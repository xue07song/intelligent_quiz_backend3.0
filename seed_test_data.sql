-- ==================== 测试数据：老师 + 学生 ====================
-- 所有密码统一为 123456（bcrypt hash，10轮加密）
-- 老师账号：teacher_liqiang ~ teacher_zhaolei
-- 学生账号：student_lizihao ~ student_sunyutong

-- 先确认 classes 表有 type 列
SET @has_type = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'type');
SET @sql = IF(@has_type = 0, 'ALTER TABLE `classes` ADD COLUMN `type` ENUM(''compulsory'',''elective'') NOT NULL DEFAULT ''compulsory'' COMMENT ''班级类型''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 先确认 users 表有 class_id 列
SET @has_classid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'class_id');
SET @sql = IF(@has_classid = 0, 'ALTER TABLE `users` ADD COLUMN `class_id` INT DEFAULT NULL COMMENT ''主必修班ID''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 先确认 student_classes 有 type 列
SET @has_sctype = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND COLUMN_NAME = 'type');
SET @sql = IF(@has_sctype = 0, 'ALTER TABLE `student_classes` ADD COLUMN `type` ENUM(''compulsory'',''elective'') NOT NULL DEFAULT ''compulsory'' COMMENT ''关系类型''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 去掉旧的 student_id 唯一约束（如果存在）
SET @old_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student');
SET @sql = IF(@old_idx > 0, 'ALTER TABLE `student_classes` DROP INDEX `uk_student`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 加 (student_id, class_id) 复合唯一键（如果不存在）
SET @new_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_classes' AND INDEX_NAME = 'uk_student_class');
SET @sql = IF(@new_idx = 0, 'ALTER TABLE `student_classes` ADD UNIQUE KEY `uk_student_class` (`student_id`, `class_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== 插入班级 ====================
INSERT INTO `classes` (`name`, `grade`, `college`, `major`, `type`, `remark`) VALUES
('计算机科学与技术1班', '2023级', '计算机学院', '计算机科学与技术', 'compulsory', '2023级计科1班'),
('计算机科学与技术2班', '2023级', '计算机学院', '计算机科学与技术', 'compulsory', '2023级计科2班'),
('软件工程1班', '2023级', '计算机学院', '软件工程', 'compulsory', '2023级软工1班'),
('人工智能实验班', '2023级', '计算机学院', '人工智能', 'elective', '选修：AI方向拔尖班'),
('数据科学交叉班', '2023级', '计算机学院', '数据科学与大数据技术', 'elective', '选修：跨学科交叉')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ==================== 插入教师（5名）====================
-- 密码均为 123456
INSERT INTO `users` (`username`, `password`, `role`, `nickname`, `college`, `major`, `grade`, `employee_no`, `title`, `status`) VALUES
('teacher_liqiang', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '李强', '计算机学院', '计算机科学与技术', NULL, 'T2021001', '副教授', 1),
('teacher_wangming', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '王明', '计算机学院', '软件工程', NULL, 'T2021002', '讲师', 1),
('teacher_zhangwei', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '张伟', '计算机学院', '人工智能', NULL, 'T2021003', '教授', 1),
('teacher_chenjing', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '陈静', '计算机学院', '数据科学与大数据技术', NULL, 'T2021004', '副教授', 1),
('teacher_zhaolei', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '赵磊', '计算机学院', '计算机科学与技术', NULL, 'T2021005', '讲师', 1)
ON DUPLICATE KEY UPDATE `nickname` = VALUES(`nickname`);

-- 教师科目关联（teacher_subjects 表，注意列名是 user_id）
INSERT INTO `teacher_subjects` (`user_id`, `subject`) VALUES
((SELECT id FROM users WHERE username='teacher_liqiang'), '计算机网络'),
((SELECT id FROM users WHERE username='teacher_liqiang'), '操作系统'),
((SELECT id FROM users WHERE username='teacher_wangming'), '软件工程'),
((SELECT id FROM users WHERE username='teacher_wangming'), '数据结构'),
((SELECT id FROM users WHERE username='teacher_zhangwei'), '人工智能'),
((SELECT id FROM users WHERE username='teacher_zhangwei'), '机器学习'),
((SELECT id FROM users WHERE username='teacher_chenjing'), '数据库原理'),
((SELECT id FROM users WHERE username='teacher_chenjing'), '高等数学'),
((SELECT id FROM users WHERE username='teacher_zhaolei'), '计算机组成原理'),
((SELECT id FROM users WHERE username='teacher_zhaolei'), '大学物理')
ON DUPLICATE KEY UPDATE `subject` = VALUES(`subject`);

-- ==================== 插入学生（20名）====================
-- 密码均为 123456
-- 学号规则：2023 + 专业代码(01=计科, 02=软工, 03=AI) + 序号
INSERT INTO `users` (`username`, `password`, `role`, `nickname`, `college`, `major`, `grade`, `student_no`, `status`) VALUES
('student_lizihao',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '李子豪', '计算机学院', '计算机科学与技术', '2023', '202301001', 1),
('student_wangyihan', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '王一涵', '计算机学院', '计算机科学与技术', '2023', '202301002', 1),
('student_zhangxinyu','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '张欣宇', '计算机学院', '计算机科学与技术', '2023', '202301003', 1),
('student_chenyifei', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '陈亦菲', '计算机学院', '计算机科学与技术', '2023', '202301004', 1),
('student_liuyifei',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '刘亦菲', '计算机学院', '计算机科学与技术', '2023', '202301005', 1),
('student_zhouziyang','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '周子阳', '计算机学院', '计算机科学与技术', '2023', '202301006', 1),
('student_wujiaqi',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '吴佳琪', '计算机学院', '计算机科学与技术', '2023', '202301007', 1),
('student_zhengshuyi','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '郑舒怡', '计算机学院', '计算机科学与技术', '2023', '202301008', 1),
('student_sunhaochen','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '孙浩辰', '计算机学院', '软件工程', '2023', '202302001', 1),
('student_zhaoyutong','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '赵雨彤', '计算机学院', '软件工程', '2023', '202302002', 1),
('student_qianzilin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '钱子琳', '计算机学院', '软件工程', '2023', '202302003', 1),
('student_fengyuxuan','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '冯雨萱', '计算机学院', '软件工程', '2023', '202302004', 1),
('student_chengyiming','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','student', '程一鸣', '计算机学院', '软件工程', '2023', '202302005', 1),
('student_chuyuxin',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '楚雨欣', '计算机学院', '软件工程', '2023', '202302006', 1),
('student_weijunkai', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '魏俊凯', '计算机学院', '软件工程', '2023', '202302007', 1),
('student_jiangruohan','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','student', '姜若涵', '计算机学院', '软件工程', '2023', '202302008', 1),
('student_shenmengyao','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','student', '沈梦瑶', '计算机学院', '计算机科学与技术', '2023', '202301009', 1),
('student_hanyifei',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '韩亦菲', '计算机学院', '计算机科学与技术', '2023', '202301010', 1),
('student_yangzixuan','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '杨子轩', '计算机学院', '计算机科学与技术', '2023', '202301011', 1),
('student_zhuyunqing','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '朱韵清', '计算机学院', '计算机科学与技术', '2023', '202301012', 1)
ON DUPLICATE KEY UPDATE `nickname` = VALUES(`nickname`);

-- ==================== 学生-班级关联（必修+选修）====================
-- 计科1班（必修）：学号 202301001~202301005 对应前5名学生
INSERT INTO `student_classes` (`student_id`, `class_id`, `type`) VALUES
((SELECT id FROM users WHERE username='student_lizihao'),  (SELECT id FROM classes WHERE name='计算机科学与技术1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_wangyihan'),(SELECT id FROM classes WHERE name='计算机科学与技术1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_zhangxinyu'),(SELECT id FROM classes WHERE name='计算机科学与技术1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_chenyifei'), (SELECT id FROM classes WHERE name='计算机科学与技术1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_liuyifei'),  (SELECT id FROM classes WHERE name='计算机科学与技术1班'), 'compulsory'),
-- 计科2班（必修）：学号 202301006~202301008、202301009~202301012
((SELECT id FROM users WHERE username='student_zhouziyang'),(SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_wujiaqi'),  (SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_zhengshuyi'),(SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_shenmengyao'),(SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_hanyifei'), (SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_yangzixuan'),(SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_zhuyunqing'),(SELECT id FROM classes WHERE name='计算机科学与技术2班'), 'compulsory'),
-- 软工1班（必修）：学号 202302001~202302008
((SELECT id FROM users WHERE username='student_sunhaochen'),(SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_zhaoyutong'),(SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_qianzilin'), (SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_fengyuxuan'), (SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_chengyiming'),(SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_chuyuxin'),  (SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_weijunkai'), (SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
((SELECT id FROM users WHERE username='student_jiangruohan'),(SELECT id FROM classes WHERE name='软件工程1班'), 'compulsory'),
-- 选修班：人工智能实验班（部分计科学生选修）
((SELECT id FROM users WHERE username='student_lizihao'),  (SELECT id FROM classes WHERE name='人工智能实验班'), 'elective'),
((SELECT id FROM users WHERE username='student_zhangxinyu'),(SELECT id FROM classes WHERE name='人工智能实验班'), 'elective'),
((SELECT id FROM users WHERE username='student_zhouziyang'),(SELECT id FROM classes WHERE name='人工智能实验班'), 'elective'),
((SELECT id FROM users WHERE username='student_shenmengyao'),(SELECT id FROM classes WHERE name='人工智能实验班'), 'elective'),
((SELECT id FROM users WHERE username='student_yangzixuan'), (SELECT id FROM classes WHERE name='人工智能实验班'), 'elective'),
-- 选修班：数据科学交叉班（部分软工学生选修）
((SELECT id FROM users WHERE username='student_sunhaochen'),(SELECT id FROM classes WHERE name='数据科学交叉班'), 'elective'),
((SELECT id FROM users WHERE username='student_qianzilin'), (SELECT id FROM classes WHERE name='数据科学交叉班'), 'elective'),
((SELECT id FROM users WHERE username='student_chengyiming'),(SELECT id FROM classes WHERE name='数据科学交叉班'), 'elective'),
((SELECT id FROM users WHERE username='student_chuyuxin'),  (SELECT id FROM classes WHERE name='数据科学交叉班'), 'elective'),
((SELECT id FROM users WHERE username='student_jiangruohan'),(SELECT id FROM classes WHERE name='数据科学交叉班'), 'elective')
ON DUPLICATE KEY UPDATE `type` = VALUES(`type`);

-- 回填 users.class_id（取每个学生的第一个必修班）
UPDATE users u
INNER JOIN (
    SELECT sc.student_id, MIN(sc.class_id) AS first_class_id
    FROM student_classes sc
    WHERE sc.type = 'compulsory'
    GROUP BY sc.student_id
) t ON u.id = t.student_id
SET u.class_id = t.first_class_id
WHERE u.class_id IS NULL;
