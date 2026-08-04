const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');

// 登录（公开）
router.post('/login', authController.login);

// 获取当前登录用户信息（需登录）
router.get('/profile', auth, authController.profile);

// 修改自己的密码（需登录）
router.post('/change-password', auth, authController.changePassword);

module.exports = router;
