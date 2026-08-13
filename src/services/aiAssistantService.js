const axios = require('axios');
const practiceService = require('./practiceService');
const practiceModel = require('../models/practiceModel');
const questionModel = require('../models/questionModel');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const EXAM_DAILY_LIMIT = 5;
const SUMMARY_MIN_INTERVAL_MS = 60 * 1000;
const SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// MVP 限流/缓存：内存存储，服务重启后清零
const examGenCounts = new Map();
const summaryLastAt = new Map();
const summaryCache = new Map();

const dateKey = (date = new Date()) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const todayKey = () => dateKey();

const canGenerateExam = (userId) => {
    const today = todayKey();
    const record = examGenCounts.get(userId);
    if (!record || record.date !== today) {
        examGenCounts.set(userId, { date: today, count: 0 });
        return true;
    }
    return record.count < EXAM_DAILY_LIMIT;
};

const markExamGenerated = (userId) => {
    const today = todayKey();
    const record = examGenCounts.get(userId);
    if (!record || record.date !== today) {
        examGenCounts.set(userId, { date: today, count: 1 });
    } else {
        record.count += 1;
    }
};

const mapExamOptions = (options = {}) => ({
    章节: options.chapter !== undefined && options.chapter !== '' ? Number(options.chapter) : undefined,
    题型: options.questionType !== undefined && options.questionType !== '' ? Number(options.questionType) : undefined,
    难度: options.difficulty !== undefined && options.difficulty !== '' ? String(options.difficulty) : undefined,
    count: Math.min(Math.max(Number(options.count) || 10, 1), 100),
});

const generateExamReply = async (userId, options) => {
    const normalized = mapExamOptions(options);
    const result = await practiceService.generateExam(userId, normalized);
    return {
        type: 'exam',
        reply: `已为您生成一套《${result.title}》试卷，共 ${result.total} 题，请在练习页查看。`,
        data: { examId: result.examId, total: result.total, title: result.title },
    };
};

const extractExamOptionsFromMessage = (message) => {
    const options = { count: 10 };
    const countMatch = message.match(/(\d{1,2})\s*题/);
    if (countMatch) {
        options.count = Math.min(Math.max(parseInt(countMatch[1], 10), 1), 100);
    }

    const chapterMatch = message.match(/第\s*(\d{1,2})\s*章/);
    if (chapterMatch) {
        options.chapter = parseInt(chapterMatch[1], 10);
    }

    const typeMap = {
        判断题: 1,
        单选题: 2,
        多选题: 3,
        填空题: 4,
        简答题: 5,
        程序论述题: 6,
        论述题: 6,
    };
    for (const [name, value] of Object.entries(typeMap)) {
        if (message.includes(name)) {
            options.questionType = value;
            break;
        }
    }

    const difficultyMap = {
        入门: '1',
        简单: '2',
        中等: '3',
        困难: '4',
        挑战: '5',
    };
    for (const [name, value] of Object.entries(difficultyMap)) {
        if (message.includes(name)) {
            options.difficulty = value;
            break;
        }
    }
    const difficultyNum = message.match(/难度\s*([1-5])/);
    if (difficultyNum) {
        options.difficulty = difficultyNum[1];
    }

    return options;
};

const callDeepSeek = async (messages) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey.includes('your_key')) {
        console.error('AI 错题浓缩未配置：请在 .env 中设置 DEEPSEEK_API_KEY 并重启后端');
        const err = new Error('AI 服务未配置');
        err.statusCode = 500;
        throw err;
    }
    const resp = await axios.post(
        DEEPSEEK_URL,
        {
            model: DEEPSEEK_MODEL,
            messages,
            temperature: 0.4,
            max_tokens: 2048,
        },
        {
            timeout: 60000,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        }
    );
    return resp.data?.choices?.[0]?.message?.content || '';
};

