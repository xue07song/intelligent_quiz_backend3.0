const express = require('express');
const router = express.Router();
const multer = require('multer');
const studentQuestionController = require('../controllers/studentQuestionController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

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

router.use(auth);

router.post('/batch-import', requireRoles('student'), upload.single('file'), studentQuestionController.batchImport);
router.post('/batch-delete', requireRoles('student'), studentQuestionController.batchDelete);
router.post('/import-from-public', requireRoles('student'), studentQuestionController.importFromPublic);
router.post('/batch-import-from-public', requireRoles('student'), studentQuestionController.batchImportFromPublic);
router.post('/', requireRoles('student'), studentQuestionController.create);
router.get('/', requireRoles('student'), studentQuestionController.findAll);
router.get('/statistics', requireRoles('student'), studentQuestionController.statistics);
router.get('/:id', requireRoles('student'), studentQuestionController.findById);
router.put('/:id', requireRoles('student'), studentQuestionController.update);
router.delete('/:id', requireRoles('student'), studentQuestionController.remove);

module.exports = router;
