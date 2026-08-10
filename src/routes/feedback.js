const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 所有接口都需要登录
router.use(auth);

// 用户接口（所有登录用户）
router.post('/', feedbackController.create);                       // 提交反馈
router.get('/mine', feedbackController.myList);                    // 我的反馈列表
router.get('/:id', feedbackController.detail);                     // 反馈详情（本人或管理员）
router.delete('/:id', feedbackController.remove);                  // 删除反馈（本人或管理员）

// 管理员接口
router.get('/', requireRoles('admin'), feedbackController.list);                 // 查看所有反馈
router.patch('/:id/status', requireRoles('admin'), feedbackController.changeStatus); // 更新状态
router.patch('/:id/reply', requireRoles('admin'), feedbackController.reply);         // 回复反馈

module.exports = router;
