require('./src/app.js').start().catch((err) => {
    console.error('服务启动失败:', err.message);
    process.exitCode = 1;
});
//“it is nothing”
