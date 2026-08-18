// 测试数据播种脚本：教师5名 + 学生20名 + 班级5个
// 用法：node seed.js
const pool = require('./src/config/db');
const bcrypt = require('bcryptjs');

const PWD = bcrypt.hashSync('123456', 10);

const run = async () => {
    const conn = await pool.getConnection();
    try {
        // ===== 1. 迁移：安全加列 =====
        const hasCol = async (table, col) => {
            const [rows] = await conn.query(
                `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [table, col]
            );
            return rows[0].c > 0;
        };

        if (!(await hasCol('classes', 'type'))) {
            await conn.query(`ALTER TABLE \`classes\` ADD COLUMN \`type\` ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '班级类型'`);
            console.log('✅ classes.type 列已添加');
        }
        if (!(await hasCol('users', 'class_id'))) {
            await conn.query(`ALTER TABLE \`users\` ADD COLUMN \`class_id\` INT DEFAULT NULL COMMENT '主必修班ID'`);
            console.log('✅ users.class_id 列已添加');
        }
        if (!(await hasCol('student_classes', 'type'))) {
            await conn.query(`ALTER TABLE \`student_classes\` ADD COLUMN \`type\` ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '关系类型'`);
            console.log('✅ student_classes.type 列已添加');
        }

        // 索引迁移
        const [oldIdx] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student'`
        );
        if (oldIdx[0].c > 0) {
            await conn.query('ALTER TABLE `student_classes` DROP INDEX `uk_student`');
            console.log('✅ 旧 uk_student 索引已删除');
        }
        const [newIdx] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student_class'`
        );
        if (newIdx[0].c === 0) {
            await conn.query('ALTER TABLE `student_classes` ADD UNIQUE KEY `uk_student_class` (`student_id`, `class_id`)');
            console.log('✅ uk_student_class 复合唯一键已添加');
        }

        // ===== 2. 插入班级 =====
        const classes = [
            ['计算机科学与技术1班', '2023级', '计算机学院', '计算机科学与技术', 'compulsory', '2023级计科1班'],
            ['计算机科学与技术2班', '2023级', '计算机学院', '计算机科学与技术', 'compulsory', '2023级计科2班'],
            ['软件工程1班', '2023级', '计算机学院', '软件工程', 'compulsory', '2023级软工1班'],
            ['人工智能实验班', '2023级', '计算机学院', '人工智能', 'elective', '选修：AI方向拔尖班'],
            ['数据科学交叉班', '2023级', '计算机学院', '数据科学与大数据技术', 'elective', '选修：跨学科交叉'],
        ];
        for (const [name, grade, college, major, type, remark] of classes) {
            await conn.query(
                `INSERT INTO classes (name, grade, college, major, type, remark) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE grade=VALUES(grade), college=VALUES(college), major=VALUES(major), type=VALUES(type), remark=VALUES(remark)`,
                [name, grade, college, major, type, remark]
            );
        }
        console.log('✅ 5个班级已插入');

        // ===== 3. 插入教师 =====
        const teachers = [
            ['teacher_liqiang',  '李强', '计算机学院', '计算机科学与技术', 'T2021001', '副教授'],
            ['teacher_wangming', '王明', '计算机学院', '软件工程', 'T2021002', '讲师'],
            ['teacher_zhangwei', '张伟', '计算机学院', '人工智能', 'T2021003', '教授'],
            ['teacher_chenjing', '陈静', '计算机学院', '数据科学与大数据技术', 'T2021004', '副教授'],
            ['teacher_zhaolei',  '赵磊', '计算机学院', '计算机科学与技术', 'T2021005', '讲师'],
        ];
        for (const [username, nickname, college, major, empNo, title] of teachers) {
            await conn.query(
                `INSERT INTO users (username, password, role, nickname, college, major, employee_no, title, status)
                 VALUES (?, ?, 'teacher', ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), college=VALUES(college), major=VALUES(major), employee_no=VALUES(employee_no), title=VALUES(title)`,
                [username, PWD, nickname, college, major, empNo, title]
            );
        }
        console.log('✅ 5名教师已插入');

        // 教师科目
        const teacherSubjects = [
            ['teacher_liqiang', ['计算机网络', '操作系统']],
            ['teacher_wangming', ['软件工程', '数据结构']],
            ['teacher_zhangwei', ['人工智能', '机器学习']],
            ['teacher_chenjing', ['数据库原理', '高等数学']],
            ['teacher_zhaolei', ['计算机组成原理', '大学物理']],
        ];
        for (const [username, subjects] of teacherSubjects) {
            const [rows] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
            if (rows[0]) {
                for (const subject of subjects) {
                    await conn.query(
                        `INSERT IGNORE INTO teacher_subjects (user_id, subject) VALUES (?, ?)`,
                        [rows[0].id, subject]
                    );
                }
            }
        }
        console.log('✅ 教师科目已关联');

        // ===== 4. 插入学生 =====
        const students = [
            ['student_lizihao',  '李子豪', '计算机科学与技术', '202301001'],
            ['student_wangyihan', '王一涵', '计算机科学与技术', '202301002'],
            ['student_zhangxinyu','张欣宇', '计算机科学与技术', '202301003'],
            ['student_chenyifei', '陈亦菲', '计算机科学与技术', '202301004'],
            ['student_liuyifei',  '刘亦菲', '计算机科学与技术', '202301005'],
            ['student_zhouziyang','周子阳', '计算机科学与技术', '202301006'],
            ['student_wujiaqi',   '吴佳琪', '计算机科学与技术', '202301007'],
            ['student_zhengshuyi','郑舒怡', '计算机科学与技术', '202301008'],
            ['student_sunhaochen','孙浩辰', '软件工程', '202302001'],
            ['student_zhaoyutong','赵雨彤', '软件工程', '202302002'],
            ['student_qianzilin', '钱子琳', '软件工程', '202302003'],
            ['student_fengyuxuan','冯雨萱', '软件工程', '202302004'],
            ['student_chengyiming','程一鸣','软件工程', '202302005'],
            ['student_chuyuxin',  '楚雨欣', '软件工程', '202302006'],
            ['student_weijunkai', '魏俊凯', '软件工程', '202302007'],
            ['student_jiangruohan','姜若涵','软件工程', '202302008'],
            ['student_shenmengyao','沈梦瑶','计算机科学与技术', '202301009'],
            ['student_hanyifei',  '韩亦菲', '计算机科学与技术', '202301010'],
            ['student_yangzixuan','杨子轩', '计算机科学与技术', '202301011'],
            ['student_zhuyunqing','朱韵清', '计算机科学与技术', '202301012'],
        ];
        for (const [username, nickname, major, studentNo] of students) {
            await conn.query(
                `INSERT INTO users (username, password, role, nickname, college, major, grade, student_no, status)
                 VALUES (?, ?, 'student', ?, '计算机学院', ?, '2023', ?, 1)
                 ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), major=VALUES(major), student_no=VALUES(student_no)`,
                [username, PWD, nickname, major, studentNo]
            );
        }
        console.log('✅ 20名学生已插入');

        // ===== 5. 学生-班级关联 =====
        const getClassId = async (name) => {
            const [rows] = await conn.query('SELECT id FROM classes WHERE name = ?', [name]);
            return rows[0] ? rows[0].id : null;
        };
        const getUserId = async (username) => {
            const [rows] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
            return rows[0] ? rows[0].id : null;
        };

        // 必修班
        const jike1Class = await getClassId('计算机科学与技术1班');
        const jike2Class = await getClassId('计算机科学与技术2班');
        const ruangong1Class = await getClassId('软件工程1班');
        const aiElective = await getClassId('人工智能实验班');
        const dataElective = await getClassId('数据科学交叉班');

        // 计科1班（必修）：前8名计科学生
        const jike1Students = ['student_lizihao','student_wangyihan','student_zhangxinyu','student_chenyifei','student_liuyifei','student_zhouziyang','student_wujiaqi','student_zhengshuyi'];
        // 计科2班（必修）：后4名计科学生
        const jike2Students = ['student_shenmengyao','student_hanyifei','student_yangzixuan','student_zhuyunqing'];
        // 软工1班（必修）：8名软工学生
        const ruangongStudents = ['student_sunhaochen','student_zhaoyutong','student_qianzilin','student_fengyuxuan','student_chengyiming','student_chuyuxin','student_weijunkai','student_jiangruohan'];

        for (const username of jike1Students) {
            const sid = await getUserId(username);
            if (sid && jike1Class) await conn.query('INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)', [sid, jike1Class, 'compulsory']);
        }
        for (const username of jike2Students) {
            const sid = await getUserId(username);
            if (sid && jike2Class) await conn.query('INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)', [sid, jike2Class, 'compulsory']);
        }
        for (const username of ruangongStudents) {
            const sid = await getUserId(username);
            if (sid && ruangong1Class) await conn.query('INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)', [sid, ruangong1Class, 'compulsory']);
        }
        console.log('✅ 必修班关联已建立');

        // 选修班：AI实验班（部分计科学生）
        const aiStudents = ['student_lizihao','student_zhangxinyu','student_zhouziyang','student_shenmengyao','student_yangzixuan'];
        for (const username of aiStudents) {
            const sid = await getUserId(username);
            if (sid && aiElective) await conn.query('INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)', [sid, aiElective, 'elective']);
        }
        // 选修班：数据科学交叉班（部分软工学生）
        const dataStudents = ['student_sunhaochen','student_qianzilin','student_chengyiming','student_chuyuxin','student_jiangruohan'];
        for (const username of dataStudents) {
            const sid = await getUserId(username);
            if (sid && dataElective) await conn.query('INSERT IGNORE INTO student_classes (student_id, class_id, type) VALUES (?, ?, ?)', [sid, dataElective, 'elective']);
        }
        console.log('✅ 选修班关联已建立');

        // 回填 users.class_id
        await conn.query(`
            UPDATE users u
            INNER JOIN (
                SELECT sc.student_id, MIN(sc.class_id) AS first_class_id
                FROM student_classes sc
                WHERE sc.type = 'compulsory'
                GROUP BY sc.student_id
            ) t ON u.id = t.student_id
            SET u.class_id = t.first_class_id
            WHERE u.class_id IS NULL
        `);
        console.log('✅ users.class_id 已回填');

        console.log('\n🎉 全部测试数据播种完成！');
        console.log('   教师5名 | 学生20名 | 班级5个（3必修+2选修）');
        console.log('   所有账号密码：123456');
    } catch (err) {
        console.error('❌ 播种失败：', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
};

run();
