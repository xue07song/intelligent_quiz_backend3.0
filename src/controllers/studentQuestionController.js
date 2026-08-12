const studentQuestionService = require('../services/studentQuestionService');
const { success, paginated } = require('../utils/response');

const create = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const result = await studentQuestionService.createQuestion(studentId, req.body);
        res.status(201).json(success({ id: req.body.id }, '✅ 题目创建成功'));
    } catch (err) {
        next(err);
    }
};

const findAll = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await studentQuestionService.getQuestions(studentId, {
            page,
            pageSize,
            题型: req.query.题型,
            难度: req.query.难度,
            关键词: req.query.关键词,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const findById = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const question = await studentQuestionService.getQuestionById(req.params.id, studentId);
        res.json(success(question));
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        await studentQuestionService.updateQuestion(req.params.id, studentId, req.body);
        res.json(success(null, '✅ 更新成功'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        await studentQuestionService.deleteQuestion(req.params.id, studentId);
        res.json(success(null, '✅ 删除成功'));
    } catch (err) {
        next(err);
    }
};

const batchImport = async (req, res, next) => {
    try {
        const XLSX = require('xlsx');
        const studentId = req.user.id;
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

        const result = await studentQuestionService.batchImport(studentId, rows);
        res.status(201).json(success(result, `✅ 导入完成：成功 ${result.inserted} 条，跳过 ${result.skipped} 条，无效 ${result.invalid} 条`));
    } catch (err) {
        next(err);
    }
};

const batchDelete = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const { ids } = req.body;
        const result = await studentQuestionService.batchDelete(studentId, ids);
        res.json(success(result, `✅ 批量删除完成：共删除 ${result.deleted} 条`));
    } catch (err) {
        next(err);
    }
};

const statistics = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const stats = await studentQuestionService.getStatistics(studentId);
        res.json(success(stats));
    } catch (err) {
        next(err);
    }
};

// 从公共题库导入单道题目到学生题库
const importFromPublic = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const { question_id } = req.body;
        await studentQuestionService.importFromPublic(studentId, question_id);
        res.status(201).json(success(null, '✅ 已加入我的题库'));
    } catch (err) {
        next(err);
    }
};

// 批量从公共题库导入题目到学生题库
const batchImportFromPublic = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const { question_ids } = req.body;
        const result = await studentQuestionService.batchImportFromPublic(studentId, question_ids);
        const msg = `✅ 导入完成：成功 ${result.inserted} 条，跳过 ${result.skipped} 条，未找到 ${result.notFound} 条`;
        res.status(201).json(success(result, msg));
    } catch (err) {
        next(err);
    }
};

module.exports = { create, findAll, findById, update, remove, batchImport, batchDelete, statistics, importFromPublic, batchImportFromPublic };
