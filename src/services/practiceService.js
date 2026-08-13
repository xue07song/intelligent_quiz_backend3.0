const practiceModel = require('../models/practiceModel');
const { OBJECTIVE_TYPES } = practiceModel;
const { buildInventory, analyzeRuleExamConfiguration, assembleRuleExam } = require('../algorithms/examRuleEngine');
const { isValidSubject } = require('../config/subjects');

const makeError = (message, statusCode, errorCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

// 解析操作者上下文：教师返回所教科目数组；管理员返回 null（不限制）
const getActorSubjects = async (actor) => {
    if (!actor || actor.role !== 'teacher') return null;
    const userModel = require('../models/userModel');
    return userModel.getTeacherSubjects(actor.id);
};

// 校验组卷科目：教师必须在所教科目内；管理员仅校验合法性
const resolveExamSubject = async (subject, teacherSubjects) => {
    if (subject === undefined || subject === null || String(subject).trim() === '') {
        if (teacherSubjects !== null) {
            // 教师组卷必须指定科目
            throw makeError('请选择组卷科目', 400, 40001);
        }
        return null; // 管理员可不指定
    }
    const s = String(subject).trim();
    if (!isValidSubject(s)) {
        throw makeError(`科目「${s}」不在合法科目列表中`, 400, 40002);
    }
    if (teacherSubjects !== null && !teacherSubjects.includes(s)) {
        throw makeError(`无权使用科目「${s}」组卷，请选择您所教的科目`, 403, 40303);
    }
    return s;
};

// 随机组卷
const generateExam = async (userId, options, actor) => {
    const { 章节, 题型, 难度, count = 10, title, subject, classId } = options;
    const numCount = Number(count) || 10;

    if (numCount < 1 || numCount > 100) {
        throw makeError('题目数量需在 1-100 之间', 400, 40001);
    }

    // 科目权限校验：教师组卷必须指定且在自己科目内
    const teacherSubjects = await getActorSubjects(actor);
    const finalSubject = await resolveExamSubject(subject, teacherSubjects);

    const questions = await practiceModel.randomPick({ 章节, 题型, 难度, count: numCount, 科目: finalSubject });
    if (questions.length === 0) {
        throw makeError('题库中没有符合条件的题目，请调整筛选条件', 404, 40401);
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
        subject: finalSubject,
        classId: classId || null,
    });

    return { examId, title: examTitle, total: questions.length, objectiveCount, questions };
};

const getExamInventory = async ({ chapters = [], subject } = {}, actor) => {
    const teacherSubjects = await getActorSubjects(actor);
    // 教师限定为自己科目；管理员可按传入 subject 过滤或不限
    let subjects = [];
    if (teacherSubjects !== null) {
        subjects = teacherSubjects;
    } else if (subject) {
        subjects = [String(subject).trim()];
    }
    const candidates = await practiceModel.findRuleExamCandidates({ chapters, subjects });
    return buildInventory(candidates).report;
};

const previewRuleExam = async (options = {}, actor) => {
    const {
        chapters = [], count = 20, typeDistribution,
        difficultyDistribution, minKnowledgePoints = 1, subject,
    } = options;
    const teacherSubjects = await getActorSubjects(actor);
    let subjects = [];
    if (teacherSubjects !== null) {
        subjects = teacherSubjects;
    } else if (subject) {
        subjects = [String(subject).trim()];
    }
    const candidates = await practiceModel.findRuleExamCandidates({ chapters, subjects });
    return analyzeRuleExamConfiguration({
        rawQuestions: candidates,
        count: Number(count),
        typeDistribution,
        difficultyDistribution,
        minKnowledgePoints: Number(minKnowledgePoints),
    });
};

