const { chat, chatJSON, isConfigured } = require('../utils/aiClient');
const practiceModel = require('../models/practiceModel');
const questionModel = require('../models/questionModel');
const userModel = require('../models/userModel');
const { isValidSubject } = require('../config/subjects');

// 题型映射（与 typeMap 一致）
const TYPE_MAP = {
    1: '判断题',
    2: '单选题',
    3: '多选题',
    4: '填空题',
    5: '简答题',
    6: '程序论述题',
};

// ==================== 1. AI 自动出题 ====================
// 根据章节/知识点/题型/数量生成题目草稿（不入库，返回给前端审核）
const generateQuestions = async (options) => {
    const { 章节, 知识点, 题型, 数量 = 3, 难度, 补充说明 } = options;
    const count = Math.min(Math.max(Number(数量) || 1, 1), 10);

    if (!isConfigured()) {
        const err = new Error('AI 服务未配置：请在 .env 中设置 GLM_API_KEY');
        err.statusCode = 500;
        err.errorCode = 50001;
        throw err;
    }

    const typeName = TYPE_MAP[题型] || '任意题型';
    const difficultyDesc = 难度 ? `难度约为 ${难度}` : '难度不限';

    const systemPrompt = `你是一位资深命题专家，擅长为编程/计算机基础类课程命题。
要求：
1. 题目科学严谨、无歧义，答案唯一且正确
2. 选项格式统一为 "A.内容 B.内容 C.内容 D.内容"，不要换行分隔
3. 判断题答案只能是 "对" 或 "错"
4. 单选/多选题答案为大写字母（多选如 "ABC"）
5. 填空题答案简明扼要
6. 解析要清晰说明正确答案的依据
7. 必须以 JSON 对象返回，结构为 {"questions": [...]}`;

    const userPrompt = `请围绕「章节${章节 || '不限'}、知识点：${知识点 || '不限'}」生成 ${count} 道${typeName}，${difficultyDesc}。
${补充说明 ? '附加要求：' + 补充说明 : ''}

每道题包含字段：id(如 AI001)、章节(数字)、题型(数字1-6)、序号(0)、题目、选项、答案、解析、难度、知识点、科目、使用频率("0")、出题人("AI")。

返回 JSON：{"questions": [{...}]}`;

    const result = await chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], { temperature: 0.8, max_tokens: 4096 });

    const questions = Array.isArray(result.questions) ? result.questions : [];
    // 标准化字段类型
    return questions.map((q) => ({
        id: String(q.id || '').trim(),
        章节: Number(q.章节) || Number(章节) || 0,
        题型: Number(q.题型) || Number(题型) || 2,
        序号: Number(q.序号) || 0,
        题目: String(q.题目 || '').trim(),
        选项: String(q.选项 || ''),
        答案: String(q.答案 || '').trim(),
        解析: String(q.解析 || ''),
        难度: String(q.难度 || (难度 || '')),
        知识点: String(q.知识点 || (知识点 || '')),
        科目: String(q.科目 || '').trim(),
        使用频度: String(q.使用频率 || '0'),
        出题人: String(q.出题人 || 'AI'),
    })).filter((q) => q.id && q.题目);
};

// 批量入库 AI 生成的题目（教师审核后调用，复用 batchImport 逻辑，重复 id 跳过）
const saveGenerated = async (items, subject, actor) => {
    const questionService = require('./questionService');
    return questionService.batchImport(items, subject ? { subject: String(subject).trim() } : {}, actor);
};

// ==================== 2. AI 答疑助手 ====================
// 学生做题时提问：传入题目内容 + 学生问题，返回思路提示/解析
const askTutor = async ({ question, options, questionType, userQuestion, userAnswer, examId }) => {
    if (!isConfigured()) {
        const err = new Error('AI 服务未配置');
        err.statusCode = 500;
        err.errorCode = 50001;
        throw err;
    }
    if (examId) {
        const exam = await practiceModel.findExamById(examId);
        if (exam && exam.creator_role === 'teacher' &&
            (exam.duration_minutes || exam.end_at || exam.max_attempts || (exam.status && exam.status !== 'published'))) {
            const err = new Error('正式考试模式下暂不开放 AI 答疑，交卷后可继续使用');
            err.statusCode = 403;
            err.errorCode = 40301;
            throw err;
        }
    }

    const typeName = TYPE_MAP[questionType] || '题目';
    const systemPrompt = `你是一位耐心的辅导老师。学生正在做一道${typeName}，向你提问。
要求：
1. 启发式引导，优先给出解题思路和关键提示，而非直接抛出最终答案
2. 如果学生明确要求直接看答案，或已多次提问，可以给出详细解析
3. 回答简洁清晰，使用中文，适当使用分点表述
4. 不要编造题目中未给出的信息`;

    const context = [
        `【题目类型】${typeName}`,
        `【题目】${question}`,
    ];
    if (options) context.push(`【选项】${options}`);
    if (userAnswer) context.push(`【学生作答】${userAnswer}`);
    context.push(`【学生提问】${userQuestion || '请给我一些解题思路。'}`);

    const content = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context.join('\n') },
    ], { temperature: 0.5, max_tokens: 1024 });

    return { reply: content };
};

