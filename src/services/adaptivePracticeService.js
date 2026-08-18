const model = require('../models/adaptivePracticeModel');
const practiceModel = require('../models/practiceModel'); // ===== [新增] =====
const { difficultyGroup, evaluateDifficulty } = require('../algorithms/difficultyAdjustment');
const subjectiveEvaluation = require('./subjectiveEvaluationService');

// 现在支持所有 6 种题型：判断(1)/单选(2)/多选(3)/填空(4)/简答(5)/程序(6)
// 客观题为 1/2/3（可 100% 自动判分且立刻出对错），4/5/6 填空/简答/程序走统一评阅（correct/partial/incorrect/review）
const ALL_TYPES = [1, 2, 3, 4, 5, 6];

const normalizeOptions = (raw = {}) => {
    const chapters = [...new Set((Array.isArray(raw.chapters) ? raw.chapters : []).map(Number)
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 10))];
    const questionTypes = [...new Set((Array.isArray(raw.questionTypes) && raw.questionTypes.length ? raw.questionTypes : ALL_TYPES)
        .map(Number).filter((value) => ALL_TYPES.includes(value)))];
    const knowledgeKeyword = String(raw.knowledgeKeyword || '').trim().slice(0, 100);
    const questionCount = Number(raw.questionCount || 10);
    if (!questionTypes.length) throw Object.assign(new Error('请至少选择一种题型'), { statusCode: 400 });
    if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 50) {
        throw Object.assign(new Error('练习题数需要设置为 5～50 题'), { statusCode: 400 });
    }
    return { chapters, questionTypes, knowledgeKeyword, questionCount };
};

const summarizeInventory = (rows, requestedCount) => {
    const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
    const byDifficulty = [1, 2, 3, 4, 5].map((difficulty) => ({
        difficulty, label: difficultyGroup(difficulty),
        total: rows.filter((row) => Number(row.difficulty) === difficulty).reduce((sum, row) => sum + Number(row.total), 0),
    }));
    const suggestions = [];
    if (total < requestedCount) {
        if (total >= 5) suggestions.push({ code: 'reduce-count', text: `把练习题数改为 ${total} 题`, value: total });
        suggestions.push({ code: 'remove-keyword', text: '保留章节和题型，不限制知识点关键词' });
        suggestions.push({ code: 'all-objective-types', text: '保留章节和知识点，使用全部可自动判分题型' });
        suggestions.push({ code: 'all-chapters', text: '保留知识点和题型，把范围扩大到全部章节' });
    }
    return {
        total, enough: total >= requestedCount, requestedCount, byDifficulty,
        knowledgePoints: [...new Set(rows.map((row) => row.knowledgePoint).filter(Boolean))],
        message: total >= requestedCount
            ? `当前条件找到 ${total} 道题，可以开始 ${requestedCount} 题的练习。`
            : `当前条件只找到 ${total} 道题，不够完成 ${requestedCount} 题的练习。`,
        suggestions,
    };
};

const inventory = async (raw) => {
    const options = normalizeOptions(raw);
    const report = summarizeInventory(await model.getInventory(options), options.questionCount);
    const chapterRows = await model.getChapterInventory({ chapters: options.chapters, questionTypes: options.questionTypes });
    const totalAvailable = chapterRows.reduce((sum, row) => sum + Number(row.total), 0);
    const presetCounts = [...new Set([5, 10, 15, 20, options.questionCount])].filter((count) => count <= totalAvailable && count >= 5);
    const plans = presetCounts.slice(0, 4).map((count, index) => ({
        id: `chapter-plan-${count}`,
        name: index === 0 ? '轻量起步' : count <= 10 ? '日常巩固' : count <= 15 ? '稳步提升' : '完整训练',
        description: `使用所选章节全部客观题，不限制知识点，完成 ${count} 题`,
        questionCount: count,
        chapters: options.chapters,
        questionTypes: options.questionTypes,
        knowledgeKeyword: '',
        totalAvailable,
    }));
    return { ...report, filters: options, plans };
};

const publicQuestion = (question) => ({ id: question.id, chapter: question.章节, type: Number(question.题型),
    content: question.题目, options: question.选项, difficulty: Number(question.normalizedDifficulty),
    difficultyLabel: difficultyGroup(question.normalizedDifficulty), knowledgePoint: question.知识点 });

