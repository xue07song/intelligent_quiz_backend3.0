const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 登录（公开）
router.post('/login', authController.login);

// 提交注册申请（公开）
router.post('/register', authController.register);

// 注册申请管理（管理员/教师）
router.get('/registrations', auth, requireRoles('admin', 'teacher'), authController.listRegistrations);
router.patch('/registrations/:id/approve', auth, requireRoles('admin', 'teacher'), authController.approveRegistration);
router.patch('/registrations/:id/reject', auth, requireRoles('admin', 'teacher'), authController.rejectRegistration);

// 获取当前登录用户信息（需登录）
router.get('/profile', auth, authController.profile);

// 修改自己的密码（需登录）
router.post('/change-password', auth, authController.changePassword);

module.exports = router;
