const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 所有练习接口均需登录
router.use(auth);

// ==================== 学生端接口 ====================
// 组卷
router.post('/exams', practiceController.generate);

// 试卷列表
router.get('/exams', practiceController.listExams);

// 试卷详情（含题目）
router.get('/exams/:id', practiceController.getExam);

// 提交答卷（自动评分）
router.post('/exams/:id/submit', practiceController.submit);

// 答题记录列表（本人）
router.get('/records', practiceController.listRecords);

// 答题记录详情（含每题对错）
router.get('/records/:id', practiceController.getRecord);

// 统计分析（本人，总览 + 趋势 + 按题型）
router.get('/statistics', practiceController.statistics);

// 错题本（本人）
router.get('/wrong-questions', requireRoles('student'), practiceController.wrongQuestions);
router.post('/wrong-exams', requireRoles('student'), practiceController.wrongExam);

// ==================== 管理端接口（教师/管理员）====================
// 教师只能查看学生数据；管理员可查看所有人并按角色筛选

// 有做题记录的用户列表（按角色分组，含统计汇总）
router.get('/admin/users', requireRoles('admin', 'teacher'), practiceController.adminListUsers);

// 所有用户答题记录列表（可按角色筛选）
router.get('/admin/records', requireRoles('admin', 'teacher'), practiceController.adminListRecords);

// 查看任意答题记录详情
router.get('/admin/records/:id', requireRoles('admin', 'teacher'), practiceController.adminGetRecord);

// 查看指定用户的答题记录列表
router.get('/admin/users/:userId/records', requireRoles('admin', 'teacher'), practiceController.adminListUserRecords);

// 查看指定用户的统计分析
router.get('/admin/users/:userId/statistics', requireRoles('admin', 'teacher'), practiceController.adminGetUserStats);

// 以人为界的全局统计总览（每人含汇总 + 最近 N 次答题明细）
router.get('/admin/stats/all', requireRoles('admin', 'teacher'), practiceController.adminGetAllStats);

module.exports = router;
