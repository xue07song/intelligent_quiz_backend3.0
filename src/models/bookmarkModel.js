const pool = require('../config/db');

const TABLE = '`question_bookmarks`';
const QT_TABLE = '`题库1`';
const SQT_TABLE = '`学生题库`';

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (user_id, question_id, source_type, note) VALUES (?, ?, ?, ?)`,
        [data.user_id, data.question_id, data.source_type || 'public', data.note || '']
    );
    return result;
};

const findByUser = async (user_id, { page = 1, pageSize = 20, source_type } = {}) => {
    const conditions = [`${TABLE}.user_id = ?`];
    const params = [user_id];

    if (source_type !== undefined && source_type !== '' && source_type !== null) {
        conditions.push(`${TABLE}.source_type = ?`);
        params.push(source_type);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countResult] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${TABLE} ${whereClause}`,
        params
    );
    const total = countResult[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT ${TABLE}.*, 
                q.章节, q.题型, q.题目, q.选项, q.答案, q.解析, q.难度, q.知识点, q.出题人,
                CASE ${TABLE}.source_type
                    WHEN 'public' THEN q.id
                    WHEN 'student' THEN sq.question_id
                    ELSE NULL
                END AS question_display_id
         FROM ${TABLE}
         LEFT JOIN ${QT_TABLE} q ON ${TABLE}.source_type = 'public' AND ${TABLE}.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         LEFT JOIN ${SQT_TABLE} sq ON ${TABLE}.source_type = 'student' AND ${TABLE}.question_id = CONVERT(sq.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND sq.student_id = ${TABLE}.user_id
         ${whereClause}
         ORDER BY ${TABLE}.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    return { rows, total };
};

const findByQuestion = async (user_id, question_id, source_type = 'public') => {
    const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE user_id = ? AND question_id = ? AND source_type = ?`,
        [user_id, question_id, source_type]
    );
    return rows[0] || null;
};

const update = async (id, user_id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['note'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(data[field]);
        }
    }
    if (fields.length === 0) return { affectedRows: 0 };

    params.push(id, user_id);
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
        params
    );
    return result;
};

const remove = async (id, user_id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ? AND user_id = ?`, [id, user_id]);
    return result;
};

const removeByQuestion = async (user_id, question_id, source_type = 'public') => {
    const [result] = await pool.query(
        `DELETE FROM ${TABLE} WHERE user_id = ? AND question_id = ? AND source_type = ?`,
        [user_id, question_id, source_type]
    );
    return result;
};

const toggle = async (user_id, question_id, source_type = 'public', note = '') => {
    const existing = await findByQuestion(user_id, question_id, source_type);
    if (existing) {
        await removeByQuestion(user_id, question_id, source_type);
        return { bookmarked: false, bookmark: null };
    }
    const result = await create({ user_id, question_id, source_type, note });
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [result.insertId]);
    return { bookmarked: true, bookmark: rows[0] };
};

const batchCheck = async (user_id, questionIds, source_type = 'public') => {
    if (!questionIds || questionIds.length === 0) return [];
    const placeholders = questionIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT question_id FROM ${TABLE} WHERE user_id = ? AND source_type = ? AND question_id IN (${placeholders})`,
        [user_id, source_type, ...questionIds]
    );
    return rows.map((r) => r.question_id);
};

module.exports = {
    create,
    findByUser,
    findByQuestion,
    update,
    remove,
    removeByQuestion,
    toggle,
    batchCheck,
};
