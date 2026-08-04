const { verify } = require('../utils/jwt');
const { error } = require('../utils/response');

// 登录认证中间件：解析 Authorization: Bearer <token>，挂载 req.user
const auth = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json(error(40101, '未登录，请先登录'));
    }

    try {
        const decoded = verify(token);
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
        next();
    } catch (err) {
        return res.status(401).json(error(40102, '登录已过期或 token 无效，请重新登录'));
    }
};

module.exports = auth;
