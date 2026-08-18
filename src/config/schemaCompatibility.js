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

    // 题库主键宽度兼容：旧库可能只有 varchar(5)，不足以容纳批量导入/ AI 生成 ID
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

    await addMissingColumns('classes', {
        college: 'VARCHAR(255) NULL',
        major: 'VARCHAR(255) NULL',
        capacity: 'INT NOT NULL DEFAULT 50',
        counselor_id: 'BIGINT NULL',
        head_teacher_id: 'BIGINT NULL',
    });

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
};

module.exports = { ensureCompatibleSchema };
