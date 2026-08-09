const pool = require('../config/db');

const TABLE = '`users`';
// 默认不返回密码字段
const COLUMNS = 'id, username, role, nickname, status, created_at, updated_at';

const findByUsername = async (username) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE username = ?`, [username]);
    return rows[0] || null;
};

const findById = async (id) => {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

// 按 id 查询（含 password 字段，用于改密码校验）
const findWithPasswordById = async (id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const findAll = async ({ page = 1, pageSize = 20, role, keyword, status } = {}) => {
    const conditions = [];
    const params = [];

    if (role !== undefined && role !== '' && role !== null) {
        conditions.push('role = ?');
        params.push(role);
    }
    if (status !== undefined && status !== '' && status !== null) {
        conditions.push('status = ?');
        params.push(Number(status));
    }
    if (keyword !== undefined && keyword !== '' && keyword !== null) {
        conditions.push('(username LIKE ? OR nickname LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw);
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

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (username, password, role, nickname, status) VALUES (?, ?, ?, ?, ?)`,
        [data.username, data.password, data.role, data.nickname ?? null, data.status ?? 1]
    );
    return result;
};

const update = async (id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['role', 'nickname', 'status'];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(data[field]);
        }
    }

    if (fields.length === 0) {
        return { affectedRows: 0 };
    }

    params.push(id);
    const [result] = await pool.query(`UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ?`, params);
    return result;
};

const updatePassword = async (id, hashedPassword) => {
    const [result] = await pool.query(`UPDATE ${TABLE} SET password = ? WHERE id = ?`, [hashedPassword, id]);
    return result;
};

const remove = async (id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return result;
};

module.exports = {
    findByUsername,
    findById,
    findWithPasswordById,
    findAll,
    create,
    update,
    updatePassword,
    remove,
};
