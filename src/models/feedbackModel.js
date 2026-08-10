const pool = require('../config/db');

const TABLE = '`feedbacks`';
// 默认查询字段（不含 content/reply 大字段，列表用）
const LIST_COLUMNS = 'id, user_id, category, title, contact, status, replied_by, replied_at, created_at, updated_at';
// 详情字段（含 content/reply）
const DETAIL_COLUMNS = 'id, user_id, category, title, content, contact, status, reply, replied_by, replied_at, created_at, updated_at';

// 创建反馈
const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (user_id, category, title, content, contact, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [data.user_id, data.category, data.title, data.content, data.contact ?? null]
    );
    return result;
};

// 按 id 查详情
const findById = async (id) => {
    const [rows] = await pool.query(`SELECT ${DETAIL_COLUMNS} FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

// 列表查询（支持按 status / category / user_id 筛选 + 分页）
const findAll = async ({ page = 1, pageSize = 20, status, category, userId } = {}) => {
    const conditions = [];
    const params = [];

    if (status !== undefined && status !== '' && status !== null) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (category !== undefined && category !== '' && category !== null) {
        conditions.push('category = ?');
        params.push(category);
    }
    if (userId !== undefined && userId !== '' && userId !== null) {
        conditions.push('user_id = ?');
        params.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`, params);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT ${LIST_COLUMNS} FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    return { rows, total };
};

// 更新状态
const updateStatus = async (id, status) => {
    const [result] = await pool.query(`UPDATE ${TABLE} SET status = ? WHERE id = ?`, [status, id]);
    return result;
};

// 管理员回复（同时更新状态为已处理 + 记录回复人和时间）
const reply = async (id, replyText, repliedBy) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET reply = ?, replied_by = ?, replied_at = CURRENT_TIMESTAMP, status = 'resolved' WHERE id = ?`,
        [replyText, repliedBy, id]
    );
    return result;
};

// 删除
const remove = async (id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return result;
};

module.exports = {
    create,
    findById,
    findAll,
    updateStatus,
    reply,
    remove,
};
