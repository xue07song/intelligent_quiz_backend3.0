const classModel = require('../models/classModel');

const makeError = (message, statusCode, errorCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

// 班级列表
const listClasses = async ({ keyword } = {}) => {
    return classModel.findAll({ keyword });
};

// 班级详情（含学生列表分页）
const getClass = async (id, { page = 1, pageSize = 50 } = {}) => {
    const cls = await classModel.findById(id);
    if (!cls) throw makeError('班级不存在', 404, 40401);
    const studentsResult = await classModel.findStudentsByClassId(id, { page, pageSize });
    return {
        ...cls,
        students: studentsResult.rows, // 直接返回学生数组，符合前端期望
        total: studentsResult.total,
        page,
        pageSize,
    };
};

// 创建班级
const createClass = async (data) => {
    if (!data.name || !String(data.name).trim()) {
        throw makeError('班级名称不能为空', 400, 40001);
    }
    const existing = await classModel.findByName(String(data.name).trim());
    if (existing) {
        throw makeError('班级名称已存在', 409, 40901);
    }
    return classModel.create(data);
};

// 更新班级
const updateClass = async (id, data) => {
    const existing = await classModel.findById(id);
    if (!existing) throw makeError('班级不存在', 404, 40401);
    if (data.name !== undefined) {
        const dup = await classModel.findByName(String(data.name).trim());
        if (dup && dup.id !== Number(id)) {
            throw makeError('班级名称已存在', 409, 40901);
        }
    }
    return classModel.update(id, data);
};

// 删除班级（学生自动回到未分班状态）
const deleteClass = async (id) => {
    const existing = await classModel.findById(id);
    if (!existing) throw makeError('班级不存在', 404, 40401);
    return classModel.remove(id);
};

// 把学生分入班级（支持批量，已分班则调班）
const assignStudents = async (classId, studentIds) => {
    const cls = await classModel.findById(classId);
    if (!cls) throw makeError('班级不存在', 404, 40401);
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw makeError('请选择要分班的学生', 400, 40001);
    }
    return classModel.assignStudentsToClass(classId, studentIds);
};

// 把学生移出班级
const removeStudents = async (studentIds) => {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw makeError('请选择要移出的学生', 400, 40001);
    }
    return classModel.removeStudentsFromClass(studentIds);
};

// 未分班学生列表
const listUnassignedStudents = async ({ page = 1, pageSize = 50, keyword } = {}) => {
    return classModel.findUnassignedStudents({ page, pageSize, keyword });
};

module.exports = {
    listClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    assignStudents,
    removeStudents,
    listUnassignedStudents,
};
