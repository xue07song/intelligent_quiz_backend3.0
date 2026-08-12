const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
    console.error('❌ 未捕获错误:', err);

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json(error(40001, '请求体格式错误'));
    }

    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json(error(40002, '数据重复，请检查ID是否已存在'));
    }

    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR') {
        return res.status(500).json(error(50001, '数据库表不存在，请先初始化数据库'));
    }

    if (err.code === 'ER_NO_DEFAULT_FOR_FIELD') {
        return res.status(400).json(error(40003, '缺少必要字段'));
    }

    const statusCode = err.statusCode || 500;
    const errorCode = err.errorCode || 50000;
    const message = err.message || '服务器内部错误';

    res.status(statusCode).json(error(errorCode, message, err.details || null));
};

module.exports = errorHandler;
