-- ============================================================
-- 班级管理功能迁移脚本（适用于已有数据库增量升级，不破坏现有数据）
-- 数据库: program1
-- 用法: 在 MySQL 中执行本脚本即可
-- 做四件事：
--   1. exams 表增加 subject / class_id 字段
--   2. 创建 classes 班级表
--   3. 创建 student_classes 学生分班关联表
--   4. 默认把现有所有学生大致均分到「1班」「2班」
-- ============================================================

USE program1;

-- 1. exams 表增加字段（若不存在）
--    用条件判断替代 MySQL 不支持的 ADD COLUMN IF NOT EXISTS
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='exams' AND COLUMN_NAME='subject');
SET @sql := IF(@col=0, 'ALTER TABLE `exams` ADD COLUMN `subject` VARCHAR(50) DEFAULT NULL COMMENT ''试卷所属科目'' AFTER `difficulty`', 'SELECT ''exams.subject 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='exams' AND COLUMN_NAME='class_id');
SET @sql := IF(@col=0, 'ALTER TABLE `exams` ADD COLUMN `class_id` INT DEFAULT NULL COMMENT ''目标班级ID'' AFTER `subject`', 'SELECT ''exams.class_id 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='exams' AND INDEX_NAME='idx_subject');
SET @sql := IF(@idx=0, 'ALTER TABLE `exams` ADD INDEX `idx_subject` (`subject`)', 'SELECT ''idx_subject 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='exams' AND INDEX_NAME='idx_class');
SET @sql := IF(@idx=0, 'ALTER TABLE `exams` ADD INDEX `idx_class` (`class_id`)', 'SELECT ''idx_class 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. 班级表
CREATE TABLE IF NOT EXISTS `classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '班级ID',
  name VARCHAR(50) NOT NULL COMMENT '班级名称，如 1班、2班',
  grade VARCHAR(20) DEFAULT NULL COMMENT '年级（可选）',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_name (name),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级表';

-- 3. 学生-班级关联表（一个学生只属于一个班级）
CREATE TABLE IF NOT EXISTS `student_classes` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  student_id INT NOT NULL COMMENT '学生用户ID',
  class_id INT NOT NULL COMMENT '班级ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分班时间',
  UNIQUE KEY uk_student (student_id),
  INDEX idx_class (class_id),
  CONSTRAINT fk_sc_class FOREIGN KEY (class_id) REFERENCES `classes`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生班级关联表';

-- 4. 默认分班：把现有所有未分班的学生大致均分到「1班」「2班」
--    4.1 先确保两个默认班级存在
INSERT IGNORE INTO `classes` (name, grade, remark) VALUES
  ('1班', NULL, '系统默认班级'),
  ('2班', NULL, '系统默认班级');

--    4.2 把未分班的学生按 id 升序轮流分到 1班/2班
INSERT INTO `student_classes` (student_id, class_id)
SELECT u.id,
       CASE WHEN ((@rn := @rn + 1) % 2) = 1
            THEN (SELECT id FROM `classes` WHERE name = '1班' LIMIT 1)
            ELSE (SELECT id FROM `classes` WHERE name = '2班' LIMIT 1)
       END AS class_id
FROM `users` u
LEFT JOIN `student_classes` sc ON sc.student_id = u.id
CROSS JOIN (SELECT @rn := 0) AS v
WHERE u.role = 'student' AND sc.student_id IS NULL
ORDER BY u.id ASC;

-- 完成
SELECT '✅ 班级管理迁移完成：exams 已增加 subject/class_id，classes 与 student_classes 已创建，现有学生已均分到 1班/2班' AS result;
