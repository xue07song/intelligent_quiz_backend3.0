const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔥 当前后端读取的数据库名是:', process.env.DB_NAME);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
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