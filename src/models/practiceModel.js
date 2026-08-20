const pool = require('../config/db');

const QT_TABLE = '`题库1`';

// 客观题题型（1判断 2单选 3多选 4填空），5简答 6程序为非客观题
const OBJECTIVE_TYPES = [1, 2, 3, 4];

// 随机抽题（按条件）
const randomPick = async ({ 章节, 题型, 难度, count, 科目 }) => {
    const conditions = [];
    const params = [];
    if (章节 !== undefined && 章节 !== '' && 章节 !== null) {
        conditions.push('章节 = ?');
        params.push(章节);
    }
    if (题型 !== undefined && 题型 !== '' && 题型 !== null) {
        conditions.push('题型 = ?');
        params.push(Number(题型));
    }
    if (难度 !== undefined && 难度 !== '' && 难度 !== null) {
        conditions.push('难度 = ?');
        params.push(难度);
    }
    // 科目过滤：支持单个字符串或数组
    if (科目 !== undefined && 科目 !== null) {
        if (Array.isArray(科目)) {
            if (科目.length === 0) {
                conditions.push('1 = 0');
            } else {
                const ph = 科目.map(() => '?').join(', ');
                conditions.push(`科目 IN (${ph})`);
                params.push(...科目);
            }
        } else if (String(科目).trim() !== '') {
            conditions.push('科目 = ?');
            params.push(String(科目).trim());
        }
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
        `SELECT * FROM ${QT_TABLE} ${where} ORDER BY RAND() LIMIT ?`,
        [...params, Number(count)]
    );
    return rows;
};

// 规则组卷候选题，使用 exam_questions 实时计算题目历史使用次数
const findRuleExamCandidates = async ({ chapters = [], subjects = [], knowledgePoints = [] } = {}) => {
    const normalizedChapters = Array.isArray(chapters)
        ? [...new Set(chapters.map(Number).filter((chapter) => Number.isInteger(chapter) && chapter >= 1 && chapter <= 10))]
        : [];
    const normalizedSubjects = Array.isArray(subjects)
        ? subjects.map((s) => String(s).trim()).filter(Boolean)
        : [];
    const normalizedKnowledgePoints = Array.isArray(knowledgePoints)
        ? knowledgePoints.map((point) => String(point).trim()).filter(Boolean)
        : [];
    const conditions = [];
    const params = [];
    if (normalizedChapters.length) {
        conditions.push(`q.章节 IN (${normalizedChapters.map(() => '?').join(', ')})`);
        params.push(...normalizedChapters);
    }
    if (normalizedSubjects.length) {
        conditions.push(`q.科目 IN (${normalizedSubjects.map(() => '?').join(', ')})`);
        params.push(...normalizedSubjects);
    }
    if (normalizedKnowledgePoints.length) {
        conditions.push(`q.\`知识点\` IN (${normalizedKnowledgePoints.map(() => '?').join(', ')})`);
        params.push(...normalizedKnowledgePoints);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
        `SELECT q.*, COUNT(eq.id) AS used_count
         FROM ${QT_TABLE} q
                  LEFT JOIN \`exam_questions\` eq
                            ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
             ${where}
         GROUP BY q.id
         ORDER BY q.章节, q.题型, q.序号`,
        params
    );
    return rows;
};

// 统计客观题数量
const countObjective = (questions) => {
    return questions.filter((q) => OBJECTIVE_TYPES.includes(Number(q.题型))).length;
};

// ====== exam_classes 关联表：试卷多班级 ======
const findExamClassIds = async (examId) => {
    const [rows] = await pool.query('SELECT class_id FROM exam_classes WHERE exam_id = ?', [examId]);
    return rows.map(r => r.class_id);
};

const addExamClasses = async (conn, examId, classIds) => {
    const ids = Array.isArray(classIds)
        ? classIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : (classIds ? [Number(classIds)] : []);
    if (ids.length === 0) return 0;
    const values = ids.map(cid => [examId, cid]);
    const [result] = await conn.query(
        'INSERT IGNORE INTO exam_classes (exam_id, class_id) VALUES ?',
        [values]
    );
    return result.affectedRows;
};

const replaceExamClasses = async (examId, classIds) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM exam_classes WHERE exam_id = ?', [examId]);
        const added = await addExamClasses(conn, examId, classIds);
        // 同步冗余列 class_id = 第一个班级（兼容旧代码）
        const ids = Array.isArray(classIds)
            ? classIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
            : (classIds ? [Number(classIds)] : []);
        const legacyClassId = ids[0] || null;
        await conn.query('UPDATE exams SET class_id = ? WHERE id = ?', [legacyClassId, examId]);
        await conn.commit();
        return { added, legacyClassId };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 判卷：用户是否在试卷指定的任一目标班级内（多选班级 + 冗余 class_id 兼容）
// classIdsFromStudent: 该学生所属的所有班级ID（必修+选修）
// studentSubjects: 学生所学课程科目（从班级名解析）
// 返回 true = 对该学生可见
const isExamVisibleToStudentClasses = async (examId, classIdsFromStudent, studentSubjects = []) => {
    const studentIds = Array.isArray(classIdsFromStudent) && classIdsFromStudent.length > 0
        ? classIdsFromStudent.map(Number)
        : [];
    const subjects = Array.isArray(studentSubjects) && studentSubjects.length > 0
        ? studentSubjects.map(String)
        : [];
    if (studentIds.length === 0) {
        // 学生不在任何班级：只能看 class_id IS NULL 且 exam_classes 为空的全开放卷
        const [rows] = await pool.query(
            `SELECT e.class_id,
                    (SELECT COUNT(*) FROM exam_classes ec WHERE ec.exam_id = e.id) AS ec_count
             FROM exams e WHERE e.id = ?`,
            [examId]
        );
        const r = rows[0];
        return r && r.class_id === null && Number(r.ec_count) === 0;
    }
    const placeholders = studentIds.map(() => '?').join(', ');
    const subjectPlaceholders = subjects.length > 0 ? subjects.map(() => '?').join(', ') : '';
    const openSubjectFilter = subjects.length > 0
        ? `AND (e.subject IS NULL OR e.subject IN (${subjectPlaceholders}))`
        : '';
    const directedSubjectFilter = subjects.length > 0
        ? `AND e.subject IN (${subjectPlaceholders})`
        : '';
    const params = [];
    if (subjects.length > 0) params.push(...subjects);
    params.push(...studentIds);
    if (subjects.length > 0) params.push(...subjects);
    params.push(...studentIds);
    if (subjects.length > 0) params.push(...subjects);
    params.push(examId);
    const [rows] = await pool.query(
        `SELECT
           (e.class_id IS NULL AND
              (SELECT COUNT(*) FROM exam_classes ec WHERE ec.exam_id = e.id) = 0
              ${openSubjectFilter}
           ) AS is_open_all,
           (e.class_id IN (${placeholders}) ${directedSubjectFilter}) AS match_legacy,
           EXISTS(SELECT 1 FROM exam_classes ec
                  WHERE ec.exam_id = e.id AND ec.class_id IN (${placeholders})
                  ${directedSubjectFilter}
           ) AS match_ec
         FROM exams e WHERE e.id = ?`,
        params
    );
    const r = rows[0];
    if (!r) return false;
    return Boolean(r.is_open_all) || Boolean(r.match_legacy) || Boolean(r.match_ec);
};

