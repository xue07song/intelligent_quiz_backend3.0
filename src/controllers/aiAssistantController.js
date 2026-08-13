const aiAssistantService = require('../services/aiAssistantService');
const { success } = require('../utils/response');

const chat = async (req, res, next) => {
    try {
        const result = await aiAssistantService.chat({
            userId: req.user.id,
            message: req.body.message,
            currentPage: req.body.currentPage,
            currentQuestionId: req.body.currentQuestionId,
            currentExamId: req.body.currentExamId,
            examOptions: req.body.examOptions,
        });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

module.exports = { chat };
