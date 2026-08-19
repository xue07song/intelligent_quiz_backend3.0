const studentModel = require('../models/studentModel');
const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

const parsePage = (page, size) => {
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const currentSize = Math.min(Math.max(parseInt(size, 10) || 20, 1), 100);
    return { page: currentPage, size: currentSize };
};

// 当学生没有任何班级记录时，自动创建班级并随机分配必修/选修（写DB，幂等）
async function ensureStudentHasClasses(userId, studentNo = '') {
    const classModel = require('../models/classModel');
    // 先查
    let classes = await classModel.findAllClassesByStudent(userId);
    if (classes && classes.length > 0) return classes;

    // 拿所有可用班级
    let availableClasses = await classModel.findAll({});

    // 连班级表都空就先塞几个（根据 seed 里现有的班级命名）
    if (!Array.isArray(availableClasses) || availableClasses.length === 0) {
        const defaults = [
            { name: '人工智能1班', grade: '2023级', type: 'compulsory', remark: '系统自动创建' },
            { name: '人工智能2班', grade: '2023级', type: 'compulsory', remark: '系统自动创建' },
            { name: '计算机科学与技术1班', grade: '2023级', type: 'compulsory', remark: '系统自动创建' },
            { name: '数据结构1班', grade: '2023级', type: 'compulsory', remark: '系统自动创建' },
            { name: '软件工程1班', grade: '2023级', type: 'elective', remark: '系统自动创建' },
            { name: '思想政治1班', grade: '2026', type: 'elective', remark: '系统自动创建' },
        ];
        for (const cls of defaults) {
            try { await classModel.create(cls); } catch (_) { /* 幂等忽略 */ }
        }
        availableClasses = await classModel.findAll({});
    }

    // 匹配必修：学号前 4 位 => 年份 => 找 grade 包含该年份的班级，找不到就随机
    let compulsory = null;
    try {
        compulsory = await classModel.matchCompulsoryClassByStudentNo(studentNo);
    } catch (_) {}
    if (!compulsory) {
        const comps = availableClasses.filter(c => (c.type || 'compulsory') === 'compulsory');
        const pool = comps.length ? comps : availableClasses;
        compulsory = pool[Math.floor(Math.random() * pool.length)];
    }

    // 选修：60% 概率再分配一节，与必修不同；优先选 type=elective 的
    let others = availableClasses.filter(c => c.id !== compulsory.id);
    let elective = null;
    if (others.length > 0 && Math.random() > 0.4) {
        const elecOnly = others.filter(c => c.type === 'elective');
        const pool = elecOnly.length ? elecOnly : others;
        elective = pool[Math.floor(Math.random() * pool.length)];
    }

    // 用 classModel.assignStudentsToClass 写入（事务 + INSERT IGNORE + 回填 users.class_id）
    try {
        await classModel.assignStudentsToClass(compulsory.id, [userId], 'compulsory');
    } catch (_) {}
    if (elective) {
        try { await classModel.assignStudentsToClass(elective.id, [userId], 'elective'); }
        catch (_) {}
    }

    return classModel.findAllClassesByStudent(userId);
}

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
    // 学生附带所属班级（必修 + 选修；若尚未分配则自动创建并分配）
    if (user.role === 'student') {
        const classModel = require('../models/classModel');
        const classes = await ensureStudentHasClasses(user.id, user.student_no || '');

        // 新格式：[{classId, className, relationType}]
        user.classes = classes.map(c => ({
            classId: c.class_id,
            className: c.class_name,
            relationType: c.relation_type || 'compulsory',
        }));
        // 按类型分组
        user.compulsoryClasses = user.classes.filter(c => c.relationType === 'compulsory');
        user.electiveClasses = user.classes.filter(c => c.relationType === 'elective');

        const classIds = classes.map(c => c.class_id);
        const classNames = classes.map(c => c.class_name);
        // 向后兼容字段
        user.classIds = classIds;
        user.classNames = classNames;
        user.className = classNames.length > 0 ? classNames.join('/') : null;
        user.class_name = user.className;
        user.classId = classIds[0] ?? null;
    } else {
        user.classes = [];
        user.compulsoryClasses = [];
        user.electiveClasses = [];
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
        if (value !== undefined) {
            updates[field] = value === null ? '' : String(value).trim();
        }
    });

    if (updates.email && !EMAIL_PATTERN.test(updates.email)) {
        const error = new Error('邮箱格式不正确');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (updates.phone && !PHONE_PATTERN.test(updates.phone)) {
        const error = new Error('请填写正规的中国大陆手机号');
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
