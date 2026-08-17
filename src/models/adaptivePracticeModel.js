const pool = require('../config/db');

const QT_TABLE = '`题库1`';
const OBJECTIVE_TYPES = [1, 2, 3, 4, 5, 6];
// 支持所有题型：判断 单选 多选 填空 简答 程序
const ALL_TYPES = [1, 2, 3, 4, 5, 6];

const normalizeDifficultySql = `CASE
    WHEN q.难度 REGEXP '^[1-5]$' THEN CAST(q.难度 AS UNSIGNED)
    WHEN q.难度 = '简单' THEN 2
    WHEN q.难度 = '中等' THEN 3
    WHEN q.难度 = '困难' THEN 5
    ELSE NULL END`;

const ensureTables = async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS adaptive_practice_sessions (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        chapters VARCHAR(100) DEFAULT NULL,
        knowledge_keyword VARCHAR(200) DEFAULT NULL,
        question_types VARCHAR(50) NOT NULL DEFAULT '1,2,3,4',
        planned_count INT NOT NULL DEFAULT 10,
        initial_difficulty TINYINT NOT NULL DEFAULT 1,
        current_difficulty TINYINT NOT NULL DEFAULT 1,
        answered_count INT NOT NULL DEFAULT 0,
        correct_count INT NOT NULL DEFAULT 0,
        adjustment_signal VARCHAR(10) NOT NULL DEFAULT '',
        cooldown_remaining INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id), KEY idx_adaptive_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS adaptive_practice_answers (
        id INT NOT NULL AUTO_INCREMENT,
        session_id INT NOT NULL,
        sequence_no INT NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        question_type INT NOT NULL,
        question_difficulty TINYINT NOT NULL,
        knowledge_point VARCHAR(500) DEFAULT NULL,
        user_answer TEXT,
        correct_answer VARCHAR(500) DEFAULT NULL,
        is_correct TINYINT NOT NULL,
        difficulty_before TINYINT NOT NULL,
        difficulty_after TINYINT NOT NULL,
        adjustment_message VARCHAR(500) DEFAULT NULL,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), UNIQUE KEY uk_session_sequence (session_id, sequence_no),
        UNIQUE KEY uk_session_question (session_id, question_id), KEY idx_adaptive_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

const filters = ({ chapters = [], questionTypes = ALL_TYPES, knowledgeKeyword = '', difficulty } = {}, alias = 'q') => {
    const conditions = [`${alias}.题型 IN (${questionTypes.map(() => '?').join(',')})`];
    const params = [...questionTypes];
    if (chapters.length) {
        conditions.push(`${alias}.章节 IN (${chapters.map(() => '?').join(',')})`);
        params.push(...chapters);
    }
    if (knowledgeKeyword) {
        conditions.push(`${alias}.知识点 LIKE ?`);
        params.push(`%${knowledgeKeyword}%`);
    }
    if (difficulty) {
        conditions.push(`${normalizeDifficultySql.replaceAll('q.', `${alias}.`)} = ?`);
        params.push(Number(difficulty));
    }
    conditions.push(`${normalizeDifficultySql.replaceAll('q.', `${alias}.`)} IS NOT NULL`);
    return { where: conditions.join(' AND '), params };
};

const getInventory = async (options) => {
    const f = filters(options);
    const [rows] = await pool.query(
        `SELECT q.章节 chapter, q.题型 questionType, ${normalizeDifficultySql} difficulty,
                q.知识点 knowledgePoint, COUNT(*) total
         FROM ${QT_TABLE} q WHERE ${f.where}
         GROUP BY q.章节, q.题型, difficulty, q.知识点
         ORDER BY q.章节, q.题型, difficulty, q.知识点`, f.params
    );
    return rows;
};

const getChapterInventory = async ({ chapters = [], questionTypes = OBJECTIVE_TYPES } = {}) => {
    const f = filters({ chapters, questionTypes });
    const [rows] = await pool.query(
        `SELECT q.章节 chapter, ${normalizeDifficultySql} difficulty, q.题型 questionType, COUNT(*) total
         FROM ${QT_TABLE} q WHERE ${f.where} GROUP BY q.章节, difficulty, q.题型 ORDER BY q.章节, difficulty`, f.params
    );
    return rows;
};

