const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1', routes);

app.use(errorHandler);

app.listen(port, () => {
    console.log(`🚀 智能题库后端服务已启动！`);
    console.log(`📍 监听地址: http://localhost:${port}`);
    console.log(`🔌 API 前缀: http://localhost:${port}/api/v1`);
    console.log(`📋 测试接口示例: GET http://localhost:${port}/api/v1/questions`);
    console.log(`💓 健康检查: GET http://localhost:${port}/health`);
});

module.exports = app;