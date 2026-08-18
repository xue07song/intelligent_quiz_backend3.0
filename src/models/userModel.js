const pool = require('../config/db');

const TABLE = '`users`';

// 期望 SELECT 的列（class_id 为新列，旧库可能没有，必须安全跳过）
const DESIRED_COLUMNS = [
    'id', 'username', 'role', 'nickname', 'email', 'phone', 'school', 'college',
    'student_no', 'employee_no', 'major', 'grade', 'title', 'class_id',
    'status', 'created_at', 'updated_at'
];

// 用户表列自探测缓存（避免每次 SQL 都查 information_schema）
let cachedColumns = null;
const getActualColumns = async () => {
    if (cachedColumns) return cachedColumns;
    try {
        const [rows] = await pool.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
        );
        cachedColumns = new Set(rows.map(r => r.COLUMN_NAME));
    } catch {
        cachedColumns = new Set();
    }
    return cachedColumns;
};

// 安全 SELECT 列：存在则直接写 `col`，不存在则返回 `NULL AS col` 占位
const safeSelectColumns = async (desired) => {
    const actual = await getActualColumns();
    return desired.map(col => {
        return actual.has(col) ? `\`${col}\`` : `NULL AS \`${col}\``;
    }).join(', ');
};

// 动态生成不包含密码字段的 SELECT 列（安全版，class_id 缺失时返回 NULL）
const getSafeColumns = async () => safeSelectColumns(DESIRED_COLUMNS);

const findByUsername = async (username) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE username = ?`, [username]);
    return rows[0] || null;
};

const findById = async (id) => {
    const cols = await getSafeColumns();
    const [rows] = await pool.query(`SELECT ${cols} FROM ${TABLE} WHERE id = ?`, [id]);
    const user = rows[0] || null;
    if (user && user.role === 'student') {
        // 查询全部必修班（多选）
        const [clsRows] = await pool.query(
            `SELECT c.id AS class_id, c.name AS class_name
             FROM student_classes sc
             INNER JOIN classes c ON c.id = sc.class_id
             WHERE sc.student_id = ? AND sc.type = 'compulsory'
             ORDER BY sc.created_at ASC`,
            [id]
        );
        const classIds = clsRows.map(r => r.class_id);
        const classNames = clsRows.map(r => r.class_name);
        user.classIds = classIds;
        user.classNames = classNames;
        // className / class_name：多选时用「/」拼接，兼容前端只显示单值
        user.className = classNames.length > 0 ? classNames.join('/') : null;
        user.class_name = user.className;
        // classId：返回第一个（保留兼容）
        user.classId = classIds[0] ?? user.class_id ?? null;
    }
    return user;
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
    const cols = await getSafeColumns();
    const [rows] = await pool.query(
        `SELECT ${cols} FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    // 若结果中含教师，批量查询其科目并组装（避免 N+1）
    const teacherIds = rows.filter((r) => r.role === 'teacher').map((r) => r.id);
    if (teacherIds.length > 0) {
        const placeholders = teacherIds.map(() => '?').join(', ');
        const [subRows] = await pool.query(
            `SELECT user_id, subject FROM teacher_subjects WHERE user_id IN (${placeholders}) ORDER BY user_id, subject`,
            teacherIds
        );
        const subjectMap = {};
        for (const s of subRows) {
            if (!subjectMap[s.user_id]) subjectMap[s.user_id] = [];
            subjectMap[s.user_id].push(s.subject);
        }
        for (const r of rows) {
            r.subjects = r.role === 'teacher' ? (subjectMap[r.id] || []) : null;
        }
    } else {
        for (const r of rows) {
            r.subjects = r.role === 'teacher' ? [] : null;
        }
    }

    // 若结果中含学生，批量查询其全部必修班（多选）并组装（避免 N+1）
    const studentIds = rows.filter((r) => r.role === 'student').map((r) => r.id);
    if (studentIds.length > 0) {
        const placeholders = studentIds.map(() => '?').join(', ');
        // 从 student_classes 表查全部 compulsory 关系（多选）
        const [clsRows] = await pool.query(
            `SELECT sc.student_id, c.id AS class_id, c.name AS class_name,
                    c.college AS class_college, c.major AS class_major, c.grade AS class_grade
             FROM student_classes sc
             INNER JOIN classes c ON c.id = sc.class_id
             WHERE sc.type = 'compulsory' AND sc.student_id IN (${placeholders})
             ORDER BY sc.student_id, sc.created_at ASC`,
            studentIds
        );
        // 每个学生可能有多个必修班，用数组聚合
        const multiClassMap = {};
        for (const c of clsRows) {
            if (!multiClassMap[c.student_id]) multiClassMap[c.student_id] = [];
            multiClassMap[c.student_id].push({
                classId: c.class_id, className: c.class_name,
                classCollege: c.class_college, classMajor: c.class_major, classGrade: c.class_grade
            });
        }
        for (const r of rows) {
            if (r.role === 'student') {
                const classes = multiClassMap[r.id] || [];
                const classIds = classes.map(c => c.classId);
                const classNames = classes.map(c => c.className);
                r.classIds = classIds;
                r.classNames = classNames;
                // className / class_name：多选时用「/」拼接，兼容前端单值显示
                r.className = classNames.length > 0 ? classNames.join('/') : null;
                r.class_name = r.className;
                // classId / classCollege / classMajor / classGrade：返回第一个（保留兼容）
                const first = classes[0];
                r.classId = first ? first.classId : (r.class_id || null);
                r.classCollege = first ? first.classCollege : null;
                r.classMajor = first ? first.classMajor : null;
                r.classGrade = first ? first.classGrade : null;
            } else {
                r.classId = null;
                r.className = null;
                r.class_name = null;
                r.classCollege = null;
                r.classMajor = null;
                r.classGrade = null;
            }
        }
    } else {
        for (const r of rows) {
            r.classId = null;
            r.className = null;
            r.class_name = null;
            r.classIds = [];
            r.classNames = [];
            r.classCollege = null;
            r.classMajor = null;
            r.classGrade = null;
        }
    }

    return { rows, total };
};