// 创建试卷（事务：写 exams + exam_questions + 可选 exam_classes）
const createExam = async ({
    userId, title, chapter, questionType, difficulty, questions, subject, classId, classIds,
    status, durationMinutes, startAt, endAt, maxAttempts,
}) => {
    // 兼容：若只传了 classId，转成 [classId]；若传了 classIds，以 classIds 为准
    const targetClassIds = Array.isArray(classIds) && classIds.length > 0
        ? classIds
        : (classId ? [classId] : []);
    // 冗余 class_id = 第一个目标班级（保留旧列兼容）
    const legacyClassId = targetClassIds.length > 0 ? Number(targetClassIds[0]) : null;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const objectiveCount = countObjective(questions);
        const [examResult] = await conn.query(
            `INSERT INTO \`exams\`
             (user_id, title, total_count, objective_count, chapter, question_type, difficulty,
              subject, class_id, status, duration_minutes, start_at, end_at, max_attempts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, title, questions.length, objectiveCount, chapter || null,
                questionType || null, difficulty || null, subject || null, legacyClassId,
                status || 'published', durationMinutes || null, startAt || null, endAt || null,
                maxAttempts || null,
            ]
        );
        const examId = examResult.insertId;

        const values = questions.map((q, i) => [
            examId,
            q.id,
            i + 1,
            q.章节 ?? null,
            q.题型 ?? null,
            q.序号 ?? null,
            q.题目 ?? null,
            q.选项 ?? null,
            q.答案 ?? null,
            q.解析 ?? null,
            q.难度 ?? null,
            q.知识点 ?? null,
        ]);
        await conn.query(
            `INSERT INTO \`exam_questions\`
             (exam_id, question_id, sort_order,
              snapshot_章节, snapshot_题型, snapshot_序号,
              snapshot_题目, snapshot_选项, snapshot_答案, snapshot_解析,
              snapshot_难度, snapshot_知识点)
             VALUES ?`,
            [values]
        );

        // 多选班级：写入 exam_classes
        if (targetClassIds.length > 0) {
            await addExamClasses(conn, examId, targetClassIds);
        }

        await conn.commit();
        return { examId, objectiveCount, classIds: targetClassIds };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

const countExamRecords = async (examId) => {
    const [rows] = await pool.query(
        'SELECT COUNT(*) AS total FROM \`exam_records\` WHERE exam_id = ?',
        [examId]
    );
    return rows[0].total;
};

const updateExam = async (id, data) => {
    const fields = [];
    const params = [];
    const mapping = [
        ['title', 'title'],
        ['duration_minutes', 'durationMinutes'],
        ['start_at', 'startAt'],
        ['end_at', 'endAt'],
        ['max_attempts', 'maxAttempts'],
        ['class_id', 'classId'],
    ];
    for (const [column, key] of mapping) {
        if (data[key] !== undefined) {
            fields.push(`\`${column}\` = ?`);
            params.push(data[key]);
        }
    }
    if (fields.length === 0) return { affectedRows: 0 };
    params.push(id);
    const [result] = await pool.query(
        `UPDATE \`exams\` SET ${fields.join(', ')} WHERE id = ?`,
        params
    );
    return result;
};

const updateExamStatus = async (id, status) => {
    const [result] = await pool.query(
        'UPDATE \`exams\` SET status = ? WHERE id = ?',
        [status, id]
    );
    return result;
};

const removeExam = async (id) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM `exam_classes` WHERE exam_id = ?', [id]);
        await conn.query('DELETE FROM `exam_questions` WHERE exam_id = ?', [id]);
        await conn.query('DELETE FROM `exam_attempts` WHERE exam_id = ?', [id]);
        await conn.query('DELETE FROM `exam_drafts` WHERE exam_id = ?', [id]);
        await conn.query('DELETE FROM `exams` WHERE id = ?', [id]);
        await conn.commit();
        return { id: Number(id) };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// 查询用户试卷列表
const findExamsByUser = async (userId, { page = 1, pageSize = 20, subject, classId } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = ['e.user_id = ?'];
    const params = [userId];
    if (subject) { conditions.push('e.subject = ?'); params.push(subject); }
    if (classId) { conditions.push('(e.class_id IS NULL OR e.class_id = ?)'); params.push(Number(classId)); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exams\` e ${where}`, params
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT e.*, (SELECT COUNT(*) FROM \`exam_records\` r
          WHERE r.exam_id = e.id
            ${classId ? 'AND EXISTS (SELECT 1 FROM student_classes sc WHERE sc.student_id = r.user_id AND sc.class_id = ?)' : ''}
         ) AS attempt_count
         FROM \`exams\` e ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
        [...(classId ? [Number(classId)] : []), ...params, pageSize, offset]
    );
    return { rows, total };
};

const findExamsByScope = async (userId, userRole, { page = 1, pageSize = 20, subject, classId, classIds, studentSubjects, teacherSubjects } = {}) => {
    if (userRole === 'teacher') {
        return findExamsByUser(userId, { page, pageSize, subject, classId });
    }
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    // 学生：教师发布的班级可见试卷 + 自己创建的自建练习卷
    if (userRole === 'student') {
        // 多选班级：支持 classIds 数组（必修+选修）
        const ids = Array.isArray(classIds) && classIds.length > 0
            ? classIds.map(Number)
            : (classId ? [Number(classId)] : []);
        // 学生所学课程科目（从班级名解析）
        const subjects = Array.isArray(studentSubjects) && studentSubjects.length > 0
            ? studentSubjects.map(String)
            : [];
        let teacherClause = "u.role = 'teacher' AND (e.status IS NULL OR e.status = 'published')";
        if (ids.length > 0) {
            const ph = ids.map(() => '?').join(', ');
            if (subjects.length > 0) {
                const sph = subjects.map(() => '?').join(', ');
                // 可见条件：
                // 1) 全开放卷：无班级限制 AND（无科目 或 科目在学生所学课程内）
                // 2) 班级限定卷：班级匹配 AND 科目匹配
                teacherClause += ` AND (
                    (e.class_id IS NULL AND NOT EXISTS (SELECT 1 FROM exam_classes ec_sub WHERE ec_sub.exam_id = e.id)
                     AND (e.subject IS NULL OR e.subject IN (${sph})))
                    OR (
                        (e.class_id IN (${ph}) OR EXISTS (SELECT 1 FROM exam_classes ec_sub WHERE ec_sub.exam_id = e.id AND ec_sub.class_id IN (${ph})))
                        AND e.subject IN (${sph})
                    )
                )`;
                params.push(...subjects, ...ids, ...ids, ...subjects);
            } else {
                // 有班级但解析不出科目：沿用班级匹配兜底
                teacherClause += ` AND (
                    (e.class_id IS NULL AND NOT EXISTS (SELECT 1 FROM exam_classes ec_sub WHERE ec_sub.exam_id = e.id))
                    OR e.class_id IN (${ph})
                    OR EXISTS (SELECT 1 FROM exam_classes ec_sub WHERE ec_sub.exam_id = e.id AND ec_sub.class_id IN (${ph}))
                )`;
                params.push(...ids, ...ids);
            }
        } else {
            // 无班级：只能看全开放卷
            teacherClause += " AND (e.class_id IS NULL AND NOT EXISTS (SELECT 1 FROM exam_classes ec_sub WHERE ec_sub.exam_id = e.id))";
        }
        conditions.push(`(${teacherClause} OR e.user_id = ?)`);
        params.push(userId);
    } else {
        // 管理员：查看所有教师发布的试卷
        conditions.push("u.role='teacher'");
    }
    if (subject) { conditions.push('e.subject = ?'); params.push(subject); }
    if (userRole === 'admin' && classId) {
        conditions.push('(e.class_id IS NULL OR e.class_id = ? OR EXISTS (SELECT 1 FROM exam_classes ec2 WHERE ec2.exam_id = e.id AND ec2.class_id = ?))');
        params.push(Number(classId), Number(classId));
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.query(
        `SELECT COUNT(*) total FROM exams e INNER JOIN users u ON u.id=e.user_id ${where}`, params
    );
    const [rows] = await pool.query(
        `SELECT e.*, u.nickname creator_name, u.username creator_username, u.role creator_role,
                (SELECT COUNT(*) FROM exam_records r WHERE r.exam_id=e.id) attempt_count,
                (SELECT GROUP_CONCAT(ec.class_id) FROM exam_classes ec WHERE ec.exam_id=e.id) AS class_ids
         FROM exams e INNER JOIN users u ON u.id=e.user_id ${where}
         ORDER BY e.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    rows.forEach((row) => {
        row.class_ids = row.class_ids ? row.class_ids.split(',').map(Number) : [];
    });
    return { rows, total: countRows[0].total };
};

// 查询试卷详情（含题目列表，带题库原题信息 + 多选班级列表）
const findExamById = async (examId) => {
    const [examRows] = await pool.query(
        'SELECT e.*, u.role creator_role, u.nickname creator_name FROM `exams` e LEFT JOIN users u ON u.id=e.user_id WHERE e.id = ?', [examId]
    );
    if (examRows.length === 0) return null;
    const exam = examRows[0];

    // 多选班级：返回 class_ids 数组（优先用 exam_classes，冗余 class_id 兜底）
    exam.class_ids = await findExamClassIds(examId);
    if (exam.class_ids.length === 0 && exam.class_id) {
        exam.class_ids = [Number(exam.class_id)];
    }

    const [qRows] = await pool.query(
        `SELECT eq.question_id, eq.sort_order,
                eq.snapshot_章节, eq.snapshot_题型, eq.snapshot_序号,
                eq.snapshot_题目, eq.snapshot_选项, eq.snapshot_答案, eq.snapshot_解析,
                eq.snapshot_难度, eq.snapshot_知识点,
                q.*
         FROM \`exam_questions\` eq
         LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE eq.exam_id = ? ORDER BY eq.sort_order`,
        [examId]
    );
    exam.questions = qRows.map((r) => {
        const row = { ...r };
        row.id = r.question_id;
        row.sort_order = r.sort_order;
        if (row.snapshot_题目 !== null && row.snapshot_题目 !== undefined) {
            row.章节 = row.snapshot_章节;
            row.题型 = row.snapshot_题型;
            row.序号 = row.snapshot_序号;
            row.题目 = row.snapshot_题目;
            row.选项 = row.snapshot_选项;
            row.答案 = row.snapshot_答案;
            row.解析 = row.snapshot_解析;
            row.难度 = row.snapshot_难度;
            row.知识点 = row.snapshot_知识点;
        }
        for (const key of [
            'eq_id', 'eq_exam_id', 'question_id',
            'snapshot_章节', 'snapshot_题型', 'snapshot_序号',
            'snapshot_题目', 'snapshot_选项', 'snapshot_答案', 'snapshot_解析',
            'snapshot_难度', 'snapshot_知识点',
        ]) {
            delete row[key];
        }
        return row;
    });
    return exam;
};

const findExamIdsByUser = async (userId) => {
    const [rows] = await pool.query('SELECT id FROM \`exams\` WHERE user_id = ?', [userId]);
    return rows.map((r) => r.id);
};

// 批量查题（用于提交评分时获取正确答案）
const findQuestionsByIds = async (ids) => {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT id, 题型, 题目, 选项, 答案, 解析 FROM ${QT_TABLE} WHERE id IN (${placeholders})`,
        ids
    );
    return rows;
};

// ================================================================
// [修改] 错题本：统计当前用户最近一次做错的题目数
// ================================================================
const countWrongQuestions = async (userId, { chapter, questionType, keyword } = {}) => {
    let sql = `
        SELECT COUNT(*) AS total
        FROM (
                 SELECT a.question_id, MAX(a.id) AS max_id
                 FROM exam_answers a
                          JOIN exam_records r ON a.record_id = r.id
                 WHERE r.user_id = ?
                 GROUP BY a.question_id
             ) latest
                 JOIN exam_answers a ON a.id = latest.max_id
                 JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE a.is_correct = 0
    `;
    const params = [userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        sql += ` AND q.章节 = ?`;
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        sql += ` AND q.题型 = ?`;
        params.push(Number(questionType));
    }
    if (keyword && String(keyword).trim()) {
        sql += ` AND (q.题目 LIKE ? OR q.知识点 LIKE ? OR q.id LIKE ?)`;
        const value = `%${String(keyword).trim()}%`;
        params.push(value, value, value);
    }
    const [rows] = await pool.query(sql, params);
    return rows[0].total;
};

// ================================================================
// [修改] 错题本：分页列出错题（仅最近一次作答为错误的题目）
// ================================================================
const findWrongQuestions = async (userId, { page = 1, pageSize = 20, chapter, questionType, keyword } = {}) => {
    const offset = (page - 1) * pageSize;
    let sql = `
        SELECT q.id, q.章节 AS chapter, q.题型 AS question_type, q.题目 AS title,
               q.选项 AS options, q.难度 AS difficulty, q.知识点 AS knowledge_point,
               q.答案 AS correct_answer,
               a.is_correct, a.user_answer, a.correct_answer AS last_correct_answer,
               r2.submitted_at AS last_wrong_at, r2.exam_id, e.title AS exam_title,
               (SELECT COUNT(*) FROM exam_answers aw JOIN exam_records rw ON rw.id=aw.record_id
                WHERE rw.user_id=? AND aw.question_id=a.question_id AND aw.is_correct=0) AS wrong_count
        FROM (
                 SELECT a.question_id, MAX(a.id) AS max_id
                 FROM exam_answers a
                          JOIN exam_records r ON a.record_id = r.id
                 WHERE r.user_id = ?
                 GROUP BY a.question_id
             ) latest
                 JOIN exam_answers a ON a.id = latest.max_id
                 JOIN exam_records r2 ON a.record_id = r2.id
                 LEFT JOIN exams e ON e.id=r2.exam_id
                 JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE a.is_correct = 0
    `;
    const params = [userId, userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        sql += ` AND q.章节 = ?`;
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        sql += ` AND q.题型 = ?`;
        params.push(Number(questionType));
    }
    if (keyword && String(keyword).trim()) {
        sql += ` AND (q.题目 LIKE ? OR q.知识点 LIKE ? OR q.id LIKE ?)`;
        const value = `%${String(keyword).trim()}%`;
        params.push(value, value, value);
    }
    sql += ` ORDER BY r2.submitted_at DESC LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);
    const [rows] = await pool.query(sql, params);
    return rows;
};

// ================================================================
// [修改] 错题本：获取全部错题 id（用于错题重练）
// ================================================================
const findWrongQuestionIds = async (userId, { chapter, questionType } = {}) => {
    let sql = `
        SELECT q.id
        FROM (
            SELECT a.question_id, MAX(a.id) AS max_id
            FROM exam_answers a
            JOIN exam_records r ON a.record_id = r.id
            WHERE r.user_id = ?
            GROUP BY a.question_id
        ) latest
        JOIN exam_answers a ON a.id = latest.max_id
        JOIN exam_records r2 ON a.record_id = r2.id
        JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE a.is_correct = 0
    `;
    const params = [userId];
    if (chapter !== undefined && chapter !== '' && chapter !== null) {
        sql += ` AND q.章节 = ?`;
        params.push(chapter);
    }
    if (questionType !== undefined && questionType !== '' && questionType !== null) {
        sql += ` AND q.题型 = ?`;
        params.push(Number(questionType));
    }
    sql += ` ORDER BY r2.submitted_at DESC`;
    const [rows] = await pool.query(sql, params);
    return rows.map((r) => r.id);
};

// 从指定 id 集合中随机抽题（错题重练）
const randomPickByIds = async (ids, count) => {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT * FROM ${QT_TABLE} WHERE id IN (${placeholders}) ORDER BY RAND() LIMIT ?`,
        [...ids, Number(count)]
    );
    return rows;
};

// 自探测并缓存 exam_answers 列，防止新字段在旧 schema 下炸 SQL
let cachedAnswerColumns = null;
const getAnswerColumns = async () => {
    if (cachedAnswerColumns) return cachedAnswerColumns;
    try {
        const [rows] = await pool.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_answers'`
        );
        cachedAnswerColumns = new Set(rows.map(r => r.COLUMN_NAME));
    } catch { cachedAnswerColumns = new Set(); }
    return cachedAnswerColumns;
};

