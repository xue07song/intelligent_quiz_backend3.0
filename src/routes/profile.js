const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const profileController = require('../controllers/profileController');

// 所有接口都需要登录
router.use(auth);

// 获取完整个人信息
router.get('/', profileController.getProfile);

// 更新个人资料
router.put('/', profileController.updateProfile);

// 历史做题汇总
router.get('/history/summary', profileController.historySummary);

// 历史做过的题目（去重分页）
router.get('/history/questions', profileController.historyQuestions);

module.exports = router;
