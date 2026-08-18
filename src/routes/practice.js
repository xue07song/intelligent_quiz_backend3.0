const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');
const adaptivePracticeController = require('../controllers/adaptivePracticeController');
const learningAnalysisController = require('../controllers/learningAnalysisController');

// 所有练习接口均需登录
router.use(auth);

// ==================== 学生端接口 ====================
// 组卷
router.post('/exams', requireRoles('teacher'), practiceController.generate);

// 题库库存与多约束智能组卷（旧组卷接口继续保留）
router.get('/exam-inventory', requireRoles('teacher'), practiceController.inventory);
router.post('/rule-exams/preview', requireRoles('teacher'), practiceController.previewRule);
router.post('/rule-exams', requireRoles('teacher'), practiceController.generateRule);

// 逐题难度自适应练习
router.post('/adaptive/inventory', requireRoles('student'), adaptivePracticeController.inventory);
router.post('/adaptive/sessions', requireRoles('student'), adaptivePracticeController.start);
router.get('/adaptive/sessions/:id', requireRoles('student'), adaptivePracticeController.getSession);
router.post('/adaptive/sessions/:id/answers', requireRoles('student'), adaptivePracticeController.submit);
router.get('/adaptive-progress', requireRoles('student'), adaptivePracticeController.progress);
router.get('/adaptive-overview', requireRoles('teacher', 'admin'), adaptivePracticeController.overview);
router.get('/learning-analysis/me', requireRoles('student'), learningAnalysisController.mine);
router.get('/learning-analysis/overview', requireRoles('teacher', 'admin'), learningAnalysisController.overview);
router.get('/learning-analysis/students/:userId', requireRoles('teacher', 'admin'), learningAnalysisController.student);

// 试卷列表
router.get('/exams', practiceController.listExams);

// 导出试卷（Word / Excel，可带答案）
router.get('/exams/:id/export', requireRoles('admin', 'teacher'), practiceController.exportExam);

// 试卷详情（含题目）
router.get('/exams/:id', practiceController.getExam);

// 试卷维度分析（每题正确率 + 学生成绩 + 整体统计 + 班级对比 + 分数段）
router.get('/exams/:id/analytics', requireRoles('admin', 'teacher'), practiceController.examAnalytics);

// 单题详情：某试卷某道题每个学生的作答情况
router.get('/exams/:id/questions/:questionId/details', requireRoles('admin', 'teacher'), practiceController.questionDetail);

// 答题草稿（本人保存 / 读取）
router.get('/exams/:id/draft', requireRoles('student'), practiceController.getExamDraft);
router.put('/exams/:id/draft', requireRoles('student'), practiceController.saveExamDraft);

// 提交答卷（自动评分）
router.post('/exams/:id/submit', requireRoles('student'), practiceController.submit);

// 答题记录列表（本人）
router.get('/records', practiceController.listRecords);

// 答题记录详情（含每题对错）
router.get('/records/:id', practiceController.getRecord);

// 统计分析（本人，总览 + 趋势 + 按题型）
router.get('/statistics', practiceController.statistics);

// 错题本（本人）
router.get('/wrong-questions', requireRoles('student'), practiceController.wrongQuestions);
router.post('/wrong-exams', requireRoles('student'), practiceController.wrongExam);

// 单题练习：根据题目ID生成练习
router.post('/single-question', requireRoles('student', 'teacher'), practiceController.startSingleQuestionPractice);

// ===== 单题判题（不创建试卷，不记录） =====
router.post('/single-question/check', requireRoles('student', 'teacher'), practiceController.checkSingleQuestion);

// ==================== 管理端接口（教师/管理员）====================
router.get('/admin/users', requireRoles('admin', 'teacher'), practiceController.adminListUsers);
router.get('/admin/records', requireRoles('admin', 'teacher'), practiceController.adminListRecords);
router.get('/admin/records/:id', requireRoles('admin', 'teacher'), practiceController.adminGetRecord);
router.put('/admin/answers/:answerId/review', requireRoles('teacher'), practiceController.reviewSubjectiveAnswer);
router.get('/admin/users/:userId/records', requireRoles('admin', 'teacher'), practiceController.adminListUserRecords);
router.get('/admin/users/:userId/statistics', requireRoles('admin', 'teacher'), practiceController.adminGetUserStats);
router.get('/admin/stats/all', requireRoles('admin', 'teacher'), practiceController.adminGetAllStats);

module.exports = router;