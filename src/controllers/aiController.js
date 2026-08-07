const aiService = require('../services/aiService');
const { success } = require('../utils/response');

// 1. AI 自动出题（生成草稿）
const generate = async (req, res, next) => {
    try {
        const result = await aiService.generateQuestions(req.body);
        res.json(success(result, `✅ AI 已生成 ${result.length} 道题目草稿，请审核后入库`));
    } catch (err) {
        next(err);
    }
};

// 1.1 入库审核后的题目
const save = async (req, res, next) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions) || questions.length === 0) {
            const err = new Error('请提交待入库的题目数组');
            err.statusCode = 400;
            err.errorCode = 40001;
            throw err;
        }
        const result = await aiService.saveGenerated(questions);
        res.status(201).json(success(result, `✅ 导入完成：成功 ${result.inserted} 条，跳过 ${result.skipped} 条`));
    } catch (err) {
        next(err);
    }
};

// 2. AI 答疑助手
const tutor = async (req, res, next) => {
    try {
        const result = await aiService.askTutor(req.body);
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

// 3. AI 智能组卷
const smartExam = async (req, res, next) => {
    try {
        const result = await aiService.smartGenerateExam(req.user.id, req.body);
        res.status(201).json(success(result, '✅ AI 智能组卷完成'));
    } catch (err) {
        next(err);
    }
};

// 4. AI 错题分析
const weakness = async (req, res, next) => {
    try {
        const result = await aiService.analyzeWeakness(req.user.id);
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

// 5. AI 配置状态探测（前端可据此提示用户）
const status = (req, res) => {
    const { isConfigured } = require('../utils/aiClient');
    res.json(success({ configured: isConfigured() }));
};

module.exports = { generate, save, tutor, smartExam, weakness, status };
