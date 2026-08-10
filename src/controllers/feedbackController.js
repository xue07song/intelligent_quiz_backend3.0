const feedbackService = require('../services/feedbackService');
const { success, paginated } = require('../utils/response');

// 用户提交反馈
const create = async (req, res, next) => {
    try {
        await feedbackService.createFeedback(req.user.id, req.body);
        res.status(201).json(success(null, '✅ 反馈提交成功，感谢你的建议！'));
    } catch (err) {
        next(err);
    }
};

// 我的反馈列表
const myList = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await feedbackService.listMyFeedback(req.user.id, {
            page,
            pageSize,
            status: req.query.status,
            category: req.query.category,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 反馈详情（本人或管理员）
const detail = async (req, res, next) => {
    try {
        const fb = await feedbackService.getFeedback(req.params.id, req.user);
        res.json(success(fb));
    } catch (err) {
        next(err);
    }
};

// 管理员查看所有反馈
const list = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await feedbackService.listAllFeedback({
            page,
            pageSize,
            status: req.query.status,
            category: req.query.category,
            userId: req.query.userId,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 管理员更新处理状态
const changeStatus = async (req, res, next) => {
    try {
        await feedbackService.updateStatus(req.params.id, req.body.status);
        res.json(success(null, '✅ 状态更新成功'));
    } catch (err) {
        next(err);
    }
};

// 管理员回复反馈
const reply = async (req, res, next) => {
    try {
        await feedbackService.replyFeedback(req.params.id, req.body.reply, req.user.id);
        res.json(success(null, '✅ 回复成功'));
    } catch (err) {
        next(err);
    }
};

// 删除反馈（本人或管理员）
const remove = async (req, res, next) => {
    try {
        await feedbackService.deleteFeedback(req.params.id, req.user);
        res.json(success(null, '✅ 反馈已删除'));
    } catch (err) {
        next(err);
    }
};

module.exports = { create, myList, detail, list, changeStatus, reply, remove };