const summarizeWrongQuestions = async (userId) => {
    const cacheKey = `${userId}:${todayKey()}`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < SUMMARY_CACHE_TTL_MS) {
        return { type: 'summary', reply: cached.reply };
    }

    const last = summaryLastAt.get(userId);
    if (last && Date.now() - last < SUMMARY_MIN_INTERVAL_MS) {
        return { type: 'text', reply: '您刚刚已经生成过错题总结，请一分钟后再试哦。' };
    }

    const wrongAnswers = await practiceModel.findRecentWrongAnswers(userId, { days: 30, limit: 50 });
    if (wrongAnswers.length < 3) {
        return { type: 'text', reply: '您的错题还不够多，继续练习吧！多做几套题再来找我浓缩精华 💪' };
    }

    const lines = wrongAnswers
        .map((item) => `题目：${item.title || '(题目已失效)'} | 我的答案：${item.user_answer || '(空)'} | 正确答案：${item.correct_answer || '(空)'}`)
        .join('\n');
    const prompt = `你是一位资深学科教师。以下是我最近30天做错的题目列表（含题目、我的错误答案、正确答案）。\n\n请帮我做三件事：\n1. 总结出我最薄弱的2个知识点（用简洁语言概括）。\n2. 给出针对性的复习建议（不超过150字）。\n3. 从错题中选1道最具代表性的题目，改写题干（保持相同知识点和难度），生成一道变式题（只给题干，不给答案）。\n\n错题数据：\n${lines}\n\n请严格按以下 Markdown 格式输出：\n## 薄弱点\n- ...\n\n## 复习建议\n...\n\n## 变式练习\n...`;

    try {
        const reply = await callDeepSeek([
            { role: 'system', content: '你是一位严谨、耐心的学科教师，输出使用 Markdown。' },
            { role: 'user', content: prompt },
        ]);
        summaryCache.set(cacheKey, { savedAt: Date.now(), reply });
        summaryLastAt.set(userId, Date.now());
        return { type: 'summary', reply };
    } catch (err) {
        console.error('AI 错题浓缩失败:', err.message);
        const reply = err.message === 'AI 服务未配置'
            ? 'AI 错题总结服务暂未配置，请先在 .env 中填写 DEEPSEEK_API_KEY 并重启后端。'
            : 'AI 错题总结服务暂时不可用，请稍后再试。';
        return { type: 'text', reply };
    }
};

const findSimilarQuestions = async (userId, currentQuestionId, currentExamId) => {
    const question = await questionModel.findById(currentQuestionId);
    if (!question) {
        return { type: 'text', reply: '当前题目不存在或已失效，请重新进入答题页。' };
    }

    const limit = 3;
    let rows = await questionModel.findSimilarByKnowledgePoint({
        knowledgePoint: question.知识点,
        excludeId: question.id,
        limit,
    });
    if (rows.length < limit) {
        rows = await questionModel.findSimilarByKnowledgePointLike({
            knowledgePoint: question.知识点,
            excludeId: question.id,
            limit,
        });
    }
    if (rows.length < limit) {
        rows = await questionModel.findSimilarByChapterType({
            chapter: question.章节,
            questionType: question.题型,
            excludeId: question.id,
            limit,
        });
    }
    if (rows.length < limit) {
        return { type: 'text', reply: '暂时没有找到同类题，试试换一道题吧。' };
    }

    let originalTitle = '当前试卷';
    if (currentExamId) {
        const exam = await practiceModel.findExamById(currentExamId);
        if (exam) originalTitle = exam.title || originalTitle;
    }
    const title = `【同类题】《${originalTitle}》拓展练习`;
    const { examId } = await practiceModel.createExam({
        userId,
        title,
        chapter: question.章节,
        questionType: question.题型,
        difficulty: question.难度,
        questions: rows,
    });

    return {
        type: 'similar',
        reply: `已为您找到 ${rows.length} 道同类题并生成拓展练习，点击“去练习”开始作答。`,
        questions: rows.map((q) => ({ id: q.id, 题目: q.题目, 选项: q.选项, 题型: q.题型 })),
        data: { examId, total: rows.length, title },
    };
};

