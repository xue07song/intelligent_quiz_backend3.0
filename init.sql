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
  出题人 VARCHAR(50) COMMENT '出题人姓名',
  科目 VARCHAR(50) DEFAULT NULL COMMENT '题目所属科目，对应 subjects 常量列表中的科目名',
  INDEX idx_subject (科目)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能题库表';

-- 用户表（登录与权限管理）
CREATE TABLE IF NOT EXISTS `users` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  username VARCHAR(50) NOT NULL UNIQUE COMMENT '登录用户名',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role ENUM('admin','teacher','student') NOT NULL DEFAULT 'student' COMMENT '角色：admin管理员 teacher教师 student学生',
  nickname VARCHAR(50) COMMENT '昵称',
  email VARCHAR(255) NULL COMMENT '邮箱',
  phone VARCHAR(50) NULL COMMENT '手机号',
  school VARCHAR(255) NULL COMMENT '学校',
  college VARCHAR(255) NULL COMMENT '学院',
  student_no VARCHAR(20) DEFAULT NULL COMMENT '学号（学生用）',
  employee_no VARCHAR(20) DEFAULT NULL COMMENT '工号（教师用）',
  major VARCHAR(50) DEFAULT NULL COMMENT '专业',
  grade VARCHAR(20) DEFAULT NULL COMMENT '年级，如 2024级',
  title VARCHAR(50) DEFAULT NULL COMMENT '职称（教师用），如 讲师/副教授/教授',
  class_id INT DEFAULT NULL COMMENT '主必修班ID（冗余字段，快速查询用；实际归属以 student_classes 为准）',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1启用 0禁用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 默认管理员账号（用户名: admin / 密码: admin123）
INSERT IGNORE INTO `users` (username, password, role, nickname)
VALUES ('admin', '$2b$10$jndatEvivNWlc8LYBlgOm.oGt60gq5PrNV6/s4BtyKJLhgBeizoZ2', 'admin', '系统管理员');

