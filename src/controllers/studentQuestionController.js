const studentQuestionService = require('../services/studentQuestionService');
const formatRecognitionService = require('../services/formatRecognitionService');
const { success, paginated } = require('../utils/response');

const parsePagination = (req) => ({
    page: parseInt(req.query.page) || 1,
    pageSize: parseInt(req.query.pageSize) || 20,
});

const list = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req);
        const result = await studentQuestionService.getQuestions({
            actor: req.user,
            scope: req.query.scope || 'own',
            options: {
                page,
                pageSize,
                status: req.query.status,
                keyword: req.query.keyword,
                subject: req.query.subject,
                题型: req.query.题型,
            },
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const reviewQueue = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req);
        const result = await studentQuestionService.getReviewQueue({
            actor: req.user,
            options: {
                page,
                pageSize,
                keyword: req.query.keyword,
            },
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const create = async (req, res, next) => {
    try {
        const result = await studentQuestionService.create({
            actor: req.user,
            data: req.body,
            share: req.body.share === true || req.body.share === 'true',
        });
        res.status(201).json(success(result, '✅ 题目已保存到我的题库'));
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const result = await studentQuestionService.update({
            actor: req.user,
            id: req.params.id,
            data: req.body,
        });
        res.json(success(result, '✅ 题目已更新'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await studentQuestionService.remove({ actor: req.user, id: req.params.id });
        res.json(success(null, '✅ 题目已删除'));
    } catch (err) {
        next(err);
    }
};

const share = async (req, res, next) => {
    try {
        const result = await studentQuestionService.share({ actor: req.user, id: req.params.id });
        res.json(success(result, '✅ 已提交共享审核，等待版主/管理员审核'));
    } catch (err) {
        next(err);
    }
};

const review = async (req, res, next) => {
    try {
        const result = await studentQuestionService.review({
            actor: req.user,
            id: req.params.id,
            action: req.body.action,
            reason: req.body.reason,
        });
        res.json(success(result, '✅ 审核完成'));
    } catch (err) {
        next(err);
    }
};

const exportQuestions = async (req, res, next) => {
    try {
        const format = String(req.query.format || 'docx').toLowerCase();
        const withAnswers = req.query.withAnswers !== 'false' && req.query.withAnswers !== '0';
        const result = await studentQuestionService.exportQuestions({
            actor: req.user,
            scope: req.query.scope || 'own',
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

const importRecognition = async (req, res, next) => {
    try {
        const result = await formatRecognitionService.importStudentQuestions({
            items: req.body.questions,
            actor: req.user,
        });
        res.status(201).json(success(result, `✅ 图片识别导入完成：成功 ${result.inserted} 条，无效 ${result.invalid} 条`));
    } catch (err) {
        next(err);
    }
};

const adminList = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req);
        const result = await studentQuestionService.getQuestions({
            actor: req.user,
            scope: 'admin',
            options: {
                page,
                pageSize,
                status: req.query.status,
                college: req.query.college,
                keyword: req.query.keyword,
                subject: req.query.subject,
                题型: req.query.题型,
            },
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const adminRemove = async (req, res, next) => {
    try {
        await studentQuestionService.remove({ actor: req.user, id: req.params.id });
        res.json(success(null, '✅ 学生题目已删除'));
    } catch (err) {
        next(err);
    }
};

const listModerators = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req);
        const result = await studentQuestionService.listModerators({
            page,
            pageSize,
            keyword: req.query.keyword,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const createModerator = async (req, res, next) => {
    try {
        const result = await studentQuestionService.createModerator({
            actor: req.user,
            userId: req.body.userId,
            college: req.body.college,
        });
        res.status(201).json(success(result, '✅ 学生版主已添加'));
    } catch (err) {
        next(err);
    }
};

const removeModerator = async (req, res, next) => {
    try {
        await studentQuestionService.removeModerator(req.params.id);
        res.json(success(null, '✅ 学生版主已移除'));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    list,
    reviewQueue,
    create,
    update,
    remove,
    share,
    review,
    exportQuestions,
    importRecognition,
    adminList,
    adminRemove,
    listModerators,
    createModerator,
    removeModerator,
};
