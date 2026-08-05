const pool = require('../config/db');

const TABLE = '`题库1`';

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE} (id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.id, data.章节, data.题型, data.序号, data.题目, data.选项, data.答案, data.解析, data.难度, data.知识点, data.使用频度, data.出题人]
    );
    return result;
};

const findAll = async ({ page = 1, pageSize = 20, id, 章节, 题型, 难度, 关键词, 出题人 } = {}) => {
    const conditions = [];
    const params = [];

    if (id !== undefined && id !== '' && id !== null) {
        conditions.push('id LIKE ?');
        params.push(`%${id}%`);
    }
    if (章节 !== undefined && 章节 !== '' && 章节 !== null) {
        conditions.push('章节 = ?');
        params.push(章节);
    }
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
    if (出题人 !== undefined && 出题人 !== '' && 出题人 !== null) {
        conditions.push('出题人 LIKE ?');
        params.push(`%${出题人}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

const findById = async (id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const update = async (id, data) => {
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

    params.push(id);
    const [result] = await pool.query(
        `UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ?`,
        params
    );
    return result;
};

const remove = async (id) => {
    const [result] = await pool.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return result;
};

// 批量新增（事务）—— 已存在 id 跳过，不抛错
const batchCreate = async (items) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const placeholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const placeholders = items.map(() => placeholder).join(', ');
        const values = [];
        for (const data of items) {
            values.push(
                data.id, data.章节, data.题型, data.序号, data.题目, data.选项,
                data.答案, data.解析, data.难度, data.知识点, data.使用频率, data.出题人
            );
        }

        // INSERT IGNORE：遇到重复 id 自动跳过而非报错
        const [result] = await conn.query(
            `INSERT IGNORE INTO ${TABLE} (id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人) VALUES ${placeholders}`,
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

// 批量删除（按 id 数组）
const batchRemove = async (ids) => {
    if (!ids || ids.length === 0) return { affectedRows: 0 };
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.query(
        `DELETE FROM ${TABLE} WHERE id IN (${placeholders})`,
        ids
    );
    return result;
};

const statistics = async () => {
    const [chapterStats] = await pool.query(
        `SELECT 章节, COUNT(*) AS count FROM ${TABLE} GROUP BY 章节 ORDER BY 章节`
    );
    const [typeStats] = await pool.query(
        `SELECT 题型, COUNT(*) AS count FROM ${TABLE} GROUP BY 题型 ORDER BY 题型`
    );
    const [difficultyStats] = await pool.query(
        `SELECT 难度, COUNT(*) AS count FROM ${TABLE} GROUP BY 难度 ORDER BY 难度`
    );
    const [creatorStats] = await pool.query(
        `SELECT 出题人, COUNT(*) AS count FROM ${TABLE} WHERE 出题人 IS NOT NULL AND 出题人 != '' GROUP BY 出题人 ORDER BY count DESC LIMIT 10`
    );
    const [totalResult] = await pool.query(`SELECT COUNT(*) AS total FROM ${TABLE}`);
    const total = totalResult[0].total;

    return {
        total,
        byChapter: chapterStats,
        byType: typeStats,
        byDifficulty: difficultyStats,
        byCreator: creatorStats,
    };
};

const searchByKeyword = async (keyword) => {
    const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE 题目 LIKE ? OR 选项 LIKE ? OR 知识点 LIKE ? OR 解析 LIKE ? ORDER BY id DESC`,
        [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
    );
    return rows;
};

module.exports = {
    create,
    findAll,
    findById,
    update,
    remove,
    batchCreate,
    batchRemove,
    statistics,
    searchByKeyword,
};