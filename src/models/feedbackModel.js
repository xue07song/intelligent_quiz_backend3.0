const pool = require('../config/db');

const TABLE = '`feedbacks`';
// 列表查询：JOIN users 表带出提交人、回复人的用户名与昵称（不含 content/reply 大字段）
const LIST_SELECT = `
    SELECT f.id, f.user_id, f.category, f.title, f.contact, f.status,
           f.replied_by, f.replied_at, f.created_at, f.updated_at,
           u.username  AS user_name,
           u.nickname  AS user_nickname,
           ru.username AS replied_by_name,
           ru.nickname AS replied_by_nickname
    FROM ${TABLE} f
    LEFT JOIN \`users\` u  ON u.id  = f.user_id
    LEFT JOIN \`users\` ru ON ru.id = f.replied_by
`;
// 详情查询：JOIN users 表带出用户名与昵称（含 content/reply）
const DETAIL_SELECT = `
    SELECT f.id, f.user_id, f.category, f.title, f.content, f.contact, f.status, f.reply,
           f.replied_by, f.replied_at, f.created_at, f.updated_at,
           u.username  AS user_name,
           u.nickname  AS user_nickname,
           ru.username AS replied_by_name,
           ru.nickname AS replied_by_nickname
    FROM ${TABLE} f
    LEFT JOIN \`users\` u  ON u.id  = f.user_id
    LEFT JOIN \`users\` ru ON ru.id = f.replied_by
`;

// 创建反馈
const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (user_id, category, title, content, contact, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [data.user_id, data.category, data.title, data.content, data.contact ?? null]
    );
    return result;
};

// 按 id 查详情（含提交人/回复人用户名）
const findById = async (id) => {
    const [rows] = await pool.query(`${DETAIL_SELECT} WHERE f.id = ?`, [id]);
    return rows[0] || null;
};

// 列表查询（支持按 status / category / user_id 筛选 + 分页，带出用户名）
const findAll = async ({ page = 1, pageSize = 20, status, category, userId } = {}) => {
    const conditions = [];
    const params = [];

    if (status !== undefined && status !== '' && status !== null) {
        conditions.push('f.status = ?');
        params.push(status);
    }
    if (category !== undefined && category !== '' && category !== null) {
        conditions.push('f.category = ?');
        params.push(category);
    }
    if (userId !== undefined && userId !== '' && userId !== null) {
        conditions.push('f.user_id = ?');
        params.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE} f ${where}`, params);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `${LIST_SELECT} ${where} ORDER BY f.id DESC LIMIT ? OFFSET ?`,
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