// 写入答题记录（事务：写 exam_records + exam_answers）
const createRecord = async (data) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // exam_records 列探测：兼容旧表无 attempt_no 的情况
        const [recColsRows] = await conn.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_records'`
        );
        const recCols = new Set(recColsRows.map(r => r.COLUMN_NAME));
        const recFields = ['exam_id', 'user_id', 'started_at', 'submitted_at', 'duration_seconds',
                           'total_count', 'answered_count', 'correct_count', 'wrong_count', 'skipped_count',
                           'objective_total', 'objective_correct', 'accuracy', 'score'];
        const recPlaceholders = ['?','?','?','NOW()','?', '?','?','?','?','?', '?','?','?','?'];
        const recParams = [
            data.examId, data.userId, data.startedAt, data.durationSeconds,
            data.totalCount, data.answeredCount, data.correctCount, data.wrongCount, data.skippedCount,
            data.objectiveTotal, data.objectiveCorrect, data.accuracy, data.score
        ];
        if (recCols.has('attempt_no') && data.attemptNo !== undefined && data.attemptNo !== null) {
            recFields.push('attempt_no');
            recPlaceholders.push('?');
            recParams.push(Number(data.attemptNo));
        }
        const [recordResult] = await conn.query(
            `INSERT INTO \`exam_records\` (${recFields.join(', ')}) VALUES (${recPlaceholders.join(', ')})`,
            recParams
        );
        const recordId = recordResult.insertId;

        const cols = await getAnswerColumns();
        const baseCols = ['record_id', 'question_id', 'question_type', 'user_answer', 'correct_answer', 'is_objective', 'is_correct'];
        // 扩展：若 exam_id / user_id / review_* / score_rate 列存在，则一并写入
        const optionalCols = ['exam_id', 'user_id', 'score_rate'];
        const useReviewCols = cols.has('review_status') && cols.has('review_score_rate');
        const insertCols = [...baseCols];
        optionalCols.forEach(c => { if (cols.has(c)) insertCols.push(c); });
        if (useReviewCols) insertCols.push('review_status', 'review_score_rate');

        const values = data.answers.map((a) => {
            const row = [
                recordId, a.questionId, a.questionType, a.userAnswer,
                a.correctAnswer, a.isObjective, a.isCorrect
            ];
            if (cols.has('exam_id')) row.push(data.examId ?? null);
            if (cols.has('user_id')) row.push(data.userId ?? null);
            if (cols.has('score_rate')) {
                const evalStatus = a.evaluation?.status;
                const rate =
                    evalStatus === 'correct' ? 1
                        : (evalStatus === 'partial' ? Number(a.evaluation?.scoreRate || 0)
                            : (evalStatus === 'incorrect' || Number(a.isCorrect) === 0 ? 0
                                : (Number(a.isCorrect) === 1 ? 1 : null)));
                row.push(rate);
            }
            if (useReviewCols) {
                const evalStatus = a.evaluation?.status;
                const initialReviewStatus =
                    evalStatus === 'correct' || evalStatus === 'incorrect' ? null
                        : (evalStatus === 'partial' ? 'partial'
                            : (evalStatus === 'review' ? 'review'
                                : (Number(a.isCorrect) === 3 ? 'review' : null)));
                const initialScoreRate =
                    initialReviewStatus === 'partial' ? Number(a.evaluation?.scoreRate || 0)
                        : (initialReviewStatus === 'review' ? 0 : null);
                row.push(initialReviewStatus, initialScoreRate);
            }
            return row;
        });
        if (values.length > 0) {
            await conn.query(
                `INSERT INTO \`exam_answers\` (${insertCols.map(c => `\`${c}\``).join(', ')}) VALUES ?`,
                [values]
            );
        }

        await conn.commit();
        return recordId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

const ensureReviewColumns = async () => {
    const columns = [
        ['review_status', "VARCHAR(20) DEFAULT NULL"],
        ['review_score_rate', "DECIMAL(5,2) DEFAULT NULL"],
        ['review_comment', "VARCHAR(500) DEFAULT NULL"],
        ['reviewed_by', "INT DEFAULT NULL"],
        ['reviewed_at', "DATETIME DEFAULT NULL"],
    ];
    const [existing] = await pool.query("SHOW COLUMNS FROM `exam_answers`");
    const names = new Set(existing.map((item) => item.Field));
    for (const [name, definition] of columns) {
        if (!names.has(name)) await pool.query(`ALTER TABLE \`exam_answers\` ADD COLUMN \`${name}\` ${definition}`);
    }
};

