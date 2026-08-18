-- 逻辑修复配套迁移（后端启动时 schemaCompatibility 会自动建列，此文件用于手工初始化/回填）
USE program1;

-- 1) 统一难度口径：文本/星数一律归一为 1-5（1入门 2简单 3中等 4困难 5挑战）
UPDATE `题库1` SET `难度` = '1' WHERE `难度` IN ('入门', '1星', '⭐');
UPDATE `题库1` SET `难度` = '2' WHERE `难度` IN ('简单', '容易', '2星', '⭐⭐');
UPDATE `题库1` SET `难度` = '3' WHERE `难度` IN ('一般', '中等', '3星', '⭐⭐⭐');
UPDATE `题库1` SET `难度` = '4' WHERE `难度` IN ('困难', '较难', '4星', '⭐⭐⭐⭐');
UPDATE `题库1` SET `难度` = '5' WHERE `难度` IN ('挑战', '5星', '⭐⭐⭐⭐⭐');

-- 2) 为历史试卷回填题目快照，保证改题/删题后试卷内容稳定
UPDATE `exam_questions` eq
LEFT JOIN `题库1` q ON eq.question_id = CONVERT(q.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
SET eq.snapshot_章节 = q.章节,
    eq.snapshot_题型 = q.题型,
    eq.snapshot_序号 = q.序号,
    eq.snapshot_题目 = q.题目,
    eq.snapshot_选项 = q.选项,
    eq.snapshot_答案 = q.答案,
    eq.snapshot_解析 = q.解析,
    eq.snapshot_难度 = q.难度,
    eq.snapshot_知识点 = q.知识点
WHERE eq.snapshot_题目 IS NULL;

-- 3) 若产品要支持“一个学生属于多个班级”，把旧 student_id 唯一键迁移为 (student_id, class_id) 唯一
-- 注意：仅在没有重复数据时执行，生产环境需先备份
SET @old_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME IN ('student_id', 'uk_student_class_student'));
SET @sql = IF(@old_index_exists > 0,
  'ALTER TABLE `student_classes` DROP INDEX `student_id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @new_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student_class');
SET @sql = IF(@new_index_exists = 0,
  'ALTER TABLE `student_classes` ADD UNIQUE KEY `uk_student_class` (`student_id`, `class_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
