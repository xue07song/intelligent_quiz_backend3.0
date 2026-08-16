const express = require('express');
const questionRoutes = require('./question');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const practiceRoutes = require('./practice');
const aiRoutes = require('./ai');
const feedbackRoutes = require('./feedback');
const classRoutes = require('./class');
const auth = require('../middlewares/auth');
const { success } = require('../utils/response');
const { SUBJECTS } = require('../config/subjects');
const aiAssistantRoutes = require('./aiAssistant');
const adminRoutes = require('./admin');

const router = express.Router();

router.use('/questions', questionRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/practice', practiceRoutes);
router.use('/ai', aiRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/classes', classRoutes);

// 科目列表（固定预定义，需登录后获取）
router.get('/subjects', auth, (req, res) => {
    res.json(success(SUBJECTS));
});
router.use('/ai-assistant', aiAssistantRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
