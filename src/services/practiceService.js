const practiceModel = require('../models/practiceModel');
const { OBJECTIVE_TYPES } = practiceModel;
const { buildInventory, analyzeRuleExamConfiguration, assembleRuleExam } = require('../algorithms/examRuleEngine');
const subjectiveEvaluation = require('./subjectiveEvaluationService');
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
    // 学生：注入其所属的全部班级（必修+选修）用于过滤可见试卷
    if (userRole === 'student') {
        const classModel = require('../models/classModel');
        const allClasses = await classModel.findAllClassesByStudent(userId);
        const classIds = allClasses.map(c => c.class_id);
        options = { ...options, classIds: classIds.length ? classIds : null };
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
            // 多对多模式：学生可能在必修班或选修班中，只要在任意班级即可
            const allClasses = await classModel.findAllClassesByStudent(userId);
            const inClass = allClasses.some(c => c.class_id === exam.class_id);
            if (!inClass) {
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
        // 多对多模式：学生可能在必修班或选修班中
        const allClasses = await classModel.findAllClassesByStudent(userId);
        const inClass = allClasses.some(c => c.class_id === exam.class_id);
        if (!inClass) {
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
    for (const q of exam.questions) {
        const qType = Number(q.题型);
        const isObjective = [1, 2, 3].includes(qType);
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
                const evaluation = await subjectiveEvaluation.evaluate({
                    questionType: qType, question: q.题目, userAnswer: String(userAnswer).trim(),
                    referenceAnswer: q.答案 || '', explanation: q.解析 || '',
                });
                isCorrect = evaluation.status === 'correct' ? 1 : evaluation.status === 'incorrect' ? 0 : 3;
                q.evaluation = evaluation;
                if (evaluation.status === 'correct') correctCount++;
                else if (evaluation.status === 'incorrect') wrongCount++;
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
            evaluation: q.evaluation || null,
        });
    }

    // ================== [MODIFIED] 准确率计算改为：正确数 / 总题数 ==================
    const totalQuestions = exam.questions.length;
    const accuracy = totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 10000) / 100
        : 0;
    // ============================================================================

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

    // 提交成功后清理草稿（若草稿不存在则忽略）
    try { await practiceModel.deleteDraft(userId, examId); } catch (_) { /* ignore */ }

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

