const express = require('express');
const router = express.Router();
const multer = require('multer');
const studentController = require('../controllers/studentController');
const verifyToken = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');
const studentQuestionController = require('../controllers/studentQuestionController');
const formatRecognitionController = require('../controllers/formatRecognitionController');

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (allowed.includes(file.mimetype) || /\.(png|jpe?g|webp)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 PNG / JPG / JPEG / WebP 图片'));
        }
    },
});

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

// ===== 学生题库与社区 =====
router.get('/questions', requireRoles('student'), studentQuestionController.list);
router.post('/questions', requireRoles('student'), studentQuestionController.create);
router.put('/questions/:id', requireRoles('student'), studentQuestionController.update);
router.delete('/questions/:id', requireRoles('student'), studentQuestionController.remove);
router.post('/questions/:id/share', requireRoles('student'), studentQuestionController.share);
router.patch('/questions/:id/review', requireRoles('student', 'admin'), studentQuestionController.review);
router.get('/questions/export', requireRoles('student'), studentQuestionController.exportQuestions);
router.get('/questions/review-queue', requireRoles('student'), studentQuestionController.reviewQueue);
router.post('/questions/format-recognition/recognize', requireRoles('student'), imageUpload.single('image'), formatRecognitionController.recognize);
router.post('/questions/format-recognition/import', requireRoles('student'), studentQuestionController.importRecognition);

module.exports = router;
