const { error } = require('../utils/response');

// 角色权限校验中间件：要求当前用户具有指定角色之一
// 用法：requireRoles('admin', 'teacher')
const requireRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json(error(40101, '未登录，请先登录'));
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json(error(40301, '权限不足，无法执行此操作'));
        }
        next();
    };
};

module.exports = { requireRoles };
