const pool = require('../config/db');

const TABLE = '`student_moderators`';

const findByUserCollege = async (userId, college) => {
    const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE user_id = ? AND college = ? LIMIT 1`,
        [userId, college]
    );
    return rows[0] || null;
};

const create = async ({ userId, college, createdBy }) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (user_id, college, created_by) VALUES (?, ?, ?)`,
        [userId, college, createdBy ?? null]
    );
    return result;
};

const findAll = async ({ page = 1, pageSize = 20, keyword = '' } = {}) => {
    const conditions = [];
    const params = [];
    if (keyword) {
        conditions.push('(u.username LIKE ? OR u.nickname LIKE ? OR sm.college LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw, kw);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${TABLE} sm LEFT JOIN users u ON u.id = sm.user_id ${where}`,
        params
    );
    const total = countRows[0].total;
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT sm.*, u.username, u.nickname, u.college AS user_college
         FROM ${TABLE} sm
         LEFT JOIN users u ON u.id = sm.user_id
         ${where}
         ORDER BY sm.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

const remove = async (id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return result;
};

module.exports = { findByUserCollege, create, findAll, remove };
