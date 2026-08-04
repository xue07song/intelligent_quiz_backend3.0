const express = require('express');
const router = express.Router();
const multer = require('multer');
const questionController = require('../controllers/questionController');
const { validateQuestionInput, validateIdParam } = require('../middlewares/validator');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 文件上传配置：内存存储（不落盘），限制 5MB，仅允许 Excel
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ];
        if (allowed.includes(file.mimetype) || /\.(xlsx|xls)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 .xlsx 或 .xls 文件'));
        }
    },
});

// 所有题目接口均需登录
router.use(auth);

// 写操作仅教师/管理员可用；读操作所有登录用户可用
// 注意：批量接口放在 /:id 之前，避免被动态参数匹配
router.post('/batch-import', requireRoles('admin', 'teacher'), upload.single('file'), questionController.batchImport);
router.post('/batch-delete', requireRoles('admin', 'teacher'), questionController.batchDelete);
router.post('/', requireRoles('admin', 'teacher'), validateQuestionInput, questionController.create);
router.get('/', questionController.findAll);
router.get('/search', questionController.search);
router.get('/statistics', questionController.statistics);
router.get('/:id', validateIdParam, questionController.findById);
router.put('/:id', requireRoles('admin', 'teacher'), validateIdParam, validateQuestionInput, questionController.update);
router.delete('/:id', requireRoles('admin', 'teacher'), validateIdParam, questionController.remove);

module.exports = router;
