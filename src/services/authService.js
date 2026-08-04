const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
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

    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            nickname: user.nickname,
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

    // findById 默认不返回 password，这里需要完整记录用于校验原密码
    const user = await userModel.findByUsername(
        (await userModel.findById(userId)).username
    );
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

module.exports = { login, getProfile, changePassword };
