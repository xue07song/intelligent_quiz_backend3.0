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

module.exports = router;
