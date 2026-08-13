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

const DESIRED_COLUMNS = ['id', 'username', 'role', 'college', 'major', 'subjects', 'grade', 'student_no', 'employee_no', 'title', 'status', 'reject_reason', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at'];

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
