const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { filterValidSubjects } = require('../config/subjects');
const subjectModel = require('../models/subjectModel');

const SALT_ROUNDS = 10;
const VALID_ROLES = ['admin', 'teacher', 'student'];

const listUsers = async (options) => {
    return userModel.findAll(options);
};

const getUser = async (id) => {
    const user = await userModel.findById(id);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    // 教师附带所教科目
    if (user.role === 'teacher') {
        user.subjects = await userModel.getTeacherSubjects(user.id);
    } else {
        user.subjects = null;
    }
    return user;
};

const createUser = async (data) => {
    if (!data.username || !data.password) {
        const error = new Error('用户名和密码不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (!VALID_ROLES.includes(data.role)) {
        const error = new Error('角色无效，有效值：admin/teacher/student');
        error.statusCode = 400;
        error.errorCode = 40002;
        throw error;
    }

    const existing = await userModel.findByUsername(data.username);
    if (existing) {
        const error = new Error('用户名已存在');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    const hashedPassword = bcrypt.hashSync(data.password, SALT_ROUNDS);
    const result = await userModel.create({
        username: data.username,
        password: hashedPassword,
        role: data.role,
        nickname: data.nickname,
        email: data.email,
        phone: data.phone,
        school: data.school,
        college: data.college,
        major: data.major,
        grade: data.grade,
        student_no: data.student_no,
        employee_no: data.employee_no,
        title: data.title,
        status: data.status ?? 1,
    });

    // 教师创建后写入科目关联
    if (data.role === 'teacher') {
        const subjects = filterValidSubjects(data.subjects);
        await subjectModel.ensureMany(subjects);
        for (const name of subjects) await subjectModel.ensureDefaultChapter(name);
        const newId = result.insertId;
        if (newId) {
            await userModel.setTeacherSubjects(newId, subjects);
        }
    }

    return result;
};

const updateUser = async (id, data) => {
    const existing = await userModel.findById(id);
    if (!existing) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    if (data.role !== undefined && !VALID_ROLES.includes(data.role)) {
        const error = new Error('角色无效，有效值：admin/teacher/student');
        error.statusCode = 400;
        error.errorCode = 40002;
        throw error;
    }

    // 目标角色：若传了 role 用新 role，否则沿用原 role
    const targetRole = data.role !== undefined ? data.role : existing.role;

    // 若目标角色是教师且请求带 subjects 字段，则全量替换科目
    if (targetRole === 'teacher' && data.subjects !== undefined) {
        const subjects = filterValidSubjects(data.subjects);
        await subjectModel.ensureMany(subjects);
        for (const name of subjects) await subjectModel.ensureDefaultChapter(name);
        await userModel.setTeacherSubjects(id, subjects);
    }

    // 若角色由教师变为非教师，清空其科目关联
    if (existing.role === 'teacher' && targetRole !== 'teacher') {
        await userModel.clearTeacherSubjects(id);
    }

    // 若传了 class_id（单值）或 classIds（多选数组），同步维护 student_classes 必修班多选
    // 多选优先用 classIds 数组；兼容旧前端只传 class_id 单值
    const hasClassIds = Array.isArray(data.classIds);
    const hasSingleClass = data.class_id !== undefined;
    if ((hasClassIds || hasSingleClass) && targetRole === 'student') {
        const classModel = require('../models/classModel');
        const classIds = hasClassIds ? data.classIds : (data.class_id ? [data.class_id] : []);
        await classModel.setCompulsoryClasses(Number(id), classIds);
    }

    return userModel.update(id, data);
};

const changePassword = async (id, newPassword) => {
    if (!newPassword || newPassword.length < 6) {
        const error = new Error('密码长度不能少于6位');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const existing = await userModel.findById(id);
    if (!existing) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    const hashedPassword = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    return userModel.updatePassword(id, hashedPassword);
};

const toggleStatus = async (id, status) => {
    if (status !== 0 && status !== 1) {
        const error = new Error('状态值无效，仅允许 0 或 1');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const existing = await userModel.findById(id);
    if (!existing) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    return userModel.update(id, { status });
};

const deleteUser = async (id) => {
    const existing = await userModel.findById(id);
    if (!existing) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    // 删除教师时一并清理科目关联
    if (existing.role === 'teacher') {
        await userModel.clearTeacherSubjects(id);
    }
    // 删除学生时清理分班记录
    if (existing.role === 'student') {
        const classModel = require('../models/classModel');
        await classModel.clearByStudent(id);
    }
    return userModel.remove(id);
};

module.exports = {
    listUsers,
    getUser,
    createUser,
    updateUser,
    changePassword,
    toggleStatus,
    deleteUser,
};
