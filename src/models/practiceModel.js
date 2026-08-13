const pool = require('../config/db');

const QT_TABLE = '`题库1`';

// 客观题题型（1判断 2单选 3多选 4填空），5简答 6程序为非客观题
const OBJECTIVE_TYPES = [1, 2, 3, 4];

// 随机抽题（按条件）
const randomPick = async ({ 章节, 题型, 难度, count }) => {
    const conditions = [];
    const params = [];
    if (章节 !== undefined && 章节 !== '' && 章节 !== null) {
        conditions.push('章节 = ?');
        params.push(章节);
    }
    if (题型 !== undefined && 题型 !== '' && 题型 !== null) {
        conditions.push('题型 = ?');
        params.push(Number(题型));
    }
    if (难度 !== undefined && 难度 !== '' && 难度 !== null) {
        conditions.push('难度 = ?');
        params.push(难度);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
        `SELECT * FROM ${QT_TABLE} ${where} ORDER BY RAND() LIMIT ?`,
        [...params, Number(count)]
    );
    return rows;
};

// 统计客观题数量
const countObjective = (questions) => {
    return questions.filter((q) => OBJECTIVE_TYPES.includes(Number(q.题型))).length;
};

// 创建试卷（事务：写 exams + exam_questions）
const createExam = async ({ userId, title, chapter, questionType, difficulty, questions }) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const objectiveCount = countObjective(questions);
        const [examResult] = await conn.query(
            `INSERT INTO \`exams\` (user_id, title, total_count, objective_count, chapter, question_type, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, questions.length, objectiveCount, chapter || null, questionType || null, difficulty || null]
        );
        const examId = examResult.insertId;

        const values = questions.map((q, i) => [examId, q.id, i + 1]);
        await conn.query(
            `INSERT INTO \`exam_questions\` (exam_id, question_id, sort_order) VALUES ?`,
            [values]
        );

        await conn.commit();
        return { examId, objectiveCount };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 查询用户试卷列表
const findExamsByUser = async (userId, { page = 1, pageSize = 20 } = {}) => {
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM `exams` WHERE user_id = ?', [userId]
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM \`exam_records\` r WHERE r.exam_id = e.id) AS attempt_count
         FROM \`exams\` e WHERE e.user_id = ? ORDER BY e.id DESC LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
    );
    return { rows, total };
};

// 查询试卷详情（含题目列表，带题库原题信息）
const findExamById = async (examId) => {
    const [examRows] = await pool.query('SELECT * FROM `exams` WHERE id = ?', [examId]);
    if (examRows.length === 0) return null;
    const exam = examRows[0];

    const [qRows] = await pool.query(
        `SELECT eq.sort_order, q.* FROM \`exam_questions\` eq
         LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE eq.exam_id = ? ORDER BY eq.sort_order`,
        [examId]
    );
    exam.questions = qRows;
    return exam;
};

// 批量查题（用于提交评分时获取正确答案）
const findQuestionsByIds = async (ids) => {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT id, 题型, 题目, 选项, 答案, 解析 FROM ${QT_TABLE} WHERE id IN (${placeholders})`,
        ids
    );
    return rows;
};

// 错题本：统计当前用户做错的题目数
const countWrongQuestions = async (userId, { chapter, questionType } = {}) => {
    const conditions = ['r.user_id = ?', 'a.is_correct = 0'];
    const params = [userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        conditions.push('q.章节 = ?');
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        conditions.push('q.题型 = ?');
        params.push(Number(questionType));
    }
    const [rows] = await pool.query(
        `SELECT COUNT(DISTINCT q.id) AS total
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         INNER JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE ${conditions.join(' AND ')}`,
        params
    );
    return rows[0].total;
};

// 错题本：分页列出错题
const findWrongQuestions = async (userId, { page = 1, pageSize = 20, chapter, questionType } = {}) => {
    const conditions = ['r.user_id = ?', 'a.is_correct = 0'];
    const params = [userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        conditions.push('q.章节 = ?');
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        conditions.push('q.题型 = ?');
        params.push(Number(questionType));
    }
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT q.id, q.章节 AS chapter, q.题型 AS question_type, q.题目 AS title,
                q.选项 AS options, q.难度 AS difficulty, q.知识点 AS knowledge_point,
                q.答案 AS correct_answer, COUNT(a.id) AS wrong_count,
                MAX(r.submitted_at) AS last_wrong_at
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         INNER JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE ${conditions.join(' AND ')}
         GROUP BY q.id, q.章节, q.题型, q.题目, q.选项, q.难度, q.知识点, q.答案
         ORDER BY last_wrong_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return rows;
};

// 错题本：获取全部错题 id（用于错题重练）
const findWrongQuestionIds = async (userId, { chapter, questionType } = {}) => {
    const conditions = ['r.user_id = ?', 'a.is_correct = 0'];
    const params = [userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        conditions.push('q.章节 = ?');
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        conditions.push('q.题型 = ?');
        params.push(Number(questionType));
    }
    const [rows] = await pool.query(
        `SELECT q.id
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         INNER JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE ${conditions.join(' AND ')}
         GROUP BY q.id
         ORDER BY MAX(r.submitted_at) DESC`,
        params
    );
    return rows.map((r) => r.id);
};

// 从指定 id 集合中随机抽题（错题重练）
const randomPickByIds = async (ids, count) => {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT * FROM ${QT_TABLE} WHERE id IN (${placeholders}) ORDER BY RAND() LIMIT ?`,
        [...ids, Number(count)]
    );
    return rows;
};

