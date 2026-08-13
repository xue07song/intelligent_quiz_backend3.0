const pool = require('../config/db');

// ==================== 班级表 ====================

// 班级列表（含每班学生人数）
const findAll = async ({ keyword } = {}) => {
    let where = '';
    const params = [];
    if (keyword && keyword.trim()) {
        where = 'WHERE c.name LIKE ? OR c.grade LIKE ? OR c.remark LIKE ?';
        const kw = `%${keyword.trim()}%`;
        params.push(kw, kw, kw);
    }
    const [rows] = await pool.query(
        `SELECT c.*, (SELECT COUNT(*) FROM student_classes sc WHERE sc.class_id = c.id) AS student_count
         FROM classes c
         ${where}
         ORDER BY c.id ASC`,
        params
    );
    return rows;
};

const findById = async (id) => {
    const [rows] = await pool.query(
        `SELECT c.*, (SELECT COUNT(*) FROM student_classes sc WHERE sc.class_id = c.id) AS student_count
         FROM classes c WHERE c.id = ?`,
        [id]
    );
    return rows[0] || null;
};

const findByName = async (name) => {
    const [rows] = await pool.query('SELECT * FROM classes WHERE name = ?', [name]);
    return rows[0] || null;
};

const create = async ({ name, grade, remark }) => {
    const [result] = await pool.query(
        'INSERT INTO classes (name, grade, remark) VALUES (?, ?, ?)',
        [String(name).trim(), grade || null, remark || null]
    );
    return result;
};

const update = async (id, { name, grade, remark }) => {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
    if (grade !== undefined) { fields.push('grade = ?'); params.push(grade || null); }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(remark || null); }
    if (fields.length === 0) return { affectedRows: 0 };
    params.push(id);
    const [result] = await pool.query(`UPDATE classes SET ${fields.join(', ')} WHERE id = ?`, params);
    return result;
};

const remove = async (id) => {
    // 级联由外键 ON DELETE CASCADE 处理 student_classes
    const [result] = await pool.query('DELETE FROM classes WHERE id = ?', [id]);
    return result;
};

// ==================== 学生分班 ====================

// 查询某学生的班级（返回 class_id / name 或 null）
const findClassByStudent = async (studentId) => {
    const [rows] = await pool.query(
        `SELECT c.id AS class_id, c.name AS class_name
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.student_id = ?`,
        [studentId]
    );
    return rows[0] || null;
};

// 批量查询学生班级（返回 [{student_id, class_id, class_name}]）
const findClassesByStudentIds = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT sc.student_id, c.id AS class_id, c.name AS class_name
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.student_id IN (${placeholders})`,
        studentIds
    );
    return rows;
};

// 查询某班级的学生列表
const findStudentsByClassId = async (classId, { page = 1, pageSize = 50 } = {}) => {
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM student_classes WHERE class_id = ?',
        [classId]
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.email, u.phone, u.school, u.college, u.status,
                u.created_at,
                sc.created_at AS joined_at
         FROM student_classes sc
         INNER JOIN users u ON u.id = sc.student_id
         WHERE sc.class_id = ?
         ORDER BY u.id ASC
         LIMIT ? OFFSET ?`,
        [classId, pageSize, offset]
    );
    return { rows, total };
};

// 查询未分班的学生
const findUnassignedStudents = async ({ page = 1, pageSize = 50, keyword } = {}) => {
    const offset = (page - 1) * pageSize;
    let whereExtra = '';
    const params = [];
    if (keyword && keyword.trim()) {
        const kw = `%${keyword.trim()}%`;
        whereExtra = ' AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)';
        params.push(kw, kw, kw);
    }
    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM users u
         LEFT JOIN student_classes sc ON sc.student_id = u.id
         WHERE u.role = 'student' AND sc.student_id IS NULL${whereExtra}`,
        params
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.email, u.phone, u.school, u.college, u.status,
                u.created_at
         FROM users u
         LEFT JOIN student_classes sc ON sc.student_id = u.id
         WHERE u.role = 'student' AND sc.student_id IS NULL${whereExtra}
         ORDER BY u.id ASC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 把学生分入某班级（事务，支持批量）。已分班的会先移除再加入（调班）
const assignStudentsToClass = async (classId, studentIds) => {
    if (!studentIds || studentIds.length === 0) return { classId, assigned: 0 };
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 先删旧分班（实现调班）
        const placeholders = studentIds.map(() => '?').join(', ');
        await conn.query(
            `DELETE FROM student_classes WHERE student_id IN (${placeholders})`,
            studentIds
        );
        const values = studentIds.map((sid) => [sid, classId]);
        await conn.query(
            'INSERT INTO student_classes (student_id, class_id) VALUES ?',
            [values]
        );
        await conn.commit();
        return { classId, assigned: studentIds.length };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 把学生移出班级（变回未分班）
const removeStudentsFromClass = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return { removed: 0 };
    const placeholders = studentIds.map(() => '?').join(', ');
    const [result] = await pool.query(
        `DELETE FROM student_classes WHERE student_id IN (${placeholders})`,
        studentIds
    );
    return { removed: result.affectedRows };
};

// 学生删除时清理分班记录
const clearByStudent = async (studentId) => {
    const [result] = await pool.query('DELETE FROM student_classes WHERE student_id = ?', [studentId]);
    return result;
};

module.exports = {
    findAll,
    findById,
    findByName,
    create,
    update,
    remove,
    findClassByStudent,
    findClassesByStudentIds,
    findStudentsByClassId,
    findUnassignedStudents,
    assignStudentsToClass,
    removeStudentsFromClass,
    clearByStudent,
};
