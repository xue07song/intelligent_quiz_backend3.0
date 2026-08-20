// 模拟测试数据：新增 sim_ 教师/学生，按 14 个学科建班并随机分班
// 用法：node seed_simulation.js
const pool = require('./src/config/db');
const bcrypt = require('bcryptjs');
const { SUBJECTS } = require('./src/config/subjects');

const PWD = bcrypt.hashSync('123456', 10);
const pad = (n) => String(n).padStart(2, '0');
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const teachers = [
    { username: 'sim_teacher01', nickname: '模拟教师01', major: '数学与应用数学', employee_no: 'SIMT2024001', title: '副教授', subjects: ['高等数学', '线性代数', '概率论与数理统计'] },
    { username: 'sim_teacher02', nickname: '模拟教师02', major: '物理学', employee_no: 'SIMT2024002', title: '讲师', subjects: ['大学物理', '大学英语'] },
    { username: 'sim_teacher03', nickname: '模拟教师03', major: '计算机科学与技术', employee_no: 'SIMT2024003', title: '副教授', subjects: ['数据结构', '操作系统'] },
    { username: 'sim_teacher04', nickname: '模拟教师04', major: '网络工程', employee_no: 'SIMT2024004', title: '讲师', subjects: ['计算机网络', '计算机组成原理'] },
    { username: 'sim_teacher05', nickname: '模拟教师05', major: '软件工程', employee_no: 'SIMT2024005', title: '教授', subjects: ['数据库原理', '软件工程'] },
    { username: 'sim_teacher06', nickname: '模拟教师06', major: '人工智能', employee_no: 'SIMT2024006', title: '副教授', subjects: ['人工智能', '机器学习', '思想政治'] },
];

const studentMajors = ['计算机科学与技术', '软件工程', '人工智能', '数据科学与大数据技术'];
const students = Array.from({ length: 36 }, (_, i) => ({
    username: `sim_student${pad(i + 1)}`,
    nickname: `模拟学生${pad(i + 1)}`,
    major: studentMajors[i % studentMajors.length],
    student_no: `2024${String(i + 1).padStart(3, '0')}`,
}));

const main = async () => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 每个学科建 1 个必修班 + 1 个选修班
        for (const subject of SUBJECTS) {
            await conn.query(
                `INSERT INTO classes (name, grade, college, major, type, remark)
                 VALUES (?, ?, ?, ?, 'compulsory', '模拟测试必修班')
                 ON DUPLICATE KEY UPDATE grade = VALUES(grade), college = VALUES(college),
                                         major = VALUES(major), type = VALUES(type), remark = VALUES(remark)`,
                [`${subject}1班`, '2024级', '计算机学院', '计算机科学与技术']
            );
            await conn.query(
                `INSERT INTO classes (name, grade, college, major, type, remark)
                 VALUES (?, ?, ?, ?, 'elective', '模拟测试选修班')
                 ON DUPLICATE KEY UPDATE grade = VALUES(grade), college = VALUES(college),
                                         major = VALUES(major), type = VALUES(type), remark = VALUES(remark)`,
                [`${subject}2班`, '2024级', '计算机学院', '软件工程']
            );
        }

        for (const t of teachers) {
            await conn.query(
                `INSERT INTO users (username, password, role, nickname, college, major, employee_no, title, status)
                 VALUES (?, ?, 'teacher', ?, '计算机学院', ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), college = VALUES(college),
                                         major = VALUES(major), employee_no = VALUES(employee_no),
                                         title = VALUES(title), status = 1`,
                [t.username, PWD, t.nickname, t.major, t.employee_no, t.title]
            );
            const [rows] = await conn.query('SELECT id FROM users WHERE username = ?', [t.username]);
            const userId = rows[0].id;
            for (const subject of t.subjects) {
                await conn.query(
                    'INSERT IGNORE INTO teacher_subjects (user_id, subject) VALUES (?, ?)',
                    [userId, subject]
                );
            }
        }

        for (const s of students) {
            await conn.query(
                `INSERT INTO users (username, password, role, nickname, college, major, grade, student_no, status)
                 VALUES (?, ?, 'student', ?, '计算机学院', ?, '2024', ?, 1)
                 ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), college = VALUES(college),
                                         major = VALUES(major), grade = VALUES(grade),
                                         student_no = VALUES(student_no), status = 1`,
                [s.username, PWD, s.nickname, s.major, s.student_no]
            );
        }

        const [classRows] = await conn.query(
            `SELECT id, name, type FROM classes
             WHERE remark IN ('模拟测试必修班', '模拟测试选修班')`
        );
        const classMap = {};
        for (const c of classRows) classMap[c.name] = c;
        const simClassIds = classRows.map((c) => c.id);

        const [studentRows] = await conn.query(
            `SELECT id, username FROM users WHERE username LIKE 'sim_student%' ORDER BY id`
        );
        const simStudentIds = studentRows.map((r) => r.id);

        // 清理这批模拟学生的旧分班记录，保证脚本可重复执行
        if (simClassIds.length && simStudentIds.length) {
            const classPlaceholders = simClassIds.map(() => '?').join(', ');
            const studentPlaceholders = simStudentIds.map(() => '?').join(', ');
            await conn.query(
                `DELETE FROM student_classes
                 WHERE class_id IN (${classPlaceholders})
                   AND student_id IN (${studentPlaceholders})`,
                [...simClassIds, ...simStudentIds]
            );
        }

        let compulsoryCount = 0;
        let electiveCount = 0;
        for (const stu of studentRows) {
            const compulsorySubject = pickRandom(SUBJECTS);
            const compulsoryClass = classMap[`${compulsorySubject}1班`];
            if (compulsoryClass) {
                await conn.query(
                    'INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)',
                    [stu.id, compulsoryClass.id, 'compulsory']
                );
                await conn.query('UPDATE users SET class_id = ? WHERE id = ?', [compulsoryClass.id, stu.id]);
                compulsoryCount += 1;
            }

            if (Math.random() < 0.7) {
                const options = SUBJECTS.filter((s) => s !== compulsorySubject);
                const electiveSubject = pickRandom(options);
                const electiveClass = classMap[`${electiveSubject}2班`];
                if (electiveClass) {
                    await conn.query(
                        'INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)',
                        [stu.id, electiveClass.id, 'elective']
                    );
                    electiveCount += 1;
                }
            }
        }

        await conn.commit();

        console.log(`✅ 教师新增 ${teachers.length} 人：${teachers.map((t) => t.username).join(', ')}`);
        console.log(`✅ 学生新增 ${students.length} 人：sim_student01 ~ sim_student${pad(students.length)}`);
        console.log(`✅ 班级新增 ${classRows.length} 个（14 学科 x 必修1班 + 选修2班）`);
        console.log(`✅ 分班完成：必修关系 ${compulsoryCount} 条，选修关系 ${electiveCount} 条`);
        console.log('🔑 所有 sim_ 账号密码均为：123456');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
        await pool.end();
    }
};

main().catch((err) => {
    console.error('❌ 模拟数据播种失败:', err.message);
    process.exitCode = 1;
});