const findAnswerRecord = async (answerId) => {
    const [rows] = await pool.query(
        'SELECT id, record_id, question_type FROM `exam_answers` WHERE id = ?',
        [answerId]
    );
    return rows[0] || null;
};

const listSubjectiveReviewAnswers = async ({ reviewerId, status = 'pending' } = {}) => {
    await ensureReviewColumns();
    const statusClause = status === 'reviewed'
        ? "a.review_status IN ('correct','partial','incorrect')"
        : "(a.is_correct = 3 OR a.review_status = 'review')";
    const [rows] = await pool.query(
        `SELECT a.id, a.user_answer, a.correct_answer, a.question_type, a.review_status,
                a.review_comment, r.submitted_at AS answered_at, u.username, u.nickname,
                COALESCE(eq.snapshot_题目, q.题目) AS title,
                COALESCE(eq.snapshot_选项, q.选项) AS options,
                q.知识点 AS knowledge_point
         FROM exam_answers a
         INNER JOIN exam_records r ON r.id=a.record_id
         INNER JOIN exams e ON e.id=r.exam_id
         INNER JOIN users u ON u.id=r.user_id
         LEFT JOIN exam_questions eq ON eq.exam_id=e.id AND eq.question_id=a.question_id
         LEFT JOIN ${QT_TABLE} q ON a.question_id=CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE e.user_id=? AND a.question_type IN (4,5,6) AND ${statusClause}
         ORDER BY a.id DESC`,
        [reviewerId]
    );
    return rows;
};

