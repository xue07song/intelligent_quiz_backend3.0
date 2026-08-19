const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const verifyToken = require('../middlewares/auth');

// 学生个人中心全部接口均需登录
router.use(verifyToken);

router.get('/profile', studentController.profile);
router.put('/profile', studentController.updateProfile);
router.get('/history/questions', studentController.historyQuestions);
router.get('/history/exams', studentController.historyExams);
router.get('/history/exams/:examId/records', studentController.examRecords);
router.get('/favorites', studentController.favorites);
router.post('/favorites', studentController.addFavorite);
router.delete('/favorites/:questionId', studentController.removeFavorite);

// 收藏标签
router.get('/favorite-tags', studentController.favoriteTags);
router.post('/favorite-tags', studentController.createFavoriteTag);
router.delete('/favorite-tags/:tagId', studentController.deleteFavoriteTag);
router.get('/favorites/:questionId/tags', studentController.favoriteTagsOfQuestion);
router.put('/favorites/:questionId/tags', studentController.setFavoriteTagsOfQuestion);

// 收藏复习（遗忘曲线）
router.get('/review-schedule', studentController.reviewSchedule);
router.post('/favorites/:questionId/reviews', studentController.submitFavoriteReview);
router.get('/favorite-stats', studentController.favoriteStats);

module.exports = router;
