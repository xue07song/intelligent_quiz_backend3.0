const authService = require('../services/authService');
const { success, paginated } = require('../utils/response');

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

// 提交注册申请（公开）
const register = async (req, res, next) => {
    try {
        const result = await authService.register(req.body);
        res.status(201).json(success(result, '✅ 注册申请已提交，请等待管理员审核'));
    } catch (err) {
        next(err);
    }
};

// 注册申请列表（管理员/教师）
const listRegistrations = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await authService.listRegistrations({
            page,
            pageSize,
            status: req.query.status,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 审核通过
const approveRegistration = async (req, res, next) => {
    try {
        const result = await authService.approveRegistration(req.params.id, req.user.id);
        res.json(success(result, '✅ 审核通过成功'));
    } catch (err) {
        next(err);
    }
};

// 审核拒绝
const rejectRegistration = async (req, res, next) => {
    try {
        const result = await authService.rejectRegistration(req.params.id, req.body.reason, req.user.id);
        res.json(success(result, '✅ 已拒绝该注册申请'));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    login,
    profile,
    changePassword,
    register,
    listRegistrations,
    approveRegistration,
    rejectRegistration,
};