const start = async (userId, raw) => {
    const options = normalizeOptions(raw);
    const report = summarizeInventory(await model.getInventory(options), options.questionCount);
    if (!report.enough) {
        const error = Object.assign(new Error(report.message), { statusCode: 409, errorCode: 40910, details: report });
        throw error;
    }
    const session = await model.createSession({ userId, ...options, plannedCount: options.questionCount });
    const next = await model.findNextQuestion(session);
    if (!next) throw Object.assign(new Error('当前条件下暂时找不到可用题目'), { statusCode: 404 });
    return { sessionId: session.id, currentDifficulty: 1, difficultyLabel: '简单',
        startMessage: '本次从 1 级简单题开始，答完几题后会根据你的表现逐步调整。',
        inventory: report, question: publicQuestion(next.question), fallbackMessage: next.fallbackMessage };
};

const checkAnswer = (type, userAnswer, correctAnswer) => {
    const t = Number(type);
    if (t === 1) {
        const booleanValue = (value) => {
            const text = String(value || '').trim().toLowerCase();
            const T = ['t', 'true', '正确', '对', '是', '√', '1', '✓', '✔', '对的', '是的', '正确的'];
            const F = ['f', 'false', '错误', '错', '否', '×', '0', '✗', '✘', 'x', 'X', '不对', '不是', '错的', '错误的'];
            if (T.includes(text)) return 'T';
            if (F.includes(text)) return 'F';
            const stripped = text.replace(/\s+|。|\./g, '');
            if (T.includes(stripped)) return 'T';
            if (F.includes(stripped)) return 'F';
            return text.toUpperCase();
        };
        return booleanValue(userAnswer) === booleanValue(correctAnswer);
    }
    if (t === 3) {
        const normalize = (s) => String(s || '').replace(/[;；,，、]/g, '').replace(/\s+/g, '').toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
        return normalize(userAnswer) === normalize(correctAnswer);
    }
    if (t === 4) {
        const normalizeOne = (s) => String(s || '')
            .replace(/\s+/g, '')
            .replace(/[，。、；;：:！!？?·""''（）()【】\[\]《》<>、\-—_/\\|,]/g, '')
            .toLowerCase().replace(/％/g, '%').replace(/．/g, '.');
        const splitMany = (s) => String(s || '').split(/\s*[;；|｜/／]\s*/).map(x => x.trim()).filter(Boolean);
        const uList = splitMany(userAnswer), cList = splitMany(correctAnswer);
        if (uList.length > 1 && cList.length > 1 && uList.length === cList.length) {
            return uList.every((u, i) => normalizeOne(u) === normalizeOne(cList[i]));
        }
        return normalizeOne(userAnswer) === normalizeOne(correctAnswer);
    }
    return String(userAnswer || '').trim().toUpperCase() === String(correctAnswer || '').trim().toUpperCase();
};

// ================================================================
// [新增] 同步自适应练习数据到 exam_records 表
// ================================================================
const syncToExamRecords = async (userId, session, updatedSession) => {
    try {
        // 获取所有答题记录
        const answers = await model.findAnswers(session.id);
        if (!answers.length) return;

        const totalCount = Number(session.planned_count);
        const answeredCount = Number(updatedSession.answered_count || answers.length);
        const correctCount = Number(updatedSession.correct_count || answers.filter(a => a.is_correct === 1).length);
        const wrongCount = answeredCount - correctCount;
        const skippedCount = totalCount - answeredCount;
        const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 10000) / 100 : 0;
        const score = accuracy;

        // 计算用时（从创建到完成）
        const startTime = new Date(session.created_at);
        const endTime = new Date();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);

        // 构建 exam_records 数据
        const recordData = {
            examId: null,
            userId,
            startedAt: session.created_at,
            durationSeconds: Math.max(0, durationSeconds),
            totalCount,
            answeredCount,
            correctCount,
            wrongCount,
            skippedCount,
            objectiveTotal: answers.filter(a => [1, 2, 3].includes(a.question_type)).length,
            objectiveCorrect: answers.filter(a => [1, 2, 3].includes(a.question_type) && a.is_correct === 1).length,
            accuracy,
            score,
            answers: answers.map(a => ({
                questionId: a.question_id,
                questionType: a.question_type,
                userAnswer: a.user_answer || '',
                correctAnswer: a.correct_answer || '',
                isObjective: [1, 2, 3].includes(a.question_type) ? 1 : 0,
                isCorrect: a.is_correct,
                evaluation: null,
            })),
        };

        // 写入 exam_records
        const recordId = await practiceModel.createRecord(recordData);
        console.log(`[自适应练习] 已同步到 exam_records，记录ID: ${recordId}`);
    } catch (err) {
        // 同步失败不影响主流程，只记录日志
        console.error('[自适应练习] 同步到 exam_records 失败:', err.message);
    }
};
// ================================================================

