-- 大学用户信息迁移脚本（不破坏现有数据）
USE program1;

-- ============ 1. users 表新增字段 ============
-- 学号（学生）
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME='student_no');
SET @sql := IF(@c=0, 'ALTER TABLE `users` ADD COLUMN `student_no` VARCHAR(20) DEFAULT NULL COMMENT ''学号（学生用）'' AFTER `college`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 工号（教师）
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME='employee_no');
SET @sql := IF(@c=0, 'ALTER TABLE `users` ADD COLUMN `employee_no` VARCHAR(20) DEFAULT NULL COMMENT ''工号（教师用）'' AFTER `student_no`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 专业
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME='major');
SET @sql := IF(@c=0, 'ALTER TABLE `users` ADD COLUMN `major` VARCHAR(50) DEFAULT NULL COMMENT ''专业'' AFTER `employee_no`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 年级
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME='grade');
SET @sql := IF(@c=0, 'ALTER TABLE `users` ADD COLUMN `grade` VARCHAR(20) DEFAULT NULL COMMENT ''年级，如 2024级'' AFTER `major`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 职称（教师）
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME='title');
SET @sql := IF(@c=0, 'ALTER TABLE `users` ADD COLUMN `title` VARCHAR(50) DEFAULT NULL COMMENT ''职称（教师用），如 讲师/副教授/教授'' AFTER `grade`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ============ 2. classes 表新增字段 ============
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='classes' AND COLUMN_NAME='college');
SET @sql := IF(@c=0, 'ALTER TABLE `classes` ADD COLUMN `college` VARCHAR(100) DEFAULT NULL COMMENT ''所属学院'' AFTER `grade`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='classes' AND COLUMN_NAME='major');
SET @sql := IF(@c=0, 'ALTER TABLE `classes` ADD COLUMN `major` VARCHAR(50) DEFAULT NULL COMMENT ''所属专业'' AFTER `college`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ============ 3. registration_requests 表新增字段 ============
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='college');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `college` VARCHAR(100) DEFAULT NULL COMMENT ''学院'' AFTER `nickname`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='major');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `major` VARCHAR(50) DEFAULT NULL COMMENT ''专业'' AFTER `college`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='grade');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `grade` VARCHAR(20) DEFAULT NULL COMMENT ''年级'' AFTER `major`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='student_no');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `student_no` VARCHAR(20) DEFAULT NULL COMMENT ''学号'' AFTER `grade`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='employee_no');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `employee_no` VARCHAR(20) DEFAULT NULL COMMENT ''工号'' AFTER `student_no`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME='title');
SET @sql := IF(@c=0, 'ALTER TABLE `registration_requests` ADD COLUMN `title` VARCHAR(50) DEFAULT NULL COMMENT ''职称'' AFTER `employee_no`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ============ 验证 ============
SELECT '=== users 新字段 ===' AS info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='users' AND COLUMN_NAME IN ('student_no','employee_no','major','grade','title');
SELECT '=== classes 新字段 ===' AS info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='classes' AND COLUMN_NAME IN ('college','major');
SELECT '=== registration_requests 新字段 ===' AS info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='program1' AND TABLE_NAME='registration_requests' AND COLUMN_NAME IN ('college','major','grade','student_no','employee_no','title');
