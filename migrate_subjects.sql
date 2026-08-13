-- ============================================================
-- 科目分类功能迁移脚本（适用于已有数据库增量升级，不破坏现有数据）
-- 数据库: program1
-- 用法: 在 MySQL 中执行本脚本即可
-- ============================================================

USE program1;

-- 1. 题库表增加「科目」字段（若不存在）
--    用条件判断替代 MySQL 不支持的 ADD COLUMN IF NOT EXISTS
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='题库1' AND COLUMN_NAME='科目');
SET @sql := IF(@col=0, 'ALTER TABLE `题库1` ADD COLUMN `科目` VARCHAR(50) DEFAULT NULL COMMENT ''题目所属科目'' AFTER `出题人`', 'SELECT ''科目 字段已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='题库1' AND INDEX_NAME='idx_subject');
SET @sql := IF(@idx=0, 'ALTER TABLE `题库1` ADD INDEX `idx_subject` (`科目`)', 'SELECT ''idx_subject 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. 新建教师科目关联表（多对多：一个老师可教多门科目）
CREATE TABLE IF NOT EXISTS `teacher_subjects` (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  user_id INT NOT NULL COMMENT '教师用户ID（users.id，role=teacher）',
  subject VARCHAR(50) NOT NULL COMMENT '科目名称（对应 subjects 固定常量列表）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_user_subject (user_id, subject),
  INDEX idx_user (user_id),
  INDEX idx_subject (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师科目关联表';

-- 完成
SELECT '✅ 科目分类迁移完成：题库1 已增加 科目 字段，teacher_subjects 表已创建' AS result;
