const express = require('express');
const router = express.Router();
const multer = require('multer');
const questionController = require('../controllers/questionController');
const formatRecognitionController = require('../controllers/formatRecognitionController');
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

// 图片识别上传：内存存储，仅允许常见图片格式
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (allowed.includes(file.mimetype) || /\.(png|jpe?g|webp)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 PNG / JPG / JPEG / WebP 图片'));
        }
    },
});

// 所有题目接口均需登录
router.use(auth);

/**
 * 读 / 写的分界 —— **经用户确认的权限变更**，不是 R3 机械搬移的隐含行为。
 *
 * 产品裁决：**教师只能查看自己所教科目的题库；所有题库写能力仅管理员可用。**
 * 所以本文件里**全部 7 条写路由**一律收成 `requireRoles('admin')`，教师不再可调用。
 *
 * 为什么服务端也要收一遍、而不是只在前端把入口藏起来：前端隐藏只是 UI，
 * 任何人拿到 token 都能直接发 HTTP 请求。写权限必须以**服务端**为准 ——
 * 验收时要断言的是 HTTP 403，不是「按钮不见了」。
 * （本仓库**没有**自动化测试框架，所以这条只能靠真实 HTTP 请求验收，见 `docs/R3 验收报告.md`。）
 *
 * 完整枚举本文件的写路由（7 条，逐条对照，避免漏掉批量 / 导入 / 图片 这类非 RESTful 入口）：
 *   1. POST   /batch-import                    Excel 批量导入
 *   2. POST   /batch-delete                    批量删除
 *   3. POST   /format-recognition/recognize    图片识别（本身不落库，但它只服务于随后的 import，
 *                                              所以和 import 一起收 —— 否则教师仍能拿到结构化题目）
 *   4. POST   /format-recognition/import       图片识别结果入库
 *   5. POST   /                                 新增单题
 *   6. PUT    /:id                              修改单题
 *   7. DELETE /:id                              删除单题
 *
 * ⚠️ 本文件之外**还有一条**题库写入口：`POST /ai/generate/save`（在 `routes/ai.js`），
 *    AI 出题结果入库，走的是同一个 `questionService.batchImport`。它同样已收成仅管理员。
 *    只在本文件里搜索是搜不到「AI」这个入口的 —— 换文件时别忘了它。
 *
 * 读路由（`GET /`、`/search`、`/statistics`、`/:id`）保持所有登录用户可用；
 * 教师具体能读到哪些行，由服务层按其所教科目收窄（见 `services/questionService.js`）。
 *
 * 注意：批量接口放在 `/:id` 之前，避免被动态参数匹配。
 */
router.post('/batch-import', requireRoles('admin'), upload.single('file'), questionController.batchImport);
router.post('/batch-delete', requireRoles('admin'), questionController.batchDelete);
router.post('/format-recognition/recognize', requireRoles('admin'), imageUpload.single('image'), formatRecognitionController.recognize);
router.post('/format-recognition/import', requireRoles('admin'), formatRecognitionController.importQuestions);
router.post('/', requireRoles('admin'), validateQuestionInput, questionController.create);
router.get('/', questionController.findAll);
router.get('/search', questionController.search);
router.get('/statistics', questionController.statistics);
router.get('/:id', validateIdParam, questionController.findById);
router.put('/:id', requireRoles('admin'), validateIdParam, validateQuestionInput, questionController.update);
router.delete('/:id', requireRoles('admin'), validateIdParam, questionController.remove);

module.exports = router;
