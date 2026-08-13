const { chatJSON, isConfigured } = require('../utils/aiClient');

const normalize = (value) => String(value || '').trim().toLowerCase()
    .replace(/\s+/g, '').replace(/[，。；：、“”‘’（）()【】\[\],.!?;:'"]/g, '');

const exactEvaluation = (userAnswer, referenceAnswer) => {
    const expected = String(referenceAnswer || '').split(/\s*(?:\||\/|；|;)\s*/).filter(Boolean);
    return expected.some((item) => normalize(item) === normalize(userAnswer));
};

const fallback = (reason = '评阅服务暂时不可用') => ({
    status: 'review', scoreRate: 0, matchedPoints: [], missingPoints: [], errors: [],
    reason: `${reason}，本题已转为待复核，不会直接判错。`, reviewRequired: true,
});

const evaluate = async ({ questionType, question, userAnswer, referenceAnswer, explanation }) => {
    const type = Number(questionType);
    if (exactEvaluation(userAnswer, referenceAnswer)) {
        return { status: 'correct', scoreRate: 1, matchedPoints: ['答案与参考答案一致'], missingPoints: [], errors: [], reason: '答案正确。', reviewRequired: false };
    }
    if (![4, 5, 6].includes(type)) return { ...fallback('当前题型无法确定判定结果') };
    if (!isConfigured()) return fallback();
    try {
        const result = await chatJSON([
            { role: 'system', content: `你是严谨的课程答题评阅助手。根据题目、参考答案和解析判断学生答案，不因措辞不同而扣分，也不能因语言流畅忽略事实错误。填空题侧重核心概念等价；简答题和程序论述题按关键步骤、结论、边界与复杂度等要点评分。只返回JSON：{"status":"correct|partial|incorrect|review","scoreRate":0到1,"matchedPoints":["已覆盖要点"],"missingPoints":["遗漏要点"],"errors":["事实错误"],"reason":"简洁依据","reviewRequired":false}。无法可靠判断时必须返回review。` },
            { role: 'user', content: `题型：${type === 4 ? '填空题' : type === 5 ? '简答题' : '程序论述题'}\n题目：${question}\n参考答案：${referenceAnswer}\n参考解析：${explanation || '无'}\n学生答案：${userAnswer}` },
        ], { temperature: 0.1 });
        const allowed = ['correct', 'partial', 'incorrect', 'review'];
        const status = allowed.includes(result.status) ? result.status : 'review';
        const scoreRate = status === 'review' ? 0 : Math.max(0, Math.min(1, Number(result.scoreRate) || 0));
        return {
            status, scoreRate,
            matchedPoints: Array.isArray(result.matchedPoints) ? result.matchedPoints.slice(0, 8) : [],
            missingPoints: Array.isArray(result.missingPoints) ? result.missingPoints.slice(0, 8) : [],
            errors: Array.isArray(result.errors) ? result.errors.slice(0, 8) : [],
            reason: String(result.reason || '已完成语义评阅。').slice(0, 500),
            reviewRequired: status === 'review' || Boolean(result.reviewRequired),
        };
    } catch (error) {
        return fallback();
    }
};

module.exports = { evaluate, exactEvaluation };
