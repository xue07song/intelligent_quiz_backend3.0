const pool = require('../config/db');

// ==================== 班级表 ====================

// 班级列表（含每班学生人数）
const findAll = async ({ keyword, ownerId } = {}) => {
    let where = '';
    const params = [];
    const conditions = [];
    if (keyword && keyword.trim()) {
        conditions.push('(c.name LIKE ? OR c.grade LIKE ? OR c.remark LIKE ?)');
        const kw = `%${keyword.trim()}%`;
        params.push(kw, kw, kw);
    }
    if (ownerId !== undefined && ownerId !== null) {
        conditions.push('c.owner_id = ?');
        params.push(ownerId);
    }
    if (conditions.length) where = `WHERE ${conditions.join(' AND ')}`;
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

const create = async ({ name, grade, remark, type, ownerId }) => {
    const [result] = await pool.query(
        'INSERT INTO classes (name, grade, remark, type, owner_id) VALUES (?, ?, ?, ?, ?)',
        [String(name).trim(), grade || null, remark || null, type || 'compulsory', ownerId || null]
    );
    return result;
};

const update = async (id, { name, grade, remark, type }) => {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
    if (grade !== undefined) { fields.push('grade = ?'); params.push(grade || null); }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(remark || null); }
    if (type !== undefined) { fields.push('type = ?'); params.push(type); }
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

// ==================== 学生-班级（多对多）====================

// 查询某学生的全部班级（必修+选修）
const findAllClassesByStudent = async (studentId) => {
    const [rows] = await pool.query(
        `SELECT c.id AS class_id, c.name AS class_name, sc.type AS relation_type
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.student_id = ?
         ORDER BY sc.type ASC, sc.created_at ASC`,
        [studentId]
    );
    return rows;
};

// 批量查询学生全部班级（返回 [{student_id, class_id, class_name, relation_type}]）
const findAllClassesByStudentIds = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT sc.student_id, c.id AS class_id, c.name AS class_name, sc.type AS relation_type
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.student_id IN (${placeholders})
         ORDER BY sc.student_id, sc.type ASC, sc.created_at ASC`,
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
                sc.type AS relation_type,
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

// 可添加学生列表：返回所有学生，附带已加入的班级列表
const findAvailableStudents = async ({ page = 1, pageSize = 50, keyword, college } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = ["u.role = 'student'"];
    const params = [];
    if (college) {
        conditions.push('u.college = ?');
        params.push(college);
    }
    if (keyword && keyword.trim()) {
        const kw = `%${keyword.trim()}%`;
        conditions.push('(u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ? OR u.student_no LIKE ?)');
        params.push(kw, kw, kw, kw);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM users u ${where}`,
        params
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.email, u.phone, u.school, u.college, u.status,
                u.student_no, u.created_at
         FROM users u
         ${where}
         ORDER BY u.id ASC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    // 批量查询这些学生的已加入班级
    const studentIds = rows.map(r => r.id);
    if (studentIds.length > 0) {
        const placeholders = studentIds.map(() => '?').join(', ');
        const [clsRows] = await pool.query(
            `SELECT sc.student_id, c.id AS class_id, c.name AS class_name, sc.type AS relation_type
             FROM student_classes sc
             INNER JOIN classes c ON c.id = sc.class_id
             WHERE sc.student_id IN (${placeholders})
             ORDER BY sc.student_id, sc.type ASC`,
            studentIds
        );
        const classMap = {};
        for (const c of clsRows) {
            if (!classMap[c.student_id]) classMap[c.student_id] = [];
            classMap[c.student_id].push({
                classId: c.class_id,
                className: c.class_name,
                relationType: c.relation_type,
            });
        }
        for (const r of rows) {
            r.classes = classMap[r.id] || [];
        }
    } else {
        for (const r of rows) {
            r.classes = [];
        }
    }

    return { rows, total };
};

