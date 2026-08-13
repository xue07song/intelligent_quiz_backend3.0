const pool = require('../config/db');

const getStudents = async () => {
    const [rows] = await pool.query("SELECT id, username, nickname FROM users WHERE role='student' ORDER BY id");
    return rows;
};

const getStudent = async (userId) => {
    const [rows] = await pool.query("SELECT id, username, nickname FROM users WHERE id=? AND role='student'", [userId]);
    return rows[0] || null;
};

const getExamRecords = async (userId) => {
    const [rows] = await pool.query(`SELECT r.id, r.score, r.accuracy, r.total_count, r.answered_count,
        r.correct_count, r.duration_seconds, r.submitted_at, e.title
        FROM exam_records r LEFT JOIN exams e ON e.id=r.exam_id
        WHERE r.user_id=? ORDER BY r.submitted_at`, [userId]);
    return rows;
};

const getExamAnswers = async (userId) => {
    const [rows] = await pool.query(`SELECT a.question_id questionId, a.question_type questionType,
        a.is_correct isCorrect, r.submitted_at answeredAt, q.章节 chapter, q.题目 content,
        COALESCE(NULLIF(q.知识点,''),'未标注知识点') knowledgePoint,
        CASE WHEN q.难度 REGEXP '^[1-5]$' THEN CAST(q.难度 AS UNSIGNED)
          WHEN q.难度='简单' THEN 2 WHEN q.难度='中等' THEN 3 WHEN q.难度='困难' THEN 5 ELSE NULL END difficulty
        FROM exam_answers a INNER JOIN exam_records r ON r.id=a.record_id
        LEFT JOIN 题库1 q ON a.question_id=CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE r.user_id=? AND a.is_objective=1 ORDER BY r.submitted_at`, [userId]);
    return rows;
};

const getAdaptiveAnswers = async (userId) => {
    const [rows] = await pool.query(`SELECT a.question_id questionId, a.question_type questionType,
        a.is_correct isCorrect, a.answered_at answeredAt, q.章节 chapter, q.题目 content,
        COALESCE(NULLIF(a.knowledge_point,''),'未标注知识点') knowledgePoint,
        a.question_difficulty difficulty, a.difficulty_after difficultyAfter
        FROM adaptive_practice_answers a INNER JOIN adaptive_practice_sessions s ON s.id=a.session_id
        LEFT JOIN 题库1 q ON a.question_id=CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE s.user_id=? ORDER BY a.answered_at`, [userId]);
    return rows;
};

module.exports = { getStudents, getStudent, getExamRecords, getExamAnswers, getAdaptiveAnswers };