// 写入答题记录（事务：写 exam_records + exam_answers）
const createRecord = async (data) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [recordResult] = await conn.query(
            `INSERT INTO \`exam_records\`
             (exam_id, user_id, started_at, submitted_at, duration_seconds,
              total_count, answered_count, correct_count, wrong_count, skipped_count,
              objective_total, objective_correct, accuracy, score)
             VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.examId, data.userId, data.startedAt, data.durationSeconds,
                data.totalCount, data.answeredCount, data.correctCount, data.wrongCount, data.skippedCount,
                data.objectiveTotal, data.objectiveCorrect, data.accuracy, data.score
            ]
        );
        const recordId = recordResult.insertId;

        const values = data.answers.map((a) => [
            recordId, a.questionId, a.questionType, a.userAnswer,
            a.correctAnswer, a.isObjective, a.isCorrect
        ]);
        if (values.length > 0) {
            await conn.query(
                `INSERT INTO \`exam_answers\` (record_id, question_id, question_type, user_answer, correct_answer, is_objective, is_correct) VALUES ?`,
                [values]
            );
        }

        await conn.commit();
        return recordId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 查询用户答题记录列表（含提交人信息）
const findRecordsByUser = async (userId, { page = 1, pageSize = 20 } = {}) => {
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM `exam_records` WHERE user_id = ?', [userId]
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.user_id = ? ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
    );
    return { rows, total };
};

// 按角色权限范围查询答题记录（含提交人信息）
// 权限规则：
//   student  → 仅本人记录
//   teacher  → 所有 teacher + student 的记录
//   admin    → 所有人的记录
const findRecordsByScope = async ({ userId, userRole, page = 1, pageSize = 20 } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];

    if (userRole === 'student') {
        conditions.push('r.user_id = ?');
        params.push(userId);
    } else if (userRole === 'teacher') {
        conditions.push("u.role IN ('teacher', 'student')");
    }
    // admin 不加条件，看所有人

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exam_records\` r
         INNER JOIN \`users\` u ON r.user_id = u.id ${where}`,
        params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         LEFT JOIN \`users\` u ON r.user_id = u.id
         ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 查询答题记录详情（含每题对错，含提交人 username/nickname）
const findRecordById = async (recordId) => {
    const [recordRows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role AS user_role
         FROM \`exam_records\` r
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.id = ?`,
        [recordId]
    );
    if (recordRows.length === 0) return null;
    const record = recordRows[0];

    const [answerRows] = await pool.query(
        `SELECT a.*, q.题目, q.选项, q.解析 FROM \`exam_answers\` a
         LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE a.record_id = ? ORDER BY a.id`,
        [recordId]
    );
    record.answers = answerRows;
    return record;
};

