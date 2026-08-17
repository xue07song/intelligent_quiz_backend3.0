const pool = require('../config/db');

const getStudents = async (examIds = null) => {
    const examIdsArray = Array.isArray(examIds) && examIds.length > 0 ? examIds : null;
    if (Array.isArray(examIds) && examIds.length === 0) return [];
    let sql = "SELECT DISTINCT u.id, u.username, u.nickname FROM users u INNER JOIN exam_records r ON r.user_id = u.id";
    const params = [];
    if (examIdsArray) {
        const placeholders = examIdsArray.map(() => '?').join(', ');
        sql += ` WHERE u.role = 'student' AND r.exam_id IN (${placeholders})`;
        params.push(...examIdsArray);
    } else {
        sql += " WHERE u.role = 'student'";
    }
    sql += " ORDER BY u.id";
    const [rows] = await pool.query(sql, params);
    return rows;
};

const getStudent = async (userId) => {
    const [rows] = await pool.query("SELECT id, username, nickname FROM users WHERE id=? AND role='student'", [userId]);
    return rows[0] || null;
};

const getExamRecords = async (userId, examIds = null) => {
    const examIdsArray = Array.isArray(examIds) && examIds.length > 0 ? examIds : null;
    const examClause = examIdsArray ? ` AND r.exam_id IN (${examIdsArray.map(() => '?').join(', ')})` : '';
    const examParams = examIdsArray || [];
    const [rows] = await pool.query(`SELECT r.id, r.score, r.accuracy, r.total_count, r.answered_count,
        r.correct_count, r.duration_seconds, r.submitted_at, e.title
        FROM exam_records r LEFT JOIN exams e ON e.id=r.exam_id
        WHERE r.user_id=?${examClause} ORDER BY r.submitted_at`, [userId, ...examParams]);
    return rows;
};

const getExamAnswers = async (userId, examIds = null) => {
    const examIdsArray = Array.isArray(examIds) && examIds.length > 0 ? examIds : null;
    const examClause = examIdsArray ? ` AND r.exam_id IN (${examIdsArray.map(() => '?').join(', ')})` : '';
    const examParams = examIdsArray || [];
    const [rows] = await pool.query(`SELECT a.question_id questionId, a.question_type questionType,
        a.is_correct isCorrect, r.submitted_at answeredAt,
        COALESCE(eq.snapshot_章节, q.章节) chapter,
        COALESCE(eq.snapshot_题目, q.题目) content,
        COALESCE(eq.snapshot_知识点, q.知识点) knowledgePoint,
        COALESCE(eq.snapshot_难度, q.难度) difficulty
        FROM exam_answers a INNER JOIN exam_records r ON r.id=a.record_id
        LEFT JOIN exam_questions eq ON eq.exam_id=r.exam_id AND eq.question_id=a.question_id
        LEFT JOIN 题库1 q ON a.question_id=CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE r.user_id=? AND a.is_objective=1${examClause} ORDER BY r.submitted_at`, [userId, ...examParams]);
    return rows;
};

const getAdaptiveAnswers = async (userId) => {
    const [rows] = await pool.query(`SELECT a.question_id questionId, a.question_type questionType,
        a.is_correct isCorrect, a.answered_at answeredAt, q.章节 chapter, q.题目 content,
        COALESCE(NULLIF(a.knowledge_point,''),'未标注知识点') knowledgePoint,
        a.question_difficulty difficulty, a.difficulty_after difficultyAfter
        FROM adaptive_practice_answers a INNER JOIN adaptive_practice_sessions s ON s.id=a.session_id
        LEFT JOIN 题库1 q ON a.question_id=CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE s.user_id=? AND a.is_correct IN (0,1) ORDER BY a.answered_at`, [userId]);
    return rows;
};

module.exports = { getStudents, getStudent, getExamRecords, getExamAnswers, getAdaptiveAnswers };
