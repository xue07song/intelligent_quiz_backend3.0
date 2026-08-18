const QUESTION_TYPES = [1, 2, 3, 4, 5, 6];

// 题库中真实存在的中文难度与数字/星级难度都允许录入
const DIFFICULTY_VALUES = new Set([
    '1', '2', '3', '4', '5',
    '1星', '2星', '3星', '4星', '5星',
    '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐',
    '1-5',
    '入门', '简单', '容易', '一般', '中等', '较难', '困难', '挑战',
]);

const TRUTHY = new Set(['t', 'true', '正确', '对', '是', '√', '1', '✓', '✔', '对的', '是的', '正确的']);
const FALSY = new Set(['f', 'false', '错误', '错', '否', '×', '0', '✗', '✘', 'x', '不对', '不是', '错的', '错误的']);

const toText = (value) => (value === undefined || value === null ? '' : String(value));

const parseType = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const type = Number(value);
    return Number.isInteger(type) && QUESTION_TYPES.includes(type) ? type : null;
};

const isValidDifficulty = (value) => DIFFICULTY_VALUES.has(toText(value).trim());

// 解析选项文本，返回 [{ key, text }]；支持多行、单行"A. xx B. xx"、数组、对象
const parseOptions = (options) => {
    if (Array.isArray(options)) {
        return options.map((item, index) => ({
            key: String.fromCharCode(65 + index),
            text: item === undefined || item === null ? '' : toText(item),
        })).filter((item) => item.text !== '');
    }
    if (typeof options === 'object' && options !== null) {
        return Object.entries(options).map(([key, text]) => ({
            key: key.trim().toUpperCase(),
            text: toText(text),
        })).filter((item) => item.text !== '');
    }

    const text = toText(options).trim();
    if (!text) return [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 1) {
        const tokens = lines[0].split(/(?=[A-Za-z]\s*[.、)）:：])/).map((token) => token.trim()).filter(Boolean);
        if (tokens.length > 1) {
            lines.length = 0;
            lines.push(...tokens);
        }
    }
    return lines.map((line) => {
        const match = line.match(/^([A-Za-z])\s*[.、)）:：]?\s*(.*)$/);
        if (match) return { key: match[1].toUpperCase(), text: match[2].trim() };
        return null;
    }).filter(Boolean);
};

const normalizeBooleanAnswer = (value) => {
    const text = toText(value).trim().toLowerCase().replace(/\s+|。|\./g, '');
    if (TRUTHY.has(text)) return 'T';
    if (FALSY.has(text)) return 'F';
    return text.toUpperCase();
};

const isBooleanAnswer = (value) => {
    const text = toText(value).trim();
    return text !== '' && /^[TF]$/.test(normalizeBooleanAnswer(text));
};

const extractAnswerKeys = (value, type) => {
    const answer = toText(value).trim();
    if (!answer) return [];
    const letters = answer
        .replace(/[；;，,、\s]/g, '')
        .toUpperCase()
        .match(/[A-Z]/g) || [];
    if (type === 2) return letters.slice(0, 1);
    if (type === 3) return [...new Set(letters)];
    return letters;
};

// 校验题目数据。requireId/requireSubject/requireDifficulty 用于新增场景，
// 更新场景使用 merged 后的完整记录校验，避免类型切换后答案/选项不一致。
const validateQuestionPayload = (payload = {}, options = {}) => {
    const {
        requireId = false,
        requireSubject = false,
        requireDifficulty = false,
        requireAnswer = true,
        requireTitle = true,
    } = options;
    const errors = [];

    const id = toText(payload.id).trim();
    const 题目 = toText(payload.题目).trim();
    const 科目 = toText(payload.科目).trim();
    const type = parseType(payload.题型);
    const 难度 = toText(payload.难度).trim();

    if (requireId && !id) errors.push('ID不能为空');
    if (requireTitle && !题目) errors.push('题目内容不能为空');
    if (requireSubject && !科目) errors.push('科目不能为空');
    if (payload.题型 !== undefined && payload.题型 !== null && payload.题型 !== '' && type === null) {
        errors.push('题型无效，有效值为 1判断 2单选 3多选 4填空 5简答 6程序论述');
    }
    if (requireDifficulty && !难度) errors.push('难度不能为空');
    if (难度 && !isValidDifficulty(难度)) {
        errors.push(`难度值「${难度}」无效，仅支持 1-5、1星-5星、简单/中等/困难等常用等级`);
    }

    if (type) {
        const 答案 = toText(payload.答案).trim();
        const 选项 = toText(payload.选项);
        if (type === 1) {
            if (requireAnswer && !答案) errors.push('判断题必须填写答案');
            if (答案 && !isBooleanAnswer(答案)) errors.push('判断题答案需为 对/错、T/F、正确/错误、√/× 等');
        } else if (type === 2 || type === 3) {
            if (!选项) errors.push('选择题必须填写选项');
            const keys = parseOptions(选项).map((item) => item.key);
            if (keys.length < 2) errors.push('选择题至少需要两个选项');
            if (requireAnswer && !答案) errors.push('选择题必须填写答案');
            const answerKeys = extractAnswerKeys(答案, type);
            if (答案 && answerKeys.length === 0) errors.push('答案中未识别出有效选项字母');
            if (答案 && keys.length > 0) {
                const invalid = answerKeys.filter((key) => !keys.includes(key));
                if (invalid.length > 0) errors.push(`答案包含不存在的选项：${invalid.join('、')}`);
                if (type === 2 && answerKeys.length !== 1) errors.push('单选题答案只能是一个选项');
                if (type === 3 && answerKeys.length < 2) errors.push('多选题答案至少需要两个选项');
            }
        } else if (type === 4) {
            if (requireAnswer && !答案) errors.push('填空题必须填写答案');
        }
        // 简答/程序论述：参考答案用于 AI 评阅与人工复核，建议填写但不强制
    }

    return { valid: errors.length === 0, errors, type, id, 题目, 科目, 难度 };
};

module.exports = {
    QUESTION_TYPES,
    DIFFICULTY_VALUES,
    parseType,
    isValidDifficulty,
    parseOptions,
    extractAnswerKeys,
    isBooleanAnswer,
    validateQuestionPayload,
};
