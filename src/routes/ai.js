const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 所有 AI 接口均需登录
router.use(auth);

// AI 配置状态
router.get('/status', aiController.status);

// AI 答疑助手（所有登录用户，做题时使用）
router.post('/tutor', aiController.tutor);

// AI 智能组卷（所有登录用户，学生练习用）
router.post('/smart-exam', aiController.smartExam);

// AI 错题分析（所有登录用户，分析本人）
router.get('/weakness', aiController.weakness);

// AI 自动出题（仅教师/管理员）
router.post('/generate', requireRoles('admin', 'teacher'), aiController.generate);
router.post('/generate/save', requireRoles('admin', 'teacher'), aiController.save);

// AI 小助手（所有登录用户，通用对话）
router.post('/chat', aiController.chat);

module.exports = router;