const create = async (data) => {
    const actual = await getActualColumns();
    const insertFields = [
        { col: 'username', key: 'username' },
        { col: 'password', key: 'password' },
        { col: 'role', key: 'role' },
        { col: 'nickname', key: 'nickname' },
        { col: 'email', key: 'email' },
        { col: 'phone', key: 'phone' },
        { col: 'school', key: 'school' },
        { col: 'college', key: 'college' },
        { col: 'student_no', key: 'student_no' },
        { col: 'employee_no', key: 'employee_no' },
        { col: 'major', key: 'major' },
        { col: 'grade', key: 'grade' },
        { col: 'title', key: 'title' },
        { col: 'class_id', key: 'class_id' },
        { col: 'status', key: 'status' },
    ];
    const cols = [];
    const placeholders = [];
    const values = [];
    for (const { col, key } of insertFields) {
        if (actual.has(col)) {
            cols.push(`\`${col}\``);
            placeholders.push('?');
            if (key === 'status') {
                values.push(data.status ?? 1);
            } else {
                values.push(data[key] ?? null);
            }
        }
    }
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
    );
    return result;
};

const update = async (id, data) => {
    const fields = [];
    const params = [];
    const actual = await getActualColumns();
    const allowedFields = ['role', 'nickname', 'email', 'phone', 'school', 'college', 'student_no', 'employee_no', 'major', 'grade', 'title', 'class_id', 'status'];

    for (const field of allowedFields) {
        // class_id 只在表实际有这一列时才允许写入，避免旧库炸 1054
        if (data[field] !== undefined && (field !== 'class_id' || actual.has('class_id'))) {
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

const updateProfile = async (id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['nickname', 'email', 'phone', 'school', 'college', 'student_no', 'employee_no', 'major', 'grade', 'title'];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            const value = data[field] === null ? '' : String(data[field]).trim();
            params.push(value || null);
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

// ==================== 教师科目关联（teacher_subjects）====================

// 获取某教师的科目列表（按科目名升序）
const getTeacherSubjects = async (userId) => {
    const [rows] = await pool.query(
        `SELECT subject FROM teacher_subjects WHERE user_id = ? ORDER BY subject ASC`,
        [userId]
    );
    return rows.map((r) => r.subject);
};

// 全量替换某教师的科目（事务：先删后插）。subjects 为合法科目名数组。
const setTeacherSubjects = async (userId, subjects) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM teacher_subjects WHERE user_id = ?`, [userId]);
        if (subjects && subjects.length > 0) {
            const placeholders = subjects.map(() => '(?, ?)').join(', ');
            const values = [];
            for (const s of subjects) {
                values.push(userId, s);
            }
            await conn.query(
                `INSERT IGNORE INTO teacher_subjects (user_id, subject) VALUES ${placeholders}`,
                values
            );
        }
        await conn.commit();
        return { userId, subjects };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 删除教师的全部科目（删除教师时调用）
const clearTeacherSubjects = async (userId) => {
    const [result] = await pool.query(`DELETE FROM teacher_subjects WHERE user_id = ?`, [userId]);
    return result;
};

module.exports = {
    findByUsername,
    findById,
    findWithPasswordById,
    findAll,
    create,
    update,
    updateProfile,
    updatePassword,
    remove,
    getTeacherSubjects,
    setTeacherSubjects,
    clearTeacherSubjects,
};
