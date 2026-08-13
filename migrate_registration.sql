-- 注册申请表迁移脚本（移除 nickname，新增 subjects 字段）
-- 数据库: program1
-- 用法: 在 MySQL 中执行本脚本即可
-- ============================================================

USE program1;

-- 1. 新增 subjects 字段（教师所教科目，逗号分隔）
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='subjects');
SET @sql := IF(@col_exists=0, 'ALTER TABLE `registration_requests` ADD COLUMN `subjects` VARCHAR(255) DEFAULT NULL COMMENT ''所教科目（教师填写，逗号分隔）'' AFTER `major`', 'SELECT ''subjects 字段已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. 删除 nickname 字段（可选，保留不影响功能）
-- 如需删除，取消下面两行注释：
-- ALTER TABLE `registration_requests` DROP COLUMN IF EXISTS `nickname`;

-- 完成
SELECT '✅ registration_requests 表迁移完成：已新增 subjects 字段' AS result;
