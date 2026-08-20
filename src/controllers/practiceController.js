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

const getExam = async (req, res, next) => {
    try {
        const exam = await practiceService.getExam(req.params.id, req.user.id, req.user.role);
        res.json(success(exam));
    } catch (err) {
        next(err);
    }
};

const submit = async (req, res, next) => {
    try {
        const result = await practiceService.submitExam(req.user.id, req.user.role, req.params.id, req.body);
        res.status(201).json(success(result, `✅ 提交成功！准确率 ${result.accuracy}%，得分 ${result.score}`));
    } catch (err) {
        next(err);
    }
};

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

const getRecord = async (req, res, next) => {
    try {
        const record = await practiceService.getRecord(req.params.id, req.user.id);
        res.json(success(record));
    } catch (err) {
        next(err);
    }
};

const statistics = async (req, res, next) => {
    try {
        const stats = await practiceService.getStats(req.user.id, req.user.role);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

const wrongQuestions = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await practiceService.listWrongQuestions(req.user.id, {
            page,
            pageSize,
            chapter: req.query.chapter,
            questionType: req.query.questionType,
            keyword: req.query.keyword,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const wrongExam = async (req, res, next) => {
    try {
        const result = await practiceService.createWrongExam(req.user.id, req.body);
        res.status(201).json(success(result, `✅ 已生成错题重练试卷，共 ${result.total} 题`));
    } catch (err) {
        next(err);
    }
};

const startSingleQuestionPractice = async (req, res, next) => {
    try {
        const { questionId } = req.body;
        if (!questionId) {
            const err = new Error('题目ID不能为空');
            err.statusCode = 400;
            throw err;
        }
        const result = await practiceService.startSingleQuestionPractice(req.user.id, questionId);
        res.status(201).json(success(result, '✅ 单题练习已开始'));
    } catch (err) {
        next(err);
    }
};

// ===== 单题判题（不创建试卷，不记录） =====
const checkSingleQuestion = async (req, res, next) => {
    try {
        const { questionId, userAnswer } = req.body;
        if (!questionId) {
            const err = new Error('题目ID不能为空');
            err.statusCode = 400;
            throw err;
        }
        const result = await practiceService.checkSingleQuestion(questionId, userAnswer);
        res.json(success(result, '判题完成'));
    } catch (err) {
        next(err);
    }
};

// ==================== 管理端接口 ====================

const adminListRecords = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const role = req.query.role;
        const result = await practiceService.adminListRecords(req.user.role, req.user.id, { role, page, pageSize });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const adminListUsers = async (req, res, next) => {
    try {
        const role = req.query.role;
        const result = await practiceService.adminListUsers(req.user.role, req.user.id, { role });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

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

const adminGetUserStats = async (req, res, next) => {
    try {
        const stats = await practiceService.adminGetUserStats(req.user.role, req.user.id, req.params.userId);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

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
        if (req.user.role === 'admin') {
            return next(Object.assign(new Error('管理员无权复核主观题答案'), { statusCode: 403 }));
        }
        res.json(success(await practiceService.reviewSubjectiveAnswer(req.user.id, req.params.answerId, req.body), '复核结果已保存'));
    } catch (err) { next(err); }
};

const listAdaptiveReview = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const status = req.query.status || 'pending';
        const result = await practiceService.listAdaptiveReview({ status, page, pageSize }, req.user.id);
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) { next(err); }
};

const reviewAdaptiveAnswer = async (req, res, next) => {
    try {
        res.json(success(await practiceService.reviewAdaptiveAnswer(req.user.id, req.params.answerId, req.body), '复核结果已保存'));
    } catch (err) { next(err); }
};

const getExamDraft = async (req, res, next) => {
    try {
        const examId = Number(req.params.id);
        res.json(success(await practiceService.getExamDraft(req.user.id, examId)));
    } catch (err) { next(err); }
};

const saveExamDraft = async (req, res, next) => {
    try {
        const examId = Number(req.params.id);
        res.json(success(await practiceService.saveExamDraft(req.user.id, examId, req.body || {}), '草稿已保存'));
    } catch (err) { next(err); }
};

const adminGetAllStats = async (req, res, next) => {
    try {
        const role = req.query.role;
        const result = await practiceService.adminGetAllStatsByUser(req.user.role, req.user.id, { role });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

const examAnalytics = async (req, res, next) => {
    try {
        const result = await practiceService.getExamAnalytics(req.user, req.params.id, req.query.classId);
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

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

// 学生开始作答（服务端记录开始时间）
const startExam = async (req, res, next) => {
    try {
        const result = await practiceService.startExam(req.user.id, req.params.id);
        res.json(success(result, '开始作答'));
    } catch (err) {
        next(err);
    }
};

// 试卷生命周期管理
const updateExamStatus = async (req, res, next) => {
    try {
        await practiceService.updateExamStatus(req.user, req.params.id, req.body.status);
        res.json(success(null, '试卷状态已更新'));
    } catch (err) {
        next(err);
    }
};

const updateExam = async (req, res, next) => {
    try {
        await practiceService.updateExamSettings(req.user, req.params.id, req.body);
        res.json(success(null, '试卷已更新'));
    } catch (err) {
        next(err);
    }
};

const removeExam = async (req, res, next) => {
    try {
        await practiceService.deleteExam(req.user, req.params.id);
        res.json(success(null, '试卷已删除'));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    generate,
    inventory,
    previewRule,
    generateRule,
    listExams,
    getExam,
    submit,
    listRecords,
    getRecord,
    statistics,
    getExamDraft,
    saveExamDraft,
    wrongQuestions,
    wrongExam,
    startSingleQuestionPractice,
    checkSingleQuestion,
    adminListRecords,
    adminListUsers,
    adminListUserRecords,
    adminGetUserStats,
    adminGetRecord,
    adminGetAllStats,
    reviewSubjectiveAnswer,
    listAdaptiveReview,
    reviewAdaptiveAnswer,
    examAnalytics,
    questionDetail,
    exportExam,
    startExam,
    updateExamStatus,
    updateExam,
    removeExam,
};
