const profileService = require('../services/profileService');
const { success, paginated } = require('../utils/response');

const getProfile = async (req, res, next) => {
    try {
        const data = await profileService.getProfile(req.user.id);
        res.json(success(data));
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const updated = await profileService.updateProfile(req.user.id, req.body);
        res.json(success(updated, '✅ 个人信息更新成功'));
    } catch (err) {
        next(err);
    }
};

const historyQuestions = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await profileService.getHistoryQuestions(req.user.id, {
            page,
            pageSize,
            isCorrect: req.query.isCorrect,
            question_type: req.query.question_type,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const historySummary = async (req, res, next) => {
    try {
        const data = await profileService.getHistorySummary(req.user.id);
        res.json(success(data));
    } catch (err) {
        next(err);
    }
};

module.exports = { getProfile, updateProfile, historyQuestions, historySummary };
