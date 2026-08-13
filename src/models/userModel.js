const pool = require('../config/db');

const TABLE = '`users`';
// 默认不返回密码字段
const COLUMNS = 'id, username, role, nickname, email, phone, school, college, student_no, employee_no, major, grade, title, status, created_at, updated_at';

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

    // 若结果中含学生，批量查询其班级并组装（避免 N+1）
    const studentIds = rows.filter((r) => r.role === 'student').map((r) => r.id);
    if (studentIds.length > 0) {
        const placeholders = studentIds.map(() => '?').join(', ');
        const [clsRows] = await pool.query(
            `SELECT sc.student_id, c.id AS class_id, c.name AS class_name, c.college AS class_college, c.major AS class_major, c.grade AS class_grade
             FROM student_classes sc
             INNER JOIN classes c ON c.id = sc.class_id
             WHERE sc.student_id IN (${placeholders})`,
            studentIds
        );
        const classMap = {};
        for (const c of clsRows) {
            classMap[c.student_id] = {
                classId: c.class_id, className: c.class_name,
                classCollege: c.class_college, classMajor: c.class_major, classGrade: c.class_grade
            };
        }
        for (const r of rows) {
            if (r.role === 'student') {
                const c = classMap[r.id];
                r.classId = c ? c.classId : null;
                r.className = c ? c.className : null;
                r.classCollege = c ? c.classCollege : null;
                r.classMajor = c ? c.classMajor : null;
                r.classGrade = c ? c.classGrade : null;
            } else {
                r.classId = null;
                r.className = null;
                r.classCollege = null;
                r.classMajor = null;
                r.classGrade = null;
            }
        }
    } else {
        for (const r of rows) {
            r.classId = null;
            r.className = null;
            r.classCollege = null;
            r.classMajor = null;
            r.classGrade = null;
        }
    }

    return { rows, total };
};

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE}
         (username, password, role, nickname, email, phone, school, college, student_no, employee_no, major, grade, title, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.username, data.password, data.role, data.nickname ?? null,
            data.email ?? null, data.phone ?? null, data.school ?? null, data.college ?? null,
            data.student_no ?? null, data.employee_no ?? null, data.major ?? null,
            data.grade ?? null, data.title ?? null, data.status ?? 1
        ]
    );
    return result;
};

const update = async (id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['role', 'nickname', 'email', 'phone', 'school', 'college', 'student_no', 'employee_no', 'major', 'grade', 'title', 'status'];

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

const updateProfile = async (id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['nickname', 'email', 'phone', 'school', 'college', 'student_no', 'employee_no', 'major', 'grade', 'title'];

    for (const field of allowedFields) {
        if (data[field] !== undefined && data[field] !== null && String(data[field]).trim() !== '') {
            fields.push(`${field} = ?`);
            params.push(String(data[field]).trim());
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
