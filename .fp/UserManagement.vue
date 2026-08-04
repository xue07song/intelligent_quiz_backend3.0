<template>
  <div>
    <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="color:#2c3e50;margin:0;">👤 用户管理</h2>
      <button @click="openAddDialog" class="btn-primary">+ 新增用户</button>
    </header>

    <!-- 筛选 -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <input v-model.trim="filters.keyword" class="input" style="max-width:200px;" placeholder="用户名/昵称" @keyup.enter="loadData" />
      <select v-model="filters.role" class="input" style="max-width:140px;">
        <option value="">全部角色</option>
        <option v-for="(name,key) in roleMap" :key="key" :value="key">{{ name }}</option>
      </select>
      <select v-model="filters.status" class="input" style="max-width:140px;">
        <option value="">全部状态</option>
        <option :value="1">启用</option>
        <option :value="0">禁用</option>
      </select>
      <button @click="loadData" class="btn-view">查询</button>
    </div>

    <!-- 表格 -->
    <div style="background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow-x:auto;padding:10px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:900px;">
        <thead>
          <tr style="background:#f5f7fa;border-bottom:2px solid #e4e7ed;">
            <th class="th">ID</th>
            <th class="th">用户名</th>
            <th class="th">角色</th>
            <th class="th">昵称</th>
            <th class="th">状态</th>
            <th class="th">创建时间</th>
            <th class="th" style="text-align:center;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in list" :key="u.id" style="border-bottom:1px solid #ebeef5;">
            <td class="td">{{ u.id }}</td>
            <td class="td">{{ u.username }}</td>
            <td class="td">{{ roleMap[u.role] || u.role }}</td>
            <td class="td">{{ u.nickname || '-' }}</td>
            <td class="td">
              <span :class="u.status ? 'tag-on' : 'tag-off'">{{ u.status ? '启用' : '禁用' }}</span>
            </td>
            <td class="td">{{ formatTime(u.created_at) }}</td>
            <td class="td" style="text-align:center;white-space:nowrap;">
              <button @click="openEditDialog(u)" class="btn-edit">编辑</button>
              <button @click="openPasswordDialog(u)" class="btn-view">改密</button>
              <button @click="handleToggleStatus(u)" class="btn-view">{{ u.status ? '禁用' : '启用' }}</button>
              <button @click="handleDelete(u)" class="btn-delete">删除</button>
            </td>
          </tr>
          <tr v-if="list.length === 0">
            <td colspan="7" style="text-align:center;padding:30px 0;color:#909399;">暂无用户数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="dialogVisible" class="modal-overlay" @click.self="dialogVisible = false">
      <div class="modal-content" style="max-width:480px;">
        <h2 style="margin-top:0;">{{ dialogType === 'add' ? '📝 新增用户' : '✏️ 编辑用户' }}</h2>
        <form @submit.prevent="submitForm">
          <div class="form-group">
            <label>用户名 *</label>
            <input v-model.trim="form.username" class="input" :disabled="dialogType === 'edit'" placeholder="登录用户名" />
          </div>
          <div v-if="dialogType === 'add'" class="form-group">
            <label>密码 *</label>
            <input v-model.trim="form.password" type="password" class="input" placeholder="至少6位" />
          </div>
          <div class="form-group">
            <label>角色 *</label>
            <select v-model="form.role" class="input">
              <option v-for="(name, key) in roleMap" :key="key" :value="key">{{ name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>昵称</label>
            <input v-model.trim="form.nickname" class="input" placeholder="昵称（选填）" />
          </div>
          <div v-if="dialogType === 'edit'" class="form-group">
            <label>状态</label>
            <select v-model.number="form.status" class="input">
              <option :value="1">启用</option>
              <option :value="0">禁用</option>
            </select>
          </div>
          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
            <button type="button" @click="dialogVisible = false" class="btn-cancel">取消</button>
            <button type="submit" class="btn-primary">{{ dialogType === 'add' ? '确认新增' : '确认修改' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 改密弹窗 -->
    <div v-if="pwdVisible" class="modal-overlay" @click.self="pwdVisible = false">
      <div class="modal-content" style="max-width:400px;">
        <h2 style="margin-top:0;">🔑 修改密码</h2>
        <p style="color:#606266;">为用户 <strong>{{ pwdTarget.username }}</strong> 设置新密码</p>
        <div class="form-group">
          <label>新密码 *</label>
          <input v-model.trim="pwdForm.password" type="password" class="input" placeholder="至少6位" />
        </div>
        <p v-if="pwdError" class="error-msg">{{ pwdError }}</p>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
          <button type="button" @click="pwdVisible = false" class="btn-cancel">取消</button>
          <button @click="submitPassword" class="btn-primary">确认修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { getUsers, addUser, updateUser, changeUserPassword, toggleUserStatus, deleteUser } from '@/api/user';
import { roleMap } from '@/utils/auth';

const list = ref([]);
const filters = reactive({ keyword: '', role: '', status: '' });

const dialogVisible = ref(false);
const dialogType = ref('add');
const errorMsg = ref('');
const editId = ref(null);
const form = ref({ username: '', password: '', role: 'student', nickname: '', status: 1 });

const pwdVisible = ref(false);
const pwdTarget = ref({});
const pwdForm = ref({ password: '' });
const pwdError = ref('');

const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-';

const loadData = async () => {
    try {
        const params = { page: 1, pageSize: 100 };
        if (filters.keyword) params.keyword = filters.keyword;
        if (filters.role) params.role = filters.role;
        if (filters.status !== '') params.status = filters.status;
        const res = await getUsers(params);
        list.value = res.data.list || [];
    } catch (err) {
        alert('加载用户列表失败');
        console.error(err);
    }
};

const openAddDialog = () => {
    dialogType.value = 'add';
    form.value = { username: '', password: '', role: 'student', nickname: '', status: 1 };
    editId.value = null;
    errorMsg.value = '';
    dialogVisible.value = true;
};

const openEditDialog = (u) => {
    dialogType.value = 'edit';
    form.value = { username: u.username, role: u.role, nickname: u.nickname || '', status: u.status };
    editId.value = u.id;
    errorMsg.value = '';
    dialogVisible.value = true;
};

const submitForm = async () => {
    errorMsg.value = '';
    if (!form.value.username) { errorMsg.value = '用户名不能为空'; return; }
    if (dialogType.value === 'add' && !form.value.password) { errorMsg.value = '密码不能为空'; return; }
    try {
        if (dialogType.value === 'add') {
            await addUser(form.value);
            alert('✅ 用户创建成功');
        } else {
            await updateUser(editId.value, {
                role: form.value.role,
                nickname: form.value.nickname,
                status: form.value.status,
            });
            alert('✅ 用户更新成功');
        }
        dialogVisible.value = false;
        await loadData();
    } catch (err) {
        errorMsg.value = err.response?.data?.message || '操作失败';
    }
};

const openPasswordDialog = (u) => {
    pwdTarget.value = u;
    pwdForm.value = { password: '' };
    pwdError.value = '';
    pwdVisible.value = true;
};

const submitPassword = async () => {
    pwdError.value = '';
    if (!pwdForm.value.password || pwdForm.value.password.length < 6) {
        pwdError.value = '密码至少6位';
        return;
    }
    try {
        await changeUserPassword(pwdTarget.value.id, pwdForm.value.password);
        alert('✅ 密码修改成功');
        pwdVisible.value = false;
    } catch (err) {
        pwdError.value = err.response?.data?.message || '修改失败';
    }
};

const handleToggleStatus = async (u) => {
    const next = u.status ? 0 : 1;
    if (!confirm(`确定要${next ? '启用' : '禁用'}用户 ${u.username} 吗？`)) return;
    try {
        await toggleUserStatus(u.id, next);
        await loadData();
    } catch (err) {
        alert(err.response?.data?.message || '操作失败');
    }
};

const handleDelete = async (u) => {
    if (!confirm(`确定要删除用户 ${u.username} 吗？此操作不可恢复。`)) return;
    try {
        await deleteUser(u.id);
        alert('✅ 删除成功');
        await loadData();
    } catch (err) {
        alert(err.response?.data?.message || '删除失败');
    }
};

onMounted(() => {
    loadData();
});
</script>

<style scoped>
.th { padding: 12px 8px; text-align: left; white-space: nowrap; }
.td { padding: 10px 8px; }
.tag-on { background: #e6fffb; color: #13c2c2; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tag-off { background: #fff1f0; color: #ff4d4f; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.error-msg { color: #ff4d4f; font-size: 13px; margin: 8px 0; }
.input { width: 100%; padding: 8px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #409EFF; box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2); }
select.input { appearance: auto; height: 38px; }
.form-group { display: flex; flex-direction: column; margin-bottom: 12px; }
.form-group label { font-weight: 500; margin-bottom: 4px; font-size: 13px; color: #606266; }
.btn-primary { background: #409EFF; color: white; border: none; padding: 8px 20px; border-radius: 4px; font-size: 14px; cursor: pointer; }
.btn-primary:hover { background: #66b1ff; }
.btn-view { background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 4px 10px; border-radius: 4px; margin-right: 4px; cursor: pointer; }
.btn-view:hover { background: #bae7ff; }
.btn-edit { background: #fff7e6; color: #fa8c16; border: 1px solid #ffd591; padding: 4px 10px; border-radius: 4px; margin-right: 4px; cursor: pointer; }
.btn-edit:hover { background: #ffe7ba; }
.btn-delete { background: #fff1f0; color: #ff4d4f; border: 1px solid #ffa39e; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.btn-delete:hover { background: #ffccc7; }
.btn-cancel { background: #f5f5f5; color: #333; border: 1px solid #d9d9d9; padding: 8px 20px; border-radius: 4px; cursor: pointer; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.45); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; padding: 30px 35px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2); width: 100%; max-height: 90vh; overflow-y: auto; }
</style>
