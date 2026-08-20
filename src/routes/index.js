const express = require('express');
const questionRoutes = require('./question');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const practiceRoutes = require('./practice');
const aiRoutes = require('./ai');
const feedbackRoutes = require('./feedback');
const classRoutes = require('./class');
const auth = require('../middlewares/auth');
const aiAssistantRoutes = require('./aiAssistant');
const studentRoutes = require('./student');
const subjectController = require('../controllers/subjectController');
const { requireRoles } = require('../middlewares/permission');

const router = express.Router();

router.use('/questions', questionRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/practice', practiceRoutes);
router.use('/ai', aiRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/classes', classRoutes);
router.use('/students', studentRoutes);

// 注册页需要读取科目，因此列表和章节为公开只读；创建和维护仍需登录。
router.get('/subjects', subjectController.list);
router.get('/subjects/:name/chapters', subjectController.chapters);
router.get('/subjects/:name/knowledge-points', subjectController.knowledgePoints);
router.post('/subjects', auth, requireRoles('teacher', 'admin'), subjectController.create);
router.put('/subjects/mine', auth, requireRoles('teacher'), subjectController.updateMine);
router.use('/ai-assistant', aiAssistantRoutes);

module.exports = router;
