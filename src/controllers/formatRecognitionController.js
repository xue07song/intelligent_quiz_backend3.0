const formatRecognitionService = require('../services/formatRecognitionService');
const { success } = require('../utils/response');

const recognize = async (req, res, next) => {
    try {
        if (!req.file) {
            const error = new Error('请上传图片文件');
            error.statusCode = 400;
            error.errorCode = 40001;
            throw error;
        }
        const result = await formatRecognitionService.recognizeImage({
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
        });
        res.json(success(result));
    } catch (err) {
        next(err);
    }
};

const importQuestions = async (req, res, next) => {
    try {
        const result = await formatRecognitionService.importQuestions({
            items: req.body.questions,
            subject: req.body.subject,
            actor: req.user,
        });
        res.status(201).json(
            success(result, `✅ 图片识别题目导入完成：成功 ${result.inserted} 条，跳过 ${result.skipped} 条，无效 ${result.invalid} 条`)
        );
    } catch (err) {
        next(err);
    }
};

module.exports = { recognize, importQuestions };