// 把学生加入某班级（幂等：已在同班则跳过，不影响其他班级关系）
const assignStudentsToClass = async (classId, studentIds, type = 'compulsory') => {
    if (!studentIds || studentIds.length === 0) return { classId, assigned: 0 };
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 幂等：用 INSERT IGNORE 跳过已存在的 (student_id, class_id) 组合
        const values = studentIds.map((sid) => [sid, classId, type]);
        const [result] = await conn.query(
            'INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES ?',
            [values]
        );
        // 若是必修班，回填 users.class_id
        if (type === 'compulsory') {
            for (const sid of studentIds) {
                await conn.query(
                    `UPDATE users SET class_id = ? WHERE id = ? AND (class_id IS NULL OR class_id != ?)`,
                    [classId, sid, classId]
                );
            }
        }
        await conn.commit();
        return { classId, assigned: result.affectedRows };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 把学生从某班级移出（仅删除该班级关系，不影响其他班级）
const removeStudentsFromClass = async (classId, studentIds) => {
    if (!studentIds || studentIds.length === 0) return { removed: 0 };
    const placeholders = studentIds.map(() => '?').join(', ');
    const [result] = await pool.query(
        `DELETE FROM student_classes WHERE class_id = ? AND student_id IN (${placeholders})`,
        [classId, ...studentIds]
    );

    // 如果移出的是必修班，回填 users.class_id 为剩余的必修班（若有）
    const conn = await pool.getConnection();
    try {
        for (const sid of studentIds) {
            const [rows] = await conn.query(
                `SELECT class_id FROM student_classes WHERE student_id = ? AND type = 'compulsory' ORDER BY created_at ASC LIMIT 1`,
                [sid]
            );
            const newClassId = rows[0] ? rows[0].class_id : null;
            await conn.query('UPDATE users SET class_id = ? WHERE id = ?', [newClassId, sid]);
        }
    } finally {
        conn.release();
    }

    return { removed: result.affectedRows };
};

// 学生删除时清理分班记录
const clearByStudent = async (studentId) => {
    const [result] = await pool.query('DELETE FROM student_classes WHERE student_id = ?', [studentId]);
    return result;
};

// 查询某学生的全部必修班（返回数组 [{class_id, class_name}]，按加入顺序）
const findCompulsoryClassesByStudent = async (studentId) => {
    const [rows] = await pool.query(
        `SELECT c.id AS class_id, c.name AS class_name
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.student_id = ? AND sc.type = 'compulsory'
         ORDER BY sc.created_at ASC`,
        [studentId]
    );
    return rows;
};

// 保留旧 findClassByStudent 做兼容（返回第一个必修班）
const findClassByStudent = async (studentId) => {
    const rows = await findCompulsoryClassesByStudent(studentId);
    return rows[0] || null;
};

// 批量查询学生的全部必修班（返回 [{student_id, class_id, class_name}]）
const findCompulsoryClassesByStudentIds = async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT sc.student_id, c.id AS class_id, c.name AS class_name
         FROM student_classes sc
         INNER JOIN classes c ON c.id = sc.class_id
         WHERE sc.type = 'compulsory' AND sc.student_id IN (${placeholders})
         ORDER BY sc.student_id, sc.created_at ASC`,
        studentIds
    );
    return rows;
};

// 保留旧 findClassesByStudentIds（返回第一个必修班）
const findClassesByStudentIds = async (studentIds) => {
    const rows = await findCompulsoryClassesByStudentIds(studentIds);
    // 只取每个学生的第一个
    const seen = new Set();
    const result = [];
    for (const r of rows) {
        if (!seen.has(r.student_id)) {
            seen.add(r.student_id);
            result.push(r);
        }
    }
    return result;
};

// 设置学生的必修班（多选：传入 classIds 数组，事务：删旧 compulsory 记录 → 批量插新 → 回填 users.class_id = 第一个）
const setCompulsoryClasses = async (studentId, classIds) => {
    const ids = Array.isArray(classIds)
        ? classIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : (classIds ? [Number(classIds)] : []);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 删除旧的必修班关系
        await conn.query(
            `DELETE FROM student_classes WHERE student_id = ? AND type = 'compulsory'`,
            [studentId]
        );
        // 批量插入新的必修班关系（幂等）
        if (ids.length > 0) {
            const values = ids.map(cid => [studentId, cid, 'compulsory']);
            await conn.query(
                `INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES ?`,
                [values]
            );
        }
        // 回填 users.class_id：取第一个（作为冗余缓存，多选场景下显示拼接字段，此列仅兜底）
        const firstClassId = ids[0] || null;
        // 如果实际有 class_id 列再更新，避免旧库报错
        const [colRows] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'class_id'`
        );
        if (colRows[0] && colRows[0].c > 0) {
            await conn.query(
                'UPDATE users SET class_id = ? WHERE id = ?',
                [firstClassId, studentId]
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 给一个学生追加 N 个必修班（不删旧，只补新，注册时 append 用）
const appendCompulsoryClasses = async (studentId, classIds) => {
    const ids = Array.isArray(classIds)
        ? classIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : (classIds ? [Number(classIds)] : []);
    if (ids.length === 0) return 0;
    const values = ids.map(cid => [studentId, cid, 'compulsory']);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query(
            `INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES ?`,
            [values]
        );
        // 如果 users.class_id 目前是空，填入第一个追加成功的班级做兜底
        const [colRows] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'class_id'`
        );
        if (colRows[0] && colRows[0].c > 0) {
            await conn.query(
                `UPDATE users SET class_id = ? WHERE id = ? AND class_id IS NULL`,
                [ids[0], studentId]
            );
        }
        await conn.commit();
        return result.affectedRows;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 保留旧 setCompulsoryClass 做兼容（只传一个也能跑）
const setCompulsoryClass = async (studentId, classId) => setCompulsoryClasses(studentId, classId ? [classId] : []);

// 按学号匹配必修班（学号前4位=入学年份，中间几位=专业代码）
const matchCompulsoryClassByStudentNo = async (studentNo) => {
    if (!studentNo || String(studentNo).length < 4) return null;
    const sn = String(studentNo).trim();
    const year = sn.substring(0, 4);
    // 尝试用学号、年级、专业代码匹配 compulsory 班级
    // 优先按 grade LIKE 'year%' AND type='compulsory' 匹配
    const [rows] = await pool.query(
        `SELECT * FROM classes
         WHERE type = 'compulsory'
           AND (grade LIKE ? OR name LIKE ? OR remark LIKE ?)
         ORDER BY id ASC LIMIT 1`,
        [`${year}%`, `%${year}%`, `%${year}%`]
    );
    return rows[0] || null;
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
    findCompulsoryClassesByStudent,
    findCompulsoryClassesByStudentIds,
    findAllClassesByStudent,
    findAllClassesByStudentIds,
    findStudentsByClassId,
    findAvailableStudents,
    assignStudentsToClass,
    removeStudentsFromClass,
    clearByStudent,
    setCompulsoryClass,
    setCompulsoryClasses,
    appendCompulsoryClasses,
    matchCompulsoryClassByStudentNo,
};
