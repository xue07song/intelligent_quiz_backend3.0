const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { validateQuestionInput, validateIdParam } = require('../middlewares/validator');

router.post('/', validateQuestionInput, questionController.create);
router.get('/', questionController.findAll);
router.get('/search', questionController.search);
router.get('/statistics', questionController.statistics);
router.get('/:id', validateIdParam, questionController.findById);
router.put('/:id', validateIdParam, validateQuestionInput, questionController.update);
router.delete('/:id', validateIdParam, questionController.remove);

module.exports = router;