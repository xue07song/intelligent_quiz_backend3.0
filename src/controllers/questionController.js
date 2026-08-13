const questionService = require('../services/questionService');
const { success, paginated } = require('../utils/response');

// 统一构造操作者上下文（供 service 做科目权限过滤）
const buildActor = (req) => ({ id: req.user.id, role: req.user.role });

const create = async (req, res, next) => {
    try {
        const result = await questionService.createQuestion(req.body, buildActor(req));
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
            id: req.query.id,
            章节: req.query.章节,
            题型: req.query.题型,
            难度: req.query.难度,
            关键词: req.query.关键词,
            出题人: req.query.出题人,
            科目: req.query.科目,
        }, buildActor(req));
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const findById = async (req, res, next) => {
    try {
        const question = await questionService.getQuestionById(req.params.id, buildActor(req));
        res.json(success(question));
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        await questionService.updateQuestion(req.params.id, req.body, buildActor(req));
        res.json(success(null, '✅ 更新成功'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await questionService.deleteQuestion(req.params.id, buildActor(req));
        res.json(success(null, '✅ 删除成功'));
    } catch (err) {
        next(err);
    }
};

// 批量导入（解析 Excel 文件）。可通过 form 字段 subject 统一指定导入科目
const batchImport = async (req, res, next) => {
    try {
        const XLSX = require('xlsx');
        if (!req.file) {
            const error = new Error('请上传 Excel 文件');
            error.statusCode = 400;
            error.errorCode = 40001;
            throw error;
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const subject = req.body && req.body.subject ? req.body.subject : undefined;
        const result = await questionService.batchImport(rows, { subject }, buildActor(req));
        res.status(201).json(success(result, `✅ 导入完成：成功 ${result.inserted} 条，跳过 ${result.skipped} 条，无效 ${result.invalid} 条`));
    } catch (err) {
        next(err);
    }
};

// 批量删除
const batchDelete = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const result = await questionService.batchDelete(ids, buildActor(req));
        res.json(success(result, `✅ 批量删除完成：共删除 ${result.deleted} 条`));
    } catch (err) {
        next(err);
    }
};

const statistics = async (req, res, next) => {
    try {
        const stats = await questionService.getStatistics(buildActor(req));
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

const search = async (req, res, next) => {
    try {
        const keyword = req.query.kw || req.query.keyword || '';
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await questionService.searchQuestions(keyword, { page, pageSize }, buildActor(req));
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

module.exports = { create, findAll, findById, update, remove, batchImport, batchDelete, statistics, search };