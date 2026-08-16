const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const studentRoutes = require('./routes/student');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', routes);
app.use('/api/student', require('./routes/student'));

// 托管前端静态文件
const frontendDist = path.join(__dirname, '../../intelligent_quiz_fronted3.0/dist');
app.use(express.static(frontendDist));
// 前端路由 fallback：所有非 API 请求返回 index.html
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
        res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
        next();
    }
});

app.use(errorHandler);

const ensureSchema = async () => {
    const pool = require('./config/db');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS \`registration_requests\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('student','teacher') NOT NULL DEFAULT 'student',
            nickname VARCHAR(50) NULL,
            status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            reject_reason VARCHAR(255) NULL,
            handled_by INT NULL,
            handled_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_registration_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS \`student_questions\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            college VARCHAR(50) DEFAULT NULL,
            章节 INT DEFAULT 0,
            题型 INT DEFAULT 2,
            序号 INT DEFAULT 0,
            题目 TEXT NOT NULL,
            选项 TEXT NULL,
            答案 VARCHAR(255) NULL,
            解析 TEXT NULL,
            难度 VARCHAR(10) NULL,
            知识点 VARCHAR(255) NULL,
            科目 VARCHAR(50) NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'manual',
            is_public TINYINT NOT NULL DEFAULT 0,
            review_status ENUM('private','pending','approved','rejected') NOT NULL DEFAULT 'private',
            reject_reason VARCHAR(255) NULL,
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_owner (owner_id),
            INDEX idx_college_status (college, review_status),
            INDEX idx_review (review_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS \`student_moderators\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            college VARCHAR(50) NOT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_user_college (user_id, college),
            INDEX idx_college (college)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
};

ensureSchema()
    .then(() => {
        app.listen(port, () => {
            console.log(`🚀 智能题库后端服务已启动！`);
            console.log(`📍 监听地址: http://localhost:${port}`);
            console.log(`🔌 API 前缀: http://localhost:${port}/api/v1`);
            console.log(`🖥️ 前端页面: http://localhost:${port}`);
            console.log(`📋 测试接口示例: GET http://localhost:${port}/api/v1/questions`);
            console.log(`💓 健康检查: GET http://localhost:${port}/health`);
        });
    })
    .catch((err) => {
        console.error('❌ 数据库初始化失败:', err.message);
        process.exit(1);
    });

module.exports = app;
