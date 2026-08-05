const practiceModel = require('../models/practiceModel');
const { OBJECTIVE_TYPES } = practiceModel;

// 随机组卷
const generateExam = async (userId, options) => {
    const { 章节, 题型, 难度, count = 10, title } = options;
    const numCount = Number(count) || 10;

    if (numCount < 1 || numCount > 100) {
        const error = new Error('题目数量需在 1-100 之间');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const questions = await practiceModel.randomPick({ 章节, 题型, 难度, count: numCount });
    if (questions.length === 0) {
        const error = new Error('题库中没有符合条件的题目，请调整筛选条件');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    // 生成试卷标题
    const examTitle = title || `练习试卷-${new Date().toLocaleString('zh-CN', { hour12: false })}`;

    const { examId, objectiveCount } = await practiceModel.createExam({
        userId,
        title: examTitle,
        chapter: 章节,
        questionType: 题型,
        difficulty: 难度,
        questions,
    });

    return { examId, title: examTitle, total: questions.length, objectiveCount, questions };
};

// 获取试卷列表
const getExams = async (userId, options) => {
    return practiceModel.findExamsByUser(userId, options);
};

// 获取试卷详情
const getExam = async (examId) => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        const error = new Error('试卷不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return exam;
};

// 提交答卷并自动评分
const submitExam = async (userId, examId, { answers, startedAt }) => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        const error = new Error('试卷不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    // answers: [{ questionId, userAnswer }]
    if (!Array.isArray(answers)) {
        const error = new Error('answers 必须为数组');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    // 取出本试卷所有题目（含正确答案）
    const questionMap = new Map();
    exam.questions.forEach((q) => {
        questionMap.set(q.id, q);
    });

    // 计算用时
    let durationSeconds = 0;
    let startedAtValue = null;
    if (startedAt) {
        const start = new Date(startedAt);
        durationSeconds = Math.floor((Date.now() - start.getTime()) / 1000);
        if (durationSeconds < 0) durationSeconds = 0;
        // 转为 MySQL datetime 格式
        startedAtValue = start.toISOString().slice(0, 19).replace('T', ' ');
    }

    // 逐题判分
    let answeredCount = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let objectiveTotal = 0;
    let objectiveCorrect = 0;
    const answerRecords = [];

    // 构建用户答案查找表
    const userAnswerMap = new Map();
    answers.forEach((a) => {
        userAnswerMap.set(String(a.questionId), a.userAnswer);
    });

    // 遍历试卷所有题目判分
    exam.questions.forEach((q) => {
        const qType = Number(q.题型);
        const isObjective = OBJECTIVE_TYPES.includes(qType);
        const userAnswer = userAnswerMap.get(String(q.id));

        if (isObjective) objectiveTotal++;

        let isCorrect = 2; // 默认未答
        if (userAnswer !== undefined && userAnswer !== null && String(userAnswer).trim() !== '') {
            answeredCount++;
            if (isObjective) {
                // 客观题自动判分
                const ok = checkAnswer(qType, String(userAnswer).trim(), String(q.答案 || '').trim());
                isCorrect = ok ? 1 : 0;
                if (ok) {
                    correctCount++;
                    objectiveCorrect++;
                } else {
                    wrongCount++;
                }
            } else {
                // 非客观题：标记为不判分
                isCorrect = 3;
                wrongCount++; // 计入已答但非客观题
            }
        } else {
            skippedCount++;
        }

        answerRecords.push({
            questionId: q.id,
            questionType: qType,
            userAnswer: userAnswer !== undefined ? String(userAnswer) : '',
            correctAnswer: q.答案 || '',
            isObjective: isObjective ? 1 : 0,
            isCorrect,
        });
    });

    // 计算准确率和得分（基于客观题）
    const accuracy = objectiveTotal > 0
        ? Math.round((objectiveCorrect / objectiveTotal) * 10000) / 100
        : 0;
    const score = accuracy; // 百分制

    const recordId = await practiceModel.createRecord({
        examId,
        userId,
        startedAt: startedAtValue,
        durationSeconds,
        totalCount: exam.questions.length,
        answeredCount,
        correctCount,
        wrongCount,
        skippedCount,
        objectiveTotal,
        objectiveCorrect,
        accuracy,
        score,
        answers: answerRecords,
    });

    return {
        recordId,
        totalCount: exam.questions.length,
        answeredCount,
        correctCount,
        wrongCount,
        skippedCount,
        objectiveTotal,
        objectiveCorrect,
        accuracy,
        score,
        durationSeconds,
    };
};

// 客观题判分逻辑
const checkAnswer = (type, userAnswer, correctAnswer) => {
    if (type === 3) {
        // 多选题：排序后比较（如 "BCA" vs "ABC" 视为相同）
        const normalize = (s) => s.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
        return normalize(userAnswer) === normalize(correctAnswer);
    } else if (type === 4) {
        // 填空题：去空格、去标点后比较
        const normalize = (s) => s.replace(/\s+/g, '').replace(/[，。、；：""''（）()【】\[\]]/g, '').toLowerCase();
        return normalize(userAnswer) === normalize(correctAnswer);
    } else {
        // 判断题、单选题：直接比较（兼容中英文、大小写）
        const normalize = (s) => String(s).trim().toUpperCase();
        return normalize(userAnswer) === normalize(correctAnswer);
    }
};

// 答题记录列表
const getRecords = async (userId, options) => {
    return practiceModel.findRecordsByUser(userId, options);
};

// 答题记录详情
const getRecord = async (recordId) => {
    const record = await practiceModel.findRecordById(recordId);
    if (!record) {
        const error = new Error('答题记录不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return record;
};

// 统计分析
const getStats = async (userId) => {
    return practiceModel.getStatistics(userId);
};

// ==================== 管理端 ====================

// 权限规则：
// - teacher：只能看学生（role=student）数据
// - admin：可看所有人，可通过 role 参数筛选 student/teacher
const resolveRoleFilter = (callerRole, queryRole) => {
    if (callerRole === 'teacher') {
        return 'student'; // 教师强制只看学生
    }
    if (callerRole === 'admin') {
        return queryRole || null; // 管理员可选筛选，不传则查全部
    }
    return null;
};

// 管理端：查询所有用户的答题记录列表（含用户信息）
const adminListRecords = async (callerRole, { role, page, pageSize } = {}) => {
    const finalRole = resolveRoleFilter(callerRole, role);
    return practiceModel.findRecordsByRole({ role: finalRole, page, pageSize });
};

// 管理端：查询有做题记录的用户列表（含统计汇总，按角色区分）
const adminListUsers = async (callerRole, { role } = {}) => {
    const finalRole = resolveRoleFilter(callerRole, role);
    const users = await practiceModel.findUsersWithRecords({ role: finalRole });
    // 按 role 分组返回，方便前端展示
    const grouped = { student: [], teacher: [], admin: [] };
    users.forEach((u) => {
        if (grouped[u.role]) grouped[u.role].push(u);
    });
    return { total: users.length, grouped, list: users };
};

// 管理端：查询指定用户的答题记录列表
const adminListUserRecords = async (callerRole, targetUserId, { page, pageSize } = {}) => {
    // 教师只能查看学生记录，需校验目标用户角色
    if (callerRole === 'teacher') {
        const targetUser = await practiceModel.findUserById(targetUserId);
        if (!targetUser || targetUser.role !== 'student') {
            const error = new Error('教师只能查看学生的做题记录');
            error.statusCode = 403;
            error.errorCode = 40301;
            throw error;
        }
    }
    return practiceModel.findRecordsByUserId(targetUserId, { page, pageSize });
};

// 管理端：查询指定用户的统计分析
const adminGetUserStats = async (callerRole, targetUserId) => {
    if (callerRole === 'teacher') {
        const targetUser = await practiceModel.findUserById(targetUserId);
        if (!targetUser || targetUser.role !== 'student') {
            const error = new Error('教师只能查看学生的统计数据');
            error.statusCode = 403;
            error.errorCode = 40301;
            throw error;
        }
    }
    return practiceModel.getUserStatistics(targetUserId);
};

// 管理端：查看任意答题记录详情（教师需校验记录所属用户为学生）
const adminGetRecord = async (callerRole, recordId) => {
    const record = await practiceModel.findRecordById(recordId);
    if (!record) {
        const error = new Error('答题记录不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    if (callerRole === 'teacher') {
        const targetUser = await practiceModel.findUserById(record.user_id);
        if (!targetUser || targetUser.role !== 'student') {
            const error = new Error('教师只能查看学生的答题记录');
            error.statusCode = 403;
            error.errorCode = 40301;
            throw error;
        }
    }
    return record;
};

module.exports = {
    generateExam,
    getExams,
    getExam,
    submitExam,
    getRecords,
    getRecord,
    getStats,
    adminListRecords,
    adminListUsers,
    adminListUserRecords,
    adminGetUserStats,
    adminGetRecord,
};