const navigationReply = (message) => {
    const rules = [
        { pattern: /怎么开始做题|开始练习|如何练习/, reply: '点击左侧「答题练习」进入试卷列表，点击“开始答题”即可；也可以在「智能组卷」按需生成试卷。' },
        { pattern: /错题本/, reply: '「错题本」在 答题练习 → 错题本，做错的题会自动收录，还支持错题重练。' },
        { pattern: /收藏|标记|星标/, reply: '在答题页或错题本中，点击题目旁边的星标⭐，即可收藏该题，方便后续集中复习。' },
        { pattern: /智能组卷|组卷/, reply: '「智能组卷」在 答题练习 → 智能组卷，可以按章节、题型、难度生成试卷。' },
        { pattern: /答题记录|记录/, reply: '「答题记录」在 答题练习 → 答题记录，可查看历史成绩和逐题详情。' },
        { pattern: /统计分析|统计|分析/, reply: '「统计分析」在 答题练习 → 统计分析，可查看正确率趋势和薄弱题型。' },
        { pattern: /个人中心|资料/, reply: '「个人中心」可以修改资料、查看历史题目/试卷和收藏题目。' },
        { pattern: /反馈|建议/, reply: '点击左侧「用户反馈」即可提交建议或问题。' },
    ];
    for (const rule of rules) {
        if (rule.pattern.test(message)) return rule.reply;
    }
    return '您可以通过左侧导航进入 答题练习、个人中心、用户反馈；练习相关问题可以问我“怎么开始做题”。';
};

const chat = async ({ userId, message, currentPage, currentQuestionId, currentExamId, examOptions }) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
        return { type: 'text', reply: '请输入您想咨询的内容。' };
    }

    const hasExamOptions =
        examOptions &&
        Object.values(examOptions).some((value) => value !== undefined && value !== null && value !== '');
    if (hasExamOptions) {
        if (!canGenerateExam(userId)) {
            return { type: 'text', reply: '今日生成试卷次数已达上限（5 次），明天再来吧。' };
        }
        try {
            const result = await generateExamReply(userId, examOptions);
            markExamGenerated(userId);
            return result;
        } catch (err) {
            return { type: 'text', reply: err.message || '组卷失败，请稍后再试。' };
        }
    }

    const groupPattern = /组卷|出套卷|生成一套|生成.*试卷|帮我出.*卷/;
    if (groupPattern.test(normalizedMessage)) {
        if (!canGenerateExam(userId)) {
            return { type: 'text', reply: '今日生成试卷次数已达上限（5 次），明天再来吧。' };
        }
        try {
            const options = extractExamOptionsFromMessage(normalizedMessage);
            const result = await generateExamReply(userId, options);
            markExamGenerated(userId);
            return result;
        } catch (err) {
            return { type: 'text', reply: err.message || '组卷失败，请稍后再试。' };
        }
    }

    const summaryPattern = /(浓缩|总结|汇总).*错题|错题.*(浓缩|总结|汇总)/;
    if (summaryPattern.test(normalizedMessage)) {
        return summarizeWrongQuestions(userId);
    }

    const similarPattern = /类似|同类|举一反三/;
    if (currentPage === 'practice/exam' && currentQuestionId && similarPattern.test(normalizedMessage)) {
        return findSimilarQuestions(userId, currentQuestionId, currentExamId);
    }

    const navigationPattern = /在哪|怎么|如何|哪里/;
    if (navigationPattern.test(normalizedMessage)) {
        return { type: 'text', reply: navigationReply(normalizedMessage) };
    }

    return { type: 'text', reply: '抱歉，我暂时只能帮您组卷、找同类题、浓缩错题或引导功能页哦。' };
};

module.exports = { chat };