-- 注册申请表（学生/教师自助注册，管理员审核）
CREATE TABLE IF NOT EXISTS `registration_requests` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '注册申请ID',
  username VARCHAR(50) NOT NULL COMMENT '申请用户名',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role ENUM('student','teacher') NOT NULL DEFAULT 'student' COMMENT '申请角色',
  nickname VARCHAR(50) NULL COMMENT '昵称',
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  reject_reason VARCHAR(255) NULL COMMENT '拒绝原因',
  handled_by INT NULL COMMENT '处理人ID',
  handled_at TIMESTAMP NULL COMMENT '处理时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  UNIQUE KEY uk_registration_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注册申请表';

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
  subject VARCHAR(50) DEFAULT NULL COMMENT '试卷所属科目（教师组卷时必填，对应其所教科目）',
  class_id INT DEFAULT NULL COMMENT '目标班级ID（冗余，历史兼容；多选班级看 exam_classes 表）',
  status ENUM('draft','published','closed') NOT NULL DEFAULT 'published' COMMENT '试卷状态：draft草稿 published已发布 closed已关闭',
  duration_minutes INT DEFAULT NULL COMMENT '限时答题（分钟），NULL表示不限时',
  start_at DATETIME DEFAULT NULL COMMENT '允许开始答题时间（NULL表示随时可开始）',
  end_at DATETIME DEFAULT NULL COMMENT '截止答题时间（NULL表示不截止）',
  max_attempts INT DEFAULT NULL COMMENT '最大作答次数（NULL表示不限）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_user (user_id),
  INDEX idx_subject (subject),
  INDEX idx_class (class_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='练习试卷表';

-- 试卷题目关联表（含题目快照，防止题库原题修改后历史作答失真）
CREATE TABLE IF NOT EXISTS `exam_questions` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL COMMENT '试卷ID',
  question_id VARCHAR(50) NOT NULL COMMENT '题库题目ID',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '题目顺序',
  snapshot_章节 INT DEFAULT NULL COMMENT '快照：章节',
  snapshot_题型 INT DEFAULT NULL COMMENT '快照：题型',
  snapshot_序号 INT DEFAULT NULL COMMENT '快照：序号',
  snapshot_题目 TEXT COMMENT '快照：题干',
  snapshot_选项 TEXT COMMENT '快照：选项',
  snapshot_答案 VARCHAR(500) COMMENT '快照：正确答案',
  snapshot_解析 TEXT COMMENT '快照：解析',
  snapshot_难度 VARCHAR(10) COMMENT '快照：难度',
  snapshot_知识点 VARCHAR(255) COMMENT '快照：知识点',
  INDEX idx_exam (exam_id),
  INDEX idx_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试卷题目关联表';

-- 作答尝试表（服务端计时与次数控制，每 startExam 一次插入一条新 attempt）
CREATE TABLE IF NOT EXISTS `exam_attempts` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  exam_id INT NOT NULL COMMENT '试卷ID exams.id',
  user_id INT NOT NULL COMMENT '学生ID users.id',
  attempt_no INT NOT NULL DEFAULT 1 COMMENT '第几次作答（从1开始递增）',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '开始答题时间',
  submitted_at TIMESTAMP NULL COMMENT '提交时间（NULL=进行中）',
  UNIQUE KEY uk_exam_user_attempt (exam_id, user_id, attempt_no),
  INDEX idx_exam_user (exam_id, user_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作答尝试（计时与次数控制）';

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
  is_correct TINYINT DEFAULT 2 COMMENT '判分：0错/需要巩固 1对/正确 2未答 3部分掌握/待复核',
  review_status VARCHAR(20) DEFAULT NULL COMMENT '教师复核状态：correct/partial/incorrect/review',
  review_score_rate DECIMAL(5,2) DEFAULT NULL COMMENT '最终得分比例（0-1），仅 review_status=partial 时使用',
  review_comment VARCHAR(500) DEFAULT NULL COMMENT '教师复核意见',
  reviewed_by INT DEFAULT NULL COMMENT '执行复核的教师 users.id',
  reviewed_at DATETIME DEFAULT NULL COMMENT '复核时间',
  INDEX idx_record (record_id),
  INDEX idx_question (question_id),
  INDEX idx_review_status (review_status),
  INDEX idx_reviewed_by (reviewed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题明细表';

-- 答题草稿表（学生答题中保存临时答案，刷新页面不丢失）
CREATE TABLE IF NOT EXISTS `exam_drafts` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '草稿ID',
  exam_id INT NOT NULL COMMENT '试卷ID exams.id',
  user_id INT NOT NULL COMMENT '学生用户ID users.id',
  answers JSON DEFAULT NULL COMMENT 'JSON 形式保存 { questionId: userAnswer }',
  duration_seconds INT DEFAULT 0 COMMENT '已用时间（秒），断网/刷新后可续时',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_exam_user (exam_id, user_id),
  INDEX idx_user (user_id),
  INDEX idx_exam (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题草稿表';

-- ==================== 注册审核模块表 ====================

-- 注册申请表（用户提交注册申请，管理员/老师审核后创建正式用户）
CREATE TABLE IF NOT EXISTS `registration_requests` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '申请ID',
  username VARCHAR(50) NOT NULL UNIQUE COMMENT '申请用户名',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role ENUM('teacher','student') NOT NULL DEFAULT 'student' COMMENT '申请角色：teacher教师 student学生（不允许直接申请 admin）',
  college VARCHAR(100) DEFAULT NULL COMMENT '学院',
  major VARCHAR(50) DEFAULT NULL COMMENT '专业（学生填写）',
  subjects VARCHAR(255) DEFAULT NULL COMMENT '所教科目（教师填写，逗号分隔）',
  grade VARCHAR(20) DEFAULT NULL COMMENT '年级',
  student_no VARCHAR(20) DEFAULT NULL COMMENT '学号（学生填写）',
  employee_no VARCHAR(20) DEFAULT NULL COMMENT '工号',
  title VARCHAR(50) DEFAULT NULL COMMENT '职称',
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

-- ==================== 个人中心模块表 ====================

-- 用户收藏题目表（学生个人中心标记题目）
CREATE TABLE IF NOT EXISTS `user_favorites` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '收藏ID',
  user_id INT NOT NULL COMMENT '用户ID',
  question_id VARCHAR(50) NOT NULL COMMENT '题目ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  UNIQUE KEY uk_user_question (user_id, question_id),
  INDEX idx_user (user_id),
  INDEX idx_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收藏题目表';

-- ==================== 科目分类模块表 ====================

-- 教师科目关联表（教师与科目多对多，一个老师可教多门科目）
CREATE TABLE IF NOT EXISTS `teacher_subjects` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id INT NOT NULL COMMENT '教师用户ID（users.id，role=teacher）',
  subject VARCHAR(50) NOT NULL COMMENT '科目名称（对应 subjects 固定常量列表）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_user_subject (user_id, subject),
  INDEX idx_user (user_id),
  INDEX idx_subject (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师科目关联表';

-- ==================== 班级管理模块表 ====================

-- 班级表
CREATE TABLE IF NOT EXISTS `classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '班级ID',
  name VARCHAR(50) NOT NULL COMMENT '班级名称，格式：课程(科目)名+几班，如 数据结构1班、人工智能2班',
  grade VARCHAR(20) DEFAULT NULL COMMENT '年级（可选）',
  college VARCHAR(100) DEFAULT NULL COMMENT '所属学院',
  major VARCHAR(50) DEFAULT NULL COMMENT '所属专业',
  type ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '班级类型：compulsory必修 elective选修',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_name (name),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级表';

-- 学生-班级关联表（多对多：一个学生可同时属于必修班和多个选修班）
CREATE TABLE IF NOT EXISTS `student_classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  student_id INT NOT NULL COMMENT '学生用户ID（users.id，role=student）',
  class_id INT NOT NULL COMMENT '班级ID（classes.id）',
  type ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '关系类型：compulsory必修 elective选修',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分班时间',
  UNIQUE KEY uk_student_class (student_id, class_id),
  INDEX idx_class (class_id),
  INDEX idx_student (student_id),
  INDEX idx_type (type),
  CONSTRAINT fk_sc_class FOREIGN KEY (class_id) REFERENCES `classes`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生班级关联表（多对多）';

-- ==================== 兼容旧库的迁移语句（幂等，可安全重复执行）====================

-- classes 表加 type 字段
ALTER TABLE `classes` ADD COLUMN IF NOT EXISTS `type` ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '班级类型：compulsory必修 elective选修';

-- users 表加 class_id 冗余字段
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `class_id` INT DEFAULT NULL COMMENT '主必修班ID（冗余字段，快速查询用；实际归属以 student_classes 为准）';

-- student_classes 表加 type 字段
ALTER TABLE `student_classes` ADD COLUMN IF NOT EXISTS `type` ENUM('compulsory','elective') NOT NULL DEFAULT 'compulsory' COMMENT '关系类型：compulsory必修 elective选修';

-- student_classes 表去掉旧的 student_id 唯一约束（改为多对多），加 (student_id, class_id) 唯一约束
-- 注意：MySQL 8.0 不支持 IF EXISTS 于 DROP INDEX，需要用存储过程或手动执行
-- 以下为安全迁移：先检查并删除旧约束，再添加新约束
SET @old_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student');
SET @sql = IF(@old_index_exists > 0, 'ALTER TABLE `student_classes` DROP INDEX `uk_student`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @new_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student_class');
SET @sql = IF(@new_index_exists = 0, 'ALTER TABLE `student_classes` ADD UNIQUE KEY `uk_student_class` (`student_id`, `class_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== exams 表扩展列迁移（安全探测 + 动态SQL） ====================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'status');
SET @sql = IF(@col = 0, "ALTER TABLE `exams` ADD COLUMN `status` ENUM('draft','published','closed') NOT NULL DEFAULT 'published' COMMENT '试卷状态'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'duration_minutes');
SET @sql = IF(@col = 0, "ALTER TABLE `exams` ADD COLUMN `duration_minutes` INT DEFAULT NULL COMMENT '限时答题（分钟）'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'start_at');
SET @sql = IF(@col = 0, "ALTER TABLE `exams` ADD COLUMN `start_at` DATETIME DEFAULT NULL COMMENT '允许开始答题时间'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'end_at');
SET @sql = IF(@col = 0, "ALTER TABLE `exams` ADD COLUMN `end_at` DATETIME DEFAULT NULL COMMENT '截止答题时间'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'max_attempts');
SET @sql = IF(@col = 0, "ALTER TABLE `exams` ADD COLUMN `max_attempts` INT DEFAULT NULL COMMENT '最大作答次数'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== exam_questions 表快照列迁移 ====================
SET @snap_cols = 'snapshot_章节,snapshot_题型,snapshot_序号,snapshot_题目,snapshot_选项,snapshot_答案,snapshot_解析,snapshot_难度,snapshot_知识点';
SET @snap_defs = CONCAT_WS('||',
  'snapshot_章节|INT DEFAULT NULL|快照：章节',
  'snapshot_题型|INT DEFAULT NULL|快照：题型',
  'snapshot_序号|INT DEFAULT NULL|快照：序号',
  'snapshot_题目|TEXT|快照：题干',
  'snapshot_选项|TEXT|快照：选项',
  'snapshot_答案|VARCHAR(500)|快照：正确答案',
  'snapshot_解析|TEXT|快照：解析',
  'snapshot_难度|VARCHAR(10)|快照：难度',
  'snapshot_知识点|VARCHAR(255)|快照：知识点'
);
-- 使用存储过程逐列安全添加（此处简化：在 seed.js 中逐列探测添加）

-- ==================== exam_attempts 表不存在则创建 ====================
CREATE TABLE IF NOT EXISTS `exam_attempts` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  exam_id INT NOT NULL COMMENT '试卷ID exams.id',
  user_id INT NOT NULL COMMENT '学生ID users.id',
  attempt_no INT NOT NULL DEFAULT 1 COMMENT '第几次作答（从1开始递增）',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '开始答题时间',
  submitted_at TIMESTAMP NULL COMMENT '提交时间（NULL=进行中）',
  UNIQUE KEY uk_exam_user_attempt (exam_id, user_id, attempt_no),
  INDEX idx_exam_user (exam_id, user_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作答尝试（计时与次数控制）';

-- ==================== exam_classes 多班级关联表（智能组卷多选目标班级） ====================
CREATE TABLE IF NOT EXISTS `exam_classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  exam_id INT NOT NULL COMMENT '试卷ID exams.id',
  class_id INT NOT NULL COMMENT '班级ID classes.id',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_exam_class (exam_id, class_id),
  INDEX idx_exam (exam_id),
  INDEX idx_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试卷目标班级关联表（多选）';
