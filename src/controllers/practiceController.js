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

// ==================== 管理端接口 ====================

// 管理端：所有用户答题记录列表（可按角色筛选）
const adminListRecords = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const role = req.query.role; // student / teacher（仅管理员可传，教师强制为 student）
        const result = await practiceService.adminListRecords(req.user.role, { role, page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 管理端：有做题记录的用户列表（按角色分组，含统计汇总）
const adminListUsers = async (req, res, next) => {
    try {
        const role = req.query.role;
        const result = await practiceService.adminListUsers(req.user.role, { role });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

// 管理端：查看指定用户的答题记录列表
const adminListUserRecords = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.adminListUserRecords(req.user.role, req.params.userId, { page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 管理端：查看指定用户的统计分析
const adminGetUserStats = async (req, res, next) => {
    try {
        const stats = await practiceService.adminGetUserStats(req.user.role, req.params.userId);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

// 管理端：查看任意答题记录详情
const adminGetRecord = async (req, res, next) => {
    try {
        const record = await practiceService.adminGetRecord(req.user.role, req.params.id);
        res.json(success(record));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    generate, listExams, getExam, submit, listRecords, getRecord, statistics,
    adminListRecords, adminListUsers, adminListUserRecords, adminGetUserStats, adminGetRecord,
};
