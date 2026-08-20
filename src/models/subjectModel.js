const pool = require('../config/db');

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const list = async ({ includeInactive = false, hasQuestions = false } = {}) => {
    const [rows] = await pool.query(
        `SELECT s.id, s.name, s.status, s.created_by AS createdBy, s.created_at AS createdAt,
                COUNT(q.id) AS questionCount
         FROM subjects s LEFT JOIN \`题库1\` q
           ON CONVERT(q.\`科目\` USING utf8mb4) COLLATE utf8mb4_unicode_ci = s.name
         WHERE ${includeInactive ? '1=1' : 's.status = 1'}
         GROUP BY s.id, s.name, s.status, s.created_by, s.created_at
         ${hasQuestions ? 'HAVING COUNT(q.id) > 0' : ''} ORDER BY s.name`
    );
    return rows;
};

const listKnowledgePoints = async (subjectName, chapters = []) => {
    const conditions = ['`科目` = ?', "`知识点` IS NOT NULL", "TRIM(`知识点`) <> ''"];
    const params = [normalizeName(subjectName)];
    const normalized = chapters.map(Number).filter(Number.isInteger);
    if (normalized.length) { conditions.push(`\`章节\` IN (${normalized.map(() => '?').join(',')})`); params.push(...normalized); }
    const [rows] = await pool.query(`SELECT \`知识点\` name, COUNT(*) questionCount FROM \`题库1\` WHERE ${conditions.join(' AND ')} GROUP BY \`知识点\` ORDER BY questionCount DESC, name`, params);
    return rows.map(row => ({ name: row.name, questionCount: Number(row.questionCount) }));
};

const findByName = async (name) => {
    const [rows] = await pool.query('SELECT * FROM subjects WHERE name = ?', [normalizeName(name)]);
    return rows[0] || null;
};

const create = async (name, createdBy = null) => {
    const normalized = normalizeName(name);
    await pool.query(
        `INSERT INTO subjects (name, created_by, status) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE status = 1`,
        [normalized, createdBy]
    );
    return findByName(normalized);
};

const ensureMany = async (names, createdBy = null) => {
    const unique = [...new Set((Array.isArray(names) ? names : []).map(normalizeName).filter(Boolean))];
    for (const name of unique) await create(name, createdBy);
    return unique;
};

const listChapters = async (subjectName) => {
    const [rows] = await pool.query(
        `SELECT sc.chapter_no AS chapterNo, sc.title, COUNT(q.id) AS questionCount
         FROM subjects s
         INNER JOIN subject_chapters sc ON sc.subject_id = s.id
         LEFT JOIN \`题库1\` q ON CONVERT(q.\`科目\` USING utf8mb4) COLLATE utf8mb4_unicode_ci = s.name
                                    AND q.\`章节\` = sc.chapter_no
         WHERE s.name = ? AND s.status = 1
         GROUP BY sc.id, sc.chapter_no, sc.title, sc.sort_order
         ORDER BY sc.sort_order, sc.chapter_no`,
        [normalizeName(subjectName)]
    );
    return rows.map((row) => ({ ...row, chapterNo: Number(row.chapterNo), questionCount: Number(row.questionCount) }));
};

const ensureDefaultChapter = async (subjectName) => {
    const subject = await findByName(subjectName);
    if (!subject) return;
    await pool.query(
        `INSERT IGNORE INTO subject_chapters (subject_id, chapter_no, title, sort_order)
         VALUES (?, 1, '第一章', 1)`,
        [subject.id]
    );
};

module.exports = { normalizeName, list, findByName, create, ensureMany, listChapters, listKnowledgePoints, ensureDefaultChapter };