const getOverview = async () => {
    await ensureTables();
    const [users] = await pool.query(
        `SELECT u.id userId, u.username, u.nickname, c.id classId, COALESCE(c.name, '未分班') className,
          COUNT(CASE WHEN s.answered_count > 0 THEN s.id END) sessionCount,
          COALESCE(SUM(s.answered_count),0) answeredCount,
          COALESCE(SUM(s.correct_count),0) correctCount,
          COALESCE(ROUND(SUM(s.correct_count)*100/NULLIF(SUM(s.answered_count),0),2),0) accuracy,
          COALESCE(MAX(s.current_difficulty),1) highestDifficulty,
          MAX(CASE WHEN s.answered_count > 0 THEN s.updated_at END) lastPracticeAt
         FROM users u LEFT JOIN adaptive_practice_sessions s ON s.user_id=u.id
         LEFT JOIN classes c ON c.id=u.class_id
         WHERE u.role='student' GROUP BY u.id, u.username, u.nickname, c.id, c.name ORDER BY className, lastPracticeAt DESC, u.id`
    );
    const [sessions] = await pool.query(
        `SELECT s.*, u.username, u.nickname, c.id classId, COALESCE(c.name, '未分班') className
         FROM adaptive_practice_sessions s INNER JOIN users u ON u.id=s.user_id
         LEFT JOIN classes c ON c.id=u.class_id
         WHERE s.answered_count > 0 ORDER BY s.updated_at DESC LIMIT 100`
    );
    const [classes] = await pool.query(`SELECT c.id,c.name,COUNT(DISTINCT sc.student_id) studentCount
        FROM classes c LEFT JOIN student_classes sc ON sc.class_id=c.id GROUP BY c.id,c.name ORDER BY c.name`);
    return { users, recentSessions: sessions, classes };
};

const getStudentProgress = async (userId) => {
    await ensureTables();
    const [summaryRows] = await pool.query(
        `SELECT COUNT(*) sessionCount, COALESCE(SUM(answered_count),0) answeredCount,
          COALESCE(SUM(correct_count),0) correctCount,
          COALESCE(ROUND(SUM(correct_count)*100/NULLIF(SUM(answered_count),0),2),0) accuracy,
          COALESCE(MAX(current_difficulty),1) highestDifficulty,
          MAX(updated_at) lastPracticeAt
         FROM adaptive_practice_sessions WHERE user_id=? AND answered_count>0`, [userId]
    );
    const [sessions] = await pool.query(
        `SELECT s.*, COALESCE(ROUND(s.correct_count*100/NULLIF(s.answered_count,0),2),0) accuracy
         FROM adaptive_practice_sessions s WHERE s.user_id=? AND s.answered_count>0
         ORDER BY s.updated_at DESC LIMIT 50`, [userId]
    );
    const [difficulty] = await pool.query(
        `SELECT question_difficulty difficulty, COUNT(*) answeredCount,
          SUM(is_correct=1) correctCount,
          ROUND(SUM(is_correct=1)*100/COUNT(*),2) accuracy
         FROM adaptive_practice_answers a INNER JOIN adaptive_practice_sessions s ON s.id=a.session_id
         WHERE s.user_id=? GROUP BY question_difficulty ORDER BY question_difficulty`, [userId]
    );
    const [knowledge] = await pool.query(
        `SELECT COALESCE(NULLIF(knowledge_point,''),'未标注知识点') knowledgePoint, COUNT(*) answeredCount,
          SUM(is_correct=1) correctCount, ROUND(SUM(is_correct=1)*100/COUNT(*),2) accuracy
         FROM adaptive_practice_answers a INNER JOIN adaptive_practice_sessions s ON s.id=a.session_id
         WHERE s.user_id=? GROUP BY knowledgePoint ORDER BY accuracy ASC, answeredCount DESC LIMIT 12`, [userId]
    );
    return { summary: summaryRows[0], sessions, byDifficulty: difficulty, byKnowledge: knowledge };
};

