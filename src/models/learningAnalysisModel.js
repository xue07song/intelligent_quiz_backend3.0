const pool = require('../config/db');

const getStudents = async () => {
    const [rows] = await pool.query(`SELECT u.id, u.username, u.nickname, c.id classId,
        COALESCE(c.name, '未分班') className FROM users u LEFT JOIN classes c ON c.id=u.class_id
        WHERE u.role='student' ORDER BY className, u.id`);
    return rows;
};

const getClasses = async () => {
    const [rows] = await pool.query(`SELECT c.id, c.name, COUNT(DISTINCT sc.student_id) studentCount
        FROM classes c LEFT JOIN student_classes sc ON sc.class_id=c.id
        GROUP BY c.id, c.name ORDER BY c.name`);
    return rows;
};

const getStudent = async (userId) => {
    const [rows] = await pool.query(`SELECT u.id, u.username, u.nickname, c.id classId,
        COALESCE(c.name, '未分班') className FROM users u LEFT JOIN classes c ON c.id=u.class_id
        WHERE u.id=? AND u.role='student'`, [userId]);
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

module.exports = { getStudents, getClasses, getStudent, getExamRecords, getExamAnswers, getAdaptiveAnswers };
