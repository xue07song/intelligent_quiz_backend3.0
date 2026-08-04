const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');
const auth = require('../middlewares/auth');

// 所有练习接口均需登录
router.use(auth);

// 组卷
router.post('/exams', practiceController.generate);

// 试卷列表
router.get('/exams', practiceController.listExams);

// 试卷详情（含题目）
router.get('/exams/:id', practiceController.getExam);

// 提交答卷（自动评分）
router.post('/exams/:id/submit', practiceController.submit);

// 答题记录列表
router.get('/records', practiceController.listRecords);

// 答题记录详情（含每题对错）
router.get('/records/:id', practiceController.getRecord);

// 统计分析（总览 + 趋势 + 按题型）
router.get('/statistics', practiceController.statistics);

module.exports = router;
