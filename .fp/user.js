import request from '@/utils/request';

// 用户列表（分页/筛选）
export const getUsers = (params) => {
    return request.get('/users', { params });
};

// 用户详情
export const getUserById = (id) => {
    return request.get(`/users/${id}`);
};

// 新增用户
export const addUser = (data) => {
    return request.post('/users', data);
};

// 更新用户（角色/昵称/状态）
export const updateUser = (id, data) => {
    return request.put(`/users/${id}`, data);
};

// 修改密码
export const changeUserPassword = (id, password) => {
    return request.patch(`/users/${id}/password`, { password });
};

// 启用/禁用
export const toggleUserStatus = (id, status) => {
    return request.patch(`/users/${id}/status`, { status });
};

// 删除用户
export const deleteUser = (id) => {
    return request.delete(`/users/${id}`);
};
