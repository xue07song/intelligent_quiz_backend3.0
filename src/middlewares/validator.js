const { error } = require('../utils/response');
const { validateQuestionPayload, isValidDifficulty } = require('../utils/questionValidation');

const validateQuestionInput = (req, res, next) => {
    if (req.method === 'POST') {
        const result = validateQuestionPayload(req.body, {
            requireId: true,
            requireSubject: true,
            requireDifficulty: true,
            requireAnswer: true,
        });
        if (!result.valid) {
            return res.status(400).json(error(40001, result.errors[0]));
        }
        return next();
    }

    if (req.method === 'PUT') {
        if (req.body.id !== undefined && (!req.body.id || !String(req.body.id).trim())) {
            return res.status(400).json(error(40001, 'ID不能为空'));
        }
        if (req.body.题目 !== undefined && !String(req.body.题目 || '').trim()) {
            return res.status(400).json(error(40001, '题目内容不能为空'));
        }
        if (req.body.题型 !== undefined) {
            const result = validateQuestionPayload({ ...req.body }, { requireAnswer: true, requireTitle: false });
            if (!result.valid) {
                return res.status(400).json(error(40002, result.errors[0]));
            }
        }
        if (req.body.难度 !== undefined && req.body.难度 !== '' && !isValidDifficulty(req.body.难度)) {
            return res.status(400).json(error(40003, '难度值无效，仅支持 1-5、1星-5星或简单/中等/困难等常用等级'));
        }
    }

    next();
};

const validateIdParam = (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return res.status(400).json(error(40004, '无效的ID格式'));
    }
    next();
};

module.exports = { validateQuestionInput, validateIdParam };
