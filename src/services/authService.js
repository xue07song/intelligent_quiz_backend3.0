const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const registrationModel = require('../models/registrationModel');
const { sign } = require('../utils/jwt');

const login = async ({ username, password }) => {
    if (!username || !password) {
        const error = new Error('用户名和密码不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const user = await userModel.findByUsername(username);
    if (!user) {
        const error = new Error('用户名或密码错误');
        error.statusCode = 401;
        error.errorCode = 40103;
        throw error;
    }

    if (!user.status) {
        const error = new Error('账号已被禁用，请联系管理员');
        error.statusCode = 403;
        error.errorCode = 40302;
        throw error;
    }

    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) {
        const error = new Error('用户名或密码错误');
        error.statusCode = 401;
        error.errorCode = 40103;
        throw error;
    }

    const token = sign({ id: user.id, username: user.username, role: user.role });

    // 教师登录时附带所教科目，供前端首页按科目展示题库
    let subjects = null;
    if (user.role === 'teacher') {
        subjects = await userModel.getTeacherSubjects(user.id);
    }

    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            nickname: user.nickname,
            email: user.email,
            phone: user.phone,
            school: user.school,
            college: user.college,
            student_no: user.student_no,
            employee_no: user.employee_no,
            major: user.major,
            grade: user.grade,
            title: user.title,
            subjects,
        },
    };
};

const getProfile = async (userId) => {
    const user = await userModel.findById(userId);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }
    // 教师附带所教科目
    if (user.role === 'teacher') {
        user.subjects = await userModel.getTeacherSubjects(user.id);
    } else {
        user.subjects = null;
    }
    return user;
};

// 用户修改自己的密码（需校验原密码）
const changePassword = async (userId, { oldPassword, newPassword }) => {
    if (!oldPassword || !newPassword) {
        const error = new Error('原密码和新密码不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (newPassword.length < 6) {
        const error = new Error('新密码长度不能少于6位');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    // 单次查询获取含 password 的完整记录
    const user = await userModel.findWithPasswordById(userId);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        error.errorCode = 40402;
        throw error;
    }

    const ok = bcrypt.compareSync(oldPassword, user.password);
    if (!ok) {
        const error = new Error('原密码错误');
        error.statusCode = 400;
        error.errorCode = 40003;
        throw error;
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    return userModel.updatePassword(userId, hashedPassword);
};

// 提交注册申请（公开）
const register = async ({ username, password, role, nickname }) => {
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');
    if (!normalizedUsername || !normalizedPassword) {
        const error = new Error('用户名和密码不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (normalizedPassword.length < 6) {
        const error = new Error('密码长度不能少于6位');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (!['student', 'teacher'].includes(role)) {
        const error = new Error('角色无效');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }

    const existingUser = await userModel.findByUsername(normalizedUsername);
    if (existingUser) {
        const error = new Error('用户名已被注册');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    const existingRequest = await registrationModel.findByUsername(normalizedUsername);
    if (existingRequest && existingRequest.status === 'pending') {
        const error = new Error('该用户名已有待审核的注册申请');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    const hashedPassword = bcrypt.hashSync(normalizedPassword, 10);
    if (existingRequest) {
        await registrationModel.reset(existingRequest.id, {
            password: hashedPassword,
            role,
            nickname: nickname || null,
        });
        return { id: existingRequest.id };
    }

    const result = await registrationModel.create({
        username: normalizedUsername,
        password: hashedPassword,
        role,
        nickname: nickname || null,
    });
    return { id: result.insertId };
};

// 注册申请列表（管理员/教师）
const listRegistrations = async ({ page = 1, pageSize = 20, status } = {}) => {
    const currentPage = Math.max(parseInt(page) || 1, 1);
    const currentSize = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
    return registrationModel.findAll({ page: currentPage, pageSize: currentSize, status });
};

// 审核通过（管理员/教师）
const approveRegistration = async (requestId, adminId) => {
    const request = await registrationModel.findById(requestId);
    if (!request) {
        const error = new Error('注册申请不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    if (request.status !== 'pending') {
        const error = new Error('该注册申请已处理');
        error.statusCode = 409;
        error.errorCode = 40903;
        throw error;
    }
    const existingUser = await userModel.findByUsername(request.username);
    if (existingUser) {
        const error = new Error('用户名已被占用，无法通过审核');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    await userModel.create({
        username: request.username,
        password: request.password,
        role: request.role,
        nickname: request.nickname,
        status: 1,
    });
    await registrationModel.markApproved(requestId, adminId);
    return { id: requestId };
};

// 审核拒绝（管理员/教师）
const rejectRegistration = async (requestId, reason, adminId) => {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        const error = new Error('请填写拒绝原因');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    const request = await registrationModel.findById(requestId);
    if (!request) {
        const error = new Error('注册申请不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    if (request.status !== 'pending') {
        const error = new Error('该注册申请已处理');
        error.statusCode = 409;
        error.errorCode = 40903;
        throw error;
    }
    await registrationModel.markRejected(requestId, trimmedReason, adminId);
    return { id: requestId };
};

module.exports = {
    login,
    getProfile,
    changePassword,
    register,
    listRegistrations,
    approveRegistration,
    rejectRegistration,
};
