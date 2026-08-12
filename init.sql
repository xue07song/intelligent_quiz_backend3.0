-- 智能题库系统 - 数据库初始化脚本
-- 数据库: program1
-- 表名: 题库1

CREATE DATABASE IF NOT EXISTS program1
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE program1;

CREATE TABLE IF NOT EXISTS `题库1` (
  id VARCHAR(20) PRIMARY KEY COMMENT '题目标识，如 Q001',
  章节 INT DEFAULT 0 COMMENT '题目所属章节编号',
  题型 INT DEFAULT 2 COMMENT '题型：1判断题 2单选题 3多选题 4填空题 5简答题 6程序论述题',
  序号 INT DEFAULT 0 COMMENT '题目在章节内的排序',
  题目 TEXT NOT NULL COMMENT '题干内容',
  选项 TEXT COMMENT 'ABCD选项内容',
  答案 VARCHAR(255) COMMENT '正确答案',
  解析 TEXT COMMENT '答案解析',
  难度 VARCHAR(10) COMMENT '难度标识，如 1-5',
  知识点 VARCHAR(255) COMMENT '关联知识点',
  使用频度 VARCHAR(50) COMMENT '使用频率',
  出题人 VARCHAR(50) COMMENT '出题人姓名'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能题库表';

-- 用户表（登录与权限管理）
CREATE TABLE IF NOT EXISTS `users` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  username VARCHAR(50) NOT NULL UNIQUE COMMENT '登录用户名',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role ENUM('admin','teacher','student') NOT NULL DEFAULT 'student' COMMENT '角色：admin管理员 teacher教师 student学生',
  nickname VARCHAR(50) COMMENT '昵称',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1启用 0禁用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 默认管理员账号（用户名: admin / 密码: admin123）
INSERT IGNORE INTO `users` (username, password, role, nickname)
VALUES ('admin', '$2b$10$jndatEvivNWlc8LYBlgOm.oGt60gq5PrNV6/s4BtyKJLhgBeizoZ2', 'admin', '系统管理员');

-- ==================== 练习模块表 ====================

-- 试卷表（学生随机组卷生成的试卷）
CREATE TABLE IF NOT EXISTS `exams` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '试卷ID',
  user_id INT NOT NULL COMMENT '组卷用户ID',
  title VARCHAR(100) NOT NULL DEFAULT '练习试卷' COMMENT '试卷名称',
  total_count INT NOT NULL DEFAULT 0 COMMENT '题目总数',
  objective_count INT NOT NULL DEFAULT 0 COMMENT '客观题数量（可自动判分）',
  chapter VARCHAR(50) COMMENT '章节筛选',
  question_type VARCHAR(50) COMMENT '题型筛选',
  difficulty VARCHAR(50) COMMENT '难度筛选',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='练习试卷表';

-- 试卷题目关联表
CREATE TABLE IF NOT EXISTS `exam_questions` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL COMMENT '试卷ID',
  question_id VARCHAR(50) NOT NULL COMMENT '题库题目ID',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '题目顺序',
  INDEX idx_exam (exam_id),
  INDEX idx_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试卷题目关联表';

-- 答题记录表（每次答题的总体结果）
CREATE TABLE IF NOT EXISTS `exam_records` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID',
  exam_id INT NOT NULL COMMENT '试卷ID',
  user_id INT NOT NULL COMMENT '答题用户ID',
  started_at TIMESTAMP NULL COMMENT '开始答题时间',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  duration_seconds INT DEFAULT 0 COMMENT '答题用时（秒）',
  total_count INT NOT NULL DEFAULT 0 COMMENT '题目总数',
  answered_count INT NOT NULL DEFAULT 0 COMMENT '已答数量',
  correct_count INT NOT NULL DEFAULT 0 COMMENT '正确数',
  wrong_count INT NOT NULL DEFAULT 0 COMMENT '错误数',
  skipped_count INT NOT NULL DEFAULT 0 COMMENT '未答数',
  objective_total INT NOT NULL DEFAULT 0 COMMENT '客观题总数',
  objective_correct INT NOT NULL DEFAULT 0 COMMENT '客观题正确数',
  accuracy DECIMAL(5,2) DEFAULT 0.00 COMMENT '准确率（%）',
  score DECIMAL(5,2) DEFAULT 0.00 COMMENT '得分（百分制）',
  INDEX idx_exam (exam_id),
  INDEX idx_user (user_id),
  INDEX idx_user_time (user_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题记录表';

-- 答题明细表（每题作答情况）
CREATE TABLE IF NOT EXISTS `exam_answers` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL COMMENT '答题记录ID',
  question_id VARCHAR(50) NOT NULL COMMENT '题目ID',
  question_type INT COMMENT '题型',
  user_answer TEXT COMMENT '用户作答',
  correct_answer VARCHAR(500) COMMENT '正确答案',
  is_objective TINYINT DEFAULT 1 COMMENT '是否客观题：1是 0否',
  is_correct TINYINT DEFAULT 2 COMMENT '判分：0错 1对 2未答 3非客观题不判分',
  INDEX idx_record (record_id),
  INDEX idx_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题明细表';

-- ==================== 注册审核模块表 ====================

-- 注册申请表（用户提交注册申请，管理员/老师审核后创建正式用户）
CREATE TABLE IF NOT EXISTS `registration_requests` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '申请ID',
  username VARCHAR(50) NOT NULL UNIQUE COMMENT '申请用户名',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role ENUM('teacher','student') NOT NULL DEFAULT 'student' COMMENT '申请角色：teacher教师 student学生（不允许直接申请 admin）',
  nickname VARCHAR(50) COMMENT '昵称',
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending待审核 approved已通过 rejected已拒绝',
  reject_reason VARCHAR(255) COMMENT '拒绝原因（status=rejected 时填写）',
  reviewed_by INT COMMENT '审核人用户ID',
  reviewed_at TIMESTAMP NULL COMMENT '审核时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请提交时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注册申请表';

-- ==================== 反馈模块表 ====================

-- 用户反馈表
CREATE TABLE IF NOT EXISTS `feedbacks` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '反馈ID',
  user_id INT NOT NULL COMMENT '提交用户ID',
  category VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT '分类：bug故障 suggestion建议 other其他',
  title VARCHAR(100) NOT NULL COMMENT '反馈标题',
  content TEXT NOT NULL COMMENT '反馈内容',
  contact VARCHAR(100) COMMENT '联系方式（可选）',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '处理状态：pending待处理 processing处理中 resolved已处理 closed已关闭',
  reply TEXT COMMENT '管理员回复',
  replied_by INT COMMENT '回复人用户ID',
  replied_at TIMESTAMP NULL COMMENT '回复时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表';
