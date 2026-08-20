const pool = require('./db');

const addMissingColumns = async (table, definitions) => {
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const existing = new Set(rows.map((row) => row.Field));
    for (const [name, definition] of Object.entries(definitions)) {
        if (!existing.has(name)) {
            await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
        }
    }
};

const ensureCompatibleSchema = async () => {
    // ====== 1. 确保核心表存在（全部 CREATE TABLE IF NOT EXISTS，幂等）======
    await pool.query(`CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status TINYINT NOT NULL DEFAULT 1,
        created_by BIGINT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='科目目录'`);

    await pool.query(`CREATE TABLE IF NOT EXISTS subject_chapters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        chapter_no INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uk_subject_chapter (subject_id, chapter_no),
        CONSTRAINT fk_subject_chapter_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='科目章节目录'`);

    const subjectCatalog = {
        '人工智能基础': ['计算思维基础', '计算机系统基础', 'Python程序设计', '算法与问题求解', '数字素养与数字化思维', '人工智能概述', '人工智能典型应用', '人工智能关键技术', '大模型应用', '人工智能伦理与治理'],
        '中国历史': ['中国历史基础'],
        'Python程序设计': ['函数与参数'],
        'JavaScript程序设计': ['事件处理'],
        '数据库原理': ['数据库规范化'],
    };
    for (const [subjectName, chapterTitles] of Object.entries(subjectCatalog)) {
        await pool.query('INSERT IGNORE INTO subjects (name) VALUES (?)', [subjectName]);
        const [[subject]] = await pool.query('SELECT id FROM subjects WHERE name = ?', [subjectName]);
        for (let index = 0; index < chapterTitles.length; index += 1) {
            await pool.query(
                `INSERT INTO subject_chapters (subject_id, chapter_no, title, sort_order)
                 VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order)`,
                [subject.id, index + 1, chapterTitles[index], index + 1]
            );
        }
    }

    // 旧版科目名「人工智能」对应当前完整课程「人工智能基础」。
    await pool.query(
        `INSERT IGNORE INTO teacher_subjects (user_id, subject)
         SELECT user_id, '人工智能基础' FROM teacher_subjects WHERE subject = '人工智能'`
    );
    await pool.query("DELETE FROM teacher_subjects WHERE subject = '人工智能'");

    // 只归类历史遗留的空科目数据；明确 ID 规则避免误判用户后续新增题。
    await pool.query("UPDATE `题库1` SET `科目` = '人工智能基础' WHERE (`科目` IS NULL OR TRIM(`科目`) = '') AND id REGEXP '^[0-9]{5}$'");
    await pool.query("UPDATE `题库1` SET `科目` = '中国历史', `章节` = 1 WHERE (`科目` IS NULL OR TRIM(`科目`) = '') AND id REGEXP '^Q00[1-8]$'");
    await pool.query("UPDATE `题库1` SET `科目` = 'Python程序设计', `章节` = 1 WHERE id = 'AI001' AND (`科目` IS NULL OR TRIM(`科目`) = '')");
    await pool.query("UPDATE `题库1` SET `科目` = 'JavaScript程序设计', `章节` = 1 WHERE id = 'AI002' AND (`科目` IS NULL OR TRIM(`科目`) = '')");
    await pool.query("UPDATE `题库1` SET `科目` = '数据库原理', `章节` = 1 WHERE id = 'AI003' AND (`科目` IS NULL OR TRIM(`科目`) = '')");

    // 班级表（若不存在则创建）
    await pool.query(`CREATE TABLE IF NOT EXISTS classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '班级名称：如 人工智能1班',
        grade VARCHAR(50) COMMENT '年级，如 2023级',
        college VARCHAR(255) COMMENT '所属学院',
        major VARCHAR(255) COMMENT '所属专业/科目对应',
        type ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '班级类型：必修/选修',
        description VARCHAR(500) COMMENT '班级说明',
        capacity INT NOT NULL DEFAULT 50,
        counselor_id BIGINT NULL,
        head_teacher_id BIGINT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_classes_type (type),
        KEY idx_classes_major (major)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级表'`);

    // 班级-学生 多对多中间表
    await pool.query(`CREATE TABLE IF NOT EXISTS class_students (
        class_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        type ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '班级归属类型：必修/选修',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (class_id, user_id),
        KEY idx_cs_user (user_id),
        KEY idx_cs_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级学生多对多表'`);

    // 试卷表（学生随机组卷生成）
    await pool.query(`CREATE TABLE IF NOT EXISTS exams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '组卷用户ID',
        title VARCHAR(100) NOT NULL DEFAULT '练习试卷' COMMENT '试卷名称',
        total_count INT NOT NULL DEFAULT 0 COMMENT '题目总数',
        objective_count INT NOT NULL DEFAULT 0 COMMENT '客观题数量（可自动判分）',
        chapter VARCHAR(50) COMMENT '章节筛选',
        question_type VARCHAR(50) COMMENT '题型筛选',
        difficulty VARCHAR(50) COMMENT '难度筛选',
        subject VARCHAR(50) DEFAULT NULL COMMENT '试卷所属科目（教师组卷时必填）',
        class_id INT DEFAULT NULL COMMENT '目标班级ID（冗余，多选班级看 exam_classes）',
        status ENUM('draft','published','closed') NOT NULL DEFAULT 'published',
        duration_minutes INT DEFAULT NULL,
        start_at DATETIME DEFAULT NULL,
        end_at DATETIME DEFAULT NULL,
        max_attempts INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_subject (subject),
        INDEX idx_class (class_id),
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='练习试卷表'`);

    // 试卷-题目 关联表（快照模式）
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        exam_id INT NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        snapshot_章节 INT NULL,
        snapshot_题型 INT NULL,
        snapshot_序号 INT NULL,
        snapshot_题目 TEXT NULL,
        snapshot_选项 TEXT NULL,
        snapshot_答案 VARCHAR(500) NULL,
        snapshot_解析 TEXT NULL,
        snapshot_难度 VARCHAR(20) NULL,
        snapshot_知识点 VARCHAR(255) NULL,
        UNIQUE KEY uk_exam_question (exam_id, question_id),
        KEY idx_eq_exam (exam_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试卷题目关联表（含快照）'`);

    // 试卷-班级 多选目标班级关联
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_classes (
        exam_id INT NOT NULL,
        class_id INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (exam_id, class_id),
        KEY idx_ec_class (class_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试卷目标班级多对多表'`);

    // 答题尝试（用于限时/最大次数/开始时间）
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_attempts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        exam_id INT NOT NULL,
        user_id INT NOT NULL,
        attempt_no INT NOT NULL DEFAULT 1,
        started_at TIMESTAMP NULL DEFAULT NULL,
        submitted_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_exam_user_attempt (exam_id, user_id, attempt_no),
        KEY idx_ea_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题尝试记录表（限次/限时用）'`);

    // 答题草稿
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_drafts (
        user_id INT NOT NULL,
        exam_id INT NOT NULL,
        answers_json MEDIUMTEXT COMMENT '用户答案JSON快照',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, exam_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题草稿表'`);

    // 答题记录表
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        exam_id INT NOT NULL,
        user_id INT NOT NULL COMMENT '作答用户',
        started_at DATETIME NULL COMMENT '实际开始时间（服务端attempt.started_at）',
        duration_seconds INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_count INT NOT NULL DEFAULT 0,
        answered_count INT NOT NULL DEFAULT 0,
        correct_count INT NOT NULL DEFAULT 0,
        wrong_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        objective_total INT NOT NULL DEFAULT 0,
        objective_correct INT NOT NULL DEFAULT 0,
        accuracy DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '正确率 0-100',
        score DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '百分制分数',
        attempt_no INT NULL,
        INDEX idx_user_submit (user_id, submitted_at),
        INDEX idx_exam (exam_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题记录表'`);

    // 答题详情表（注意：exam_id / user_id 允许 NULL，兼容旧版未写入的 createRecord 代码，后续可逐步补齐）
    await pool.query(`CREATE TABLE IF NOT EXISTS exam_answers (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL,
        exam_id INT NULL,
        user_id INT NULL,
        question_id VARCHAR(50) NOT NULL,
        question_type INT NOT NULL COMMENT '1判断2单选3多选4填空5简答6程序',
        is_objective TINYINT NOT NULL DEFAULT 1,
        user_answer TEXT,
        correct_answer VARCHAR(500) DEFAULT NULL,
        is_correct TINYINT NOT NULL DEFAULT 2 COMMENT '0错误 1正确 2未答 3待复核',
        score_rate DECIMAL(5,2) DEFAULT NULL COMMENT '主观题得分比例 0-1',
        review_status VARCHAR(20) NULL COMMENT '复核状态: correct/partial/incorrect/pending',
        review_score_rate DECIMAL(5,2) NULL,
        review_comment VARCHAR(500) NULL,
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_record (record_id),
        INDEX idx_question (question_id),
        INDEX idx_answer_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题详情表'`);

    // 用户收藏表
    await pool.query(`CREATE TABLE IF NOT EXISTS user_favorites (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_question (user_id, question_id),
        KEY idx_fav_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户题目收藏表'`);

    // 收藏标签表（预设+自定义）
    await pool.query(`CREATE TABLE IF NOT EXISTS user_favorite_tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '0 表示系统预设标签',
        name VARCHAR(50) NOT NULL,
        type ENUM('preset','custom') NOT NULL DEFAULT 'custom',
        color VARCHAR(20) DEFAULT '#6366F1',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_tag_name (user_id, name),
        KEY idx_tag_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏标签表'`);

    // 收藏题目标签关联表
    await pool.query(`CREATE TABLE IF NOT EXISTS user_favorite_question_tags (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_question_tag (user_id, question_id, tag_id),
        KEY idx_uqtag_user_question (user_id, question_id),
        KEY idx_uqtag_tag (tag_id),
        CONSTRAINT fk_uqtag_tag FOREIGN KEY (tag_id) REFERENCES user_favorite_tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏题目标签关联表'`);

    // 收藏题目复习记录表（遗忘曲线）
    await pool.query(`CREATE TABLE IF NOT EXISTS user_favorite_reviews (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        question_id VARCHAR(50) NOT NULL,
        result VARCHAR(20) NOT NULL DEFAULT 'forgot' COMMENT 'remembered | forgot',
        interval_days INT NOT NULL DEFAULT 1 COMMENT '本次间隔天数',
        next_review_at DATETIME NOT NULL COMMENT '下次复习时间',
        reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_review_user_question (user_id, question_id),
        KEY idx_review_user_next (user_id, next_review_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏题目复习记录表（遗忘曲线）'`);

    // 兼容旧表：将 result 列从 TINYINT 改为 VARCHAR（幂等）
    try {
        const [cols] = await pool.query(
            `SELECT DATA_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_favorite_reviews' AND COLUMN_NAME = 'result'`
        );
        if (cols[0] && cols[0].DATA_TYPE !== 'varchar') {
            await pool.query(`ALTER TABLE user_favorite_reviews MODIFY COLUMN result VARCHAR(20) NOT NULL DEFAULT 'forgot' COMMENT 'remembered | forgot'`);
        }
    } catch (_) { /* 幂等忽略 */ }

    // 初始化系统预设收藏标签（仅 3 条，颜色与契约一致）
    const presetTags = [
        { name: '易错', color: '#EF4444' },
        { name: '常考', color: '#3B82F6' },
        { name: '难题', color: '#8B5CF6' },
    ];
    for (const tag of presetTags) {
        await pool.query(
            `INSERT INTO user_favorite_tags (user_id, name, type, color) VALUES (0, ?, 'preset', ?)
             ON DUPLICATE KEY UPDATE color = VALUES(color), type = 'preset'`,
            [tag.name, tag.color]
        );
    }
    // 清理旧的多余预设标签（重点/不熟等）
    try {
        await pool.query(
            `DELETE FROM user_favorite_tags WHERE user_id = 0 AND name NOT IN ('易错', '常考', '难题')`
        );
    } catch (_) { /* 幂等忽略 */ }

    // 用户反馈表（模型使用 feedbacks 表名，字段需与 feedbackModel.js LIST_SELECT / DETAIL_SELECT 一致）
    await pool.query(`CREATE TABLE IF NOT EXISTS feedbacks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '提交用户',
        category VARCHAR(50) DEFAULT 'suggestion' COMMENT '反馈分类: bug/feature/suggestion/other',
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        contact VARCHAR(255) NULL,
        status ENUM('pending','processing','resolved','rejected','closed') NOT NULL DEFAULT 'pending',
        reply TEXT NULL,
        replied_by INT NULL,
        replied_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fb_user (user_id),
        INDEX idx_fb_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表'`);

    // 自适应练习会话 & 答题表
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
        review_status VARCHAR(20) NULL,
        review_score_rate DECIMAL(5,2) NULL,
        review_comment VARCHAR(500) NULL,
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), UNIQUE KEY uk_session_sequence (session_id, sequence_no),
        UNIQUE KEY uk_session_question (session_id, question_id), KEY idx_adaptive_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // teacher_subjects / academic_colleges / academic_majors
    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_subjects (
        user_id BIGINT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        PRIMARY KEY (user_id, subject),
        KEY idx_teacher_subject (subject)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS academic_colleges (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS academic_majors (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        college_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_college_major (college_id, name),
        KEY idx_major_college (college_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // ====== 2. 列兼容修复（新增列） ======
    await addMissingColumns('users', {
        nickname: 'VARCHAR(100) NULL',
        email: 'VARCHAR(255) NULL',
        phone: 'VARCHAR(30) NULL',
        school: 'VARCHAR(255) NULL',
        college: 'VARCHAR(255) NULL',
        student_no: 'VARCHAR(100) NULL',
        employee_no: 'VARCHAR(100) NULL',
        major: 'VARCHAR(255) NULL',
        grade: 'VARCHAR(100) NULL',
        title: 'VARCHAR(100) NULL',
        status: 'TINYINT NOT NULL DEFAULT 1',
        updated_at: 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
        class_id: 'INT NULL',
    });

    await addMissingColumns('题库1', {
        科目: 'VARCHAR(255) NULL',
    });

    // 题库主键宽度兼容：旧库可能只有 varchar(5)
    const [idCols] = await pool.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '题库1' AND COLUMN_NAME = 'id'`
    );
    if (idCols.length && Number(idCols[0].CHARACTER_MAXIMUM_LENGTH) < 20) {
        await pool.query('ALTER TABLE `题库1` MODIFY `id` VARCHAR(20) NOT NULL');
    }

    await addMissingColumns('registration_requests', {
        subjects: 'TEXT NULL',
        reject_reason: 'VARCHAR(500) NULL',
        reviewed_by: 'BIGINT NULL',
        reviewed_at: 'DATETIME NULL',
        handled_by: 'BIGINT NULL',
        handled_at: 'DATETIME NULL',
        updated_at: 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    });

    await addMissingColumns('exam_drafts', {
        answers_json: "MEDIUMTEXT COMMENT '用户答案JSON快照'",
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    });

    await addMissingColumns('exams', {
        subject: 'VARCHAR(255) NULL',
        class_id: 'BIGINT NULL',
        status: "ENUM('draft','published','closed') NOT NULL DEFAULT 'published'",
        duration_minutes: 'INT NULL',
        start_at: 'DATETIME NULL',
        end_at: 'DATETIME NULL',
        max_attempts: 'INT NULL',
    });

    await addMissingColumns('exam_questions', {
        snapshot_章节: 'INT NULL',
        snapshot_题型: 'INT NULL',
        snapshot_序号: 'INT NULL',
        snapshot_题目: 'TEXT NULL',
        snapshot_选项: 'TEXT NULL',
        snapshot_答案: 'VARCHAR(500) NULL',
        snapshot_解析: 'TEXT NULL',
        snapshot_难度: 'VARCHAR(20) NULL',
        snapshot_知识点: 'VARCHAR(255) NULL',
    });

    await addMissingColumns('adaptive_practice_answers', {
        review_status: 'VARCHAR(20) NULL',
        review_score_rate: 'DECIMAL(5,2) NULL',
        review_comment: 'VARCHAR(500) NULL',
        reviewed_by: 'INT NULL',
        reviewed_at: 'DATETIME NULL',
    });
    await addMissingColumns('adaptive_practice_sessions', { subject: 'VARCHAR(100) NULL' });

    await addMissingColumns('classes', {
        college: 'VARCHAR(255) NULL',
        major: 'VARCHAR(255) NULL',
        capacity: 'INT NOT NULL DEFAULT 50',
        counselor_id: 'BIGINT NULL',
        head_teacher_id: 'BIGINT NULL',
        subject: 'VARCHAR(100) NULL',
        description: 'VARCHAR(500) NULL',
    });
    await pool.query("UPDATE classes SET subject = '人工智能基础' WHERE subject = '人工智能'");
    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_classes (
        teacher_id BIGINT NOT NULL,
        class_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (teacher_id, class_id),
        KEY idx_teacher_classes_class (class_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

module.exports = { ensureCompatibleSchema };
