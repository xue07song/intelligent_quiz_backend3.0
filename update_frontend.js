// 临时脚本：修改前端文件
const fs = require('fs');
const path = require('path');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}
function writeText(p, content) {
  fs.writeFileSync(p, content, 'utf8');
}
function replaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error(`[${label}] 未找到目标字符串`);
  }
  const last = content.lastIndexOf(oldStr);
  if (idx !== last) {
    throw new Error(`[${label}] 目标字符串出现多次，请增加上下文`);
  }
  return content.replace(oldStr, newStr);
}

// ============= 1. 修改 practice.js =============
const practicePath = 'd:\\intelligent_quiz_fronted3.0\\src\\api\\practice.js';
let practice = readText(practicePath);

const practiceOld1 = `// 错题本：错题重练
// body: { count, 章节, 题型, title }
export const createWrongExam = (data) => {
  return request.post('/practice/wrong-exams', data);
};`;

const practiceNew1 = `// 错题本：错题重练
// body: { count, 章节, 题型, title }
export const createWrongExam = (data) => {
  return request.post('/practice/wrong-exams', data);
};

// 单题练习：创建一道题的练习卷
export const startSingleQuestionPractice = (questionId) => {
  return request.post('/practice/single-question', { questionId });
};

// 单题判题：提交答案并返回结果（不创建试卷）
export const checkSingleQuestion = (questionId, userAnswer) => {
  return request.post('/practice/single-question/check', { questionId, userAnswer });
};`;

practice = replaceOnce(practice, practiceOld1, practiceNew1, 'practice.js-1');

const practiceOld2 = `// 管理端：以人为界的全局统计总览（每人含汇总 + 最近 N 次答题明细）
export const adminGetAllStats = (params = {}) => {
  return request.get('/practice/admin/stats/all', { params });
};`;

const practiceNew2 = `// 管理端：以人为界的全局统计总览（每人含汇总 + 最近 N 次答题明细）
export const adminGetAllStats = (params = {}) => {
  return request.get('/practice/admin/stats/all', { params });
};

// 题目搜索（学生端）
export const searchQuestions = (params = {}) => {
  return request.get('/practice/questions/search', { params });
};`;

practice = replaceOnce(practice, practiceOld2, practiceNew2, 'practice.js-2');
writeText(practicePath, practice);
console.log('✓ practice.js 修改完成');

// ============= 2. 修改 WrongBook.vue =============
const vuePath = 'd:\\intelligent_quiz_fronted3.0\\src\\components\\practice\\WrongBook.vue';
let vue = readText(vuePath);

// 2a. imports
vue = replaceOnce(vue,
  `import { getWrongQuestions, createWrongExam } from '@/api/practice';`,
  `import { getWrongQuestions, createWrongExam, startSingleQuestionPractice } from '@/api/practice';`,
  'imports');

// 2h. defineEmits
vue = replaceOnce(vue,
  `const emit = defineEmits(['start-exam', 'toast']);`,
  `const emit = defineEmits(['start-exam', 'toast', 'view-question']);`,
  'defineEmits');

// 2b. searchKeyword 变量（在 retryCount 定义之后添加）
vue = replaceOnce(vue,
  `const retryChapter = ref('');
const retryType = ref('');
const retryCount = ref(20);`,
  `const retryChapter = ref('');
const retryType = ref('');
const retryCount = ref(20);
const searchKeyword = ref('');`,
  'searchKeyword');

// 2c. loadData 函数
const loadDataOld = `const loadData = async () => {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (retryChapter.value) params.chapter = retryChapter.value;
    if (retryType.value) params.questionType = retryType.value;
    const data = await getWrongQuestions(params);
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (err) {
    emit('toast', { message: err.message || '加载错题失败', type: 'error' });
  } finally {
    loading.value = false;
  }
};`;

const loadDataNew = `const loadData = async () => {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (retryChapter.value) params.chapter = retryChapter.value;
    if (retryType.value) params.questionType = retryType.value;
    if (searchKeyword.value.trim()) params.keyword = searchKeyword.value.trim();
    const data = await getWrongQuestions(params);
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (err) {
    emit('toast', { message: err.message || '加载错题失败', type: 'error' });
  } finally {
    loading.value = false;
  }
};`;

vue = replaceOnce(vue, loadDataOld, loadDataNew, 'loadData');

// 2d. handleSingleRetry
vue = replaceOnce(vue,
  `const handleSingleRetry = (id) => {
  emit('toast', { message: '单题重练功能开发中', type: 'info' });
};`,
  `const handleSingleRetry = async (id) => {
  try {
    const data = await startSingleQuestionPractice(id);
    emit('toast', { message: \`单题练习已开始\`, type: 'success' });
    emit('start-exam', data.examId);
  } catch (err) {
    emit('toast', { message: err.message || '单题重练失败', type: 'error' });
  }
};`,
  'handleSingleRetry');

// 2e. handleView
vue = replaceOnce(vue,
  `const handleView = (id) => {
  emit('toast', { message: '查看解析功能开发中', type: 'info' });
};`,
  `const handleView = (id) => {
  emit('view-question', id);
};`,
  'handleView');

// 2f. 搜索框（在 retry-left 之后、retry-controls 之前）
const searchBoxOld = `      <div class="retry-left">
        <span class="retry-label">📝 错题重练</span>
        <span class="retry-hint">从当前错题中随机抽取生成一套新试卷，反复巩固易错点</span>
      </div>
      <div class="retry-controls">`;

const searchBoxNew = `      <div class="retry-left">
        <span class="retry-label">📝 错题重练</span>
        <span class="retry-hint">从当前错题中随机抽取生成一套新试卷，反复巩固易错点</span>
      </div>
      <div class="search-box">
        <input
          v-model="searchKeyword"
          class="search-input"
          placeholder="搜索题目/知识点/章节..."
          @keyup.enter="page = 1; loadData()"
        />
        <button class="btn-search" @click="page = 1; loadData()">搜索</button>
      </div>
      <div class="retry-controls">`;

vue = replaceOnce(vue, searchBoxOld, searchBoxNew, 'searchBox');

// 2g. CSS 样式（在 .retry-controls 样式之后添加）
const cssOld = `.retry-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}`;

const cssNew = `.retry-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 300px;
}
.search-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  height: 36px;
}
.search-input:focus {
  outline: none;
  border-color: #6366F1;
}
.btn-search {
  padding: 6px 14px;
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.btn-search:hover {
  background: #E2E8F0;
}`;

vue = replaceOnce(vue, cssOld, cssNew, 'css');
writeText(vuePath, vue);
console.log('✓ WrongBook.vue 修改完成');

console.log('\n所有修改完成！');
