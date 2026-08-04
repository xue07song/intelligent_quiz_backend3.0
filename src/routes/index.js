const express = require('express');
const questionRoutes = require('./question');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const practiceRoutes = require('./practice');

const router = express.Router();

router.use('/questions', questionRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/practice', practiceRoutes);

module.exports = router;