const express = require('express');
const questionRoutes = require('./question');

const router = express.Router();

router.use('/questions', questionRoutes);

module.exports = router;