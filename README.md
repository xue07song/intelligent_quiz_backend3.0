# 📚 智能题库管理系统

智能题库是一个前后端分离的全栈项目，用于教育类题目的增删改查管理。支持判断题、单选题、多选题、填空题、简答题、程序论述题等多种题型。

---

## 🏗 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Axios |
| 后端 | Express 5 + mysql2/promise + CORS |
| 数据库 | MySQL 8.x |

---

## 📂 项目结构

```
intelligent-quiz/
├── .env.example              # 环境变量模板（需复制为 .env 后填写）
├── .gitignore                # Git 忽略规则
├── README.md                 # 本文件
├── intelligent-quiz-backend/  # 后端服务
│   ├── app.js                # Express 主入口（REST API）
│   ├── db.js                 # MySQL 连接池配置
│   ├── init.sql              # 数据库建表脚本
│   ├── package.json
│   └── package-lock.json
└── intelligent-quiz-frontend/ # 前端应用
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── package-lock.json
    └── src/
        ├── App.vue           # 主页面（表格 + 弹窗）
        ├── main.js           # 应用入口
        ├── api/question.js   # 题目 API 封装
        └── utils/request.js  # Axios 实例配置
```

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/xue07song/intelligent-quiz.git
cd intelligent-quiz
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

打开 `.env`，将 `DB_PASS` 修改为你本地 MySQL 的 root 密码。

### 3. 初始化数据库

在 MySQL 中执行：

```bash
mysql -u root -p < intelligent-quiz-backend/init.sql
```

或登录 MySQL 后手动执行 `init.sql` 中的内容。

### 4. 安装并启动后端

```bash
cd intelligent-quiz-backend
npm install
npm start
```

后端默认运行在 `http://localhost:3000`。

### 5. 安装并启动前端

另开一个终端：

```bash
cd intelligent-quiz-frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`（以 Vite 实际输出为准）。

---

## 🔌 API 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/questions` | 查询所有题目 |
| GET | `/questions/:id` | 查询单条题目 |
| POST | `/questions` | 新增题目 |
| PUT | `/questions/:id` | 修改题目 |
| DELETE | `/questions/:id` | 删除题目 |

---

## ⚠️ 开发注意事项

1. **不上传 `.env`**：`.env` 已加入 `.gitignore`，**切勿**将含有真实密码的 `.env` 提交到仓库。
2. **自行安装依赖**：`node_modules/` 已加入 `.gitignore`，克隆后务必执行 `npm install`。
3. **后端必须先启动**：前端通过 `http://localhost:3000` 访问后端，请确保后端服务已启动。

---

## 📝 数据模型

表 `questions` 主要字段：

| 字段 | 说明 |
|------|------|
| `id` | 题目标识（如 `Q001`） |
| `章节` | 章节编号 |
| `题型` | 1判断题 / 2单选题 / 3多选题 / 4填空题 / 5简答题 / 6程序论述题 |
| `题目` | 题干内容 |
| `选项` | 选项文本 |
| `答案` | 正确答案 |
| `解析` | 答案解析 |
| `难度` | 难度等级 |
| `知识点` | 关联知识点 |
| `使用频度` | 使用频率 |
| `出题人` | 出题人姓名 |

---

## 👥 参与开发

1. Fork / Clone 本仓库
2. 按「快速开始」步骤配置本地环境
3. 创建功能分支进行开发
4. 提交 Pull Request

---

> 由 xue07song 创建与维护。