// 统计：总览 + 近期趋势 + 按题型正确率
const getStatistics = async (userId) => {
    // 总览
    const [overview] = await pool.query(
        `SELECT
            COUNT(*) AS total_attempts,
            COALESCE(ROUND(AVG(accuracy), 2), 0) AS avg_accuracy,
            COALESCE(ROUND(MAX(accuracy), 2), 0) AS max_accuracy,
            COALESCE(ROUND(MIN(accuracy), 2), 0) AS min_accuracy,
            COALESCE(SUM(total_count), 0) AS total_questions,
            COALESCE(SUM(correct_count), 0) AS total_correct
         FROM \`exam_records\` WHERE user_id = ?`,
        [userId]
    );

    // 近 20 次趋势（含提交人信息、试卷标题）
    const [trend] = await pool.query(
        `SELECT r.id, r.exam_id, r.accuracy, r.score, r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count, r.duration_seconds, r.submitted_at, r.started_at,
                e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.user_id = ?
         ORDER BY r.submitted_at DESC LIMIT 20`,
        [userId]
    );
    trend.reverse(); // 时间正序展示趋势

    // 按题型正确率
    const [byType] = await pool.query(
        `SELECT
            a.question_type,
            COUNT(*) AS total,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         WHERE r.user_id = ? AND a.is_objective = 1
         GROUP BY a.question_type ORDER BY a.question_type`,
        [userId]
    );

    return {
        overview: overview[0] || {},
        trend,
        byType,
    };
};

// ==================== 管理端查询 ====================

// 查询所有用户的答题记录（可按角色过滤：student/teacher）
const findRecordsByRole = async ({ role, userId, page = 1, pageSize = 20 } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    if (userId) {
        conditions.push('r.user_id = ?');
        params.push(userId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exam_records\` r
         INNER JOIN \`users\` u ON r.user_id = u.id ${where}`,
        params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
        `SELECT r.id, r.exam_id, r.user_id, u.username, u.nickname, u.role,
                r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count,
                r.objective_total, r.objective_correct, r.accuracy, r.score,
                r.duration_seconds, r.submitted_at, e.title AS exam_title
         FROM \`exam_records\` r
         INNER JOIN \`users\` u ON r.user_id = u.id
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 管理端：查询所有用户的答题记录（不分页，按用户+提交时间排序，含用户信息）
// 用于"以人为界"分组统计：service 层按 user_id 分组，每人保留最近 N 次
const findAllRecordsWithUser = async ({ role } = {}) => {
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
        `SELECT r.id, r.exam_id, r.user_id, u.username, u.nickname, u.role,
                r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count,
                r.objective_total, r.objective_correct, r.accuracy, r.score,
                r.duration_seconds, r.submitted_at, e.title AS exam_title
         FROM \`exam_records\` r
         INNER JOIN \`users\` u ON r.user_id = u.id
         LEFT JOIN \`exams\` e ON r.exam_id = e.id
         ${where} ORDER BY u.id ASC, r.submitted_at DESC`,
        params
    );
    return rows;
};

// 查询有答题记录的用户列表（含统计汇总，按角色分组）
const findUsersWithRecords = async ({ role } = {}) => {
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.role, u.status,
                COUNT(r.id) AS attempt_count,
                COALESCE(ROUND(AVG(r.accuracy), 2), 0) AS avg_accuracy,
                COALESCE(MAX(r.accuracy), 0) AS max_accuracy,
                COALESCE(MIN(r.accuracy), 0) AS min_accuracy,
                COALESCE(SUM(r.total_count), 0) AS total_questions,
                COALESCE(SUM(r.correct_count), 0) AS total_correct,
                MAX(r.submitted_at) AS last_attempt_at
         FROM \`users\` u
         INNER JOIN \`exam_records\` r ON u.id = r.user_id
         ${where}
         GROUP BY u.id, u.username, u.nickname, u.role, u.status
         ORDER BY u.role ASC, attempt_count DESC`,
        params
    );
    return rows;
};

// 管理端：查询某用户的答题记录列表
const findRecordsByUserId = async (targetUserId, { page = 1, pageSize = 20 } = {}) => {
    return findRecordsByRole({ userId: targetUserId, page, pageSize });
};

// 管理端：查询某用户的统计信息（复用 getStatistics）
const getUserStatistics = async (userId) => {
    return getStatistics(userId);
};

// 管理端：根据 id 查用户（用于权限校验）
const findUserById = async (userId) => {
    const [rows] = await pool.query(
        'SELECT id, username, nickname, role, status FROM `users` WHERE id = ?',
        [userId]
    );
    return rows[0] || null;
};

module.exports = {
    randomPick,
    createExam,
    findExamsByUser,
    findExamById,
    findQuestionsByIds,
    countWrongQuestions,
    findWrongQuestions,
    findWrongQuestionIds,
    randomPickByIds,
    createRecord,
    findRecordsByUser,
    findRecordById,
    getStatistics,
    findRecordsByRole,
    findRecordsByScope,
    findAllRecordsWithUser,
    findUsersWithRecords,
    findRecordsByUserId,
    getUserStatistics,
    findUserById,
    OBJECTIVE_TYPES,
};
