<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="login-card">
      <h1 class="login-title">📚 智能题库管理系统</h1>
      <p class="login-subtitle">请登录后使用</p>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>用户名</label>
          <input v-model.trim="form.username" class="input" placeholder="请输入用户名" autocomplete="username" />
        </div>
        <div class="form-group">
          <label>密码</label>
          <input v-model.trim="form.password" type="password" class="input" placeholder="请输入密码" autocomplete="current-password" />
        </div>
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <button type="submit" class="btn-primary" :disabled="loading">{{ loading ? '登录中...' : '登 录' }}</button>
      </form>
      <div class="login-tip">默认管理员账号：admin / admin123</div>
      <button type="button" class="btn-close" @click="handleClose">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { login } from '@/api/auth';
import { setAuth } from '@/utils/auth';

const props = defineProps({
  visible: { type: Boolean, default: false }
});
const emit = defineEmits(['update:visible', 'success']);

const form = ref({ username: '', password: '' });
const loading = ref(false);
const errorMsg = ref('');

// 弹窗打开时重置表单
watch(() => props.visible, (val) => {
  if (val) {
    form.value = { username: '', password: '' };
    errorMsg.value = '';
  }
});

const handleClose = () => {
  emit('update:visible', false);
};

const handleLogin = async () => {
  errorMsg.value = '';
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  try {
    const res = await login(form.value);
    setAuth(res.data.token, res.data.user);
    emit('update:visible', false);
    emit('success', res.data.user);
  } catch (err) {
    errorMsg.value = err.response?.data?.message || '登录失败，请检查网络或后端服务';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}
.login-card {
  background: #fff;
  padding: 40px 35px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  width: 360px;
}
.login-title { color: #2c3e50; text-align: center; margin: 0 0 8px; font-size: 22px; }
.login-subtitle { color: #909399; text-align: center; margin: 0 0 24px; font-size: 14px; }
.form-group { display: flex; flex-direction: column; margin-bottom: 16px; }
.form-group label { font-weight: 500; margin-bottom: 6px; font-size: 13px; color: #606266; }
.input { width: 100%; padding: 10px 12px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #409EFF; box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2); }
.btn-primary { width: 100%; background: #409EFF; color: white; border: none; padding: 10px; border-radius: 4px; font-size: 15px; cursor: pointer; margin-top: 8px; }
.btn-primary:hover { background: #66b1ff; }
.btn-primary:disabled { background: #a0cfff; cursor: not-allowed; }
.error-msg { color: #ff4d4f; font-size: 13px; margin: 4px 0; }
.login-tip { margin-top: 16px; text-align: center; color: #c0c4cc; font-size: 12px; }
.btn-close { width: 100%; background: #f5f5f5; color: #333; border: 1px solid #d9d9d9; padding: 8px; border-radius: 4px; font-size: 14px; cursor: pointer; margin-top: 10px; }
.btn-close:hover { background: #e8e8e8; }
</style>
