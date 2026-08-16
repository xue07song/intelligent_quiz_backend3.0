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
  class_id INT DEFAULT NULL COMMENT '目标班级ID（可选，指定后该班学生可见此试卷）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_user (user_id),
  INDEX idx_subject (subject),
  INDEX idx_class (class_id)
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
  name VARCHAR(50) NOT NULL COMMENT '班级名称，如 1班、2班',
  grade VARCHAR(20) DEFAULT NULL COMMENT '年级（可选）',
  college VARCHAR(100) DEFAULT NULL COMMENT '所属学院',
  major VARCHAR(50) DEFAULT NULL COMMENT '所属专业',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_name (name),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级表';

-- 学生-班级关联表（一个学生只属于一个班级）
CREATE TABLE IF NOT EXISTS `student_classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  student_id INT NOT NULL COMMENT '学生用户ID（users.id，role=student）',
  class_id INT NOT NULL COMMENT '班级ID（classes.id）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分班时间',
  UNIQUE KEY uk_student (student_id),
  INDEX idx_class (class_id),
  CONSTRAINT fk_sc_class FOREIGN KEY (class_id) REFERENCES `classes`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生班级关联表';

-- ==================== 学生题库与社区模块表 ====================

-- 学生题库表（与学生社区共享，独立于教师题库）
CREATE TABLE IF NOT EXISTS `student_questions` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '题目ID',
  owner_id INT NOT NULL COMMENT '所属学生用户ID',
  college VARCHAR(50) DEFAULT NULL COMMENT '提交时的学院（社区可见范围）',
  章节 INT DEFAULT 0 COMMENT '题目所属章节编号',
  题型 INT DEFAULT 2 COMMENT '题型：1判断 2单选 3多选 4填空 5简答 6程序论述',
  序号 INT DEFAULT 0 COMMENT '题目排序',
  题目 TEXT NOT NULL COMMENT '题干内容',
  选项 TEXT COMMENT '选项内容',
  答案 VARCHAR(255) COMMENT '正确答案',
  解析 TEXT COMMENT '答案解析',
  难度 VARCHAR(10) COMMENT '难度标识 1-5',
  知识点 VARCHAR(255) COMMENT '关联知识点',
  科目 VARCHAR(50) DEFAULT NULL COMMENT '所属科目',
  source VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT '来源：manual手工 image图片识别',
  is_public TINYINT NOT NULL DEFAULT 0 COMMENT '是否公开到同学院社区',
  review_status ENUM('private','pending','approved','rejected') NOT NULL DEFAULT 'private' COMMENT '审核状态',
  reject_reason VARCHAR(255) DEFAULT NULL COMMENT '拒绝原因',
  reviewed_by INT DEFAULT NULL COMMENT '审核人用户ID',
  reviewed_at TIMESTAMP NULL DEFAULT NULL COMMENT '审核时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_owner (owner_id),
  INDEX idx_college_status (college, review_status),
  INDEX idx_review (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生题库表';

-- 学生版主表（按学院审核社区题目）
CREATE TABLE IF NOT EXISTS `student_moderators` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id INT NOT NULL COMMENT '学生用户ID',
  college VARCHAR(50) NOT NULL COMMENT '负责审核的学院',
  created_by INT DEFAULT NULL COMMENT '创建人（管理员）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_user_college (user_id, college),
  INDEX idx_college (college)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生版主表（按学院）';
