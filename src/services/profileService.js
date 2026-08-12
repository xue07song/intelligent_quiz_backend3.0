const userModel = require('../models/userModel');
const profileModel = require('../models/profileModel');
const practiceService = require('./practiceService');
const bookmarkService = require('./bookmarkService');

// 获取当前登录用户的完整个人信息
const getProfile = async (userId) => {
    const user = await userModel.findById(userId, { withProfile: true });
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }
    // 获取答题统计
    const practiceStats = await practiceService.getStats(userId);
    // 获取收藏统计
    const bookmarkList = await bookmarkService.listBookmarks(userId, { page: 1, pageSize: 1 });
    // 获取历史做题汇总
    const historySummary = await profileModel.practiceSummary(userId);

    return {
        user,
        practice: practiceStats.overview,
        bookmarks: bookmarkList.total || 0,
        history: historySummary.overview,
        historyByType: historySummary.byType,
    };
};

// 更新个人资料
const updateProfile = async (userId, data) => {
    const user = await userModel.findById(userId);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }
    // 禁止自行修改角色和状态
    const safeData = {};
    const allowedFields = ['nickname', 'phone', 'email', 'school', 'avatar', 'bio'];
    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            safeData[key] = data[key];
        }
    }
    // 字段校验：手机号、邮箱格式
    if (safeData.phone && safeData.phone.length > 20) {
        const error = new Error('手机号长度不能超过20位');
        error.statusCode = 400;
        throw error;
    }
    if (safeData.email && safeData.email.length > 100) {
        const error = new Error('邮箱长度不能超过100位');
        error.statusCode = 400;
        throw error;
    }
    await userModel.update(userId, safeData);
    return userModel.findById(userId, { withProfile: true });
};

// 历史刷题记录（去重、分页）
const getHistoryQuestions = async (userId, options) => {
    return profileModel.findPracticedQuestions(userId, options);
};

// 历史做题汇总
const getHistorySummary = async (userId) => {
    return profileModel.practiceSummary(userId);
};

module.exports = {
    getProfile,
    updateProfile,
    getHistoryQuestions,
    getHistorySummary,
};
