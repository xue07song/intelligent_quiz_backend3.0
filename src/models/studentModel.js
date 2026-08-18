const pool = require('../config/db');

const QT_TABLE = '`题库1`';

const findProfile = async (userId) => {
    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.role, u.created_at, u.email, u.phone, u.school, u.college,
                u.student_no, u.employee_no, u.major, u.grade, u.title
         FROM \`users\` u
         WHERE u.id = ?`,
        [userId]
    );
    return rows[0] || null;
};

const countHistoryQuestions = async (userId) => {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
         WHERE r.user_id = ?`,
        [userId]
    );
    return rows[0].total;
};

const findHistoryQuestions = async (userId, { page, size }) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
        `SELECT a.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                a.user_answer AS userAnswer, a.correct_answer AS correctAnswer,
                a.is_correct AS isCorrect, r.submitted_at AS answeredAt
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
                  LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE r.user_id = ?
         ORDER BY r.submitted_at DESC, a.id DESC
             LIMIT ? OFFSET ?`,
        [userId, size, offset]
    );
    return rows;
};

const countHistoryExams = async (userId) => {
    const [rows] = await pool.query(
        'SELECT COUNT(*) AS total FROM `exams` WHERE user_id = ?',
        [userId]
    );
    return rows[0].total;
};

const findHistoryExams = async (userId, { page, size }) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
        `SELECT e.id, e.title, e.total_count AS totalCount, e.created_at AS createdAt,
                COUNT(r.id) AS attemptCount, COALESCE(MAX(r.score), 0) AS maxScore
         FROM \`exams\` e
                  LEFT JOIN \`exam_records\` r ON r.exam_id = e.id AND r.user_id = ?
         WHERE e.user_id = ?
         GROUP BY e.id, e.title, e.total_count, e.created_at
         ORDER BY e.id DESC
             LIMIT ? OFFSET ?`,
        [userId, userId, size, offset]
    );
    return rows;
};

const findExamRecords = async (examId, userId) => {
    const [rows] = await pool.query(
        `SELECT r.id, r.score, r.correct_count AS correctCount, r.wrong_count AS wrongCount,
                r.skipped_count AS skippedCount, r.duration_seconds AS durationSeconds,
                r.submitted_at AS submittedAt
         FROM \`exam_records\` r
         WHERE r.exam_id = ? AND r.user_id = ?
         ORDER BY r.submitted_at DESC`,
        [examId, userId]
    );
    return rows;
};

const countFavorites = async (userId) => {
    const [rows] = await pool.query(
        'SELECT COUNT(*) AS total FROM `user_favorites` WHERE user_id = ?',
        [userId]
    );
    return rows[0].total;
};

// ================================================================
// [修改] findFavorites：添加 q.章节 AS chapter 字段
// ================================================================
const findFavorites = async (userId, { page, size }) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
        `SELECT f.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                q.难度 AS difficulty, q.知识点 AS knowledgePoint, q.章节 AS chapter, f.created_at AS createdAt
         FROM \`user_favorites\` f
         LEFT JOIN ${QT_TABLE} q ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE f.user_id = ?
         ORDER BY f.id DESC
         LIMIT ? OFFSET ?`,
        [userId, size, offset]
    );
    return rows;
};
// ================================================================

const findFavorite = async (userId, questionId) => {
    const [rows] = await pool.query(
        'SELECT id FROM `user_favorites` WHERE user_id = ? AND question_id = ?',
        [userId, questionId]
    );
    return rows[0] || null;
};

const addFavorite = async (userId, questionId) => {
    const [result] = await pool.query(
        'INSERT INTO `user_favorites` (user_id, question_id) VALUES (?, ?)',
        [userId, questionId]
    );
    return result;
};

const removeFavorite = async (userId, questionId) => {
    const [result] = await pool.query(
        'DELETE FROM `user_favorites` WHERE user_id = ? AND question_id = ?',
        [userId, questionId]
    );
    return result;
};

module.exports = {
    findProfile,
    countHistoryQuestions,
    findHistoryQuestions,
    countHistoryExams,
    findHistoryExams,
    findExamRecords,
    countFavorites,
    findFavorites,
    findFavorite,
    addFavorite,
    removeFavorite,
};