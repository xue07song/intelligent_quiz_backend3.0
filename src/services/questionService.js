const questionModel = require('../models/questionModel');

const createQuestion = async (data) => {
    const existing = await questionModel.findById(data.id);
    if (existing) {
        const error = new Error('题目ID已存在');
        error.statusCode = 409;
        error.errorCode = 40901;
        throw error;
    }
    return questionModel.create(data);
};

const getQuestions = async (options) => {
    return questionModel.findAll(options);
};

const getQuestionById = async (id) => {
    const question = await questionModel.findById(id);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return question;
};

const updateQuestion = async (id, data) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return questionModel.update(id, data);
};

const deleteQuestion = async (id) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return questionModel.remove(id);
};

// 批量导入：解析题目数组，返回成功/失败明细
const batchImport = async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error('导入数据不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const validItems = [];
    const errors = [];

    items.forEach((item, index) => {
        const rowNum = index + 1;
        // 必填字段校验
        if (!item.id || !item.题目) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: 'ID 或 题目内容 为空' });
            return;
        }
        // 标准化字段
        validItems.push({
            id: String(item.id).trim(),
            章节: Number(item.章节) || 0,
            题型: Number(item.题型) || 2,
            序号: Number(item.序号) || 0,
            题目: String(item.题目).trim(),
            选项: item.选项 ? String(item.选项) : '',
            答案: item.答案 ? String(item.答案) : '',
            解析: item.解析 ? String(item.解析) : '',
            难度: item.难度 != null ? String(item.难度) : '',
            知识点: item.知识点 ? String(item.知识点) : '',
            使用频度: item.使用频率 != null ? String(item.使用频率) : '0',
            出题人: item.出题人 ? String(item.出题人) : '',
        });
    });

    if (validItems.length === 0) {
        const error = new Error('没有有效的题目数据可导入');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    // 批量查询已存在的 id（单次查询替代 N+1）
    const allIds = validItems.map((v) => v.id);
    const existingIds = new Set(await questionModel.findExistingIds(allIds));

    const toInsert = validItems.filter((v) => !existingIds.has(v.id));
    const skipped = validItems.filter((v) => existingIds.has(v.id)).map((v) => ({
        row: items.findIndex((it) => String(it.id).trim() === v.id) + 1,
        id: v.id,
        reason: 'ID 已存在，跳过',
    }));

    let insertedCount = 0;
    if (toInsert.length > 0) {
        const result = await questionModel.batchCreate(toInsert);
        insertedCount = result.affectedRows;
    }

    return {
        total: items.length,
        inserted: insertedCount,
        skipped: skipped.length,
        invalid: errors.length,
        errors: [...errors, ...skipped],
    };
};

// 批量删除
const batchDelete = async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        const error = new Error('请选择要删除的题目');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const result = await questionModel.batchRemove(ids);
    return { deleted: result.affectedRows, total: ids.length };
};

const getStatistics = async () => {
    return questionModel.statistics();
};

const searchQuestions = async (keyword, { page, pageSize } = {}) => {
    if (!keyword || !keyword.trim()) {
        const error = new Error('搜索关键词不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    return questionModel.searchByKeyword(keyword.trim(), { page, pageSize });
};

module.exports = {
    createQuestion,
    getQuestions,
    getQuestionById,
    updateQuestion,
    deleteQuestion,
    batchImport,
    batchDelete,
    getStatistics,
    searchQuestions,
};