const reviewAnswer = async ({ answerId, reviewerId, status, scoreRate, comment }) => {
    await ensureReviewColumns();
    const [answerRows] = await pool.query('SELECT id, record_id, question_type FROM `exam_answers` WHERE id=?', [answerId]);
    if (!answerRows.length) return null;
    const answer = answerRows[0];
    if (![4, 5, 6].includes(Number(answer.question_type))) return null;
    const isCorrect = status === 'correct' ? 1 : status === 'incorrect' ? 0 : 3;
    // 复核得分率必须落在 0-1，防止异常数据把总分推到 100 以上
    const safeScoreRate = Math.max(0, Math.min(1, Number(scoreRate) || 0));
    await pool.query(`UPDATE exam_answers SET is_correct=?, review_status=?, review_score_rate=?, review_comment=?,
                                              reviewed_by=?, reviewed_at=NOW() WHERE id=?`, [isCorrect, status, scoreRate, comment || null, reviewerId, answerId]);
    const [statsRows] = await pool.query(`SELECT COUNT(*) total,
                                                 SUM(CASE WHEN is_correct=2 THEN 1 ELSE 0 END) skipped,
                                                 SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) correct,
                                                 SUM(CASE WHEN is_correct=0 THEN 1 ELSE 0 END) wrong,
                                                 SUM(CASE WHEN is_correct NOT IN (2,3) OR review_status='partial' THEN 1 ELSE 0 END) evaluated,
                                                 SUM(CASE WHEN is_correct=1 THEN 1 WHEN review_status='partial' THEN COALESCE(review_score_rate,0) ELSE 0 END) earned
                                          FROM exam_answers WHERE record_id=?`, [answer.record_id]);
    const stats = statsRows[0];
    const accuracy = Number(stats.evaluated) ? Math.round(Number(stats.earned) * 10000 / Number(stats.evaluated)) / 100 : 0;
    await pool.query(`UPDATE exam_records SET correct_count=?, wrong_count=?, skipped_count=?, accuracy=?, score=? WHERE id=?`,
        [Number(stats.correct), Number(stats.wrong), Number(stats.skipped), accuracy, accuracy, answer.record_id]);
    return { answerId: Number(answerId), recordId: answer.record_id, status, scoreRate: safeScoreRate, comment: comment || '', accuracy };
};

// ==================== 答题草稿 ====================

const findDraft = async (userId, examId) => {
    const [rows] = await pool.query(
        `SELECT exam_id, user_id, answers_json, updated_at
         FROM exam_drafts WHERE user_id = ? AND exam_id = ? LIMIT 1`,
        [userId, examId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    let answers = {};
    try { answers = r.answers_json ? JSON.parse(typeof r.answers_json === 'string' ? r.answers_json : JSON.stringify(r.answers_json)) : {}; }
    catch { answers = {}; }
    return { exam_id: r.exam_id, user_id: r.user_id, answers, updated_at: r.updated_at };
};

const saveDraft = async (userId, examId, { answers }) => {
    const payload = typeof answers === 'string' ? answers : JSON.stringify(answers || {});
    await pool.query(
        `INSERT INTO exam_drafts (exam_id, user_id, answers_json) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE answers_json = VALUES(answers_json), updated_at = NOW()`,
        [examId, userId, payload]
    );
    return findDraft(userId, examId);
};

const deleteDraft = async (userId, examId) => {
    const [result] = await pool.query(`DELETE FROM exam_drafts WHERE user_id = ? AND exam_id = ?`, [userId, examId]);
    return Boolean(result.affectedRows);
};

// ==================== 作答尝试（服务端计时与次数控制） ====================

const findLatestAttempt = async (examId, userId) => {
    const [rows] = await pool.query(
        `SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ? ORDER BY attempt_no DESC LIMIT 1`,
        [examId, userId]
    );
    return rows[0] || null;
};

const startOrResumeAttempt = async (examId, userId) => {
    const latest = await findLatestAttempt(examId, userId);
    if (latest && !latest.submitted_at) return latest;
    const [result] = await pool.query(
        `INSERT INTO exam_attempts (exam_id, user_id, attempt_no) VALUES (?, ?, ?)`,
        [examId, userId, latest ? Number(latest.attempt_no) + 1 : 1]
    );
    return findLatestAttempt(examId, userId);
};

const markAttemptSubmitted = async (examId, userId, attemptNo) => {
    await pool.query(
        `UPDATE exam_attempts SET submitted_at = NOW() WHERE exam_id = ? AND user_id = ? AND attempt_no = ?`,
        [examId, userId, attemptNo]
    );
};

const countSubmittedAttempts = async (examId, userId) => {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exam_records\` WHERE exam_id = ? AND user_id = ?`,
        [examId, userId]
    );
    return rows[0].total;
};

// 查询用户答题记录列表（含提交人信息）
const findRecordsByUser = async (userId, { page = 1, pageSize = 20 } = {}) => {
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM `exam_records` WHERE user_id = ?', [userId]
    );
    const total = countRows[0].total;
    const [rows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
                  LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.user_id = ? ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
    );
    return { rows, total };
};

