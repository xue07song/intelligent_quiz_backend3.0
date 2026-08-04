const userService = require('../services/userService');
const { success, paginated } = require('../utils/response');

const findAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await userService.listUsers({
            page,
            pageSize,
            role: req.query.role,
            status: req.query.status,
            keyword: req.query.keyword,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const findById = async (req, res, next) => {
    try {
        const user = await userService.getUser(req.params.id);
        res.json(success(user));
    } catch (err) {
        next(err);
    }
};

const create = async (req, res, next) => {
    try {
        await userService.createUser(req.body);
        res.status(201).json(success(null, '✅ 用户创建成功'));
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        await userService.updateUser(req.params.id, req.body);
        res.json(success(null, '✅ 用户更新成功'));
    } catch (err) {
        next(err);
    }
};

const changePassword = async (req, res, next) => {
    try {
        await userService.changePassword(req.params.id, req.body.password);
        res.json(success(null, '✅ 密码修改成功'));
    } catch (err) {
        next(err);
    }
};

const toggleStatus = async (req, res, next) => {
    try {
        await userService.toggleStatus(req.params.id, Number(req.body.status));
        res.json(success(null, '✅ 状态更新成功'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await userService.deleteUser(req.params.id);
        res.json(success(null, '✅ 用户删除成功'));
    } catch (err) {
        next(err);
    }
};

module.exports = { findAll, findById, create, update, changePassword, toggleStatus, remove };
