const pool = require('../config/db');

const TABLE = '`student_questions`';

const ALLOWED_UPDATE_FIELDS = ['章节', '题型', '序号', '题目', '选项', '答案', '解析', '难度', '知识点', '科目'];

const buildPagedResult = async (
    conditions,
    params,
    page,
    pageSize,
    from = '`student_questions` sq',
    select = 'sq.*'
) => {
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${from} ${where}`, params);
    const total = countRows[0].total;
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
        `SELECT ${select} FROM ${from} ${where} ORDER BY sq.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    );
    return { rows, total };
};

const findByOwner = async (ownerId, options = {}) => {
    const { page = 1, pageSize = 20, status = '', keyword = '', subject = '', 题型 = '' } = options;
    const conditions = ['owner_id = ?'];
    const params = [ownerId];
    if (status && status !== 'all') {
        conditions.push('review_status = ?');
        params.push(status);
    }
    if (keyword) {
        conditions.push('(题目 LIKE ? OR 知识点 LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw);
    }
    if (subject) {
        conditions.push('科目 = ?');
        params.push(subject);
    }
    if (题型) {
        conditions.push('题型 = ?');
        params.push(Number(题型));
    }
    return buildPagedResult(conditions, params, page, pageSize);
};

const findCommunity = async (college, options = {}) => {
    if (!college) return { rows: [], total: 0 };
    const { page = 1, pageSize = 20, keyword = '', subject = '', 题型 = '' } = options;
    const conditions = ['sq.review_status = ?', 'sq.is_public = 1', 'sq.college = ?'];
    const params = ['approved', 1, college];
    if (keyword) {
        conditions.push('(sq.`题目` LIKE ? OR sq.`知识点` LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw);
    }
    if (subject) {
        conditions.push('sq.`科目` = ?');
        params.push(subject);
    }
    if (题型) {
        conditions.push('sq.`题型` = ?');
        params.push(Number(题型));
    }
    return buildPagedResult(
        conditions,
        params,
        page,
        pageSize,
        '`student_questions` sq LEFT JOIN `users` u ON u.id = sq.owner_id',
        'sq.*, u.username AS owner_username, u.nickname AS owner_nickname'
    );
};

const findPending = async (college, options = {}) => {
    if (!college) return { rows: [], total: 0 };
    const { page = 1, pageSize = 20, keyword = '' } = options;
    const conditions = ['sq.review_status = ?', 'sq.college = ?'];
    const params = ['pending', college];
    if (keyword) {
        conditions.push('(sq.`题目` LIKE ? OR sq.`知识点` LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw);
    }
    return buildPagedResult(
        conditions,
        params,
        page,
        pageSize,
        '`student_questions` sq LEFT JOIN `users` u ON u.id = sq.owner_id',
        'sq.*, u.username AS owner_username, u.nickname AS owner_nickname'
    );
};

const findAllAdmin = async (options = {}) => {
    const { page = 1, pageSize = 20, status = '', college = '', keyword = '', subject = '', 题型 = '' } = options;
    const conditions = [];
    const params = [];
    if (status && status !== 'all') {
        conditions.push('sq.review_status = ?');
        params.push(status);
    }
    if (college) {
        conditions.push('sq.college = ?');
        params.push(college);
    }
    if (keyword) {
        conditions.push('(sq.`题目` LIKE ? OR sq.`知识点` LIKE ?)');
        const kw = `%${keyword}%`;
        params.push(kw, kw);
    }
    if (subject) {
        conditions.push('sq.`科目` = ?');
        params.push(subject);
    }
    if (题型) {
        conditions.push('sq.`题型` = ?');
        params.push(Number(题型));
    }
    return buildPagedResult(
        conditions,
        params,
        page,
        pageSize,
        '`student_questions` sq LEFT JOIN `users` u ON u.id = sq.owner_id',
        'sq.*, u.username AS owner_username, u.nickname AS owner_nickname'
    );
};

const findById = async (id) => {
    const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] || null;
};

const create = async (data) => {
    const [result] = await pool.query(
        `INSERT INTO ${TABLE}
            (owner_id, college, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 科目, source, is_public, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.owner_id,
            data.college ?? null,
            Number(data.章节) || 0,
            Number(data.题型) || 2,
            Number(data.序号) || 0,
            String(data.题目 || '').trim(),
            data.选项 != null ? String(data.选项) : '',
            data.答案 != null ? String(data.答案) : '',
            data.解析 != null ? String(data.解析) : '',
            data.难度 != null ? String(data.难度) : '',
            data.知识点 != null ? String(data.知识点) : '',
            data.科目 != null && String(data.科目).trim() !== '' ? String(data.科目).trim() : null,
            data.source || 'manual',
            data.is_public ? 1 : 0,
            data.review_status || 'private',
        ]
    );
    return result;
};

const update = async (id, data) => {
    const fields = [];
    const params = [];
    for (const field of ALLOWED_UPDATE_FIELDS) {
        if (data[field] !== undefined) {
            fields.push(`${field} = ?`);
            params.push(data[field]);
        }
    }
    if (fields.length === 0) return { affectedRows: 0 };
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

const submitForShare = async (id, ownerId) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE}
         SET is_public = 1, review_status = 'pending', reject_reason = NULL, reviewed_by = NULL, reviewed_at = NULL
         WHERE id = ? AND owner_id = ?`,
        [id, ownerId]
    );
    return result;
};

const resetToPending = async (id) => {
    const [result] = await pool.query(
        `UPDATE ${TABLE}
         SET review_status = 'pending', reject_reason = NULL, reviewed_by = NULL, reviewed_at = NULL
         WHERE id = ?`,
        [id]
    );
    return result;
};

const review = async (id, { reviewerId, action, reason }) => {
    const status = action === 'reject' ? 'rejected' : 'approved';
    const [result] = await pool.query(
        `UPDATE ${TABLE}
         SET review_status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [status, action === 'reject' ? (reason || '未通过审核') : null, reviewerId, id]
    );
    return result;
};

module.exports = {
    findByOwner,
    findCommunity,
    findPending,
    findAllAdmin,
    findById,
    create,
    update,
    remove,
    submitForShare,
    resetToPending,
    review,
};
