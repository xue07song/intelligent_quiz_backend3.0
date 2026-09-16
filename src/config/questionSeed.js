const seed = require('./questionSeed.json');
const fields = ['id', '章节', '题型', '序号', '题目', '选项', '答案', '解析', '难度', '知识点', '科目'];

async function ensureQuestionSeed(pool) {
    if (!Array.isArray(seed.questions) || seed.questions.length !== 364 ||
        new Set(seed.questions.map(q => q.id)).size !== seed.questions.length ||
        seed.questions.some(q => !/^[0-9]{5}$/.test(q.id) || !q.题目 || !q.科目)) {
        throw new Error('随包正式题库数据不完整，停止启动');
    }
    const conn = await pool.getConnection();
    let locked = false;
    try {
        const [lock] = await conn.query("SELECT GET_LOCK('iq_question_seed', 30) acquired");
        if (Number(lock[0].acquired) !== 1) throw new Error('题库初始化锁获取失败');
        locked = true;
        const [answerColumn] = await conn.query("SELECT DATA_TYPE type, CHARACTER_MAXIMUM_LENGTH maxLength FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='题库1' AND COLUMN_NAME='答案'");
        const longestAnswer = Math.max(...seed.questions.map(question => [...String(question.答案 ?? '')].length));
        if (['varchar', 'char'].includes(answerColumn[0]?.type) && Number(answerColumn[0].maxLength) < longestAnswer) {
            // 只扩容，保留原答案；旧 init.sql 的 VARCHAR(255) 容不下正式简答题。
            await conn.query('ALTER TABLE `题库1` MODIFY `答案` TEXT NULL');
        }
        await conn.query(`CREATE TABLE IF NOT EXISTS question_seed_imports (
            seed_version VARCHAR(64) PRIMARY KEY,
            status VARCHAR(20) NOT NULL,
            question_count INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        await conn.beginTransaction();
        // 任一随包种子已经处理过，则不因后续清空题库而重新填回。
        const [imports] = await conn.query('SELECT seed_version FROM question_seed_imports LIMIT 1');
        if (imports.length) { await conn.commit(); return; }
        const [existing] = await conn.query('SELECT id FROM `题库1` LIMIT 1 FOR UPDATE');
        if (existing.length) {
            await conn.query('INSERT INTO question_seed_imports(seed_version,status,question_count) VALUES(?,?,?)', [seed.version, 'skipped-nonempty', 0]);
            await conn.commit();
            console.log('题库已有内容，随包题目未导入，原数据未修改');
            return;
        }
        // 普通 INSERT：任何重复或数据错误都会回滚，绝不 UPDATE/REPLACE 原题。
        const columns = fields.map(field => `\`${field}\``).join(',');
        for (const question of seed.questions) {
            await conn.query(`INSERT INTO \`题库1\` (${columns},\`使用频度\`,\`出题人\`) VALUES (${fields.map(() => '?').join(',')},?,?)`,
                [...fields.map(field => question[field] ?? null), '0', '']);
        }
        await conn.query('INSERT INTO question_seed_imports(seed_version,status,question_count) VALUES(?,?,?)', [seed.version, 'imported', seed.questions.length]);
        await conn.commit();
        console.log(`已导入 ${seed.questions.length} 道随包正式题目（仅补充空题库）`);
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        try { if (locked) await conn.query("SELECT RELEASE_LOCK('iq_question_seed')"); }
        finally { conn.release(); }
    }
}

module.exports = { ensureQuestionSeed };
