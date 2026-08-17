const registrationService = require('../services/registrationService');
const { success, paginated } = require('../utils/response');

// 提交注册申请（公开接口）
const register = async (req, res, next) => {
    try {
        await registrationService.submit(req.body);
        res.status(201).json(success(null, '✅ 注册申请已提交，请等待管理员审核'));
    } catch (err) {
        next(err);
    }
};

// 查询注册申请列表（管理员/老师）
const list = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await registrationService.list({
            page,
            pageSize,
            status: req.query.status,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

// 审核通过（管理员/老师）
const approve = async (req, res, next) => {
    try {
        await registrationService.approve(req.params.id, req.user);
        res.json(success(null, '✅ 已通过审核，用户账号已创建'));
    } catch (err) {
        next(err);
    }
};

// 审核拒绝（管理员/老师）
const reject = async (req, res, next) => {
    try {
        const reason = req.body.reason || '未提供拒绝原因';
        await registrationService.reject(req.params.id, req.user, reason);
        res.json(success(null, '✅ 已拒绝该注册申请'));
    } catch (err) {
        next(err);
    }
};

module.exports = { register, list, approve, reject };
