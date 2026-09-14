/**
 * 迁移脚本：将题库统一为「计算机导论」课程
 * 1. 删除不在全2.sql中的题目
 * 2. 导入全2.sql中新增的题目
 * 3. 所有题目科目统一为「计算机导论」
 * 4. 创建科目和章节定义
 * 5. 更新教师所教科目
 */
const fs = require('fs');
const pool = require('./src/config/db');

const CHAPTER_NAMES = {
    1: '计算思维基础',
    2: '计算机系统基础',
    3: 'Python程序设计',
    4: '算法与问题求解',
    5: '数字素养与数字化思维',
    6: '人工智能概述',
    7: '人工智能典型应用',
    8: '人工智能关键技术',
    9: '大模型应用',
};

const SUBJECT_NAME = '计算机导论';

function parseSqlFile(content) {
    const regex = /'(\d{5})',(\d),(\d),(\d),'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'\s*,\s*'((?:[^'\\]|\\.|'')*)'/g;

    const questions = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        questions.push({
            id: match[1],
            chapter: parseInt(match[2]),
            type: parseInt(match[3]),
            seq: parseInt(match[4]),
            title: match[5].replace(/\\'/g, "'").replace(/''/g, "'"),
            options: match[6].replace(/\\'/g, "'").replace(/''/g, "'"),
            answer: match[7].replace(/\\'/g, "'").replace(/''/g, "'"),
            analysis: match[8].replace(/\\'/g, "'").replace(/''/g, "'"),
            difficulty: match[9].replace(/\\'/g, "'").replace(/''/g, "'"),
            knowledge: match[10].replace(/\\'/g, "'").replace(/''/g, "'"),
            usage: match[11].replace(/\\'/g, "'").replace(/''/g, "'").replace(/\r/g, ''),
            creator: match[12].replace(/\\'/g, "'").replace(/''/g, "'").replace(/\r/g, ''),
        });
    }
    return questions;
}

async function migrate() {
    const content = fs.readFileSync('全2.sql', 'utf8');
    const sqlQuestions = parseSqlFile(content);
    console.log(`全2.sql 解析到 ${sqlQuestions.length} 道题`);

    const sqlIds = new Set(sqlQuestions.map(q => q.id));

    // 1. 获取数据库现有题目ID
    const [dbRows] = await pool.query('SELECT id FROM `题库1`');
    const dbIds = new Set(dbRows.map(r => r.id));
    const toDelete = [...dbIds].filter(id => !sqlIds.has(id));
    const toImport = sqlQuestions.filter(q => !dbIds.has(q.id));
    console.log(`数据库现有 ${dbIds.size} 道题`);
    console.log(`需删除 ${toDelete.length} 道题（不在全2.sql中）`);
    console.log(`需导入 ${toImport.length} 道题（全2.sql中有，数据库没有）`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 2. 删除不在全2.sql中的题目
        if (toDelete.length > 0) {
            const placeholders = toDelete.map(() => '?').join(',');
            const [delResult] = await conn.query(
                `DELETE FROM \`题库1\` WHERE id IN (${placeholders})`,
                toDelete
            );
            console.log(`✅ 已删除 ${delResult.affectedRows} 道题`);
        }

        // 3. 导入新题目
        if (toImport.length > 0) {
            for (const q of toImport) {
                await conn.query(
                    `INSERT INTO \`题库1\` (id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人, 科目)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [q.id, q.chapter, q.type, q.seq, q.title, q.options, q.answer,
                     q.analysis, q.difficulty, q.knowledge, q.usage, q.creator, SUBJECT_NAME]
                );
            }
            console.log(`✅ 已导入 ${toImport.length} 道新题`);
        }

        // 4. 统一所有题目的科目为「计算机导论」
        const [updateResult] = await conn.query(
            `UPDATE \`题库1\` SET \`科目\` = ?`,
            [SUBJECT_NAME]
        );
        console.log(`✅ 已将 ${updateResult.affectedRows} 道题的科目统一为「${SUBJECT_NAME}」`);

        // 5. 创建科目
        await conn.query(
            `INSERT INTO subjects (name, status, created_by) VALUES (?, 1, NULL)
             ON DUPLICATE KEY UPDATE status = 1, name = ?`,
            [SUBJECT_NAME, SUBJECT_NAME]
        );
        const [subjectRows] = await conn.query('SELECT id FROM subjects WHERE name = ?', [SUBJECT_NAME]);
        const subjectId = subjectRows[0].id;
        console.log(`✅ 科目「${SUBJECT_NAME}」已创建/确认，id=${subjectId}`);

        // 6. 创建章节定义（先清除旧的，再插入新的）
        await conn.query('DELETE FROM subject_chapters WHERE subject_id = ?', [subjectId]);
        for (let ch = 1; ch <= 9; ch++) {
            await conn.query(
                `INSERT INTO subject_chapters (subject_id, chapter_no, title, sort_order)
                 VALUES (?, ?, ?, ?)`,
                [subjectId, ch, CHAPTER_NAMES[ch], ch]
            );
        }
        console.log(`✅ 已创建 ${Object.keys(CHAPTER_NAMES).length} 个章节定义`);

        // 7. 更新所有教师的所教科目为「计算机导论」
        const [teachers] = await conn.query('SELECT DISTINCT user_id FROM teacher_subjects');
        await conn.query('DELETE FROM teacher_subjects');
        for (const t of teachers) {
            await conn.query(
                'INSERT INTO teacher_subjects (user_id, subject) VALUES (?, ?)',
                [t.user_id, SUBJECT_NAME]
            );
        }
        console.log(`✅ 已更新 ${teachers.length} 位教师的所教科目为「${SUBJECT_NAME}」`);

        // 8. 验证最终状态
        const [finalCount] = await conn.query('SELECT COUNT(*) AS total FROM `题库1`');
        const [chapterStats] = await conn.query(
            'SELECT `章节`, COUNT(*) AS cnt FROM `题库1` GROUP BY `章节` ORDER BY `章节`'
        );
        const [subjectCheck] = await conn.query(
            "SELECT `科目`, COUNT(*) AS cnt FROM `题库1` GROUP BY `科目`"
        );

        console.log('\n📊 最终状态:');
        console.log(`  题目总数: ${finalCount[0].total}`);
        console.log(`  科目分布: ${subjectCheck.map(s => `${s.科目}(${s.cnt})`).join(', ')}`);
        console.log(`  章节分布:`);
        for (const ch of chapterStats) {
            console.log(`    第${ch.章节}章 ${CHAPTER_NAMES[ch.章节] || '?'}: ${ch.cnt}题`);
        }

        await conn.commit();
        console.log('\n🎉 迁移完成！');
    } catch (err) {
        await conn.rollback();
        console.error('❌ 迁移失败，已回滚:', err.message);
        throw err;
    } finally {
        conn.release();
        process.exit(0);
    }
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
