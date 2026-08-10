const express = require('express');
const questionRoutes = require('./question');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const practiceRoutes = require('./practice');
const aiRoutes = require('./ai');
const feedbackRoutes = require('./feedback');

const router = express.Router();

router.use('/questions', questionRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/practice', practiceRoutes);
router.use('/ai', aiRoutes);
router.use('/feedback', feedbackRoutes);

module.exports = router;