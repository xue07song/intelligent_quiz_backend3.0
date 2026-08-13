const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');
const { isValidSubject } = require('../config/subjects');

// 统一构造错误
const makeError = (message, statusCode, errorCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

// 获取操作者上下文：教师返回其所教科目数组，其他角色返回 null（不限制）
const getActorSubjects = async (actor) => {
    if (!actor || actor.role !== 'teacher') return null;
    return userModel.getTeacherSubjects(actor.id);
};

// 校验单个科目是否在教师权限内；管理员只校验合法性
const assertSubjectAllowed = (subject, teacherSubjects) => {
    if (subject === undefined || subject === null || String(subject).trim() === '') {
        // 允许不指定科目（兼容旧数据）
        return;
    }
    const s = String(subject).trim();
    if (!isValidSubject(s)) {
        throw makeError(`科目「${s}」不在合法科目列表中`, 400, 40002);
    }
    if (teacherSubjects !== null && !teacherSubjects.includes(s)) {
        throw makeError(`无权操作科目「${s}」，您只能管理自己所教的科目`, 403, 40303);
    }
};

const createQuestion = async (data, actor) => {
    const existing = await questionModel.findById(data.id);
    if (existing) {
        throw makeError('题目ID已存在', 409, 40901);
    }
    const teacherSubjects = await getActorSubjects(actor);
    assertSubjectAllowed(data.科目, teacherSubjects);
    return questionModel.create(data);
};

const getQuestions = async (options, actor) => {
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects === null) {
        // 非教师：按调用方传入的 科目 参数过滤（可为空=不过滤）
        return questionModel.findAll(options);
    }
    // 教师：无任何科目 -> 返回空
    if (teacherSubjects.length === 0) {
        return { rows: [], total: 0 };
    }
    // 教师传了具体 科目 -> 必须在其所教科目内
    if (options.科目 !== undefined && options.科目 !== null && String(options.科目).trim() !== '') {
        const s = String(options.科目).trim();
        if (!teacherSubjects.includes(s)) {
            return { rows: [], total: 0 };
        }
        return questionModel.findAll({ ...options, 科目: s });
    }
    // 教师未传 科目 -> 看自己所有科目
    return questionModel.findAll({ ...options, 科目: teacherSubjects });
};

const getQuestionById = async (id, actor) => {
    const question = await questionModel.findById(id);
    if (!question) {
        throw makeError('题目不存在', 404, 40401);
    }
    // 教师只能查看自己所教科目内的题目
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects !== null && question.科目 && !teacherSubjects.includes(question.科目)) {
        throw makeError('无权查看该题目：不在您所教科目范围内', 403, 40303);
    }
    return question;
};

const updateQuestion = async (id, data, actor) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        throw makeError('题目不存在', 404, 40401);
    }
    const teacherSubjects = await getActorSubjects(actor);
    // 教师只能改自己所教科目内的题目
    if (teacherSubjects !== null && existing.科目 && !teacherSubjects.includes(existing.科目)) {
        throw makeError('无权修改该题目：不在您所教科目范围内', 403, 40303);
    }
    // 若要变更科目，新科目也必须在权限内
    if (data.科目 !== undefined) {
        assertSubjectAllowed(data.科目, teacherSubjects);
    }
    return questionModel.update(id, data);
};

const deleteQuestion = async (id, actor) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        throw makeError('题目不存在', 404, 40401);
    }
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects !== null && existing.科目 && !teacherSubjects.includes(existing.科目)) {
        throw makeError('无权删除该题目：不在您所教科目范围内', 403, 40303);
    }
    return questionModel.remove(id);
};

// 批量导入：解析题目数组，返回成功/失败明细
// options.subject 可统一指定导入科目录入到每条题目（教师必须在自己科目内）
const batchImport = async (items, options = {}, actor) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw makeError('导入数据不能为空', 400, 40001);
    }

    const teacherSubjects = await getActorSubjects(actor);
    // 统一科目录入：校验合法性 + 权限
    let unifiedSubject = null;
    if (options.subject !== undefined && options.subject !== null && String(options.subject).trim() !== '') {
        unifiedSubject = String(options.subject).trim();
        assertSubjectAllowed(unifiedSubject, teacherSubjects);
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
        // 确定本条科目：行级「科目」列优先 > 统一 subject 参数 > 空
        let subject = null;
        if (item.科目 !== undefined && item.科目 !== null && String(item.科目).trim() !== '') {
            subject = String(item.科目).trim();
        } else if (unifiedSubject) {
            subject = unifiedSubject;
        }
        // 行级科目同样需校验合法性 + 权限
        if (subject !== null) {
            if (!isValidSubject(subject)) {
                errors.push({ row: rowNum, id: item.id, reason: `非法科目「${subject}」` });
                return;
            }
            if (teacherSubjects !== null && !teacherSubjects.includes(subject)) {
                errors.push({ row: rowNum, id: item.id, reason: `无权导入科目「${subject}」` });
                return;
            }
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
            科目: subject,
        });
    });

    if (validItems.length === 0) {
        throw makeError('没有有效的题目数据可导入', 400, 40001);
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
const batchDelete = async (ids, actor) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw makeError('请选择要删除的题目', 400, 40001);
    }
    // 教师：只能删除自己所教科目内的题目，先校验
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects !== null) {
        const rows = await questionModel.findSubjectsByIds(ids);
        for (const r of rows) {
            if (r.科目 && !teacherSubjects.includes(r.科目)) {
                throw makeError(`无权删除题目 ${r.id}：科目「${r.科目}」不在您所教范围内`, 403, 40303);
            }
        }
    }
    const result = await questionModel.batchRemove(ids);
    return { deleted: result.affectedRows, total: ids.length };
};

const getStatistics = async (actor) => {
    const teacherSubjects = await getActorSubjects(actor);
    const stats = await questionModel.statistics();
    if (teacherSubjects === null) {
        return stats;
    }
    // 教师：统计仅限自己科目
    const subjectSet = new Set(teacherSubjects);
    return {
        ...stats,
        bySubject: (stats.bySubject || []).filter((s) => subjectSet.has(s.subject)),
    };
};

const searchQuestions = async (keyword, { page, pageSize } = {}, actor) => {
    if (!keyword || !keyword.trim()) {
        throw makeError('搜索关键词不能为空', 400, 40001);
    }
    // 教师：搜索也限定在自己科目内
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects !== null && teacherSubjects.length === 0) {
        return { rows: [], total: 0 };
    }
    // 注意：当前 searchByKeyword 不支持科目过滤，这里返回全集给非教师；
    // 教师场景在前端已按科目隔离题库，搜索入口可按需后续扩展。
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