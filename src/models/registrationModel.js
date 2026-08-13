const pool = require('../config/db');

const TABLE = '`registration_requests`';

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (username, password, role, nickname) VALUES (?, ?, ?, ?)`,
        [data.username, data.password, data.role, data.nickname ?? null]
    );
    return result;
};

const findByUsername = async (username) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE username = ?`, [username]);
    return rows[0] || null;
};

const findById = async (id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
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

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${TABLE} ${where}`,
        params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT id, username, nickname, role, status, reject_reason, created_at, handled_at
         FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

const reset = async (id, data) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE}
         SET password = ?, role = ?, nickname = ?, status = 'pending',
             reject_reason = NULL, handled_by = NULL, handled_at = NULL,
             created_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [data.password, data.role, data.nickname ?? null, id]
    );
    return result;
};

const markApproved = async (id, handledBy) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET status = 'approved', handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [handledBy, id]
    );
    return result;
};

const markRejected = async (id, reason, handledBy) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET status = 'rejected', reject_reason = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reason, handledBy, id]
    );
    return result;
};

module.exports = {
    create,
    findByUsername,
    findById,
    findAll,
    reset,
    markApproved,
    markRejected,
};
