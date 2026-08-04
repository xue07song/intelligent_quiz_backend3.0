const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 签发 JWT，payload 包含用户基础信息
const sign = (payload) => {
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
};

// 校验并解析 JWT
const verify = (token) => {
    return jwt.verify(token, SECRET);
};

module.exports = { sign, verify };