// 客观题判分逻辑（加强版，兼容判断多语义、填空多分隔符/半角全角/多空按分号或竖线匹配）
const checkAnswer = (type, userAnswer, correctAnswer) => {
    if (type === 1) {
        const booleanValue = (value) => {
            const text = String(value || '').trim().toLowerCase();
            const t = ['t', 'true', '正确', '对', '是', '√', '1', '✓', '✔', '对的', '是的', '正确的'];
            const f = ['f', 'false', '错误', '错', '否', '×', '0', '✗', '✘', 'x', 'X', '不对', '不是', '错的', '错误的'];
            if (t.includes(text)) return 'T';
            if (f.includes(text)) return 'F';
            // 把各种 Unicode 空白去掉后再判断一次
            const stripped = text.replace(/\s+|。|\./g, '');
            if (t.includes(stripped)) return 'T';
            if (f.includes(stripped)) return 'F';
            return text.toUpperCase();
        };
        return booleanValue(userAnswer) === booleanValue(correctAnswer);
    }
    if (type === 3) {
        // 多选题：排序后比较（如 "BCA" vs "ABC" vs "ABC;" 视为相同；同时兼容中文分号/顿号/逗号分隔）
        const normalize = (s) => String(s || '')
            .replace(/[;；,，、]/g, '').replace(/\s+/g, '')
            .toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
        return normalize(userAnswer) === normalize(correctAnswer);
    }
    if (type === 4) {
        // 填空题：
        //  1) 去除空白、中英文标点、括号
        //  2) 支持多空用 | 或 ; 或 / 分隔，按序比较
        const normalizeOne = (s) => String(s || '')
            .replace(/\s+/g, '')
            .replace(/[，。、；;：:！!？?·""''（）()【】\[\]《》<>、\-—_/\\|,]/g, '')
            .toLowerCase()
            // 常见中文等价词（全角半角数字、中文数字等不做复杂替换，先覆盖常用等价）
            .replace(/％/g, '%').replace(/．/g, '.');
        const splitMany = (s) => String(s || '').split(/\s*[;；|｜/／]\s*/).map(x => x.trim()).filter(Boolean);
        const uList = splitMany(userAnswer);
        const cList = splitMany(correctAnswer);
        if (uList.length > 1 && cList.length > 1 && uList.length === cList.length) {
            return uList.every((u, i) => normalizeOne(u) === normalizeOne(cList[i]));
        }
        // 单空或分拆不匹配时退化为整体比较
        return normalizeOne(userAnswer) === normalizeOne(correctAnswer);
    }
    // 判断(type=1 已经走了)、单选、其他默认：兼容大小写与前后空白
    const normalize = (s) => String(s || '').trim().toUpperCase();
    return normalize(userAnswer) === normalize(correctAnswer);
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

// ==================== 答题草稿（学生本人读写） ====================
const getExamDraft = async (userId, examId) => {
    try { await getExam(examId, userId, 'student'); } catch (e) {
        if (e.statusCode === 403 || e.statusCode === 404) throw e;
    }
    const draft = await practiceModel.findDraft(userId, examId);
    return draft || { exam_id: examId, user_id: userId, answers: {}, duration_seconds: 0, updated_at: null };
};

const saveExamDraft = async (userId, examId, body = {}) => {
    try { await getExam(examId, userId, 'student'); } catch (e) {
        if (e.statusCode === 403 || e.statusCode === 404) throw e;
    }
    const answers = body.answers || {};
    if (answers && typeof answers !== 'object') {
        throw makeError('answers 必须为对象形式 { questionId: userAnswer }', 400, 40001);
    }
    const durationSeconds = Math.max(0, Number(body.durationSeconds) || 0);
    return practiceModel.saveDraft(userId, examId, { answers, durationSeconds });
};

// 错题本：分页列表
const listWrongQuestions = async (userId, options = {}) => {
    const page = Math.max(parseInt(options.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(options.pageSize) || 20, 1), 100);
    const filter = {
        chapter: options.chapter,
        questionType: options.questionType,
    };
    const [rows, total] = await Promise.all([
        practiceModel.findWrongQuestions(userId, { ...filter, page, pageSize }),
        practiceModel.countWrongQuestions(userId, filter),
    ]);
    return { rows, total };
};

// 错题本：基于当前错题重新组卷练习
const createWrongExam = async (userId, options = {}) => {
    const requestedCount = Math.min(Math.max(Number(options.count) || 20, 1), 100);
    const filter = {
        chapter: options.chapter,
        questionType: options.questionType,
    };

    const wrongIds = await practiceModel.findWrongQuestionIds(userId, filter);
    if (wrongIds.length === 0) {
        const error = new Error('错题本中暂无符合条件的题目，先做一套试卷吧');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    const pickCount = Math.min(requestedCount, wrongIds.length);
    const questions = await practiceModel.randomPickByIds(wrongIds, pickCount);
    const title = options.title || `错题重练-${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const { examId, objectiveCount } = await practiceModel.createExam({
        userId,
        title,
        chapter: options.chapter || null,
        questionType: options.questionType || null,
        difficulty: null,
        questions,
    });

    return {
        examId,
        title,
        total: questions.length,
        requestedCount,
        availableCount: wrongIds.length,
        truncated: questions.length < requestedCount,
        objectiveCount,
        questions,
    };
};

// ===== [新增] 单题练习：根据题目ID生成练习 =====
const startSingleQuestionPractice = async (userId, questionId) => {
    const questionModel = require('../models/questionModel');
    const question = await questionModel.findById(questionId);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    const title = `单题练习-${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const { examId, objectiveCount } = await practiceModel.createExam({
        userId,
        title,
        chapter: question.章节 || null,
        questionType: question.题型 || null,
        difficulty: question.难度 || null,
        questions: [question],
        subject: question.科目 || null,
        classId: null,
    });

    return {
        examId,
        title,
        total: 1,
        objectiveCount,
        questions: [question],
    };
};

// ===== 单题判题（不创建试卷，不记录） =====
const checkSingleQuestion = async (questionId, userAnswer) => {
    const questionModel = require('../models/questionModel');
    const question = await questionModel.findById(questionId);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }

    // 判断答案是否正确（复用原有判题逻辑）
    const type = Number(question.题型);
    const correct = checkAnswer(type, userAnswer, question.答案);

    return {
        isCorrect: correct,
        correctAnswer: question.答案,
        explanation: question.解析 || '暂无解析',
        question: {
            title: question.题目,
            type: question.题型,
            options: question.选项,
        }
    };
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
    const grouped = { student: [], teacher: [], admin: [] };
    users.forEach((u) => {
        if (grouped[u.role]) grouped[u.role].push(u);
    });
    return { total: users.length, grouped, list: users };
};

// 管理端：查询指定用户的答题记录列表
const adminListUserRecords = async (callerRole, targetUserId, { page, pageSize } = {}) => {
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

const reviewSubjectiveAnswer = async (reviewerId, answerId, body = {}) => {
    const allowed = ['correct', 'partial', 'incorrect'];
    const status = String(body.status || '');
    if (!allowed.includes(status)) throw Object.assign(new Error('请选择有效的复核结果'), { statusCode: 400 });
    const fullScore = Math.max(0.01, Number(body.fullScore) || 1);
    const awardedScore = status === 'correct' ? fullScore : status === 'incorrect' ? 0 : Math.max(0, Math.min(fullScore, Number(body.awardedScore) || 0));
    const scoreRate = awardedScore / fullScore;
    const result = await practiceModel.reviewAnswer({ answerId, reviewerId, status, scoreRate, comment: String(body.comment || '').trim().slice(0, 500) });
    if (!result) throw Object.assign(new Error('该答案不存在或不支持复核'), { statusCode: 404 });
    return result;
};

// 管理端：以人为界的全局统计总览
const adminGetAllStatsByUser = async (callerRole, { role } = {}) => {
    const finalRole = resolveRoleFilter(callerRole, role);
    const records = await practiceModel.findAllRecordsWithUser({ role: finalRole });

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

    const PER_USER_LIMIT = 20;
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
    getExamDraft,
    saveExamDraft,
    listWrongQuestions,
    createWrongExam,
    startSingleQuestionPractice,
    checkSingleQuestion,  // <-- 确保导出
    adminListRecords,
    adminListUsers,
    adminListUserRecords,
    adminGetUserStats,
    adminGetRecord,
    reviewSubjectiveAnswer,
    adminGetAllStatsByUser,
    getExamAnalytics,
    getQuestionDetail,
};