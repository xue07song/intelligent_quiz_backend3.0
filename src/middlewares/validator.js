const { error } = require('../utils/response');

const validateQuestionInput = (req, res, next) => {
    const { id, 题目 } = req.body;

    if (req.method === 'POST') {
        if (!id || !id.trim()) {
            return res.status(400).json(error(40001, 'ID不能为空'));
        }
        if (!题目 || !题目.trim()) {
            return res.status(400).json(error(40001, '题目内容不能为空'));
        }
    }

    if (req.method === 'PUT') {
        if (id !== undefined && !id.trim()) {
            return res.status(400).json(error(40001, 'ID不能为空'));
        }
        if (req.body.题目 !== undefined && !req.body.题目.trim()) {
            return res.status(400).json(error(40001, '题目内容不能为空'));
        }
    }

    const validTypes = [1, 2, 3, 4, 5, 6];
    if (req.body.题型 !== undefined && !validTypes.includes(Number(req.body.题型))) {
        return res.status(400).json(error(40002, '题型无效，有效值为：1判断 2单选 3多选 4填空 5简答 6程序'));
    }

    const validDifficulties = ['1', '2', '3', '4', '5', '1-5'];
    if (req.body.难度 !== undefined && !validDifficulties.some(d => String(req.body.难度).includes(d))) {
        return res.status(400).json(error(40003, '难度值无效'));
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