const submit = async (userId, sessionId, body = {}) => {
    const session = await model.findSession(sessionId, userId);
    if (!session) throw Object.assign(new Error('练习不存在或无权访问'), { statusCode: 404 });
    if (session.status !== 'active') throw Object.assign(new Error('这次练习已经结束'), { statusCode: 409 });
    const currentQuestion = await model.findEligibleQuestionById(session, body.questionId);
    if (!currentQuestion) {
        throw Object.assign(new Error('当前题目已变化，请刷新页面后继续'), { statusCode: 409 });
    }
    const answer = body.userAnswer == null ? '' : String(body.userAnswer).trim();
    if (!answer) throw Object.assign(new Error('请先填写答案'), { statusCode: 400 });
    const type = Number(currentQuestion.题型);
    const evaluation = [4, 5, 6].includes(type)
        ? await subjectiveEvaluation.evaluate({ questionType: type, question: currentQuestion.题目, userAnswer: answer,
            referenceAnswer: currentQuestion.答案, explanation: currentQuestion.解析 })
        : { status: checkAnswer(type, answer, currentQuestion.答案) ? 'correct' : 'incorrect', scoreRate: 0 };
    if (![4, 5, 6].includes(type)) evaluation.scoreRate = evaluation.status === 'correct' ? 1 : 0;
    const correct = evaluation.status === 'correct'
        || (evaluation.status === 'partial' && Number(evaluation.scoreRate) >= 0.6);
    const previous = await model.findAnswers(session.id);
    const conclusive = !evaluation.reviewRequired && !['partial', 'review'].includes(evaluation.status);
    const recentResults = [...previous.map((item) => item.is_correct), ...(conclusive ? [correct ? 1 : 0] : [])].slice(-5);
    const adjustment = conclusive
        ? evaluateDifficulty({ currentDifficulty: session.current_difficulty, recentResults,
            signal: session.adjustment_signal, cooldown: session.cooldown_remaining })
        : { difficulty: Number(session.current_difficulty), signal: session.adjustment_signal,
            cooldown: session.cooldown_remaining, accuracy: null, changed: false,
            message: evaluation.status === 'partial' ? '本题部分掌握，当前难度保持不变。' : '本题等待复核，当前难度保持不变。' };
    const saved = await model.saveAnswerAndState({ session, question: currentQuestion, userAnswer: answer, isCorrect: correct, adjustment });
    const updated = await model.findSession(session.id, userId);
    const following = saved.complete ? null : await model.findNextQuestion(updated);

    // ===== [新增] 如果练习完成，同步数据到 exam_records =====
    if (saved.complete) {
        await syncToExamRecords(userId, session, updated);
    }
    // ==============================================================

    return { isCorrect: correct, evaluation, correctAnswer: currentQuestion.答案, explanation: currentQuestion.解析,
        progress: { answered: saved.sequence, total: Number(session.planned_count) },
        state: { ...adjustment, difficultyLabel: difficultyGroup(adjustment.difficulty), recentResults },
        completed: saved.complete || !following, nextQuestion: following ? publicQuestion(following.question) : null,
        fallbackMessage: following?.fallbackMessage || '' };
};

const getSession = async (userId, sessionId) => {
    const session = await model.findSession(sessionId, userId);
    if (!session) throw Object.assign(new Error('练习不存在或无权访问'), { statusCode: 404 });
    const answers = await model.findAnswers(session.id);
    const next = session.status === 'active' ? await model.findNextQuestion(session) : null;
    return { session, answers, summary: { accuracy: session.answered_count ? Math.round(session.correct_count / session.answered_count * 100) : 0,
            initialDifficulty: session.initial_difficulty, currentDifficulty: session.current_difficulty,
            trajectory: answers.map((item) => item.difficulty_after) },
        question: next ? publicQuestion(next.question) : null, fallbackMessage: next?.fallbackMessage || '' };
};

const overview = async () => model.getOverview();
const progress = async (userId) => model.getStudentProgress(userId);

module.exports = { inventory, start, submit, getSession, overview, progress };