// ==================== 3. AI 智能组卷 ====================
// 基于学生近期表现 + 章节/难度要求，AI 推荐组卷策略并从题库选题
const smartGenerateExam = async (user, options) => {
    if (!isConfigured()) {
        const err = new Error('AI 服务未配置');
        err.statusCode = 500;
        err.errorCode = 50001;
        throw err;
    }

    const { 章节, 题型, 难度, count = 10, focusWeakPoints = true, subject, classId } = options;
    const numCount = Math.min(Math.max(Number(count) || 10, 1), 50);

    let finalSubject = null;
    if (user.role === 'teacher') {
        const teacherSubjects = await userModel.getTeacherSubjects(user.id);
        if (!subject || !String(subject).trim()) {
            const err = new Error('教师 AI 组卷必须选择科目');
            err.statusCode = 400;
            err.errorCode = 40001;
            throw err;
        }
        const s = String(subject).trim();
        if (!isValidSubject(s)) {
            const err = new Error(`科目「${s}」不在合法科目列表中`);
            err.statusCode = 400;
            err.errorCode = 40002;
            throw err;
        }
        if (!teacherSubjects.includes(s)) {
            const err = new Error(`无权使用科目「${s}」组卷，请选择您所教的科目`);
            err.statusCode = 403;
            err.errorCode = 40303;
            throw err;
        }
        finalSubject = s;
    } else if (subject && String(subject).trim()) {
        const s = String(subject).trim();
        if (!isValidSubject(s)) {
            const err = new Error(`科目「${s}」不在合法科目列表中`);
            err.statusCode = 400;
            err.errorCode = 40002;
            throw err;
        }
        finalSubject = s;
    }

    // 取学生近期统计（错题分布、薄弱题型）
    const stats = await practiceModel.getStatistics(userId);
    const byType = stats.byType || []; // [{question_type, total, correct, accuracy}]

    // 让 AI 给出组卷策略（题型分布建议）
    const systemPrompt = `你是一位智能组卷系统。根据学生的近期答题表现，给出合理的组卷策略。
返回 JSON：{"strategy": "简要说明", "distribution": [{"题型": 1, "数量": 2}, ...]}
题型数字含义：1判断 2单选 3多选 4填空 5简答 6程序。数量总和应等于 ${numCount}。`;

    const weakInfo = focusWeakPoints && byType.length > 0
        ? `学生近期按题型正确率：${byType.map(t => `${TYPE_MAP[t.question_type] || t.question_type}:${t.accuracy}%(${t.correct}/${t.total})`).join('，')}`
        : '暂无历史数据，请按均衡分布';

    const constraints = [
        `目标题量：${numCount} 题`,
        章节 ? `章节范围：${章节}` : '章节不限',
        题型 ? `限定题型：${TYPE_MAP[题型]}` : '题型可混合',
        难度 ? `目标难度：${难度}` : '难度可混合',
    ].join('；');

    const strategy = await chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${weakInfo}\n${constraints}\n请给出组卷策略（JSON）。` },
    ], { temperature: 0.4, max_tokens: 1024 });

    // 根据策略从题库按题型随机抽题
    const distribution = Array.isArray(strategy.distribution) ? strategy.distribution : [];
    const pickedQuestions = [];

    if (distribution.length > 0 && !题型) {
        // 按策略分布抽题
        for (const d of distribution) {
            const t = Number(d.题型);
            const n = Number(d.数量) || 0;
            if (!t || n <= 0) continue;
            const rows = await practiceModel.randomPick({
                章节, 题型: t, 难度, count: n, 科目: finalSubject,
            });
            pickedQuestions.push(...rows);
        }
    } else {
        // 单一题型或无策略，直接抽
        const rows = await practiceModel.randomPick({
            章节, 题型, 难度, count: numCount, 科目: finalSubject,
        });
        pickedQuestions.push(...rows);
    }

    // 去重 + 截断到目标题量
    const seen = new Set();
    const finalQuestions = [];
    for (const q of pickedQuestions) {
        if (!seen.has(q.id)) {
            seen.add(q.id);
            finalQuestions.push(q);
        }
        if (finalQuestions.length >= numCount) break;
    }

    if (finalQuestions.length === 0) {
        const err = new Error('题库中没有符合条件的题目，请调整筛选条件');
        err.statusCode = 404;
        err.errorCode = 40401;
        throw err;
    }

    // 创建试卷
    const title = `AI 智能组卷-${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const { examId, objectiveCount } = await practiceModel.createExam({
        userId: user.id,
        title,
        chapter: 章节,
        questionType: 题型,
        difficulty: 难度,
        questions: finalQuestions,
        subject: finalSubject,
        classId: classId || null,
    });

    return {
        examId,
        title,
        strategy: strategy.strategy || 'AI 智能组卷',
        distribution,
        total: finalQuestions.length,
        objectiveCount,
        questions: finalQuestions,
    };
};

// ==================== 4. AI 错题分析 ====================
// 基于学生答题记录，AI 分析薄弱知识点并给出建议
const analyzeWeakness = async (userId) => {
    if (!isConfigured()) {
        const err = new Error('AI 服务未配置');
        err.statusCode = 500;
        err.errorCode = 50001;
        throw err;
    }

    const stats = await practiceModel.getStatistics(userId);
    const overview = stats.overview || {};
    const byType = stats.byType || [];
    const trend = stats.trend || [];

    if (!overview.total_attempts || Number(overview.total_attempts) === 0) {
        return {
            hasData: false,
            message: '暂无答题记录，开始练习后即可获得 AI 分析报告',
        };
    }

    // 取最近错题明细（最多 50 题）用于 AI 分析知识点
    const [recentWrong] = await require('../config/db').query(
        `SELECT a.question_id, a.question_type, a.user_answer, a.correct_answer,
                COALESCE(eq.snapshot_题目, q.题目) AS 题目,
                COALESCE(eq.snapshot_选项, q.选项) AS 选项,
                COALESCE(eq.snapshot_知识点, q.知识点) AS 知识点,
                COALESCE(eq.snapshot_章节, q.章节) AS 章节
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         LEFT JOIN \`exam_questions\` eq ON eq.exam_id = r.exam_id AND eq.question_id = a.question_id
         LEFT JOIN \`题库1\` q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE r.user_id = ? AND a.is_correct = 0
         ORDER BY r.submitted_at DESC LIMIT 50`,
        [userId]
    );

    const systemPrompt = `你是一位学习分析专家。根据学生的答题数据，分析其薄弱环节并给出针对性建议。
返回 JSON：
{
  "summary": "总体评价（1-2句）",
  "weakTypes": [{"题型": "单选题", "正确率": 60, "建议": "..."}],
  "weakPoints": [{"知识点": "...", "章节": 3, "原因": "...", "建议": "..."}],
  "studyPlan": ["建议1", "建议2", "建议3"],
  "encouragement": "鼓励话语"
}`;

    const dataDesc = [
        `总练习次数：${overview.total_attempts}`,
        `平均准确率：${overview.avg_accuracy}%`,
        `总答题数：${overview.total_questions}，答对：${overview.total_correct}`,
        `按题型正确率：${byType.map(t => `${TYPE_MAP[t.question_type] || t.question_type} ${t.accuracy}%(${t.correct}/${t.total})`).join('，') || '无'}`,
        `最近${trend.length}次准确率趋势：${trend.map(t => t.accuracy + '%').join(' → ') || '无'}`,
        `近期错题样例（用于知识点分析，最多50题）：`,
        ...recentWrong.slice(0, 30).map(w => `  - [${TYPE_MAP[w.question_type] || w.question_type}][章${w.章节 || '?'}][${w.知识点 || '无知识点'}] ${String(w.题目 || '').slice(0, 80)}... 学生答:${w.user_answer || '(空)'} 正确:${w.correct_answer || '(空)'}`),
    ].join('\n');

    const analysis = await chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataDesc },
    ], { temperature: 0.6, max_tokens: 2048 });

    return {
        hasData: true,
        overview,
        byType,
        trend,
        wrongSampleCount: recentWrong.length,
        analysis,
    };
};

module.exports = {
    generateQuestions,
    saveGenerated,
    askTutor,
    smartGenerateExam,
    analyzeWeakness,
};
