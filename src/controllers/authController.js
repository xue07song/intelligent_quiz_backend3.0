const authService = require('../services/authService');
const { success } = require('../utils/response');

const login = async (req, res, next) => {
    try {
        const result = await authService.login(req.body);
        res.json(success(result, '✅ 登录成功'));
    } catch (err) {
        next(err);
    }
};

const profile = async (req, res, next) => {
    try {
        const user = await authService.getProfile(req.user.id);
        res.json(success(user));
    } catch (err) {
        next(err);
    }
};

// 修改自己的密码
const changePassword = async (req, res, next) => {
    try {
        await authService.changePassword(req.user.id, req.body);
        res.json(success(null, '✅ 密码修改成功，请重新登录'));
    } catch (err) {
        next(err);
    }
};

module.exports = { login, profile, changePassword };
