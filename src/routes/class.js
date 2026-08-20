const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 所有班级接口均需登录
router.use(auth);

// 班级列表（教师/管理员可用，学生也可读取用于查看自己班级）
router.get('/', classController.list);

// 未分班学生列表（仅教师/管理员）—— 兼容两种路径
router.get('/unassigned/students', requireRoles('admin', 'teacher'), classController.unassigned);
router.get('/unassigned-students', requireRoles('admin', 'teacher'), classController.unassigned);
router.get('/teachers/options', requireRoles('admin', 'teacher'), classController.teachers);
router.get('/options/all', requireRoles('teacher', 'admin'), classController.allOptions);
router.get('/mine', requireRoles('teacher'), classController.mine);
router.put('/mine', requireRoles('teacher'), classController.updateMine);
router.get('/academic/structure', requireRoles('admin'), classController.structure);
router.post('/academic/colleges', requireRoles('admin'), classController.addCollege);
router.post('/academic/majors', requireRoles('admin'), classController.addMajor);

// 调班接口（PATCH /transfer-student）
router.patch('/transfer-student', requireRoles('admin', 'teacher'), classController.transfer);

// 班级详情（含学生列表）
router.get('/:id', classController.detail);

// 创建班级（仅教师/管理员）
router.post('/', requireRoles('admin', 'teacher'), classController.create);

// 更新班级
router.put('/:id', requireRoles('admin', 'teacher'), classController.update);

// 删除班级
router.delete('/:id', requireRoles('admin', 'teacher'), classController.remove);

// 学生分班 / 调班（批量）—— 兼容 /:id/students 和 /:id/students/batch 两种路径
router.post('/:id/students', requireRoles('admin', 'teacher'), classController.assignStudents);
router.post('/:id/students/batch', requireRoles('admin', 'teacher'), classController.assignStudents);

// 学生移出班级 —— 兼容 body 传 studentIds 数组 和 路径传单个 studentId
router.delete('/:id/students', requireRoles('admin', 'teacher'), classController.removeStudents);
router.delete('/:id/students/:studentId', requireRoles('admin', 'teacher'), classController.removeStudents);

module.exports = router;
