const studentQuestionModel = require('../models/studentQuestionModel');

const createQuestion = async (studentId, data) => {
    const questionId = data.question_id || data.id;
    if (!questionId) {
        const error = new Error('题目编号不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const existing = await studentQuestionModel.findByQuestionId(questionId, studentId);
    if (existing) {
        const error = new Error('题目编号已存在');
        error.statusCode = 409;
        error.errorCode = 40901;
        throw error;
    }
    const { id: _, ...rest } = data;
    return studentQuestionModel.create({ ...rest, question_id: questionId, student_id: studentId });
};

const getQuestions = async (studentId, options) => {
    return studentQuestionModel.findByStudent({ ...options, student_id: studentId });
};

const getQuestionById = async (id, studentId) => {
    const question = await studentQuestionModel.findById(id, studentId);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return question;
};

const updateQuestion = async (id, studentId, data) => {
    const existing = await studentQuestionModel.findById(id, studentId);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return studentQuestionModel.update(id, studentId, data);
};

const deleteQuestion = async (id, studentId) => {
    const existing = await studentQuestionModel.findById(id, studentId);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return studentQuestionModel.remove(id, studentId);
};

const batchImport = async (studentId, items) => {
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
        if (!item.题目) {
            errors.push({ row: rowNum, id: item.id || item.ID || '(空)', reason: '题目内容为空' });
            return;
        }

        const questionId = item.id || item.ID || `SQ${Date.now()}_${rowNum}`;

        validItems.push({
            student_id: studentId,
            question_id: String(questionId).trim(),
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

    const allIds = validItems.map((v) => v.question_id);
    const existingIds = new Set(await studentQuestionModel.findExistingQuestionIds(allIds, studentId));

    const toInsert = validItems.filter((v) => !existingIds.has(v.question_id));
    const skipped = validItems.filter((v) => existingIds.has(v.question_id)).map((v) => ({
        row: items.findIndex((it) => String(it.id || it.ID || '').trim() === v.question_id) + 1,
        id: v.question_id,
        reason: '题目编号已存在，跳过',
    }));

    let insertedCount = 0;
    if (toInsert.length > 0) {
        const result = await studentQuestionModel.batchCreate(toInsert);
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

const batchDelete = async (studentId, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        const error = new Error('请选择要删除的题目');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const result = await studentQuestionModel.batchRemove(ids, studentId);
    return { deleted: result.affectedRows, total: ids.length };
};

const getStatistics = async (studentId) => {
    return studentQuestionModel.statistics(studentId);
};

// 从公共题库导入题目到学生题库（单道）
const importFromPublic = async (studentId, questionId) => {
    if (!questionId) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const qid = String(questionId).trim();

    // 检查是否已存在
    const existing = await studentQuestionModel.findByQuestionId(qid, studentId);
    if (existing) {
        const error = new Error('该题目已在你的题库中');
        error.statusCode = 409;
        error.errorCode = 40901;
        throw error;
    }

    // 从公共题库查询题目
    const publicQuestion = await studentQuestionModel.findPublicQuestionById(qid);
    if (!publicQuestion) {
        const error = new Error('公共题库中未找到该题目');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    // 复制到学生题库
    return studentQuestionModel.create({
        student_id: studentId,
        question_id: qid,
        章节: publicQuestion.章节 || 0,
        题型: publicQuestion.题型 || 2,
        序号: publicQuestion.序号 || 0,
        题目: publicQuestion.题目 || '',
        选项: publicQuestion.选项 || '',
        答案: publicQuestion.答案 || '',
        解析: publicQuestion.解析 || '',
        难度: publicQuestion.难度 || '',
        知识点: publicQuestion.知识点 || '',
        使用频度: publicQuestion.使用频度 || '0',
        出题人: publicQuestion.出题人 || '',
    });
};

// 批量从公共题库导入题目到学生题库
const batchImportFromPublic = async (studentId, questionIds) => {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
        const error = new Error('题目ID列表不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const ids = questionIds.map((id) => String(id).trim()).filter(Boolean);

    // 查出已在学生题库中的
    const existingIds = new Set(await studentQuestionModel.findExistingQuestionIds(ids, studentId));

    // 过滤出需要导入的
    const toImport = ids.filter((id) => !existingIds.has(id));

    if (toImport.length === 0) {
        return { total: ids.length, inserted: 0, skipped: ids.length, notFound: 0 };
    }

    // 从公共题库批量查询
    const publicQuestions = await studentQuestionModel.findPublicQuestionsByIds(toImport);
    const foundIds = new Set(publicQuestions.map((q) => String(q.id)));
    const notFoundIds = toImport.filter((id) => !foundIds.has(id));

    // 构建插入数据
    const items = publicQuestions.map((q) => ({
        student_id: studentId,
        question_id: String(q.id),
        章节: q.章节 || 0,
        题型: q.题型 || 2,
        序号: q.序号 || 0,
        题目: q.题目 || '',
        选项: q.选项 || '',
        答案: q.答案 || '',
        解析: q.解析 || '',
        难度: q.难度 || '',
        知识点: q.知识点 || '',
        使用频度: q.使用频度 || '0',
        出题人: q.出题人 || '',
    }));

    let insertedCount = 0;
    if (items.length > 0) {
        const result = await studentQuestionModel.batchCreate(items);
        insertedCount = result.affectedRows;
    }

    return {
        total: ids.length,
        inserted: insertedCount,
        skipped: existingIds.size,
        notFound: notFoundIds.length,
    };
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
    importFromPublic,
    batchImportFromPublic,
};
