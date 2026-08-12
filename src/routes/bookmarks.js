const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const bookmarkController = require('../controllers/bookmarkController');

// 所有接口都需要登录
router.use(auth);

// 收藏/取消收藏（切换）
router.post('/', bookmarkController.toggle);

// 收藏列表
router.get('/', bookmarkController.list);

// 批量检查是否已收藏
router.get('/check', bookmarkController.check);

// 更新收藏备注
router.put('/:id/note', bookmarkController.updateNote);

// 取消收藏
router.delete('/:id', bookmarkController.remove);

module.exports = router;