// 按角色权限范围查询答题记录（含提交人信息）
const findRecordsByScope = async ({ userId, userRole, page = 1, pageSize = 20, examIds } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];

    if (userRole === 'student') {
        conditions.push('r.user_id = ?');
        params.push(userId);
    } else if (userRole === 'teacher') {
        conditions.push("u.role IN ('teacher', 'student')");
    }
    if (Array.isArray(examIds) && examIds.length === 0) {
        conditions.push('1 = 0');
    } else if (Array.isArray(examIds) && examIds.length > 0) {
        const placeholders = examIds.map(() => '?').join(', ');
        conditions.push(`r.exam_id IN (${placeholders})`);
        params.push(...examIds);
    }
    // admin 不加条件，看所有人

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exam_records\` r
                                           INNER JOIN \`users\` u ON r.user_id = u.id ${where}`,
        params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
                  LEFT JOIN \`users\` u ON r.user_id = u.id
             ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 查询答题记录详情（含每题对错，含提交人 username/nickname）
const findRecordById = async (recordId) => {
    const [recordRows] = await pool.query(
        `SELECT r.*, e.title AS exam_title, u.username, u.nickname, u.role AS user_role
         FROM \`exam_records\` r
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
                  LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.id = ?`,
        [recordId]
    );
    if (recordRows.length === 0) return null;
    const record = recordRows[0];

    const [answerRows] = await pool.query(
        `SELECT a.*,
                COALESCE(eq.snapshot_题目, q.题目) AS 题目,
                COALESCE(eq.snapshot_选项, q.选项) AS 选项,
                COALESCE(eq.snapshot_解析, q.解析) AS 解析
         FROM \`exam_answers\` a
         LEFT JOIN \`exam_records\` r ON a.record_id = r.id
         LEFT JOIN \`exam_questions\` eq ON eq.exam_id = r.exam_id AND eq.question_id = a.question_id
         LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE a.record_id = ? ORDER BY a.id`,
        [recordId]
    );
    record.answers = answerRows;
    return record;
};

// 统计：总览 + 近期趋势 + 按题型正确率
const getStatistics = async (userId, examIds = null) => {
    const examIdsArray = Array.isArray(examIds) && examIds.length > 0 ? examIds : null;
    const examClause = examIdsArray ? ` AND r.exam_id IN (${examIdsArray.map(() => '?').join(', ')})` : '';
    const examParams = examIdsArray || [];
    // 总览
    const [overview] = await pool.query(
        `SELECT
             COUNT(*) AS total_attempts,
             COALESCE(ROUND(AVG(accuracy), 2), 0) AS avg_accuracy,
             COALESCE(ROUND(MAX(accuracy), 2), 0) AS max_accuracy,
             COALESCE(ROUND(MIN(accuracy), 2), 0) AS min_accuracy,
             COALESCE(SUM(total_count), 0) AS total_questions,
             COALESCE(SUM(correct_count), 0) AS total_correct
         FROM \`exam_records\` r WHERE user_id = ?${examClause}`,
        [userId, ...examParams]
    );

    // 近 20 次趋势
    const [trend] = await pool.query(
        `SELECT r.id, r.exam_id, r.accuracy, r.score, r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count, r.duration_seconds, r.submitted_at, r.started_at,
                e.title AS exam_title, u.username, u.nickname, u.role
         FROM \`exam_records\` r
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
                  LEFT JOIN \`users\` u ON r.user_id = u.id
         WHERE r.user_id = ?${examClause}
         ORDER BY r.submitted_at DESC LIMIT 20`,
        [userId, ...examParams]
    );
    trend.reverse();

    // 按题型正确率
    const [byType] = await pool.query(
        `SELECT
             a.question_type,
             COUNT(*) AS total,
             SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
             ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
         WHERE r.user_id = ?${examClause} AND a.is_objective = 1
         GROUP BY a.question_type ORDER BY a.question_type`,
        [userId, ...examParams]
    );

    return {
        overview: overview[0] || {},
        trend,
        byType,
    };
};

// ==================== 管理端查询 ====================

// 查询所有用户的答题记录（可按角色过滤：student/teacher）
const findRecordsByRole = async ({ role, userId, page = 1, pageSize = 20, examId, examIds } = {}) => {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    if (userId) {
        conditions.push('r.user_id = ?');
        params.push(userId);
    }
    if (examId) {
        conditions.push('r.exam_id = ?');
        params.push(Number(examId));
    }
    if (Array.isArray(examIds) && examIds.length === 0) {
        conditions.push('1 = 0');
    } else if (Array.isArray(examIds) && examIds.length > 0) {
        const placeholders = examIds.map(() => '?').join(', ');
        conditions.push(`r.exam_id IN (${placeholders})`);
        params.push(...examIds);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM \`exam_records\` r
                                           INNER JOIN \`users\` u ON r.user_id = u.id ${where}`,
        params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
        `SELECT r.id, r.exam_id, r.user_id, u.username, u.nickname, u.role,
                r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count,
                r.objective_total, r.objective_correct, r.accuracy, r.score,
                r.duration_seconds, r.submitted_at, e.title AS exam_title
         FROM \`exam_records\` r
                  INNER JOIN \`users\` u ON r.user_id = u.id
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
             ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

// 管理端：查询所有用户的答题记录（不分页，按用户+提交时间排序，含用户信息）
const findAllRecordsWithUser = async ({ role, examIds } = {}) => {
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    if (Array.isArray(examIds) && examIds.length === 0) {
        conditions.push('1 = 0');
    } else if (Array.isArray(examIds) && examIds.length > 0) {
        const placeholders = examIds.map(() => '?').join(', ');
        conditions.push(`r.exam_id IN (${placeholders})`);
        params.push(...examIds);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
        `SELECT r.id, r.exam_id, r.user_id, u.username, u.nickname, u.role,
                r.total_count, r.answered_count, r.correct_count, r.wrong_count, r.skipped_count,
                r.objective_total, r.objective_correct, r.accuracy, r.score,
                r.duration_seconds, r.submitted_at, e.title AS exam_title
         FROM \`exam_records\` r
                  INNER JOIN \`users\` u ON r.user_id = u.id
                  LEFT JOIN \`exams\` e ON r.exam_id = e.id
             ${where} ORDER BY u.id ASC, r.submitted_at DESC`,
        params
    );
    return rows;
};

// 查询有答题记录的用户列表（含统计汇总，按角色分组）
const findUsersWithRecords = async ({ role, examIds } = {}) => {
    const conditions = [];
    const params = [];
    if (role) {
        conditions.push('u.role = ?');
        params.push(role);
    }
    if (Array.isArray(examIds) && examIds.length === 0) {
        conditions.push('1 = 0');
    } else if (Array.isArray(examIds) && examIds.length > 0) {
        const placeholders = examIds.map(() => '?').join(', ');
        conditions.push(`r.exam_id IN (${placeholders})`);
        params.push(...examIds);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.role, u.status,
                COUNT(r.id) AS attempt_count,
                COALESCE(ROUND(AVG(r.accuracy), 2), 0) AS avg_accuracy,
                COALESCE(MAX(r.accuracy), 0) AS max_accuracy,
                COALESCE(MIN(r.accuracy), 0) AS min_accuracy,
                COALESCE(SUM(r.total_count), 0) AS total_questions,
                COALESCE(SUM(r.correct_count), 0) AS total_correct,
                MAX(r.submitted_at) AS last_attempt_at
         FROM \`users\` u
                  INNER JOIN \`exam_records\` r ON u.id = r.user_id
             ${where}
         GROUP BY u.id, u.username, u.nickname, u.role, u.status
         ORDER BY u.role ASC, attempt_count DESC`,
        params
    );
    return rows;
};

