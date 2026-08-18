const axios = require('axios');
const questionService = require('./questionService');
const { normalizeDifficultyLevel } = require('../utils/difficulty');

const GLM_VISION_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_VISION_MODEL = process.env.GLM_VISION_MODEL || 'glm-4v-flash';
const GLM_VISION_TIMEOUT = Number(process.env.GLM_VISION_TIMEOUT) || 120000;

const ALLOWED_IMAGE_TYPES = {
    'image/png': true,
    'image/jpeg': true,
    'image/webp': true,
};

const TYPE_NAME_TO_ID = {
    '判断题': 1,
    '单选题': 2,
    '多选题': 3,
    '填空题': 4,
    '简答题': 5,
    '程序论述题': 6,
    '论述题': 6,
};

const SYSTEM_PROMPT = `你是智能题库的图片识别助手。用户会发送一张包含题目的图片，你需要识别图片中的全部题目，并把每道题转换为系统题库格式。只返回 JSON，不要输出任何其他文字。
JSON 格式要求：
{
  "questions": [
    {
      "题型": "判断题|单选题|多选题|填空题|简答题|程序论述题",
      "题目": "题干内容",
      "选项": "多选题/单选题用 A.xxx\\nB.xxx 格式；其他题型填空字符串",
      "答案": "正确答案",
      "解析": "答案解析，没有可留空字符串",
      "难度": "入门|简单|中等|困难|挑战",
      "知识点": "关联知识点，没有可留空字符串",
      "章节": 0
    }
  ]
}
注意：图片不清晰或无法判断的题目不要臆造，尽量准确还原题干、选项和答案。`;

const makeError = (message, statusCode = 400, errorCode = 40001) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

const extractJSON = (text) => {
    if (!text) return null;
    let cleaned = String(text).trim();
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
        return null;
    }
};

const normalizeDifficulty = (value) => {
    if (value === undefined || value === null || value === '') return '';
    const s = String(value).trim();
    const level = normalizeDifficultyLevel(s);
    return level ? String(level) : s;
};

const normalizeQuestion = (raw, index) => {
    const typeText = String(raw.题型 || '').trim();
    const 题型 = Number(raw.题型) || TYPE_NAME_TO_ID[typeText] || 2;
    return {
        id: '',
        章节: Number(raw.章节) || 0,
        题型,
        序号: Number(raw.序号) || index + 1,
        题目: String(raw.题目 || '').trim(),
        选项: raw.选项 != null ? String(raw.选项) : '',
        答案: raw.答案 != null ? String(raw.答案) : '',
        解析: raw.解析 != null ? String(raw.解析) : '',
        难度: normalizeDifficulty(raw.难度),
        知识点: raw.知识点 != null ? String(raw.知识点) : '',
        使用频率: '0',
        出题人: raw.出题人 != null ? String(raw.出题人) : '',
        科目: raw.科目 || null,
    };
};

const mockRecognizeResult = () => ({
    questions: [
        {
            题型: '单选题',
            题目: '下列哪一项是网络流最大流算法的常用实现方式？',
            选项: 'A. 深度优先搜索\nB. Edmonds-Karp BFS\nC. 快速排序\nD. 二分查找',
            答案: 'B',
            解析: 'Edmonds-Karp 使用 BFS 寻找增广路，是最大流算法的经典实现。',
            难度: '中等',
            知识点: '网络流',
            章节: 0,
        },
        {
            题型: '填空题',
            题目: '数据库中用于保证事务原子性的机制是____。',
            选项: '',
            答案: '回滚（Rollback）',
            解析: '事务回滚可撤销未完成的操作，从而保证原子性。',
            难度: '简单',
            知识点: '数据库',
            章节: 0,
        },
    ],
    rawText: '【模拟数据】未配置 GLM_API_KEY 或 FORMAT_RECOGNITION_MOCK=true 时返回的示例识别结果。',
});

const recognizeImage = async ({ buffer, mimetype }) => {
    if (!buffer || !ALLOWED_IMAGE_TYPES[mimetype]) {
        throw makeError('仅支持 PNG / JPG / JPEG / WebP 图片', 400, 40001);
    }

    const apiKey = process.env.GLM_API_KEY;
    const mockMode = process.env.FORMAT_RECOGNITION_MOCK === 'true';
    if (mockMode) {
        return {
            questions: mockRecognizeResult().questions.map(normalizeQuestion),
            rawText: mockRecognizeResult().rawText,
            isMock: true,
        };
    }
    if (!apiKey || apiKey.includes('请填写')) {
        throw makeError('图片识别服务未配置：请在 .env 中填写 GLM_API_KEY 后再使用图片识别', 503, 50301);
    }

    const imageDataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
    const userPrompt = `请识别这张图片中的全部题目，并严格按系统要求返回 JSON。`;

    let content = '';
    try {
        const resp = await axios.post(
            GLM_VISION_URL,
            {
                model: GLM_VISION_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt },
                            { type: 'image_url', image_url: { url: imageDataUrl } },
                        ],
                    },
                ],
                temperature: 0.1,
                max_tokens: 4096,
            },
            {
                timeout: GLM_VISION_TIMEOUT,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        content = resp.data?.choices?.[0]?.message?.content || '';
    } catch (err) {
        throw makeError(`图片识别失败：${err.message || 'AI 服务暂时不可用'}`, 502, 50201);
    }

    const parsed = extractJSON(content);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        const error = makeError('识别完成但未能解析出有效题目，请换一张更清晰的图片重试', 422, 42201);
        error.rawText = content;
        throw error;
    }

    return {
        questions: parsed.questions.map(normalizeQuestion),
        rawText: content,
    };
};

const importQuestions = async ({ items, subject, actor }) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw makeError('导入题目不能为空', 400, 40001);
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 6);
    const normalized = items.map((item, index) => {
        const normalizedItem = normalizeQuestion(item, index);
        normalizedItem.id = String(item.id || '').trim() || `OCR${timestamp}${random}${String(index + 1).padStart(2, '0')}`;
        return normalizedItem;
    });

    return questionService.batchImport(normalized, { subject }, actor);
};

module.exports = { recognizeImage, importQuestions };
