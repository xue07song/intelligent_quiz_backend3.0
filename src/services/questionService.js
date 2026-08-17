const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');
const { isValidSubject } = require('../config/subjects');
const { validateQuestionPayload, isValidDifficulty, parseType } = require('../utils/questionValidation');

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

// 统一字段标准化：兼容前端历史字段「使用频率」与数据库字段「使用频度」
const normalizeQuestionData = (data) => {
    const copy = { ...data };
    if (copy.使用频率 !== undefined && copy.使用频度 === undefined) {
        copy.使用频度 = copy.使用频率;
    }
    delete copy.使用频率;

    const result = {};
    if (copy.id !== undefined) result.id = String(copy.id).trim();
    for (const key of ['章节', '序号']) {
        if (copy[key] !== undefined) result[key] = Number(copy[key]) || 0;
    }
    if (copy.题型 !== undefined) result.题型 = Number(copy.题型);
    for (const key of ['题目', '选项', '答案', '解析', '知识点', '出题人', '科目']) {
        if (copy[key] !== undefined) result[key] = String(copy[key]).trim();
    }
    for (const key of ['难度', '使用频度']) {
        if (copy[key] !== undefined) result[key] = String(copy[key]).trim();
    }
    return result;
};

const createQuestion = async (data, actor) => {
    const check = validateQuestionPayload(data, {
        requireId: true,
        requireSubject: true,
        requireDifficulty: true,
        requireAnswer: true,
    });
    if (!check.valid) {
        throw makeError(check.errors[0], 400, 40001);
    }
    const normalized = normalizeQuestionData(data);
    const teacherSubjects = await getActorSubjects(actor);
    assertSubjectAllowed(normalized.科目, teacherSubjects);
    const existing = await questionModel.findById(normalized.id);
    if (existing) {
        throw makeError('题目ID已存在', 409, 40901);
    }
    return questionModel.create(normalized);
};

const getQuestions = async (options, actor) => {
    const teacherSubjects = await getActorSubjects(actor);
    if (teacherSubjects === null) {
        // 非教师：按调用方传入的 科目 参数过滤（可为空=不过滤）
        return questionModel.findAll(options);
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
    // 用合并后的完整题目校验，避免切换题型后答案/选项不匹配
    const check = validateQuestionPayload({ ...existing, ...data }, { requireAnswer: true });
    if (!check.valid) {
        throw makeError(check.errors[0], 400, 40002);
    }
    return questionModel.update(id, normalizeQuestionData(data));
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

    const importTime = Date.now();
    items.forEach((item, index) => {
        const rowNum = index + 1;
        const 题目 = String(item.题目 ?? '').trim();
        const 题型 = parseType(item.题型);
        const 难度 = String(item.难度 ?? '').trim();
        if (!题目) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: '题目内容为空' });
            return;
        }
        if (题型 === null) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: `题型无效：${item.题型}` });
            return;
        }
        if (!难度 || !isValidDifficulty(难度)) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: '难度为空或无效，仅支持 1-5、1星-5星、简单/中等/困难等' });
            return;
        }
        // 确定本条科目：行级「科目」列优先 > 统一 subject 参数 > 空
        let subject = null;
        if (item.科目 !== undefined && item.科目 !== null && String(item.科目).trim() !== '') {
            subject = String(item.科目).trim();
        } else if (unifiedSubject) {
            subject = unifiedSubject;
        } else {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: '未指定科目，请填写行级科目或选择统一导入科目' });
            return;
        }
        // 行级科目同样需校验合法性 + 权限
        if (!isValidSubject(subject)) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: `非法科目「${subject}」` });
            return;
        }
        if (teacherSubjects !== null && !teacherSubjects.includes(subject)) {
            errors.push({ row: rowNum, id: item.id || '(空)', reason: `无权导入科目「${subject}」` });
            return;
        }
        // ID 可选：缺省时按导入批次自动生成，保证唯一
        const id = String(item.id ?? '').trim() || `IMP${importTime}${String(rowNum).padStart(3, '0')}`;
        const normalized = {
            id,
            章节: Number(item.章节) || 0,
            题型,
            序号: Number(item.序号) || 0,
            题目,
            选项: item.选项 ? String(item.选项).trim() : '',
            答案: item.答案 ? String(item.答案).trim() : '',
            解析: item.解析 ? String(item.解析).trim() : '',
            难度,
            知识点: item.知识点 ? String(item.知识点).trim() : '',
            使用频度: item.使用频率 ?? item.使用频度 ?? '0',
            出题人: item.出题人 ? String(item.出题人).trim() : '',
            科目: subject,
        };
        const check = validateQuestionPayload(normalized, { requireAnswer: true });
        if (!check.valid) {
            errors.push({ row: rowNum, id, reason: check.errors[0] });
            return;
        }
        normalized.使用频度 = String(normalized.使用频度).trim();
        validItems.push(normalized);
    });

    if (validItems.length === 0) {
        throw makeError('没有有效的题目数据可导入', 400, 40001);
    }

    // 文件内 ID 重复：仅保留第一条，其余计入跳过明细
    const seen = new Set();
    const uniqueItems = [];
    const fileDuplicateItems = [];
    for (const item of validItems) {
        if (seen.has(item.id)) {
            fileDuplicateItems.push(item);
            continue;
        }
        seen.add(item.id);
        uniqueItems.push(item);
    }

    // 批量查询已存在的 id（单次查询替代 N+1）
    const allIds = uniqueItems.map((v) => v.id);
    const existingIds = new Set(await questionModel.findExistingIds(allIds));

    const toInsert = uniqueItems.filter((v) => !existingIds.has(v.id));
    const skipped = [
        ...uniqueItems.filter((v) => existingIds.has(v.id)).map((v) => ({
            row: items.findIndex((it) => String(it.id).trim() === v.id) + 1,
            id: v.id,
            reason: 'ID 已存在，跳过',
        })),
        ...fileDuplicateItems.map((v) => ({
            row: items.findIndex((it) => String(it.id).trim() === v.id) + 1,
            id: v.id,
            reason: '文件中 ID 重复，仅保留第一条',
        })),
    ];

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
    return questionModel.statistics(teacherSubjects);
};

const searchQuestions = async (keyword, { page, pageSize } = {}, actor) => {
    if (!keyword || !keyword.trim()) {
        throw makeError('搜索关键词不能为空', 400, 40001);
    }
    // 教师：搜索也限定在自己科目内
    const teacherSubjects = await getActorSubjects(actor);
    const subjects = teacherSubjects === null ? null : teacherSubjects;
    return questionModel.searchByKeyword(keyword.trim(), { page, pageSize, subjects });
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