// 管理端：查询某用户的答题记录列表
const findRecordsByUserId = async (targetUserId, { page = 1, pageSize = 20, examIds } = {}) => {
    return findRecordsByRole({ userId: targetUserId, page, pageSize, examIds });
};

// 管理端：查询某用户的统计信息（复用 getStatistics）
const getUserStatistics = async (userId, examIds = null) => {
    return getStatistics(userId, examIds);
};

// 管理端：根据 id 查用户（用于权限校验）
const findUserById = async (userId) => {
    const [rows] = await pool.query(
        'SELECT id, username, nickname, role, status FROM `users` WHERE id = ?',
        [userId]
    );
    return rows[0] || null;
};

// ==================== 试卷维度分析 ====================

// 按试卷维度统计：每道题的正确率 + 学生成绩列表 + 整体统计
const getExamAnalytics = async (examId, classId) => {
    const selectedClassId = Number(classId);
    const hasClassFilter = Number.isInteger(selectedClassId) && selectedClassId > 0;
    const classRecordFilter = hasClassFilter
        ? ' AND EXISTS (SELECT 1 FROM student_classes sc_filter WHERE sc_filter.student_id = r.user_id AND sc_filter.class_id = ?)'
        : '';
    // 1. 试卷基本信息
    const [examRows] = await pool.query(
        `SELECT e.id, e.title, e.total_count, e.objective_count, e.subject, e.class_id, e.created_at,
                c.name AS class_name
         FROM \`exams\` e
                  LEFT JOIN \`classes\` c ON e.class_id = c.id
         WHERE e.id = ?`,
        [examId]
    );
    if (examRows.length === 0) return null;
    const exam = examRows[0];

    // 2. 每道题的正确率统计
    const questionStatsSql = hasClassFilter
        ? `SELECT eq.question_id, eq.sort_order,
                q.题目 AS question_text, q.题型 AS question_type, q.难度 AS difficulty, q.答案 AS correct_answer,
                COUNT(a.id) AS answered_count,
                SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
                SUM(CASE WHEN a.is_correct = 2 THEN 1 ELSE 0 END) AS skipped_count,
                ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS accuracy
         FROM \`exam_questions\` eq
                  LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LEFT JOIN \`exam_records\` r ON r.exam_id = eq.exam_id
                  LEFT JOIN \`exam_answers\` a ON a.record_id = r.id AND a.question_id = eq.question_id
         WHERE eq.exam_id = ?${classRecordFilter}
         GROUP BY eq.question_id, eq.sort_order, q.题目, q.题型, q.难度, q.答案
         ORDER BY eq.sort_order ASC`
        : `SELECT eq.question_id, eq.sort_order,
                q.题目 AS question_text, q.题型 AS question_type, q.难度 AS difficulty, q.答案 AS correct_answer,
                COUNT(a.id) AS answered_count,
                SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
                SUM(CASE WHEN a.is_correct = 2 THEN 1 ELSE 0 END) AS skipped_count,
                ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS accuracy
         FROM \`exam_questions\` eq
         LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         LEFT JOIN \`exam_answers\` a ON a.question_id = eq.question_id
         LEFT JOIN \`exam_records\` r ON r.id = a.record_id
         WHERE eq.exam_id = ?
         GROUP BY eq.question_id, eq.sort_order, q.题目, q.题型, q.难度, q.答案
         ORDER BY eq.sort_order ASC`;
    let [questionStats] = await pool.query(
        questionStatsSql,
        hasClassFilter ? [examId, selectedClassId] : [examId]
    );

    // 3. 学生成绩列表（原始查询，后续按 user 去重取最佳成绩）
    const [allStudentRows] = await pool.query(
        `SELECT r.id AS record_id, r.user_id, u.username, u.nickname, u.college, u.school,
                r.score, r.accuracy, r.total_count, r.answered_count, r.correct_count,
                r.wrong_count, r.skipped_count, r.duration_seconds,
                r.started_at, r.submitted_at
         FROM \`exam_records\` r
                  INNER JOIN \`users\` u ON r.user_id = u.id
         WHERE r.exam_id = ?${classRecordFilter} AND u.role = 'student'
         ORDER BY r.score DESC, r.accuracy DESC, r.submitted_at ASC`,
        hasClassFilter ? [examId, selectedClassId] : [examId]
    );

    // 4. 整体统计
    const [overview] = await pool.query(
        `SELECT
             COUNT(*) AS attempt_count,
             COUNT(DISTINCT r.user_id) AS participant_count,
             COALESCE(ROUND(AVG(score), 2), 0) AS avg_score,
             COALESCE(ROUND(MAX(score), 2), 0) AS max_score,
             COALESCE(ROUND(MIN(score), 2), 0) AS min_score,
             COALESCE(ROUND(AVG(accuracy), 2), 0) AS avg_accuracy,
             SUM(CASE WHEN score >= 60 THEN 1 ELSE 0 END) AS pass_count,
             ROUND(SUM(CASE WHEN score >= 60 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS pass_rate
         FROM \`exam_records\` r
                  INNER JOIN \`users\` u ON r.user_id = u.id
         WHERE r.exam_id = ? AND u.role = 'student'`,
        [examId]
    );

    // 5. 班级对比
    const [classBreakdown] = await pool.query(
        `SELECT
             COALESCE(c.name, '未分班') AS class_name,
             COUNT(r.id) AS participant_count,
             COALESCE(ROUND(AVG(r.score), 2), 0) AS avg_score,
             COALESCE(ROUND(MAX(r.score), 2), 0) AS max_score,
             COALESCE(ROUND(MIN(r.score), 2), 0) AS min_score,
             COALESCE(ROUND(AVG(r.accuracy), 2), 0) AS avg_accuracy,
             SUM(CASE WHEN r.score >= 60 THEN 1 ELSE 0 END) AS pass_count,
             ROUND(SUM(CASE WHEN r.score >= 60 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS pass_rate
         FROM \`exam_records\` r
                  INNER JOIN \`users\` u ON r.user_id = u.id
                  LEFT JOIN \`student_classes\` sc ON sc.student_id = u.id
                  LEFT JOIN \`classes\` c ON c.id = sc.class_id
         WHERE r.exam_id = ? AND u.role = 'student'
         GROUP BY c.id, c.name
         ORDER BY avg_score DESC`,
        [examId]
    );
    const seenUsers = new Set();
    const studentResults = [];
    allStudentRows.forEach((row) => {
        if (!seenUsers.has(row.user_id)) {
            seenUsers.add(row.user_id);
            studentResults.push(row);
        }
    });

    if (studentResults.length > 0) {
        const bestRecordIds = studentResults.map((r) => r.record_id);
        const placeholders = bestRecordIds.map(() => '?').join(', ');
        const [qRows] = await pool.query(
            `SELECT eq.question_id, eq.sort_order,
                    COALESCE(eq.snapshot_题目, q.题目) AS question_text,
                    COALESCE(eq.snapshot_题型, q.题型) AS question_type,
                    COALESCE(eq.snapshot_难度, q.难度) AS difficulty,
                    COALESCE(eq.snapshot_答案, q.答案) AS correct_answer,
                    COUNT(a.id) AS answered_count,
                    SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                    SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
                    SUM(CASE WHEN a.is_correct = 2 THEN 1 ELSE 0 END) AS skipped_count,
                    ROUND(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS accuracy
             FROM \`exam_questions\` eq
             LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LEFT JOIN \`exam_answers\` a ON a.record_id IN (${placeholders}) AND a.question_id = eq.question_id
             WHERE eq.exam_id = ?
             GROUP BY eq.question_id, eq.sort_order,
                      COALESCE(eq.snapshot_题目, q.题目),
                      COALESCE(eq.snapshot_题型, q.题型),
                      COALESCE(eq.snapshot_难度, q.难度),
                      COALESCE(eq.snapshot_答案, q.答案)
             ORDER BY eq.sort_order ASC`,
            [...bestRecordIds, examId]
        );
        questionStats = qRows;
    }

    // 6. 分数段分布
    const [scoreDistribution] = await pool.query(
        `SELECT
             CASE
                 WHEN score < 60 THEN '不及格(0-59)'
                 WHEN score < 70 THEN '及格(60-69)'
                 WHEN score < 80 THEN '中等(70-79)'
                 WHEN score < 90 THEN '良好(80-89)'
                 ELSE '优秀(90-100)'
                 END AS range_label,
             CASE
                 WHEN score < 60 THEN 1
                 WHEN score < 70 THEN 2
                 WHEN score < 80 THEN 3
                 WHEN score < 90 THEN 4
                 ELSE 5
                 END AS range_order,
             COUNT(*) AS count
         FROM \`exam_records\` r
             INNER JOIN \`users\` u ON r.user_id = u.id
         WHERE r.exam_id = ?${classRecordFilter} AND u.role = 'student'
         GROUP BY range_label, range_order
         ORDER BY range_order ASC`,
        hasClassFilter ? [examId, selectedClassId] : [examId]
    );

    // 7. 及格/不及格人数
    const passCount = overview[0]?.pass_count || 0;
    const failCount = (overview[0]?.attempt_count || 0) - passCount;

    return {
        exam,
        overview: overview[0] || { attempt_count: 0, participant_count: 0, avg_score: 0, max_score: 0, min_score: 0, avg_accuracy: 0, pass_count: 0, pass_rate: 0 },
        questionStats,
        studentResults,
        selectedClassId: hasClassFilter ? selectedClassId : null,
        scoreDistribution,
        passFail: { pass: passCount, fail: failCount },
    };
};

