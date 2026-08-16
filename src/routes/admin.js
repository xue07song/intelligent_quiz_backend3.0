const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');
const studentQuestionController = require('../controllers/studentQuestionController');

router.use(auth, requireRoles('admin'));

router.get('/student-questions', studentQuestionController.adminList);
router.delete('/student-questions/:id', studentQuestionController.adminRemove);

router.get('/student-moderators', studentQuestionController.listModerators);
router.post('/student-moderators', studentQuestionController.createModerator);
router.delete('/student-moderators/:id', studentQuestionController.removeModerator);

module.exports = router;
