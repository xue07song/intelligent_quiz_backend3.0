import request from '@/utils/request';

// 登录
export const login = (data) => {
    return request.post('/auth/login', data);
};

// 获取当前登录用户信息
export const getProfile = () => {
    return request.get('/auth/profile');
};

// 修改自己的密码（需登录）
export const changePassword = (data) => {
    return request.post('/auth/change-password', data);
};