const createSession = async ({ userId, chapters, knowledgeKeyword, questionTypes, plannedCount }) => {
    await ensureTables();
    const [result] = await pool.query(
        `INSERT INTO adaptive_practice_sessions
         (user_id, chapters, knowledge_keyword, question_types, planned_count, initial_difficulty, current_difficulty)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [userId, chapters.join(','), knowledgeKeyword || null, questionTypes.join(','), plannedCount]
    );
    return findSession(result.insertId, userId);
};

const findSession = async (id, userId) => {
    await ensureTables();
    const [rows] = await pool.query(
        'SELECT * FROM adaptive_practice_sessions WHERE id = ? AND user_id = ?', [id, userId]
    );
    return rows[0] || null;
};

const findAnswers = async (sessionId) => {
    const [rows] = await pool.query(
        'SELECT * FROM adaptive_practice_answers WHERE session_id = ? ORDER BY sequence_no', [sessionId]
    );
    return rows;
};

const findNextQuestion = async (session) => {
    const base = {
        chapters: String(session.chapters || '').split(',').filter(Boolean).map(Number),
        questionTypes: String(session.question_types).split(',').map(Number).filter(t => ALL_TYPES.includes(t)),
        knowledgeKeyword: session.knowledge_keyword || '',
    };
    const selectedTypes = base.questionTypes.length > 0 ? base.questionTypes : ALL_TYPES;
    // 题型轮转：主动覆盖用户选择的题型（按 answered_count 轮询）
    const preferredType = selectedTypes[Number(session.answered_count) % selectedTypes.length];
    const attempts = [
        // 1) 首选：当前难度 + 当前首选题型
        { ...base, questionTypes: [preferredType], difficulty: session.current_difficulty, fallback: '' },
        // 2) 同题型相邻难度兜底（难度没有对应题型时，先 ±1、再 ±2 ...）
        ...[1, 2, 3, 4].flatMap((distance) => [session.current_difficulty - distance, session.current_difficulty + distance])
            .filter((value) => value >= 1 && value <= 5)
            .map((difficulty) => ({ ...base, questionTypes: [preferredType], difficulty,
                fallback: `当前题型没有未做过的 ${session.current_difficulty} 级题，暂时使用 ${difficulty} 级同题型题目。` })),
        // 3) 用户全部已选题型 + 当前难度（题型轮转不动时用整个题型池兜底）
        { ...base, questionTypes: selectedTypes, difficulty: session.current_difficulty, fallback: '' },
        // 4) 全部题型 + 当前难度相邻
        ...[1, 2, 3, 4].flatMap((distance) => [session.current_difficulty - distance, session.current_difficulty + distance])
            .filter((value) => value >= 1 && value <= 5)
            .map((difficulty) => ({ ...base, questionTypes: selectedTypes, difficulty,
                fallback: `当前知识点没有未做过的 ${session.current_difficulty} 级题，暂时使用 ${difficulty} 级题。` })),
        // 5) 去掉知识点关键字限制，全部题型
        { ...base, questionTypes: selectedTypes, knowledgeKeyword: '', difficulty: session.current_difficulty,
            fallback: `当前知识点已没有合适题目，暂时改为同一章节的其他知识点。` },
    ];
    for (const attempt of attempts) {
        const f = filters(attempt);
        const [rows] = await pool.query(
            `SELECT q.*, ${normalizeDifficultySql} normalizedDifficulty
             FROM ${QT_TABLE} q
             WHERE ${f.where}
               AND NOT EXISTS (SELECT 1 FROM adaptive_practice_answers a WHERE a.session_id = ?
                 AND a.question_id COLLATE utf8mb4_0900_ai_ci = q.id COLLATE utf8mb4_0900_ai_ci)
             ORDER BY CAST(COALESCE(NULLIF(q.使用频度, ''), '0') AS UNSIGNED), RAND() LIMIT 1`,
            [...f.params, session.id]
        );
        if (rows.length) return { question: rows[0], fallbackMessage: attempt.fallback };
    }
    return null;
};

const findEligibleQuestionById = async (session, questionId) => {
    const options = {
        chapters: String(session.chapters || '').split(',').filter(Boolean).map(Number),
        questionTypes: String(session.question_types).split(',').map(Number),
        knowledgeKeyword: session.knowledge_keyword || '',
    };
    const f = filters(options);
    const [rows] = await pool.query(
        `SELECT q.*, ${normalizeDifficultySql} normalizedDifficulty FROM ${QT_TABLE} q
         WHERE q.id = ? AND ${f.where}
           AND NOT EXISTS (SELECT 1 FROM adaptive_practice_answers a WHERE a.session_id = ?
             AND a.question_id COLLATE utf8mb4_0900_ai_ci = q.id COLLATE utf8mb4_0900_ai_ci)
         LIMIT 1`,
        [questionId, ...f.params, session.id]
    );
    return rows[0] || null;
};

const saveAnswerAndState = async ({ session, question, userAnswer, isCorrect, adjustment }) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const sequence = Number(session.answered_count) + 1;
        await conn.query(
            `INSERT INTO adaptive_practice_answers
             (session_id, sequence_no, question_id, question_type, question_difficulty, knowledge_point,
              user_answer, correct_answer, is_correct, difficulty_before, difficulty_after, adjustment_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [session.id, sequence, question.id, question.题型, question.normalizedDifficulty, question.知识点,
                userAnswer, question.答案, isCorrect ? 1 : 0, session.current_difficulty,
                adjustment.difficulty, adjustment.message]
        );
        const complete = sequence >= session.planned_count;
        await conn.query(
            `UPDATE adaptive_practice_sessions SET current_difficulty = ?, answered_count = ?,
             correct_count = correct_count + ?, adjustment_signal = ?, cooldown_remaining = ?,
             status = ?, completed_at = ${complete ? 'NOW()' : 'NULL'} WHERE id = ?`,
            [adjustment.difficulty, sequence, isCorrect ? 1 : 0, adjustment.signal,
                adjustment.cooldown, complete ? 'completed' : 'active', session.id]
        );
        await conn.commit();
        return { complete, sequence };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

module.exports = { OBJECTIVE_TYPES, ALL_TYPES, ensureTables, getInventory, getChapterInventory, getOverview, getStudentProgress, createSession, findSession, findAnswers, findNextQuestion, findEligibleQuestionById, saveAnswerAndState };
