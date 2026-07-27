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
