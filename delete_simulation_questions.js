// 删除带 SIM 标记的模拟测试题
// 用法：node delete_simulation_questions.js
const pool = require('./src/config/db');

const main = async () => {
    const [result] = await pool.query(
        `DELETE FROM \`题库1\` WHERE id LIKE 'SIM%' OR 出题人 = '模拟测试'`
    );
    console.log(`✅ 已删除 ${result.affectedRows} 道模拟测试题`);
    await pool.end();
};

main().catch((err) => {
    console.error('❌ 删除失败:', err.message);
    process.exitCode = 1;
});
