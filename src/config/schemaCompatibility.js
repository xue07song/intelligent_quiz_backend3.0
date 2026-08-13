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
    });

    await addMissingColumns('题库1', {
        科目: 'VARCHAR(255) NULL',
    });

    await addMissingColumns('registration_requests', {
        subjects: 'TEXT NULL',
        reject_reason: 'VARCHAR(500) NULL',
        reviewed_by: 'BIGINT NULL',
        reviewed_at: 'DATETIME NULL',
        updated_at: 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    });

    await addMissingColumns('exams', {
        subject: 'VARCHAR(255) NULL',
        class_id: 'BIGINT NULL',
    });

    await pool.query(`CREATE TABLE IF NOT EXISTS teacher_subjects (
        user_id BIGINT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        PRIMARY KEY (user_id, subject),
        KEY idx_teacher_subject (subject)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

module.exports = { ensureCompatibleSchema };
