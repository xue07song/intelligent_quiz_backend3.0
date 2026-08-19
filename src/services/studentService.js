const studentModel = require('../models/studentModel');
const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');
const pool = require('../config/db');

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
    const keyword = options.keyword || '';
    const [total, list] = await Promise.all([
        studentModel.countHistoryQuestions(userId, keyword),
        studentModel.findHistoryQuestions(userId, { ...pager, keyword }),
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
    const pager = parsePage(options.page, options.pageSize || options.size);
    if (options.tagId !== undefined && options.tagId !== '' && options.tagId !== null) {
        // 解析 preset_xxx → 数字 id
        const tagIdStr = String(options.tagId);
        const tagId = tagIdStr.startsWith('preset_')
            ? Number(tagIdStr.replace('preset_', ''))
            : Number(tagIdStr);
        if (!Number.isInteger(tagId) || tagId <= 0) {
            return { list: [], total: 0 };
        }
        const [total, list] = await Promise.all([
            studentModel.countFavoritesWithTagFilter(userId, tagId),
            studentModel.findFavoritesWithTagFilter(userId, tagId, pager),
        ]);
        return { list, total };
    }
    const [total, list] = await Promise.all([
        studentModel.countFavorites(userId, options.keyword || ''),
        studentModel.findFavorites(userId, { ...pager, keyword: options.keyword || '' }),
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

// ================================================================
// 收藏标签
// ================================================================

// 预设标签 id 映射：DB 数值 id → API 字符串 id 'preset_<id>'
const formatTagId = (tag) => {
    if (tag.type === 'preset') {
        return `preset_${tag.id}`;
    }
    return tag.id;
};

// 反向解析：tagId（可能是 'preset_5' 或 5）→ 数值 id
const parseTagId = (raw) => {
    const str = String(raw);
    if (str.startsWith('preset_')) {
        return Number(str.replace('preset_', ''));
    }
    return Number(str);
};

const getFavoriteTags = async (userId) => {
    const tags = await studentModel.findFavoriteTags(userId);
    return tags.map(t => ({
        id: formatTagId(t),
        name: t.name,
        color: t.color,
        type: t.type,
    }));
};

const createFavoriteTag = async (userId, { name, color }) => {
    const trimmed = String(name || '').trim();
    if (!trimmed || trimmed.length > 20) {
        const error = new Error('标签名称不能为空且不超过 20 个字符');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const existing = await studentModel.findFavoriteTagByName(userId, trimmed);
    if (existing) {
        const error = new Error('标签名称已存在');
        error.statusCode = 409;
        error.errorCode = 40905;
        throw error;
    }
    const tagColor = color || '#6366F1';
    const tagId = await studentModel.addFavoriteTag(userId, { name: trimmed, color: tagColor });
    return { id: tagId, name: trimmed, color: tagColor, type: 'custom' };
};

const deleteFavoriteTag = async (userId, tagId) => {
    // preset_xxx 格式 → 预设标签，禁止删除
    if (String(tagId).startsWith('preset_')) {
        const error = new Error('预设标签不可删除');
        error.statusCode = 403;
        error.errorCode = 40301;
        throw error;
    }
    const numericId = Number(tagId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
        const error = new Error('标签ID无效');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    // 查库确认不是 preset
    const tag = await studentModel.findFavoriteTagById(numericId);
    if (tag && tag.type === 'preset') {
        const error = new Error('预设标签不可删除');
        error.statusCode = 403;
        error.errorCode = 40301;
        throw error;
    }
    const result = await studentModel.removeFavoriteTag(userId, numericId);
    if (result.affectedRows === 0) {
        const error = new Error('标签不存在或无权删除');
        error.statusCode = 404;
        error.errorCode = 40404;
        throw error;
    }
    return { ok: true };
};

const setFavoriteTags = async (userId, questionId, tagIds) => {
    const normalizedId = String(questionId || '').trim();
    if (!normalizedId) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const favorite = await studentModel.findFavorite(userId, normalizedId);
    if (!favorite) {
        const error = new Error('该题目不在收藏中');
        error.statusCode = 404;
        error.errorCode = 40405;
        throw error;
    }
    // 解析 tagIds：preset_xxx → 数字
    const numericTagIds = (Array.isArray(tagIds) ? tagIds : []).map(parseTagId)
        .filter(id => Number.isInteger(id) && id > 0);
    await studentModel.setFavoriteQuestionTags(userId, normalizedId, numericTagIds);
    return { ok: true };
};

const getFavoriteQuestionTags = async (userId, questionId) => {
    const tags = await studentModel.findFavoriteQuestionTags(userId, String(questionId || '').trim());
    return tags.map(t => ({
        id: formatTagId(t),
        name: t.name,
        color: t.color,
    }));
};

// ================================================================
// 收藏题目复习（遗忘曲线 — 简化 SM-2）
// ================================================================

const submitFavoriteReview = async (userId, questionId, { result }) => {
    const normalizedId = String(questionId || '').trim();
    if (!normalizedId) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const validResults = ['remembered', 'forgot'];
    if (!validResults.includes(result)) {
        const error = new Error("result 必须为 'remembered' 或 'forgot'");
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const favorite = await studentModel.findFavorite(userId, normalizedId);
    if (!favorite) {
        const error = new Error('该题目不在收藏中');
        error.statusCode = 404;
        error.errorCode = 40405;
        throw error;
    }

    const lastReview = await studentModel.findLatestReview(userId, normalizedId);

    // 简化 SM-2 算法
    let intervalDays;
    if (!lastReview) {
        // 首次复习
        intervalDays = result === 'remembered' ? 1 : 0;
    } else {
        // 后续复习
        const prevInterval = Number(lastReview.intervalDays) || 0;
        if (result === 'remembered') {
            intervalDays = Math.min(Math.max(prevInterval * 2, 1), 30);
        } else {
            intervalDays = 1;
        }
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);
    const nextReviewAtStr = nextReviewAt.toISOString().slice(0, 19).replace('T', ' ');

    await studentModel.addReview(userId, normalizedId, {
        result,
        intervalDays,
        nextReviewAt: nextReviewAtStr,
    });

    return { intervalDays, nextReviewAt: nextReviewAtStr };
};

const getReviewSchedule = async (userId) => {
    const due = await studentModel.findDueReviews(userId, { page: 1, pageSize: 200 });
    const neverReviewed = await studentModel.findFavoritesWithoutReview(userId);
    return {
        due: { list: due, total: due.length },
        neverReviewed: { list: neverReviewed, total: neverReviewed.length },
    };
};

const getFavoriteStats = async (userId) => {
    // 标签统计
    const tags = await studentModel.findTagStatsForUser(userId);
    const tagStats = tags.map(t => ({
        id: formatTagId(t),
        name: t.name,
        color: t.color,
        count: Number(t.count) || 0,
    }));

    // 收藏总数
    const [favoriteCountRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM user_favorites WHERE user_id = ?',
        [userId]
    );
    const totalFavorites = favoriteCountRows[0].total;

    // 到期复习数（next_review_at <= NOW()）
    const dueCount = await studentModel.countDueReviews(userId);
    // 今日到期数
    const dueToday = await studentModel.countDueToday(userId);
    // 从未复习的收藏数
    const neverReviewed = await studentModel.findFavoritesWithoutReview(userId);

    return {
        totalFavorites,
        dueCount,
        dueToday,
        newToReview: neverReviewed.length,
        tags: tagStats,
    };
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
    getFavoriteTags,
    createFavoriteTag,
    deleteFavoriteTag,
    setFavoriteTags,
    getFavoriteQuestionTags,
    submitFavoriteReview,
    getReviewSchedule,
    getFavoriteStats,
};
