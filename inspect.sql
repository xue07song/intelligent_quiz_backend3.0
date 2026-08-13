USE program1;
DELETE FROM users WHERE username='test_stu001';
DELETE FROM registration_requests WHERE username='test_stu001';
SELECT '清理完成' AS result;
