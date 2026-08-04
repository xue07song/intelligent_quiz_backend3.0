const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 用户管理全部接口需登录 + 管理员权限
router.use(auth, requireRoles('admin'));

router.get('/', userController.findAll);
router.get('/:id', userController.findById);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.patch('/:id/password', userController.changePassword);
router.patch('/:id/status', userController.toggleStatus);
router.delete('/:id', userController.remove);

module.exports = router;
