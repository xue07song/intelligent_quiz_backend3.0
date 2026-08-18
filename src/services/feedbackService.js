const feedbackModel = require('../models/feedbackModel');

// 允许的枚举值
const ALLOWED_CATEGORIES = ['bug', 'suggestion', 'other'];
const ALLOWED_STATUSES = ['pending', 'processing', 'resolved', 'closed'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHINA_PHONE_PATTERN = /^1[3-9]\d{9}$/;

// 创建反馈
const createFeedback = async (userId, data) => {
    if (!data.title || !data.title.trim()) {
        const err = new Error('反馈标题不能为空');
        err.statusCode = 400;
        err.errorCode = 40001;
        throw err;
    }
    if (!data.content || !data.content.trim()) {
        const err = new Error('反馈内容不能为空');
        err.statusCode = 400;
        err.errorCode = 40001;
        throw err;
    }

    const category = ALLOWED_CATEGORIES.includes(data.category) ? data.category : 'other';
    const contact = data.contact ? String(data.contact).trim() : '';
    if (contact && !EMAIL_PATTERN.test(contact) && !CHINA_PHONE_PATTERN.test(contact)) {
        const err = new Error('请填写正规手机号码或邮箱');
        err.statusCode = 400;
        err.errorCode = 40001;
        throw err;
    }

    return feedbackModel.create({
        user_id: userId,
        category,
        title: String(data.title).trim().slice(0, 100),
        content: String(data.content).trim(),
        contact: contact ? contact.slice(0, 100) : null,
    });
};

// 用户查自己的反馈列表
const listMyFeedback = async (userId, options) => {
    return feedbackModel.findAll({ ...options, userId });
};

// 管理员查所有反馈
const listAllFeedback = async (options) => {
    return feedbackModel.findAll(options);
};

// 查反馈详情（本人或管理员可看）
const getFeedback = async (feedbackId, currentUser) => {
    const fb = await feedbackModel.findById(feedbackId);
    if (!fb) {
        const err = new Error('反馈不存在');
        err.statusCode = 404;
        err.errorCode = 40401;
        throw err;
    }
    if (currentUser.role !== 'admin' && fb.user_id !== currentUser.id) {
        const err = new Error('无权查看此反馈');
        err.statusCode = 403;
        err.errorCode = 40301;
        throw err;
    }
    return fb;
};

// 管理员更新处理状态
const updateStatus = async (feedbackId, status) => {
    if (!ALLOWED_STATUSES.includes(status)) {
        const err = new Error('状态值非法');
        err.statusCode = 400;
        err.errorCode = 40001;
        throw err;
    }
    const existing = await feedbackModel.findById(feedbackId);
    if (!existing) {
        const err = new Error('反馈不存在');
        err.statusCode = 404;
        err.errorCode = 40401;
        throw err;
    }
    return feedbackModel.updateStatus(feedbackId, status);
};

// 管理员回复反馈
const replyFeedback = async (feedbackId, replyText, adminId) => {
    if (!replyText || !replyText.trim()) {
        const err = new Error('回复内容不能为空');
        err.statusCode = 400;
        err.errorCode = 40001;
        throw err;
    }
    const existing = await feedbackModel.findById(feedbackId);
    if (!existing) {
        const err = new Error('反馈不存在');
        err.statusCode = 404;
        err.errorCode = 40401;
        throw err;
    }
    return feedbackModel.reply(feedbackId, String(replyText).trim(), adminId);
};

// 删除反馈（本人或管理员）
const deleteFeedback = async (feedbackId, currentUser) => {
    const existing = await feedbackModel.findById(feedbackId);
    if (!existing) {
        const err = new Error('反馈不存在');
        err.statusCode = 404;
        err.errorCode = 40401;
        throw err;
    }
    if (currentUser.role !== 'admin' && existing.user_id !== currentUser.id) {
        const err = new Error('无权删除此反馈');
        err.statusCode = 403;
        err.errorCode = 40301;
        throw err;
    }
    return feedbackModel.remove(feedbackId);
};

module.exports = {
    createFeedback,
    listMyFeedback,
    listAllFeedback,
    getFeedback,
    updateStatus,
    replyFeedback,
    deleteFeedback,
    ALLOWED_CATEGORIES,
    ALLOWED_STATUSES,
};
