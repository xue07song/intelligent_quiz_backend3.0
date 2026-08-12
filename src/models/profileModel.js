const pool = require('../config/db');

const QT_TABLE = '`题库1`';

// 查询用户历史做过的题目（去重，按最后答题时间排序）
const findPracticedQuestions = async (userId, { page = 1, pageSize = 20, isCorrect, question_type } = {}) => {
    const conditions = ['r.user_id = ?'];
    const params = [userId];
    const countParams = [userId];

    if (isCorrect !== undefined && isCorrect !== '' && isCorrect !== null) {
        const flag = isCorrect === '1' || isCorrect === 1 || isCorrect === true ? 1 : 0;
        conditions.push('a.is_correct = ?');
        params.push(flag);
        countParams.push(flag);
    }
    if (question_type !== undefined && question_type !== '' && question_type !== null) {
        conditions.push('a.question_type = ?');
        params.push(Number(question_type));
        countParams.push(Number(question_type));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 去重：同一用户同一题目只保留最新一次提交
    const subqueryLatest = `
        SELECT a.question_id, MAX(r.submitted_at) AS last_submit_at
        FROM \`exam_answers\` a
        INNER JOIN \`exam_records\` r ON a.record_id = r.id
        ${where}
        GROUP BY a.question_id
    `;

    const [countResult] = await pool.query(
        `SELECT COUNT(*) AS total FROM (${subqueryLatest}) AS dedup`,
        countParams
    );
    const total = countResult[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT 
            dedup.question_id,
            dedup.last_submit_at,
            q.id AS question_ref_id,
            q.章节, q.题型, q.题目, q.选项, q.答案, q.解析, q.难度, q.知识点, q.出题人,
            a2.user_answer,
            a2.correct_answer,
            a2.is_correct,
            a2.is_objective
         FROM (${subqueryLatest}) AS dedup
         INNER JOIN \`exam_records\` r2
            INNER JOIN \`exam_answers\` a2 ON a2.record_id = r2.id
           ON dedup.question_id = a2.question_id AND r2.submitted_at = dedup.last_submit_at AND r2.user_id = ?
         LEFT JOIN ${QT_TABLE} q ON dedup.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         ORDER BY dedup.last_submit_at DESC
         LIMIT ? OFFSET ?`,
        [...params, userId, pageSize, offset]
    );

    return { rows, total };
};

// 用户历史做题汇总（题目数量、正确率等）
const practiceSummary = async (userId) => {
    const [overview] = await pool.query(
        `SELECT
            COUNT(DISTINCT a.question_id) AS practiced_total,
            COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.question_id END) AS practiced_correct,
            COUNT(DISTINCT CASE WHEN a.is_correct = 0 THEN a.question_id END) AS practiced_wrong
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         WHERE r.user_id = ?`,
        [userId]
    );

    const [byType] = await pool.query(
        `SELECT
            a.question_type,
            COUNT(DISTINCT a.question_id) AS total,
            COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.question_id END) AS correct_count,
            ROUND(COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.question_id END) * 100.0
                  / NULLIF(COUNT(DISTINCT a.question_id), 0), 2) AS accuracy
         FROM \`exam_answers\` a
         INNER JOIN \`exam_records\` r ON a.record_id = r.id
         WHERE r.user_id = ?
         GROUP BY a.question_type
         ORDER BY a.question_type`,
        [userId]
    );

    return {
        overview: overview[0] || { practiced_total: 0, practiced_correct: 0, practiced_wrong: 0 },
        byType,
    };
};

module.exports = { findPracticedQuestions, practiceSummary };
