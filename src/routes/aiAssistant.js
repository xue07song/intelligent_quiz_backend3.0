const express = require('express');
const router = express.Router();
const aiAssistantController = require('../controllers/aiAssistantController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// AI 悬浮球助手：仅学生端使用
router.post('/chat', auth, requireRoles('student'), aiAssistantController.chat);

module.exports = router;
