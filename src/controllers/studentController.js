const studentService = require('../services/studentService');

const ok = (data, message = '操作成功') => ({
    code: 200,
    message,
    data,
});

const profile = async (req, res, next) => {
    try {
        const data = await studentService.getProfile(req.user.id);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const data = await studentService.updateProfile(req.user.id, req.body);
        res.json(ok(data, '更新成功'));
    } catch (err) {
        next(err);
    }
};

const historyQuestions = async (req, res, next) => {
    try {
        const data = await studentService.getHistoryQuestions(req.user.id, req.query);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const historyExams = async (req, res, next) => {
    try {
        const data = await studentService.getHistoryExams(req.user.id, req.query);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const examRecords = async (req, res, next) => {
    try {
        const data = await studentService.getExamRecords(req.params.examId, req.user.id);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const favorites = async (req, res, next) => {
    try {
        const data = await studentService.getFavorites(req.user.id, req.query);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const addFavorite = async (req, res, next) => {
    try {
        const data = await studentService.addFavorite(req.user.id, req.body.questionId);
        res.json(ok(data, '收藏成功'));
    } catch (err) {
        next(err);
    }
};

const removeFavorite = async (req, res, next) => {
    try {
        const data = await studentService.removeFavorite(req.user.id, req.params.questionId);
        res.json(ok(data, '已取消收藏'));
    } catch (err) {
        next(err);
    }
};

const favoriteTags = async (req, res, next) => {
    try {
        const data = await studentService.getFavoriteTags(req.user.id);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const createFavoriteTag = async (req, res, next) => {
    try {
        const data = await studentService.createFavoriteTag(req.user.id, req.body);
        res.json(ok(data, '标签创建成功'));
    } catch (err) {
        next(err);
    }
};

const deleteFavoriteTag = async (req, res, next) => {
    try {
        const data = await studentService.deleteFavoriteTag(req.user.id, req.params.tagId);
        res.json(ok(data, '标签已删除'));
    } catch (err) {
        next(err);
    }
};

const favoriteTagsOfQuestion = async (req, res, next) => {
    try {
        const data = await studentService.getFavoriteQuestionTags(req.user.id, req.params.questionId);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const setFavoriteTagsOfQuestion = async (req, res, next) => {
    try {
        const data = await studentService.setFavoriteTags(req.user.id, req.params.questionId, req.body.tagIds);
        res.json(ok(data, '标签设置成功'));
    } catch (err) {
        next(err);
    }
};

const reviewSchedule = async (req, res, next) => {
    try {
        const data = await studentService.getReviewSchedule(req.user.id, req.query);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

const submitFavoriteReview = async (req, res, next) => {
    try {
        const data = await studentService.submitFavoriteReview(req.user.id, req.params.questionId, req.body);
        res.json(ok(data, '复习记录已保存'));
    } catch (err) {
        next(err);
    }
};

const favoriteStats = async (req, res, next) => {
    try {
        const data = await studentService.getFavoriteStats(req.user.id);
        res.json(ok(data));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    profile,
    updateProfile,
    historyQuestions,
    historyExams,
    examRecords,
    favorites,
    addFavorite,
    removeFavorite,
    favoriteTags,
    createFavoriteTag,
    deleteFavoriteTag,
    favoriteTagsOfQuestion,
    setFavoriteTagsOfQuestion,
    reviewSchedule,
    submitFavoriteReview,
    favoriteStats,
};
