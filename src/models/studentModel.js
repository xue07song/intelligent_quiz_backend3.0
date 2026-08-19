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

const countHistoryQuestions = async (userId, keyword) => {
    let sql = `SELECT COUNT(*) AS total
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id`;
    const params = [];
    const conditions = ['r.user_id = ?'];
    params.push(userId);
    if (keyword && keyword.trim()) {
        sql += ` LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
        const kw = `%${keyword.trim()}%`;
        conditions.push('(q.题目 LIKE ? OR q.知识点 LIKE ? OR q.章节 LIKE ?)');
        params.push(kw, kw, kw);
    }
    sql += ` WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

const findHistoryQuestions = async (userId, { page, size, keyword }) => {
    const offset = (page - 1) * size;
    let where = 'r.user_id = ?';
    const params = [userId];
    if (keyword && keyword.trim()) {
        const kw = `%${keyword.trim()}%`;
        where += ' AND (COALESCE(eq.snapshot_题目, q.题目) LIKE ? OR q.知识点 LIKE ? OR q.章节 LIKE ?)';
        params.push(kw, kw, kw);
    }
    const [rows] = await pool.query(
        `SELECT a.question_id AS questionId,
                COALESCE(eq.snapshot_题目, q.题目) AS title,
                COALESCE(eq.snapshot_题型, q.题型) AS questionType,
                a.user_answer AS userAnswer, a.correct_answer AS correctAnswer,
                a.is_correct AS isCorrect, r.submitted_at AS answeredAt
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
                  LEFT JOIN \`exam_questions\` eq ON eq.exam_id = r.exam_id AND eq.question_id = a.question_id
                  LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE ${where}
         ORDER BY r.submitted_at DESC, a.id DESC
             LIMIT ? OFFSET ?`,
        [...params, size, offset]
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

const countFavorites = async (userId, keyword) => {
    let sql = 'SELECT COUNT(*) AS total FROM `user_favorites` f';
    const params = [userId];
    if (keyword && keyword.trim()) {
        sql += ` LEFT JOIN ${QT_TABLE} q ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                 WHERE f.user_id = ? AND (q.题目 LIKE ? OR q.知识点 LIKE ? OR q.章节 LIKE ?)`;
        const kw = `%${keyword.trim()}%`;
        params.push(kw, kw, kw);
    } else {
        sql += ' WHERE f.user_id = ?';
    }
    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

// ================================================================
// [修改] findFavorites：添加 keyword 搜索 + q.章节 AS chapter 字段
// ================================================================
const findFavorites = async (userId, { page, size, keyword }) => {
    const offset = (page - 1) * size;
    let where = 'f.user_id = ?';
    const params = [userId];
    if (keyword && keyword.trim()) {
        const kw = `%${keyword.trim()}%`;
        where += ' AND (q.题目 LIKE ? OR q.知识点 LIKE ? OR q.章节 LIKE ?)';
        params.push(kw, kw, kw);
    }
    const [rows] = await pool.query(
        `SELECT f.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                q.难度 AS difficulty, q.知识点 AS knowledgePoint, q.章节 AS chapter, f.created_at AS createdAt
         FROM \`user_favorites\` f
         LEFT JOIN ${QT_TABLE} q ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE ${where}
         ORDER BY f.id DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
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

// ================================================================
// 收藏标签
// ================================================================

const findFavoriteTags = async (userId) => {
    const [rows] = await pool.query(
        `SELECT id, user_id AS userId, name, type, color
         FROM user_favorite_tags
         WHERE user_id = 0 OR user_id = ?
         ORDER BY type ASC, id ASC`,
        [userId]
    );
    return rows;
};

const findFavoriteTagById = async (tagId) => {
    const [rows] = await pool.query(
        'SELECT id, user_id, name, type, color FROM user_favorite_tags WHERE id = ?',
        [tagId]
    );
    return rows[0] || null;
};

const findFavoriteTagByName = async (userId, name) => {
    const [rows] = await pool.query(
        'SELECT id FROM user_favorite_tags WHERE user_id = ? AND name = ?',
        [userId, name]
    );
    return rows[0] || null;
};

const addFavoriteTag = async (userId, { name, color = '#6366F1' }) => {
    const [result] = await pool.query(
        `INSERT INTO user_favorite_tags (user_id, name, type, color) VALUES (?, ?, 'custom', ?)`,
        [userId, name, color]
    );
    return result.insertId;
};

const removeFavoriteTag = async (userId, tagId) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 先清理 favorite_question_tags 关联
        await conn.query(
            'DELETE FROM user_favorite_question_tags WHERE user_id = ? AND tag_id = ?',
            [userId, tagId]
        );
        // 只删 custom 标签（preset 由 service 层拦截 403）
        const [result] = await conn.query(
            'DELETE FROM user_favorite_tags WHERE user_id = ? AND id = ? AND type = ?',
            [userId, tagId, 'custom']
        );
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

const findFavoriteQuestionTags = async (userId, questionId) => {
    const [rows] = await pool.query(
        `SELECT t.id, t.name, t.color, t.type
         FROM user_favorite_question_tags ft
         INNER JOIN user_favorite_tags t ON ft.tag_id = t.id
         WHERE ft.user_id = ? AND ft.question_id = ?
         ORDER BY t.id ASC`,
        [userId, questionId]
    );
    return rows;
};

const findFavoriteQuestionTagIds = async (userId, questionId) => {
    const [rows] = await pool.query(
        'SELECT tag_id FROM user_favorite_question_tags WHERE user_id = ? AND question_id = ?',
        [userId, questionId]
    );
    return rows.map(r => r.tag_id);
};

const setFavoriteQuestionTags = async (userId, questionId, tagIds) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            'DELETE FROM user_favorite_question_tags WHERE user_id = ? AND question_id = ?',
            [userId, questionId]
        );
        const ids = Array.isArray(tagIds) ? tagIds.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
        if (ids.length > 0) {
            const values = ids.map(tagId => [userId, questionId, tagId]);
            await conn.query(
                'INSERT IGNORE INTO user_favorite_question_tags (user_id, question_id, tag_id) VALUES ?',
                [values]
            );
        }
        await conn.commit();
        return { tagIds: ids };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 按标签过滤收藏列表
const findFavoritesWithTagFilter = async (userId, tagId, { page, size }) => {
    const offset = (page - 1) * size;
    const [rows] = await pool.query(
        `SELECT f.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                q.难度 AS difficulty, q.知识点 AS knowledgePoint, q.章节 AS chapter,
                f.created_at AS createdAt
         FROM user_favorites f
         INNER JOIN user_favorite_question_tags ft
            ON ft.user_id = f.user_id AND ft.question_id = f.question_id
         LEFT JOIN ${QT_TABLE} q
            ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE f.user_id = ? AND ft.tag_id = ?
         GROUP BY f.question_id, q.题目, q.题型, q.难度, q.知识点, q.章节, f.created_at
         ORDER BY f.id DESC
         LIMIT ? OFFSET ?`,
        [userId, tagId, size, offset]
    );
    return rows;
};

const countFavoritesWithTagFilter = async (userId, tagId) => {
    const [rows] = await pool.query(
        `SELECT COUNT(DISTINCT f.question_id) AS total
         FROM user_favorites f
         INNER JOIN user_favorite_question_tags ft
            ON ft.user_id = f.user_id AND ft.question_id = f.question_id
         WHERE f.user_id = ? AND ft.tag_id = ?`,
        [userId, tagId]
    );
    return rows[0].total;
};

// 统计每个标签关联题数
const findTagStatsForUser = async (userId) => {
    const [rows] = await pool.query(
        `SELECT t.id, t.name, t.color, t.type,
                COUNT(ft.question_id) AS count
         FROM user_favorite_tags t
         LEFT JOIN user_favorite_question_tags ft
            ON ft.tag_id = t.id AND ft.user_id = ?
         WHERE t.user_id = 0 OR t.user_id = ?
         GROUP BY t.id, t.name, t.color, t.type
         ORDER BY t.type ASC, t.id ASC`,
        [userId, userId]
    );
    return rows;
};

// ================================================================
// 收藏题目复习（遗忘曲线）
// ================================================================

const findLatestReview = async (userId, questionId) => {
    const [rows] = await pool.query(
        `SELECT id, result, interval_days AS intervalDays,
                next_review_at AS nextReviewAt, reviewed_at AS reviewedAt
         FROM user_favorite_reviews
         WHERE user_id = ? AND question_id = ?
         ORDER BY reviewed_at DESC, id DESC
         LIMIT 1`,
        [userId, questionId]
    );
    return rows[0] || null;
};

const addReview = async (userId, questionId, { result, intervalDays, nextReviewAt }) => {
    const [insertResult] = await pool.query(
        `INSERT INTO user_favorite_reviews
         (user_id, question_id, result, interval_days, next_review_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, questionId, result, intervalDays, nextReviewAt]
    );
    return insertResult.insertId;
};

const findDueReviews = async (userId, { page = 1, pageSize = 50 } = {}) => {
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT f.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                q.难度 AS difficulty, q.知识点 AS knowledgePoint, q.章节 AS chapter,
                r.interval_days AS intervalDays,
                r.next_review_at AS nextReviewAt, r.reviewed_at AS lastReviewedAt,
                r.result AS lastResult
         FROM user_favorites f
         INNER JOIN (
             SELECT user_id, question_id, MAX(id) AS max_id
             FROM user_favorite_reviews
             WHERE user_id = ?
             GROUP BY user_id, question_id
         ) latest ON latest.user_id = f.user_id AND latest.question_id = f.question_id
         INNER JOIN user_favorite_reviews r ON r.id = latest.max_id
         LEFT JOIN ${QT_TABLE} q ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE f.user_id = ? AND r.next_review_at <= NOW()
         ORDER BY r.next_review_at ASC
         LIMIT ? OFFSET ?`,
        [userId, userId, pageSize, offset]
    );
    return rows;
};

const countDueReviews = async (userId) => {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM user_favorites f
         INNER JOIN (
             SELECT user_id, question_id, MAX(id) AS max_id
             FROM user_favorite_reviews
             WHERE user_id = ?
             GROUP BY user_id, question_id
         ) latest ON latest.user_id = f.user_id AND latest.question_id = f.question_id
         INNER JOIN user_favorite_reviews r ON r.id = latest.max_id
         WHERE f.user_id = ? AND r.next_review_at <= NOW()`,
        [userId, userId]
    );
    return rows[0].total;
};

const countDueToday = async (userId) => {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM user_favorites f
         INNER JOIN (
             SELECT user_id, question_id, MAX(id) AS max_id
             FROM user_favorite_reviews
             WHERE user_id = ?
             GROUP BY user_id, question_id
         ) latest ON latest.user_id = f.user_id AND latest.question_id = f.question_id
         INNER JOIN user_favorite_reviews r ON r.id = latest.max_id
         WHERE f.user_id = ? AND DATE(r.next_review_at) = CURDATE()`,
        [userId, userId]
    );
    return rows[0].total;
};

const findFavoritesWithoutReview = async (userId) => {
    const [rows] = await pool.query(
        `SELECT f.question_id AS questionId, q.题目 AS title, q.题型 AS questionType,
                q.难度 AS difficulty, q.知识点 AS knowledgePoint, q.章节 AS chapter,
                f.created_at AS createdAt
         FROM user_favorites f
         LEFT JOIN user_favorite_reviews r ON r.user_id = f.user_id AND r.question_id = f.question_id
         LEFT JOIN ${QT_TABLE} q ON f.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE f.user_id = ? AND r.id IS NULL
         ORDER BY f.created_at DESC`,
        [userId]
    );
    return rows;
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
    findFavoriteTags,
    findFavoriteTagById,
    findFavoriteTagByName,
    addFavoriteTag,
    removeFavoriteTag,
    findFavoriteQuestionTags,
    findFavoriteQuestionTagIds,
    setFavoriteQuestionTags,
    findFavoritesWithTagFilter,
    countFavoritesWithTagFilter,
    findTagStatsForUser,
    findLatestReview,
    addReview,
    findDueReviews,
    countDueReviews,
    countDueToday,
    findFavoritesWithoutReview,
};