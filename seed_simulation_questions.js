// 生成带标记的模拟测试题：14 个学科 x 10 章 x 14 题 = 1960 题
// 用法：node seed_simulation_questions.js
const pool = require('./src/config/db');
const { SUBJECTS } = require('./src/config/subjects');

const pad = (n, width) => String(n).padStart(width, '0');
const TYPE_NAMES = { 1: '判断题', 2: '单选题', 3: '多选题', 4: '填空题', 5: '简答题', 6: '程序论述题' };

// 每学科每章 14 题：确保两名学科教师的单章库存也能满足默认 20 题组卷
const CHAPTER_TYPE_DIFF_PAIRS = [
    [1, 1], [1, 4],
    [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4],
    [3, 1], [3, 3],
    [4, 2], [4, 5],
    [5, 4],
    [6, 2],
];

const OPTIONS = 'A.模拟选项甲 B.模拟选项乙 C.模拟选项丙 D.模拟选项丁';

const makeQuestion = (subjectIndex, chapterIndex, pairIndex) => {
    const subject = SUBJECTS[subjectIndex];
    const [type, difficulty] = CHAPTER_TYPE_DIFF_PAIRS[pairIndex];
    const chapter = chapterIndex + 1;
    const knowledge = `模拟测试-${subject}-知识点${(pairIndex % 5) + 1}`;
    const seq = pairIndex + 1;
    const questionIndex = chapterIndex * CHAPTER_TYPE_DIFF_PAIRS.length + pairIndex;
    const index = subjectIndex * 10 * CHAPTER_TYPE_DIFF_PAIRS.length + questionIndex + 1;
    const typeName = TYPE_NAMES[type];
    const answer = type === 1
        ? (questionIndex % 2 === 0 ? '对' : '错')
        : type === 2
            ? ['A', 'B', 'C', 'D'][questionIndex % 4]
            : type === 3
                ? ['AB', 'ACD', 'BCD', 'ABC'][questionIndex % 4]
                : type === 4
                    ? `模拟填空答案${index}`
                    : `模拟参考答案：本题考查${subject}${knowledge}的核心概念、关键步骤与作答要点。`;

    const stem = type === 4
        ? `【模拟测试-${subject}】第${chapter}章${knowledge}${typeName}第${index}题：请在横线处填写答案。____`
        : `【模拟测试-${subject}】第${chapter}章${knowledge}${typeName}第${index}题：请按要求作答。`;

    return {
        id: `SIM${pad(subjectIndex + 1, 2)}${pad(questionIndex + 1, 3)}`,
        章节: chapter,
        题型: type,
        序号: seq,
        题目: stem,
        选项: type === 2 || type === 3 ? OPTIONS : '',
        答案: answer,
        解析: `模拟解析：本题考查${subject}${knowledge}，模拟答案为：${answer}`,
        难度: String(difficulty),
        知识点: knowledge,
        使用频度: '0',
        出题人: '模拟测试',
        科目: subject,
    };
};

const main = async () => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let inserted = 0;
        for (let subjectIndex = 0; subjectIndex < SUBJECTS.length; subjectIndex += 1) {
            for (let chapterIndex = 0; chapterIndex < 10; chapterIndex += 1) {
                for (let pairIndex = 0; pairIndex < CHAPTER_TYPE_DIFF_PAIRS.length; pairIndex += 1) {
                    const q = makeQuestion(subjectIndex, chapterIndex, pairIndex);
                    const [result] = await conn.query(
                        `INSERT IGNORE INTO \`题库1\`
                         (id, 章节, 题型, 序号, 题目, 选项, 答案, 解析, 难度, 知识点, 使用频度, 出题人, 科目)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [q.id, q.章节, q.题型, q.序号, q.题目, q.选项, q.答案, q.解析, q.难度, q.知识点, q.使用频度, q.出题人, q.科目]
                    );
                    inserted += result.affectedRows;
                }
            }
        }
        await conn.commit();
        console.log(`✅ 模拟测试题写入完成：新增 ${inserted} 道（共 ${SUBJECTS.length * 10 * CHAPTER_TYPE_DIFF_PAIRS.length} 道）`);
        console.log('🏷️  标记：id 前缀 SIM，出题人 = 模拟测试');
        console.log('🗑️  删除：node delete_simulation_questions.js');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
        await pool.end();
    }
};

main().catch((err) => {
    console.error('❌ 模拟题写入失败:', err.message);
    process.exitCode = 1;
});
