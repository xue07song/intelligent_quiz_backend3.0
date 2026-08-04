const practiceService = require('../services/practiceService');
const { success, paginated } = require('../utils/response');

// 随机组卷
const generate = async (req, res, next) => {
    try {
        const result = await practiceService.generateExam(req.user.id, req.body);
        res.status(201).json(success(result, '✅ 组卷成功'));
    } catch (err) {
        next(err);
    }
};

// 试卷列表
const listExams = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.getExams(req.user.id, { page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 试卷详情
const getExam = async (req, res, next) => {
    try {
        const exam = await practiceService.getExam(req.params.id);
        res.json(success(exam));
    } catch (err) {
        next(err);
    }
};

// 提交答卷
const submit = async (req, res, next) => {
    try {
        const result = await practiceService.submitExam(req.user.id, req.params.id, req.body);
        res.status(201).json(success(result, `✅ 提交成功！准确率 ${result.accuracy}%，得分 ${result.score}`));
    } catch (err) {
        next(err);
    }
};

// 答题记录列表
const listRecords = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.getRecords(req.user.id, { page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 答题记录详情
const getRecord = async (req, res, next) => {
    try {
        const record = await practiceService.getRecord(req.params.id);
        res.json(success(record));
    } catch (err) {
        next(err);
    }
};

// 统计分析
const statistics = async (req, res, next) => {
    try {
        const stats = await practiceService.getStats(req.user.id);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

module.exports = { generate, listExams, getExam, submit, listRecords, getRecord, statistics };
