const practiceService = require('../services/practiceService');
const examExportService = require('../services/examExportService');
const { success, paginated } = require('../utils/response');

// 统一构造操作者上下文（供 service 做科目权限过滤）
const buildActor = (req) => ({ id: req.user.id, role: req.user.role });

// 随机组卷
const generate = async (req, res, next) => {
    try {
        const result = await practiceService.generateExam(req.user.id, req.body, buildActor(req));
        res.status(201).json(success(result, '✅ 组卷成功'));
    } catch (err) {
        next(err);
    }
};

const inventory = async (req, res, next) => {
    try {
        const chapters = String(req.query.chapters || '').split(',').filter(Boolean).map(Number);
        const subject = req.query.subject || '';
        const result = await practiceService.getExamInventory({ chapters, subject }, buildActor(req));
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

const previewRule = async (req, res, next) => {
    try {
        const result = await practiceService.previewRuleExam(req.body, buildActor(req));
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

const generateRule = async (req, res, next) => {
    try {
        const result = await practiceService.generateRuleExam(req.user.id, req.body, buildActor(req));
        res.status(201).json(success(result, '✅ 智能组卷成功'));
    } catch (err) {
        next(err);
    }
};

// 试卷列表（教师按 subject/classId 过滤自己的卷子；学生自动只看本班级+全开放卷子）
const listExams = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.getExams(req.user.id, req.user.role, {
            page,
            pageSize,
            subject: req.query.subject || '',
            classId: req.query.classId || '',
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 试卷详情
const getExam = async (req, res, next) => {
    try {
        const exam = await practiceService.getExam(req.params.id, req.user.id, req.user.role);
        res.json(success(exam));
    } catch (err) {
        next(err);
    }
};

// 学生开始作答（服务端记录开始时间）
const startExam = async (req, res, next) => {
    try {
        res.json(success(await practiceService.startExam(req.user.id, req.params.id)));
    } catch (err) {
        next(err);
    }
};

// 编辑试卷设置（标题/时限/截止/次数/班级）
const updateExam = async (req, res, next) => {
    try {
        res.json(success(await practiceService.updateExamSettings(req.user, req.params.id, req.body)));
    } catch (err) {
        next(err);
    }
};

// 发布/关闭试卷
const updateExamStatus = async (req, res, next) => {
    try {
        res.json(success(await practiceService.updateExamStatus(req.user, req.params.id, req.body.status)));
    } catch (err) {
        next(err);
    }
};

// 删除无作答记录的试卷
const removeExam = async (req, res, next) => {
    try {
        res.json(success(await practiceService.deleteExam(req.user, req.params.id), '试卷已删除'));
    } catch (err) {
        next(err);
    }
};

// 提交答卷
const submit = async (req, res, next) => {
    try {
        const result = await practiceService.submitExam(req.user.id, req.user.role, req.params.id, req.body);
        res.status(201).json(success(result, `✅ 提交成功！准确率 ${result.accuracy}%，得分 ${result.score}`));
    } catch (err) {
        next(err);
    }
};

// 答题记录列表（按角色权限范围：学生仅本人，教师看师生，管理员看全部）
const listRecords = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.getRecords(req.user.id, req.user.role, { page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 答题记录详情
const getRecord = async (req, res, next) => {
    try {
        const record = await practiceService.getRecord(req.params.id, req.user.id);
        res.json(success(record));
    } catch (err) {
        next(err);
    }
};

// 统计分析
const statistics = async (req, res, next) => {
    try {
        const stats = await practiceService.getStats(req.user.id, req.user.role);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

// 错题本列表
const wrongQuestions = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.listWrongQuestions(req.user.id, {
            page,
            pageSize,
            chapter: req.query.chapter,
            questionType: req.query.questionType,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 错题重练：基于错题重新组卷
const wrongExam = async (req, res, next) => {
    try {
        const result = await practiceService.createWrongExam(req.user.id, req.body);
        res.status(201).json(success(result, `✅ 已生成错题重练试卷，共 ${result.total} 题`));
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
        const examId = req.query.examId ? Number(req.query.examId) : null;
        const result = await practiceService.adminListRecords(req.user.role, req.user.id, { role, page, pageSize, examId });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 管理端：有做题记录的用户列表（按角色分组，含统计汇总）
const adminListUsers = async (req, res, next) => {
    try {
        const role = req.query.role;
        const result = await practiceService.adminListUsers(req.user.role, req.user.id, { role });
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
        const result = await practiceService.adminListUserRecords(req.user.role, req.user.id, req.params.userId, { page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 管理端：查看指定用户的统计分析
const adminGetUserStats = async (req, res, next) => {
    try {
        const stats = await practiceService.adminGetUserStats(req.user.role, req.user.id, req.params.userId);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

// 管理端：查看任意答题记录详情
const adminGetRecord = async (req, res, next) => {
    try {
        const record = await practiceService.adminGetRecord(req.user.role, req.user.id, req.params.id);
        res.json(success(record));
    } catch (err) {
        next(err);
    }
};

const reviewSubjectiveAnswer = async (req, res, next) => {
    try {
        // 管理员只能查看答题记录和最终结果，不能修改学生成绩
        if (req.user.role === 'admin') {
            return next(Object.assign(new Error('管理员无权复核主观题答案'), { statusCode: 403 }));
        }
        res.json(success(await practiceService.reviewSubjectiveAnswer(req.user.id, req.params.answerId, req.body), '复核结果已保存'));
    } catch (err) { next(err); }
};

const reviewAdaptiveAnswer = async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            return next(Object.assign(new Error('管理员无权复核自适应主观题答案'), { statusCode: 403 }));
        }
        res.json(success(await practiceService.reviewAdaptiveAnswer(req.user.id, req.params.answerId, req.body), '复核结果已保存'));
    } catch (err) { next(err); }
};

const listAdaptiveReview = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.listAdaptiveReview({
            status: req.query.status || 'pending',
            page,
            pageSize,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) { next(err); }
};

// 草稿：获取
const getExamDraft = async (req, res, next) => {
    try {
        const examId = Number(req.params.id);
        res.json(success(await practiceService.getExamDraft(req.user.id, examId)));
    } catch (err) { next(err); }
};

// 草稿：保存（含续时）
const saveExamDraft = async (req, res, next) => {
    try {
        const examId = Number(req.params.id);
        res.json(success(await practiceService.saveExamDraft(req.user.id, examId, req.body || {}), '草稿已保存'));
    } catch (err) { next(err); }
};

// 管理端：以人为界的全局统计总览（每人含汇总 + 最近 N 次答题明细）
const adminGetAllStats = async (req, res, next) => {
    try {
        const role = req.query.role;
        const result = await practiceService.adminGetAllStatsByUser(req.user.role, req.user.id, { role });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

// 试卷维度分析（每题正确率 + 学生成绩 + 整体统计 + 班级对比 + 分数段）
const examAnalytics = async (req, res, next) => {
    try {
        const result = await practiceService.getExamAnalytics(req.user, req.params.id, req.query.classId);
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

// 单题详情：某试卷某道题每个学生的作答情况
const questionDetail = async (req, res, next) => {
    try {
        const result = await practiceService.getQuestionDetail(req.user, req.params.id, req.params.questionId);
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

const exportExam = async (req, res, next) => {
    try {
        const format = String(req.query.format || 'docx').toLowerCase();
        const withAnswers = req.query.withAnswers === 'true' || req.query.withAnswers === '1';
        const result = await examExportService.exportExam({
            examId: req.params.id,
            actor: buildActor(req),
            format,
            withAnswers,
        });
        res.setHeader('Content-Type', result.mime);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
        res.send(result.buffer);
    } catch (err) {
        next(err);
    }
};

module.exports = {

    generate, inventory, previewRule, generateRule, listExams, getExam, startExam, updateExam, updateExamStatus, removeExam,
    submit, listRecords, getRecord, statistics,
    getExamDraft, saveExamDraft, wrongQuestions, wrongExam,

    adminListRecords, adminListUsers, adminListUserRecords, adminGetUserStats, adminGetRecord, adminGetAllStats,
    reviewSubjectiveAnswer, reviewAdaptiveAnswer, listAdaptiveReview, examAnalytics, questionDetail, exportExam,
};