// 单题详情：某试卷某道题，每个学生的作答情况
const getQuestionStudentDetail = async (examId, questionId) => {
    // 题目基本信息
    const [questionRows] = await pool.query(
        `SELECT eq.question_id, eq.sort_order,
                q.题目 AS question_text, q.题型 AS question_type, q.选项 AS options,
                q.答案 AS correct_answer, q.解析 AS analysis
         FROM \`exam_questions\` eq
                  LEFT JOIN ${QT_TABLE} q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE eq.exam_id = ? AND eq.question_id = ?`,
        [examId, questionId]
    );
    if (questionRows.length === 0) return null;
    const question = questionRows[0];

    // 每个学生对该题的作答
    const [answers] = await pool.query(
        `SELECT a.id AS answer_id, a.user_answer, a.correct_answer, a.is_correct, a.is_objective,
                a.question_type,
                r.id AS record_id, r.user_id, u.username, u.nickname, u.college,
                c.name AS class_name,
                r.score, r.accuracy, r.submitted_at
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
                  INNER JOIN \`users\` u ON r.user_id = u.id
                  LEFT JOIN \`student_classes\` sc ON sc.student_id = u.id
                  LEFT JOIN \`classes\` c ON c.id = sc.class_id
         WHERE r.exam_id = ? AND a.question_id = ? AND u.role = 'student'
         ORDER BY c.name ASC, u.id ASC`,
        [examId, questionId]
    );

    // 统计汇总
    const summary = {
        total: answers.length,
        correct: answers.filter(a => a.is_correct === 1).length,
        wrong: answers.filter(a => a.is_correct === 0).length,
        skipped: answers.filter(a => a.is_correct === 2).length,
        accuracy: answers.length > 0
            ? Math.round(answers.filter(a => a.is_correct === 1).length * 100 / answers.length * 100) / 100
            : 0,
    };

    return { question, answers, summary };
};

// AI 助手：查询用户最近 N 天错题明细
const findRecentWrongAnswers = async (userId, { days = 30, limit = 50 } = {}) => {
    const [rows] = await pool.query(
        `SELECT COALESCE(eq.snapshot_题目, q.题目) AS title,
                COALESCE(eq.snapshot_知识点, q.知识点) AS knowledge_point,
                COALESCE(eq.snapshot_难度, q.难度) AS difficulty,
                a.user_answer AS user_answer, a.correct_answer AS correct_answer
         FROM \`exam_answers\` a
                  INNER JOIN \`exam_records\` r ON a.record_id = r.id
                  LEFT JOIN ${QT_TABLE} q ON a.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
         WHERE r.user_id = ? AND a.is_correct = 0
           AND r.submitted_at >= NOW() - INTERVAL ? DAY
         ORDER BY r.submitted_at DESC
             LIMIT ?`,
        [userId, Number(days), Number(limit)]
    );
    return rows;
};

module.exports = {
    randomPick,
    findRuleExamCandidates,
    createExam,
    countExamRecords,
    updateExam,
    updateExamStatus,
    removeExam,
    findExamsByUser,
    findExamsByScope,
    findExamIdsByUser,
    findExamById,
    findQuestionsByIds,
    findAnswerRecord,
    listSubjectiveReviewAnswers,
    countWrongQuestions,
    findWrongQuestions,
    findWrongQuestionIds,
    randomPickByIds,
    createRecord,
    findRecordsByUser,
    findRecordById,
    findLatestAttempt,
    startOrResumeAttempt,
    markAttemptSubmitted,
    countSubmittedAttempts,
    getStatistics,
    findDraft,
    saveDraft,
    deleteDraft,
    findRecordsByRole,
    findRecordsByScope,
    findAllRecordsWithUser,
    findUsersWithRecords,
    findRecordsByUserId,
    getUserStatistics,
    findUserById,
    getExamAnalytics,
    getQuestionStudentDetail,
    findRecentWrongAnswers,
    OBJECTIVE_TYPES,
    ensureReviewColumns,
    reviewAnswer,
    findExamClassIds,
    addExamClasses,
    replaceExamClasses,
    isExamVisibleToStudentClasses,
};
