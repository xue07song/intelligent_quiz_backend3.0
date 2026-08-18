const pool = require('../config/db');

const TABLE = '`registration_requests`';

// 启动时探测 registration_requests 表实际有哪些列，避免新旧 schema 不一致时炸 500
let cachedColumns = null;
const getActualColumns = async () => {
    if (cachedColumns) return cachedColumns;
    try {
        const [rows] = await pool.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'registration_requests'`
        );
        cachedColumns = rows.map(r => r.COLUMN_NAME);
    } catch {
        cachedColumns = [];
    }
    return cachedColumns;
};

// 安全拼接 SELECT 字段：只保留数据库实际存在的列；不存在的列直接返回 NULL AS col
const safeSelectColumns = async (desired) => {
    const actual = new Set(await getActualColumns());
    return desired.map(col => {
        const c = col.trim();
        return actual.has(c) ? `\`${c}\`` : `NULL AS \`${c}\``;
    }).join(', ');
};

const DESIRED_COLUMNS = [
    'id', 'username', 'nickname', 'password', 'role',
    'college', 'major', 'subjects', 'grade',
    'student_no', 'employee_no', 'title',
    'status', 'reject_reason',
    'handled_by', 'handled_at', 'reviewed_by', 'reviewed_at',
    'created_at', 'updated_at',
];

const findById = async (id) => {
    const cols = await safeSelectColumns([...DESIRED_COLUMNS, 'password']);
    const [rows] = await pool.query(`SELECT ${cols} FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const findByUsername = async (username) => {
    const cols = await safeSelectColumns(DESIRED_COLUMNS);
    const [rows] = await pool.query(`SELECT ${cols} FROM ${TABLE} WHERE username = ?`, [username]);
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
    const cols = await safeSelectColumns(DESIRED_COLUMNS);
    const [rows] = await pool.query(
        `SELECT ${cols} FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 创建：探测列存在性后动态拼装 INSERT 列和值
const INSERT_DESIRED = [
    { col: 'username', key: 'username' },
    { col: 'password', key: 'password' },
    { col: 'role', key: 'role' },
    { col: 'nickname', key: 'nickname' },
    { col: 'college', key: 'college' },
    { col: 'major', key: 'major' },
    { col: 'subjects', key: 'subjects' },
    { col: 'grade', key: 'grade' },
    { col: 'student_no', key: 'student_no' },
    { col: 'employee_no', key: 'employee_no' },
    { col: 'title', key: 'title' },
];

const create = async (data) => {
    const actual = new Set(await getActualColumns());
    const cols = [];
    const placeholders = [];
    const values = [];
    for (const { col, key } of INSERT_DESIRED) {
        if (actual.has(col)) {
            cols.push(`\`${col}\``);
            placeholders.push('?');
            values.push(data[key] ?? null);
        }
    }
    cols.push('`status`');
    placeholders.push('?');
    values.push('pending');

    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
    );
    return result;
};

const reset = async (id, data) => {
    const actual = new Set(await getActualColumns());
    const values = { password: data.password, role: data.role, nickname: data.nickname ?? null,
        college: data.college ?? null, major: data.major ?? null, subjects: data.subjects ?? null,
        grade: data.grade ?? null, student_no: data.student_no ?? null,
        employee_no: data.employee_no ?? null, title: data.title ?? null };
    const sets = [];
    const params = [];
    for (const [column, value] of Object.entries(values)) {
        if (actual.has(column)) { sets.push(`\`${column}\` = ?`); params.push(value); }
    }
    sets.push("status = 'pending'");
    for (const column of ['reject_reason', 'handled_by', 'handled_at', 'reviewed_by', 'reviewed_at']) {
        if (actual.has(column)) sets.push(`\`${column}\` = NULL`);
    }
    if (actual.has('created_at')) sets.push('created_at = CURRENT_TIMESTAMP');
    params.push(id);
    const [result] = await pool.query(`UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = ?`, params);
    return result;
};

const markApproved = async (id, handledBy) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET status = 'approved',
             handled_by = ?, handled_at = CURRENT_TIMESTAMP,
             reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [handledBy, handledBy, id]
    );
    return result;
};

const markRejected = async (id, reason, handledBy) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET status = 'rejected',
             reject_reason = ?,
             handled_by = ?, handled_at = CURRENT_TIMESTAMP,
             reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, handledBy, handledBy, id]
    );
    return result;
};

// 兼容 review 语义：updateStatus（status / reject_reason / reviewed_by / reviewed_at）
const updateStatus = async (id, data) => {
    const actual = new Set(await getActualColumns());
    const sets = ['status = ?'];
    const params = [data.status];
    if (actual.has('reject_reason')) { sets.push('reject_reason = ?'); params.push(data.reject_reason ?? null); }
    if (actual.has('reviewed_by')) { sets.push('reviewed_by = ?'); params.push(data.reviewed_by ?? null); }
    if (actual.has('reviewed_at')) sets.push('reviewed_at = NOW()');
    if (actual.has('handled_by')) { sets.push('handled_by = ?'); params.push(data.reviewed_by ?? null); }
    if (actual.has('handled_at')) sets.push('handled_at = NOW()');
    params.push(id);
    const [result] = await pool.query(`UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = ?`, params);
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
    updateStatus,
};
