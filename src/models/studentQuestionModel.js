const pool = require('../config/db');

const TABLE = '`学生题库`';

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (student_id, question_id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.student_id, data.question_id, data.章节, data.题型, data.序号, data.题目, data.选项, data.答案, data.解析, data.难度, data.知识点, data.使用频度, data.出题人]
    );
    return result;
};

const findByStudent = async ({ student_id, page = 1, pageSize = 20, 题型, 难度, 关键词 } = {}) => {
    const conditions = ['student_id = ?'];
    const params = [student_id];

    if (题型 !== undefined && 题型 !== '' && 题型 !== null) {
        conditions.push('题型 = ?');
        params.push(题型);
    }
    if (难度 !== undefined && 难度 !== '' && 难度 !== null) {
        conditions.push('难度 LIKE ?');
        params.push(`%${难度}%`);
    }
    if (关键词 !== undefined && 关键词 !== '' && 关键词 !== null) {
        conditions.push('(题目 LIKE ? OR 选项 LIKE ? OR 知识点 LIKE ?)');
        const kw = `%${关键词}%`;
        params.push(kw, kw, kw);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countResult] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${TABLE} ${whereClause}`,
        params
    );
    const total = countResult[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );

    return { rows, total };
};

const findById = async (id, student_id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ? AND student_id = ?`, [id, student_id]);
    return rows[0] || null;
};

const findByQuestionId = async (question_id, student_id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE question_id = ? AND student_id = ?`, [question_id, student_id]);
    return rows[0] || null;
};

const findExistingQuestionIds = async (question_ids, student_id) => {
    if (!question_ids || question_ids.length === 0) return [];
    const placeholders = question_ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT question_id FROM ${TABLE} WHERE student_id = ? AND question_id IN (${placeholders})`,
        [student_id, ...question_ids]
    );
    return rows.map((r) => r.question_id);
};

const update = async (id, student_id, data) => {
    const fields = [];
    const params = [];
    const allowedFields = ['章节', '题型', '序号', '题目', '选项', '答案', '解析', '难度', '知识点', '使用频度', '出题人'];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(data[field]);
        }
    }

    if (fields.length === 0) {
        return { affectedRows: 0 };
    }

    params.push(id, student_id);
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ? AND student_id = ?`,
        params
    );
    return result;
};

const remove = async (id, student_id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ? AND student_id = ?`, [id, student_id]);
    return result;
};

const batchCreate = async (items) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const placeholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const placeholders = items.map(() => placeholder).join(', ');
        const values = [];
        for (const data of items) {
            values.push(
                data.student_id, data.question_id, data.章节, data.题型, data.序号,
                data.题目, data.选项, data.答案, data.解析, data.难度,
                data.知识点, data.使用频度, data.出题人
            );
        }

        const [result] = await conn.query(
            `INSERT IGNORE INTO ${TABLE} (student_id, question_id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人) VALUES ${placeholders}`,
            values
        );

        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

const batchRemove = async (ids, student_id) => {
    if (!ids || ids.length === 0) return { affectedRows: 0 };
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.query(
        `DELETE FROM ${TABLE} WHERE student_id = ? AND id IN (${placeholders})`,
        [student_id, ...ids]
    );
    return result;
};

const statistics = async (student_id) => {
    const [chapterStats] = await pool.query(
        `SELECT 章节, COUNT(*) AS count FROM ${TABLE} WHERE student_id = ? GROUP BY 章节 ORDER BY 章节`,
        [student_id]
    );
    const [typeStats] = await pool.query(
        `SELECT 题型, COUNT(*) AS count FROM ${TABLE} WHERE student_id = ? GROUP BY 题型 ORDER BY 题型`,
        [student_id]
    );
    const [difficultyStats] = await pool.query(
        `SELECT 难度, COUNT(*) AS count FROM ${TABLE} WHERE student_id = ? GROUP BY 难度 ORDER BY 难度`,
        [student_id]
    );
    const [totalResult] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE student_id = ?`, [student_id]);
    const total = totalResult[0].total;

    return { total, byChapter: chapterStats, byType: typeStats, byDifficulty: difficultyStats };
};

// 从公共题库（题库1）按 id 查询题目详情
const findPublicQuestionById = async (questionId) => {
    const [rows] = await pool.query(
        `SELECT id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人 FROM \`题库1\` WHERE id = ?`,
        [questionId]
    );
    return rows[0] || null;
};

// 批量从公共题库查询题目
const findPublicQuestionsByIds = async (questionIds) => {
    if (!questionIds || questionIds.length === 0) return [];
    const placeholders = questionIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
        `SELECT id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人 FROM \`题库1\` WHERE id IN (${placeholders})`,
        questionIds
    );
    return rows;
};

module.exports = {
    create,
    findByStudent,
    findById,
    findByQuestionId,
    findExistingQuestionIds,
    update,
    remove,
    batchCreate,
    batchRemove,
    statistics,
    findPublicQuestionById,
    findPublicQuestionsByIds,
};
