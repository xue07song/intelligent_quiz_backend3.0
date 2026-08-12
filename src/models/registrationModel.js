const pool = require('../config/db');

const TABLE = '`registration_requests`';
// 不返回 password 字段
const COLUMNS = 'id, username, role, nickname, status, reject_reason, reviewed_by, reviewed_at, created_at, updated_at';

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (username, password, role, nickname, status) VALUES (?, ?, ?, ?, 'pending')`,
        [data.username, data.password, data.role, data.nickname ?? null]
    );
    return result;
};

const findById = async (id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const findByUsername = async (username) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE username = ?`, [username]);
    return rows[0] || null;
};

const findAll = async ({ page = 1, pageSize = 20, status } = {}) => {
    const conditions = [];
    const params = [];

    if (status !== undefined && status !== '' && status !== null) {
        conditions.push('status = ?');
        params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`, params);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT ${COLUMNS} FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    return { rows, total };
};

const updateStatus = async (id, data) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
        [data.status, data.reject_reason ?? null, data.reviewed_by, id]
    );
    return result;
};

module.exports = {
    create,
    findById,
    findByUsername,
    findAll,
    updateStatus,
};
