const mysql = require('mysql2/promise');
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
const envResult = require('dotenv').config({ path: envPath });

if (envResult.error && envResult.error.code !== 'ENOENT') {
    throw envResult.error;
}

const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missingVariables.length > 0) {
    throw new Error(
        `数据库配置不完整：缺少 ${missingVariables.join(', ')}。` +
        ` 请在 ${envPath} 中补充配置。`
    );
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000),
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 100,
});

pool.on('connection', () => {
    console.log('🗄️  数据库连接已建立');
});

pool.on('error', (err) => {
    console.error('❌ 数据库连接错误:', err.message);
});

module.exports = pool;
