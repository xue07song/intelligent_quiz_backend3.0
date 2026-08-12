const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const registrationController = require('../controllers/registrationController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 登录（公开）
router.post('/login', authController.login);

// 提交注册申请（公开）
router.post('/register', registrationController.register);

// 获取当前登录用户信息（需登录）
router.get('/profile', auth, authController.profile);

// 修改自己的密码（需登录）
router.post('/change-password', auth, authController.changePassword);

// ===== 注册审核接口（需登录 + 管理员/老师权限）=====
router.get('/registrations', auth, requireRoles('admin', 'teacher'), registrationController.list);
router.patch('/registrations/:id/approve', auth, requireRoles('admin', 'teacher'), registrationController.approve);
router.patch('/registrations/:id/reject', auth, requireRoles('admin', 'teacher'), registrationController.reject);

module.exports = router;
