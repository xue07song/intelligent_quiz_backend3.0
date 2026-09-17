const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middlewares/auth');
const { requireRoles } = require('../middlewares/permission');

// 所有 AI 接口均需登录
router.use(auth);

// AI 配置状态
router.get('/status', aiController.status);

// AI 答疑助手（所有登录用户，做题时使用）
router.post('/tutor', aiController.tutor);

// AI 智能组卷（所有登录用户，学生练习用）
router.post('/smart-exam', aiController.smartExam);

// AI 错题分析（所有登录用户，分析本人）
router.get('/weakness', aiController.weakness);

/**
 * AI 自动出题 —— 题库写入口的一部分，**经用户确认的权限变更**后仅管理员可用。
 *
 * 这两条是 `routes/question.js` 之外唯一的题库写入口（见那边的注释），所以收权限时
 * 必须一起改，否则「教师只读」在前端和 question.js 上都成立、从这里却能绕过去：
 *   · POST /generate/save  → 真正落库（`aiService.saveGenerated` → `questionService.batchImport`），
 *                            不改就是一条完整的写入旁路。
 *   · POST /generate       → **本身不落库**，只返回草稿题目数组。
 *
 * `/generate` 本身不落库，**曾经**是本次改动里唯一一处「对非写接口的收权」，一度作为
 * 待确认项单列。**用户已明确裁定：保持仅管理员** —— 关闭的是教师的**AI 出题能力**，
 * 不只是保存能力；把第一步留给教师、只把第二步锁上，等于没关。此项不再是待决项。
 *
 * ⚠️ **不得误伤**：教师**智能组卷**（基于题库组卷）不是「AI 题库出题」，走的是
 * `POST /ai/smart-exam`（见上，所有登录用户可用）与 `manage.generate` 页面，
 * 与这两条 `/generate*` 无关，本次收紧**没有触碰它们**。
 *
 * 其余 AI 接口（tutor / smart-exam / weakness）与题库写入无关，保持所有登录用户可用。
 */
router.post('/generate', requireRoles('admin'), aiController.generate);
router.post('/generate/save', requireRoles('admin'), aiController.save);

module.exports = router;
