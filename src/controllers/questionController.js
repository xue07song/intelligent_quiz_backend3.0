const questionService = require('../services/questionService');
const { success, paginated } = require('../utils/response');

const create = async (req, res, next) => {
    try {
        const result = await questionService.createQuestion(req.body);
        res.status(201).json(success({ id: req.body.id }, '✅ 题目创建成功'));
    } catch (err) {
        next(err);
    }
};

const findAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await questionService.getQuestions({
            page,
            pageSize,
            章节: req.query.章节,
            题型: req.query.题型,
            难度: req.query.难度,
            关键词: req.query.关键词,
            出题人: req.query.出题人,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const findById = async (req, res, next) => {
    try {
        const question = await questionService.getQuestionById(req.params.id);
        res.json(success(question));
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        await questionService.updateQuestion(req.params.id, req.body);
        res.json(success(null, '✅ 更新成功'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await questionService.deleteQuestion(req.params.id);
        res.json(success(null, '✅ 删除成功'));
    } catch (err) {
        next(err);
    }
};

const statistics = async (req, res, next) => {
    try {
        const stats = await questionService.getStatistics();
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

const search = async (req, res, next) => {
    try {
        const keyword = req.query.kw || req.query.keyword || '';
        const results = await questionService.searchQuestions(keyword);
        res.json(success(results));
    } catch (err) {
        next(err);
    }
};

module.exports = { create, findAll, findById, update, remove, statistics, search };