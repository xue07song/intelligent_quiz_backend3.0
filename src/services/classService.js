const classModel = require('../models/classModel');

const makeError = (message, statusCode, errorCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

const assertClassOwner = (cls, actor) => {
    if (!actor || actor.role === 'admin') return;
    if (actor.role !== 'teacher') throw makeError('无权操作班级', 403, 40301);
    if (cls.owner_id !== actor.id) throw makeError('只能管理自己创建的班级', 403, 40301);
};

// 班级列表
const listClasses = async ({ keyword } = {}, actor) => {
    const ownerId = actor && actor.role === 'teacher' ? actor.id : null;
    return classModel.findAll({ keyword, ownerId });
};

// 班级详情（含学生列表分页）
const getClass = async (id, { page = 1, pageSize = 50 } = {}, actor) => {
    const cls = await classModel.findById(id);
    if (!cls) throw makeError('班级不存在', 404, 40401);
    if (actor.role === 'teacher') assertClassOwner(cls, actor);
    if (actor.role === 'student') {
        const mine = await classModel.findAllClassesByStudent(actor.id);
        if (!mine.some((c) => c.class_id === Number(id))) {
            throw makeError('无权查看该班级', 403, 40301);
        }
    }
    const studentsResult = await classModel.findStudentsByClassId(id, { page, pageSize });
    if (actor.role === 'student') {
        studentsResult.rows = studentsResult.rows.map(({ email, phone, ...rest }) => rest);
    }
    return {
        ...cls,
        students: studentsResult.rows,
        total: studentsResult.total,
        page,
        pageSize,
    };
};

// 创建班级
const createClass = async (data, actor) => {
    if (!data.name || !String(data.name).trim()) {
        throw makeError('班级名称不能为空', 400, 40001);
    }
    const existing = await classModel.findByName(String(data.name).trim());
    if (existing) {
        throw makeError('班级名称已存在', 409, 40901);
    }
    const ownerId = actor && actor.role === 'teacher' ? actor.id : null;
    return classModel.create({ ...data, ownerId });
};

// 更新班级
const updateClass = async (id, data, actor) => {
    const existing = await classModel.findById(id);
    if (!existing) throw makeError('班级不存在', 404, 40401);
    assertClassOwner(existing, actor);
    if (data.name !== undefined) {
        const dup = await classModel.findByName(String(data.name).trim());
        if (dup && dup.id !== Number(id)) {
            throw makeError('班级名称已存在', 409, 40901);
        }
    }
    return classModel.update(id, data);
};

// 删除班级
const deleteClass = async (id, actor) => {
    const existing = await classModel.findById(id);
    if (!existing) throw makeError('班级不存在', 404, 40401);
    assertClassOwner(existing, actor);
    return classModel.remove(id);
};

// 把学生加入班级（支持批量，幂等：已在同班跳过，不影响其他班级关系）
// type 由班级的 type 字段决定
const assignStudents = async (classId, studentIds, actor) => {
    const cls = await classModel.findById(classId);
    if (!cls) throw makeError('班级不存在', 404, 40401);
    assertClassOwner(cls, actor);
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw makeError('请选择要添加的学生', 400, 40001);
    }
    // 按班级 type 写入对应关系类型
    const type = cls.type === 'elective' ? 'elective' : 'compulsory';
    return classModel.assignStudentsToClass(classId, studentIds, type);
};

// 把学生从指定班级移出（不影响其他班级关系）
const removeStudents = async (classId, studentIds, actor) => {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw makeError('请选择要移出的学生', 400, 40001);
    }
    const cls = await classModel.findById(classId);
    if (!cls) throw makeError('班级不存在', 404, 40401);
    assertClassOwner(cls, actor);
    return classModel.removeStudentsFromClass(classId, studentIds);
};

// 可添加学生列表（返回所有学生 + 已加入班级列表）
const listAvailableStudents = async ({ page = 1, pageSize = 50, keyword } = {}, actor) => {
    let college = null;
    if (actor && actor.role === 'teacher') {
        const userModel = require('../models/userModel');
        const user = await userModel.findById(actor.id);
        college = String(user.college || '').trim() || null;
    }
    const result = await classModel.findAvailableStudents({ page, pageSize, keyword, college });
    if (actor && actor.role === 'teacher') {
        result.rows = result.rows.map(({ email, phone, ...rest }) => rest);
    }
    return result;
};

// 兼容旧接口名
const listUnassignedStudents = listAvailableStudents;

module.exports = {
    listClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    assignStudents,
    removeStudents,
    listAvailableStudents,
    listUnassignedStudents,
};
