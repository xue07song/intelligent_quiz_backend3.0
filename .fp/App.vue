<template>
  <div id="app">
    <!-- 主界面框架（始终渲染） -->
    <div style="padding:20px;max-width:1400px;margin:0 auto;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <!-- 顶部导航 -->
      <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #e4e7ed;padding-bottom:12px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
          <h1 style="color:#2c3e50;margin:0;">📚 智能题库管理系统</h1>
          <nav v-if="loggedIn" style="display:flex;gap:8px;">
            <button @click="currentView='questions'" :class="currentView==='questions' ? 'nav-active' : 'nav-btn'">题目管理</button>
            <button v-if="canManageUsers" @click="currentView='users'" :class="currentView==='users' ? 'nav-active' : 'nav-btn'">用户管理</button>
          </nav>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <template v-if="loggedIn">
            <span style="color:#606266;font-size:14px;">
              {{ currentUser?.nickname || currentUser?.username }}
              <span style="color:#409EFF;margin-left:6px;">[{{ roleMap[currentUser?.role] || currentUser?.role }}]</span>
            </span>
            <button @click="openProfileDialog" class="btn-profile">个人中心</button>
            <button @click="handleLogout" class="btn-logout">退出登录</button>
          </template>
          <template v-else>
            <button @click="openLoginDialog" class="btn-primary">登录</button>
          </template>
        </div>
      </header>

      <!-- 未登录占位 -->
      <div v-if="!loggedIn" style="text-align:center;padding:80px 20px;color:#909399;">
        <div style="font-size:48px;margin-bottom:16px;">🔒</div>
        <p style="font-size:16px;">请点击右上角"登录"按钮登录后使用系统</p>
      </div>

      <!-- 题目管理视图 -->
      <div v-if="loggedIn" v-show="currentView==='questions'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span v-if="!canWrite" style="color:#909399;font-size:13px;">👁 当前为只读角色，仅可查看题目</span>
          <span v-else></span>
          <div style="display:flex;gap:8px;">
            <button @click="loadData" class="btn-view">🔄 刷新</button>
            <button v-if="canWrite" @click="openAddDialog" class="btn-primary">+ 新增题目</button>
          </div>
        </div>

        <!-- 表格 -->
        <div style="background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow-x:auto;padding:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;min-width:1200px;">
            <thead>
              <tr style="background:#f5f7fa;border-bottom:2px solid #e4e7ed;">
                <th class="th">ID</th>
                <th class="th">章节</th>
                <th class="th">题型</th>
                <th class="th">序号</th>
                <th class="th">题目内容</th>
                <th class="th">选项</th>
                <th class="th">答案</th>
                <th class="th">解析</th>
                <th class="th">难度</th>
                <th class="th">知识点</th>
                <th class="th">使用频率</th>
                <th class="th">出题人</th>
                <th class="th" style="text-align:center;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in list" :key="item.id" style="border-bottom:1px solid #ebeef5;">
                <td class="td">{{ item.id }}</td>
                <td class="td">{{ item.章节 }}</td>
                <td class="td">{{ getTypeName(item.题型) }}</td>
                <td class="td">{{ item.序号 }}</td>
                <td class="td" style="max-width:200px;word-break:break-word;">{{ item.题目 }}</td>
                <td class="td" style="max-width:150px;word-break:break-word;">{{ item.选项 }}</td>
                <td class="td">{{ item.答案 }}</td>
                <td class="td" style="max-width:120px;word-break:break-word;">{{ item.解析 }}</td>
                <td class="td">{{ item.难度 }}</td>
                <td class="td" style="max-width:120px;word-break:break-word;">{{ item.知识点 }}</td>
                <td class="td">{{ item.使用频率 }}</td>
                <td class="td">{{ item.出题人 }}</td>
                <td class="td" style="text-align:center;white-space:nowrap;">
                  <button @click="openViewDialog(item)" class="btn-view">查看</button>
                  <template v-if="canWrite">
                    <button @click="openEditDialog(item)" class="btn-edit">编辑</button>
                    <button @click="handleDelete(item.id)" class="btn-delete">删除</button>
                  </template>
                </td>
              </tr>
              <tr v-if="list.length === 0">
                <td colspan="13" style="text-align:center;padding:30px 0;color:#909399;">暂无数据，请新增</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 用户管理视图 -->
      <div v-if="loggedIn" v-show="currentView==='users'">
        <UserManagement v-if="canManageUsers" />
      </div>

      <!-- 新增/编辑 弹窗 -->
      <div v-if="dialogVisible" class="modal-overlay" @click.self="dialogVisible = false">
        <div class="modal-content" style="max-width:700px;">
          <h2 style="margin-top:0;">{{ dialogType === 'add' ? '📝 新增题目' : '✏️ 编辑题目' }}</h2>
          <form @submit.prevent="submitForm">
            <div class="form-row">
              <div class="form-group"><label>ID *</label><input v-model="form.id" class="input" placeholder="如 Q001" :disabled="dialogType === 'edit'" /></div>
              <div class="form-group"><label>章节</label><input v-model.number="form.章节" type="number" class="input" placeholder="数字" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>题型 *</label>
                <select v-model="form.题型" class="input">
                  <option v-for="(name, key) in typeMap" :key="key" :value="parseInt(key)">{{ name }}</option>
                </select>
              </div>
              <div class="form-group"><label>序号</label><input v-model.number="form.序号" type="number" class="input" placeholder="数字" /></div>
            </div>
            <div class="form-group"><label>题目内容 *</label><input v-model="form.题目" class="input" placeholder="请输入题目" /></div>
            <div class="form-group"><label>选项 (请将ABCD全部填在此处，建议用分隔符)</label>
              <textarea v-model="form.选项" rows="3" class="input" placeholder="例如：A.北京 B.上海 C.广州 D.深圳"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group"><label>答案</label><input v-model="form.答案" class="input" placeholder="如 A" /></div>
              <div class="form-group"><label>解析</label><input v-model="form.解析" class="input" placeholder="解析内容" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>难度</label><input v-model="form.难度" class="input" placeholder="如 1-5" /></div>
              <div class="form-group"><label>知识点</label><input v-model="form.知识点" class="input" placeholder="知识点" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>使用频率</label><input v-model="form.使用频率" class="input" placeholder="如 0" /></div>
              <div class="form-group"><label>出题人</label><input v-model="form.出题人" class="input" placeholder="姓名" /></div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
              <button type="button" @click="dialogVisible = false" class="btn-cancel">取消</button>
              <button type="submit" class="btn-primary">{{ dialogType === 'add' ? '确认新增' : '确认修改' }}</button>
            </div>
          </form>
        </div>
      </div>

      <!-- 查看详情 弹窗（只读） -->
      <div v-if="viewVisible" class="modal-overlay" @click.self="viewVisible = false">
        <div class="modal-content" style="max-width:700px;">
          <h2 style="margin-top:0;">📄 题目详情</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><strong>ID</strong>：{{ viewData.id }}</div>
            <div><strong>章节</strong>：{{ viewData.章节 }}</div>
            <div><strong>题型</strong>：{{ getTypeName(viewData.题型) }}</div>
            <div><strong>序号</strong>：{{ viewData.序号 }}</div>
            <div style="grid-column:1 / -1;"><strong>题目内容</strong>：{{ viewData.题目 }}</div>
            <div style="grid-column:1 / -1;"><strong>选项</strong>：{{ viewData.选项 }}</div>
            <div><strong>答案</strong>：{{ viewData.答案 }}</div>
            <div><strong>解析</strong>：{{ viewData.解析 }}</div>
            <div><strong>难度</strong>：{{ viewData.难度 }}</div>
            <div><strong>知识点</strong>：{{ viewData.知识点 }}</div>
            <div><strong>使用频率</strong>：{{ viewData.使用频率 }}</div>
            <div><strong>出题人</strong>：{{ viewData.出题人 }}</div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:20px;">
            <button @click="viewVisible = false" class="btn-cancel">关闭</button>
          </div>
        </div>
      </div>

      <!-- 个人中心 弹窗 -->
      <div v-if="profileVisible" class="modal-overlay" @click.self="profileVisible = false">
        <div class="modal-content" style="max-width:480px;">
          <h2 style="margin-top:0;">👤 个人中心</h2>

          <!-- 信息展示 -->
          <div style="background:#f5f7fa;padding:16px;border-radius:8px;margin-bottom:20px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px;">
              <div><strong>用户名</strong><br/>{{ profileData.username }}</div>
              <div><strong>角色</strong><br/>
                <span style="color:#409EFF;">{{ roleMap[profileData.role] || profileData.role }}</span>
              </div>
              <div><strong>昵称</strong><br/>{{ profileData.nickname || '-' }}</div>
              <div><strong>状态</strong><br/>
                <span :class="profileData.status ? 'tag-on' : 'tag-off'">{{ profileData.status ? '启用' : '禁用' }}</span>
              </div>
              <div style="grid-column:1 / -1;"><strong>注册时间</strong><br/>{{ formatTime(profileData.created_at) }}</div>
            </div>
          </div>

          <!-- 修改密码表单 -->
          <h3 style="margin:0 0 12px;color:#2c3e50;">🔑 修改密码</h3>
          <form @submit.prevent="submitChangePassword">
            <div class="form-group">
              <label>原密码 *</label>
              <input v-model.trim="pwdForm.oldPassword" type="password" class="input" placeholder="请输入原密码" autocomplete="current-password" />
            </div>
            <div class="form-group">
              <label>新密码 *</label>
              <input v-model.trim="pwdForm.newPassword" type="password" class="input" placeholder="至少6位" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label>确认新密码 *</label>
              <input v-model.trim="pwdForm.confirmPassword" type="password" class="input" placeholder="再次输入新密码" autocomplete="new-password" />
            </div>
            <p v-if="pwdError" class="error-msg">{{ pwdError }}</p>
            <p v-if="pwdSuccess" class="success-msg">{{ pwdSuccess }}</p>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
              <button type="button" @click="profileVisible = false" class="btn-cancel">关闭</button>
              <button type="submit" class="btn-primary" :disabled="pwdLoading">{{ pwdLoading ? '提交中...' : '确认修改' }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 登录弹窗（独立于主界面，可叠加） -->
    <Login v-model:visible="loginVisible" @success="onLoginSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Login from '@/views/Login.vue';
import UserManagement from '@/views/UserManagement.vue';
import { getQuestions, addQuestion, updateQuestion, deleteQuestion } from '@/api/question';
import { getProfile, changePassword } from '@/api/auth';
import { isAuthenticated, getUser, clearAuth, setAuth, hasRole, roleMap } from '@/utils/auth';

// 题型映射
const typeMap = {
  1: '判断题',
  2: '单选题',
  3: '多选题',
  4: '填空题',
  5: '简答题',
  6: '程序论述题'
};
const getTypeName = (type) => typeMap[type] || '未知';

// ----- 登录态 -----
const loggedIn = ref(isAuthenticated());
const currentUser = ref(getUser());
const currentView = ref('questions');

// 权限计算属性
const canWrite = computed(() => hasRole('admin', 'teacher'));
const canManageUsers = computed(() => hasRole('admin'));

// ----- 登录弹窗 -----
const loginVisible = ref(false);
const openLoginDialog = () => { loginVisible.value = true; };

// ----- 个人中心弹窗 -----
const profileVisible = ref(false);
const profileData = ref({});
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const pwdError = ref('');
const pwdSuccess = ref('');
const pwdLoading = ref(false);

const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-';

const openProfileDialog = async () => {
  pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
  pwdError.value = '';
  pwdSuccess.value = '';
  profileVisible.value = true;
  // 从后端拉取最新信息
  try {
    const res = await getProfile();
    profileData.value = res.data;
  } catch (err) {
    // 拉取失败时回退到本地缓存
    profileData.value = currentUser.value || {};
  }
};

const submitChangePassword = async () => {
  pwdError.value = '';
  pwdSuccess.value = '';
  const { oldPassword, newPassword, confirmPassword } = pwdForm.value;
  if (!oldPassword || !newPassword || !confirmPassword) {
    pwdError.value = '请填写所有密码字段';
    return;
  }
  if (newPassword.length < 6) {
    pwdError.value = '新密码长度不能少于6位';
    return;
  }
  if (newPassword !== confirmPassword) {
    pwdError.value = '两次输入的新密码不一致';
    return;
  }
  pwdLoading.value = true;
  try {
    await changePassword({ oldPassword, newPassword });
    pwdSuccess.value = '✅ 密码修改成功，请重新登录';
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    // 修改密码后自动登出，要求重新登录
    setTimeout(() => {
      profileVisible.value = false;
      handleLogout();
      loginVisible.value = true;
    }, 1500);
  } catch (err) {
    pwdError.value = err.response?.data?.message || '密码修改失败';
  } finally {
    pwdLoading.value = false;
  }
};

// ----- 数据状态 -----
const list = ref([]);
const dialogVisible = ref(false);
const dialogType = ref('add');
const viewVisible = ref(false);
const viewData = ref({});
const editId = ref(null);

const defaultForm = {
  id: '',
  章节: '',
  题型: 2,
  序号: 0,
  题目: '',
  选项: '',
  答案: '',
  解析: '',
  难度: '',
  知识点: '',
  使用频率: '',
  出题人: ''
};
const form = ref({ ...defaultForm });

// ----- 加载数据 -----
const loadData = async () => {
  if (!loggedIn.value) return;
  try {
    const res = await getQuestions();
    list.value = res.data?.list || [];
  } catch (error) {
    console.error('加载题目失败:', error);
  }
};

// ----- 登录/登出 -----
const onLoginSuccess = (user) => {
  loggedIn.value = true;
  currentUser.value = user;
  currentView.value = 'questions';
  loadData();
};

const handleLogout = () => {
  clearAuth();
  loggedIn.value = false;
  currentUser.value = null;
  list.value = [];
  currentView.value = 'questions';
};

// 401 被动登出（token 失效），弹出登录窗
const handleForceLogout = () => {
  loggedIn.value = false;
  currentUser.value = null;
  list.value = [];
  loginVisible.value = true;
};

// ----- 新增 -----
const openAddDialog = () => {
  dialogType.value = 'add';
  form.value = { ...defaultForm, id: generateId() };
  editId.value = null;
  dialogVisible.value = true;
};
const generateId = () => {
  const maxId = list.value.reduce((max, item) => {
    const num = parseInt(item.id.replace(/\D/g, ''), 10);
    return num > max ? num : max;
  }, 0);
  return `Q${String(maxId + 1).padStart(3, '0')}`;
};

// ----- 编辑 -----
const openEditDialog = (item) => {
  dialogType.value = 'edit';
  form.value = { ...item };
  editId.value = item.id;
  dialogVisible.value = true;
};

// ----- 查看详情 -----
const openViewDialog = (item) => {
  viewData.value = { ...item };
  viewVisible.value = true;
};

// ----- 提交表单（新增/编辑） -----
const submitForm = async () => {
  if (!form.value.id || !form.value.题目) {
    alert('ID 和 题目内容不能为空');
    return;
  }
  if (form.value.章节 === '' || form.value.章节 === null) form.value.章节 = 0;
  if (form.value.序号 === '' || form.value.序号 === null) form.value.序号 = 0;

  try {
    if (dialogType.value === 'add') {
      await addQuestion(form.value);
      alert('✅ 新增成功');
    } else {
      await updateQuestion(editId.value, form.value);
      alert('✅ 修改成功');
    }
    dialogVisible.value = false;
    await loadData();
  } catch (error) {
    const msg = error.response?.data?.message || '操作失败，请检查控制台错误';
    alert('❌ ' + msg);
    console.error(error);
  }
};

// ----- 删除 -----
const handleDelete = async (id) => {
  if (!confirm('确定要删除该题目吗？')) return;
  try {
    await deleteQuestion(id);
    alert('✅ 删除成功');
    await loadData();
  } catch (error) {
    const msg = error.response?.data?.message || '删除失败';
    alert('❌ ' + msg);
    console.error(error);
  }
};

// ----- 生命周期 -----
onMounted(() => {
  window.addEventListener('auth:logout', handleForceLogout);
  // 未登录时自动弹出登录窗
  if (!loggedIn.value) {
    loginVisible.value = true;
  } else {
    loadData();
  }
});
onUnmounted(() => {
  window.removeEventListener('auth:logout', handleForceLogout);
});
</script>

<style scoped>
body { margin: 0; background: #f0f2f5; }
#app { background: #f0f2f5; min-height: 100vh; }

/* 导航按钮 */
.nav-btn {
  background: #fff;
  color: #606266;
  border: 1px solid #dcdfe6;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.nav-btn:hover { color: #409EFF; border-color: #c6e2ff; }
.nav-active {
  background: #409EFF;
  color: white;
  border: 1px solid #409EFF;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.btn-logout {
  background: #fff1f0;
  color: #ff4d4f;
  border: 1px solid #ffa39e;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}
.btn-logout:hover { background: #ffccc7; }

.btn-profile {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}
.btn-profile:hover { background: #d9f7be; }

/* 按钮 */
.btn-primary {
  background: #409EFF;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover { background: #66b1ff; }

.btn-view {
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
  padding: 4px 10px;
  border-radius: 4px;
  margin-right: 4px;
  cursor: pointer;
}
.btn-view:hover { background: #bae7ff; }

.btn-edit {
  background: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
  padding: 4px 10px;
  border-radius: 4px;
  margin-right: 4px;
  cursor: pointer;
}
.btn-edit:hover { background: #ffe7ba; }

.btn-delete {
  background: #fff1f0;
  color: #ff4d4f;
  border: 1px solid #ffa39e;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-delete:hover { background: #ffccc7; }

.btn-cancel {
  background: #f5f5f5;
  color: #333;
  border: 1px solid #d9d9d9;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-cancel:hover { background: #e8e8e8; }

/* 表单 */
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  background: white;
}
.input:focus {
  outline: none;
  border-color: #409EFF;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
select.input {
  appearance: auto;
  height: 38px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}
.form-group label {
  font-weight: 500;
  margin-bottom: 4px;
  font-size: 13px;
  color: #606266;
}

/* 表格 */
.th { padding: 12px 8px; text-align: left; white-space: nowrap; }
.td { padding: 10px 8px; }

/* 标签 */
.tag-on { background: #f6ffed; color: #52c41a; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tag-off { background: #fff1f0; color: #ff4d4f; padding: 2px 8px; border-radius: 10px; font-size: 12px; }

/* 弹窗遮罩 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  padding: 30px 35px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.error-msg { color: #ff4d4f; font-size: 13px; margin: 8px 0; }
.success-msg { color: #52c41a; font-size: 13px; margin: 8px 0; }

/* 表格响应式 */
@media (max-width: 768px) {
  .form-row { grid-template-columns: 1fr; gap: 8px; }
  .modal-content { padding: 20px; }
}
</style>
