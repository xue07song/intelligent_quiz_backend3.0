const studentModel = require('../models/studentModel');
const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{11}$/;

const parsePage = (page, size) => {
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const currentSize = Math.min(Math.max(parseInt(size, 10) || 20, 1), 100);
    return { page: currentPage, size: currentSize };
};

const getProfile = async (userId) => {
    const user = await studentModel.findProfile(userId);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    // 教师附带所教科目（个人信息页展示）
    if (user.role === 'teacher') {
        user.subjects = await userModel.getTeacherSubjects(user.id);
    } else {
        user.subjects = null;
    }
    // 学生附带所属全部必修班（多选）
    if (user.role === 'student') {
        const classModel = require('../models/classModel');
        const classes = await classModel.findCompulsoryClassesByStudent(user.id);
        const classIds = classes.map(c => c.class_id);
        const classNames = classes.map(c => c.class_name);
        user.classIds = classIds;
        user.classNames = classNames;
        // 兼容字段：className / class_name 多选拼接；classId 取第一个
        user.className = classNames.length > 0 ? classNames.join('/') : null;
        user.class_name = user.className;
        user.classId = classIds[0] ?? null;
    } else {
        user.classId = null;
        user.className = null;
        user.class_name = null;
        user.classIds = [];
        user.classNames = [];
    }
    return user;
};

const updateProfile = async (userId, data = {}) => {
    const existing = await studentModel.findProfile(userId);
    if (!existing) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }

    const updates = {};
    ['nickname', 'email', 'phone', 'school', 'college'].forEach((field) => {
        const value = data[field];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            updates[field] = String(value).trim();
        }
    });

    if (updates.email && !EMAIL_PATTERN.test(updates.email)) {
        const error = new Error('邮箱格式不正确');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (updates.phone && !PHONE_PATTERN.test(updates.phone)) {
        const error = new Error('手机号必须是11位数字');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    if (Object.keys(updates).length > 0) {
        await userModel.updateProfile(userId, updates);
    }

    return studentModel.findProfile(userId);
};

const getHistoryQuestions = async (userId, options = {}) => {
    const pager = parsePage(options.page, options.size);
    const [total, list] = await Promise.all([
        studentModel.countHistoryQuestions(userId),
        studentModel.findHistoryQuestions(userId, pager),
    ]);
    return { list, total };
};

const getHistoryExams = async (userId, options = {}) => {
    const pager = parsePage(options.page, options.size);
    const [total, list] = await Promise.all([
        studentModel.countHistoryExams(userId),
        studentModel.findHistoryExams(userId, pager),
    ]);
    return { list, total };
};

const getExamRecords = async (examId, userId) => {
    return studentModel.findExamRecords(examId, userId);
};

const getFavorites = async (userId, options = {}) => {
    const pager = parsePage(options.page, options.size);
    const [total, list] = await Promise.all([
        studentModel.countFavorites(userId),
        studentModel.findFavorites(userId, pager),
    ]);
    return { list, total };
};

const addFavorite = async (userId, questionId) => {
    const normalizedId = String(questionId || '').trim();
    if (!normalizedId) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const question = await questionModel.findById(normalizedId);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    const existing = await studentModel.findFavorite(userId, normalizedId);
    if (existing) {
        const error = new Error('该题目已在收藏中');
        error.statusCode = 409;
        error.errorCode = 40904;
        throw error;
    }

    await studentModel.addFavorite(userId, normalizedId);
    return { questionId: normalizedId };
};

const removeFavorite = async (userId, questionId) => {
    const normalizedId = String(questionId || '').trim();
    if (!normalizedId) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    await studentModel.removeFavorite(userId, normalizedId);
    return { questionId: normalizedId };
};

module.exports = {
    getProfile,
    updateProfile,
    getHistoryQuestions,
    getHistoryExams,
    getExamRecords,
    getFavorites,
    addFavorite,
    removeFavorite,
};
