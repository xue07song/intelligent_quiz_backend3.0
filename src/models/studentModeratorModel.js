const pool = require('../config/db');

const TABLE = '`student_moderators`';

const findByUserMajor = async (userId, major) => {
    const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE user_id = ? AND major = ? LIMIT 1`,
        [userId, major]
    );
    return rows[0] || null;
};

const create = async ({ userId, major, createdBy }) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (user_id, major, created_by) VALUES (?, ?, ?)`,
        [userId, major, createdBy ?? null]
    );
    return result;
};

const findAll = async ({ page = 1, pageSize = 20, keyword = '' } = {}) => {
    const conditions = [];
    const params = [];
    if (keyword) {
        conditions.push('(u.username LIKE ? OR u.nickname LIKE ? OR sm.major LIKE ?)');
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
        `SELECT sm.*, u.username, u.nickname, u.major AS user_major
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

module.exports = { findByUserMajor, create, findAll, remove };