const generateRuleExam = async (userId, options = {}, actor) => {
    const {
        title, chapters = [], count = 20,
        typeDistribution, difficultyDistribution, minKnowledgePoints = 1,
        subject, classId,
    } = options;
    const numCount = Number(count);
    if (!Number.isInteger(numCount) || numCount < 1 || numCount > 100) {
        throw makeError('题目数量需为 1-100 之间的整数', 400, 40001);
    }
    const pointCount = Number(minKnowledgePoints);
    if (!Number.isInteger(pointCount) || pointCount < 1 || pointCount > 111) {
        throw makeError('知识点覆盖数量必须为正整数', 400, 40001);
    }
    // 科目权限校验
    const teacherSubjects = await getActorSubjects(actor);
    const finalSubject = await resolveExamSubject(subject, teacherSubjects);

    let subjects = [];
    if (teacherSubjects !== null) {
        subjects = teacherSubjects;
    } else if (finalSubject) {
        subjects = [finalSubject];
    }
    const candidates = await practiceModel.findRuleExamCandidates({ chapters, subjects });
    const { questions, report } = assembleRuleExam({
        rawQuestions: candidates,
        count: numCount,
        typeDistribution,
        difficultyDistribution,
        minKnowledgePoints: pointCount,
    });
    const examTitle = String(title || '').trim() || `智能组卷-${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const { examId, objectiveCount } = await practiceModel.createExam({
        userId,
        title: examTitle,
        chapter: Array.isArray(chapters) && chapters.length ? chapters.join(',') : null,
        questionType: '规则分布',
        difficulty: '五级分布',
        questions,
        subject: finalSubject,
        classId: classId || null,
    });
    return { examId, title: examTitle, total: questions.length, objectiveCount, report, questions };
};

// 获取试卷列表
const getExams = async (userId, userRole, options) => {
    // 学生：注入其所属班级用于过滤可见试卷
    if (userRole === 'student') {
        const classModel = require('../models/classModel');
        const cls = await classModel.findClassByStudent(userId);
        options = { ...options, classId: cls ? cls.class_id : null };
    }
    return practiceModel.findExamsByScope(userId, userRole, options);
};

// 获取试卷详情（校验所属权 + 班级可见性）
const getExam = async (examId, userId, userRole = 'student') => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        throw makeError('试卷不存在', 404, 40401);
    }
    // 教师：只能看自己出的卷子
    if (userRole === 'teacher' && exam.user_id !== userId) {
        throw makeError('无权查看此试卷', 403, 40301);
    }
    // 学生：只能看教师出的、且对本人班级开放（class_id 为 null 表示全班级开放）的卷子
    if (userRole === 'student' && exam.creator_role === 'teacher') {
        if (exam.class_id) {
            const classModel = require('../models/classModel');
            const cls = await classModel.findClassByStudent(userId);
            if (!cls || cls.class_id !== exam.class_id) {
                throw makeError('无权查看此试卷：不在您所在班级范围内', 403, 40301);
            }
        }
    }
    // 学生看自己组卷的卷子（user_id===userId）允许
    // 管理员可看所有
    const canView = exam.user_id === userId || userRole === 'admin' || (userRole === 'student' && exam.creator_role === 'teacher');
    if (!canView) {
        throw makeError('无权查看此试卷', 403, 40301);
    }
    return exam;
};

// 提交答卷并自动评分
const submitExam = async (userId, userRole, examId, { answers, startedAt }) => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        throw makeError('试卷不存在', 404, 40401);
    }
    const canSubmit = userRole === 'student' && exam.creator_role === 'teacher';
    if (!canSubmit) {
        throw makeError('无权提交此试卷', 403, 40301);
    }
    // 班级可见性校验
    if (exam.class_id) {
        const classModel = require('../models/classModel');
        const cls = await classModel.findClassByStudent(userId);
        if (!cls || cls.class_id !== exam.class_id) {
            throw makeError('无权提交此试卷：不在您所在班级范围内', 403, 40301);
        }
    }

    // answers: [{ questionId, userAnswer }]
    if (!Array.isArray(answers)) {
        throw makeError('answers 必须为数组', 400, 40001);
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
        // 转为 MySQL datetime 格式（本地时间，避免 toISOString 的 UTC 时区偏差）
        startedAtValue = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
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
                // 非客观题：标记为不判分，不计入错误数
                isCorrect = 3;
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

// 答题记录列表（按角色权限范围查询）
const getRecords = async (userId, userRole, options) => {
    return practiceModel.findRecordsByScope({ userId, userRole, ...options });
};

// 答题记录详情（校验所属权）
const getRecord = async (recordId, userId) => {
    const record = await practiceModel.findRecordById(recordId);
    if (!record) {
        throw makeError('答题记录不存在', 404, 40401);
    }
    if (record.user_id !== userId) {
        throw makeError('无权查看此答题记录', 403, 40301);
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
            throw makeError('教师只能查看学生的做题记录', 403, 40301);
        }
    }
    return practiceModel.findRecordsByUserId(targetUserId, { page, pageSize });
};

// 管理端：查询指定用户的统计分析
const adminGetUserStats = async (callerRole, targetUserId) => {
    if (callerRole === 'teacher') {
        const targetUser = await practiceModel.findUserById(targetUserId);
        if (!targetUser || targetUser.role !== 'student') {
            throw makeError('教师只能查看学生的统计数据', 403, 40301);
        }
    }
    return practiceModel.getUserStatistics(targetUserId);
};

// 管理端：查看任意答题记录详情（教师可查看 teacher+student 的记录，管理员查看所有人）
const adminGetRecord = async (callerRole, recordId) => {
    const record = await practiceModel.findRecordById(recordId);
    if (!record) {
        throw makeError('答题记录不存在', 404, 40401);
    }
    if (callerRole === 'teacher') {
        const targetUser = await practiceModel.findUserById(record.user_id);
        if (!targetUser || (targetUser.role !== 'student' && targetUser.role !== 'teacher')) {
            throw makeError('教师只能查看教师和学生的答题记录', 403, 40301);
        }
    }
    return record;
};

// 管理端：以人为界的全局统计总览
// 返回所有有答题记录的用户（按角色过滤），每人含：个人汇总（基于全部记录） + 最近 N 次答题明细
const adminGetAllStatsByUser = async (callerRole, { role } = {}) => {
    const finalRole = resolveRoleFilter(callerRole, role);
    const records = await practiceModel.findAllRecordsWithUser({ role: finalRole });

    // 按 user_id 分组，同时累计全量汇总
    const userMap = new Map();
    records.forEach((r) => {
        if (!userMap.has(r.user_id)) {
            userMap.set(r.user_id, {
                id: r.user_id,
                username: r.username,
                nickname: r.nickname,
                role: r.role,
                records: [],
                attempt_count: 0,
                acc_sum: 0,
                max_accuracy: 0,
                min_accuracy: 100,
                total_questions: 0,
                total_correct: 0,
            });
        }
        const u = userMap.get(r.user_id);
        u.attempt_count++;
        u.acc_sum += Number(r.accuracy);
        if (Number(r.accuracy) > u.max_accuracy) u.max_accuracy = Number(r.accuracy);
        if (Number(r.accuracy) < u.min_accuracy) u.min_accuracy = Number(r.accuracy);
        u.total_questions += Number(r.total_count);
        u.total_correct += Number(r.correct_count);
        u.records.push({
            id: r.id,
            exam_id: r.exam_id,
            exam_title: r.exam_title,
            total_count: r.total_count,
            answered_count: r.answered_count,
            correct_count: r.correct_count,
            wrong_count: r.wrong_count,
            skipped_count: r.skipped_count,
            accuracy: r.accuracy,
            score: r.score,
            duration_seconds: r.duration_seconds,
            submitted_at: r.submitted_at,
        });
    });

    const PER_USER_LIMIT = 20; // 每人最多展示最近 20 次明细
    const users = Array.from(userMap.values()).map((u) => {
        const overview = {
            attempt_count: u.attempt_count,
            avg_accuracy: u.attempt_count > 0 ? Math.round((u.acc_sum / u.attempt_count) * 100) / 100 : 0,
            max_accuracy: u.attempt_count > 0 ? u.max_accuracy : 0,
            min_accuracy: u.attempt_count > 0 ? u.min_accuracy : 0,
            total_questions: u.total_questions,
            total_correct: u.total_correct,
        };
        return {
            id: u.id,
            username: u.username,
            nickname: u.nickname,
            role: u.role,
            overview,
            records: u.records.slice(0, PER_USER_LIMIT),
        };
    });

    return { total: users.length, users };
};

// 试卷维度分析：每题正确率 + 学生成绩 + 整体统计 + 班级对比 + 分数段
const getExamAnalytics = async (caller, examId) => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        throw makeError('试卷不存在', 404, 40401);
    }
    // 权限校验：教师只能查看自己创建的试卷分析；管理员可查看所有
    if (caller.role === 'teacher' && exam.user_id !== caller.id) {
        throw makeError('无权查看此试卷的分析数据', 403, 40301);
    }
    return practiceModel.getExamAnalytics(examId);
};

// 单题详情：某试卷某道题每个学生的作答情况
const getQuestionDetail = async (caller, examId, questionId) => {
    const exam = await practiceModel.findExamById(examId);
    if (!exam) {
        throw makeError('试卷不存在', 404, 40401);
    }
    if (caller.role === 'teacher' && exam.user_id !== caller.id) {
        throw makeError('无权查看此试卷的分析数据', 403, 40301);
    }
    const result = await practiceModel.getQuestionStudentDetail(examId, questionId);
    if (!result) {
        throw makeError('该题目不存在或不在此试卷中', 404, 40402);
    }
    return result;
};

module.exports = {
    generateExam,
    getExamInventory,
    previewRuleExam,
    generateRuleExam,
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
    adminGetAllStatsByUser,
    getExamAnalytics,
    getQuestionDetail,
};
