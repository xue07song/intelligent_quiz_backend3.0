const bcrypt = require('bcryptjs');
const registrationModel = require('../models/registrationModel');
const userModel = require('../models/userModel');

const SALT_ROUNDS = 10;
// 注册申请允许的角色（不允许直接申请 admin）
const ALLOWED_ROLES = ['teacher', 'student'];

// 提交注册申请
const submit = async (data) => {
    if (!data.username || !data.password) {
        const error = new Error('用户名和密码不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (data.password.length < 6) {
        const error = new Error('密码长度不能少于6位');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    if (!ALLOWED_ROLES.includes(data.role)) {
        const error = new Error('角色无效，仅允许申请 teacher 或 student');
        error.statusCode = 400;
        error.errorCode = 40002;
        throw error;
    }

    // 用户名在正式用户表和申请表中都不能重复
    const existingUser = await userModel.findByUsername(data.username);
    if (existingUser) {
        const error = new Error('用户名已存在');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    const existingRequest = await registrationModel.findByUsername(data.username);
    if (existingRequest && existingRequest.status === 'pending') {
        const error = new Error('该用户名已有待审核的注册申请，请等待审核');
        error.statusCode = 409;
        error.errorCode = 40903;
        throw error;
    }

    if (existingRequest) {
        const hashedPassword = bcrypt.hashSync(data.password, SALT_ROUNDS);
        await registrationModel.reset(existingRequest.id, { ...data, password: hashedPassword });
        return { id: existingRequest.id };
    }

    const hashedPassword = bcrypt.hashSync(data.password, SALT_ROUNDS);
    return registrationModel.create({
        username: data.username,
        password: hashedPassword,
        role: data.role,
        college: data.college,
        major: data.major,
        subjects: data.subjects,
        grade: data.grade,
        student_no: data.student_no,
        employee_no: data.employee_no,
        title: data.title,
    });
};

// 查询注册申请列表
const list = async (options) => {
    return registrationModel.findAll(options);
};

// 审核通过：创建正式用户 + 更新申请状态
const approve = async (id, reviewerId) => {
    const request = await registrationModel.findById(id);
    if (!request) {
        const error = new Error('注册申请不存在');
        error.statusCode = 404;
        error.errorCode = 40404;
        throw error;
    }
    if (request.status !== 'pending') {
        const error = new Error(`该申请已处理（当前状态：${request.status}），无法重复审核`);
        error.statusCode = 400;
        error.errorCode = 40004;
        throw error;
    }

    // 再次校验用户名未被占用
    const existingUser = await userModel.findByUsername(request.username);
    const isRecoverablePartialApproval = existingUser
        && existingUser.role === request.role
        && existingUser.password === request.password;
    if (existingUser && !isRecoverablePartialApproval) {
        const error = new Error('该用户名已被占用，无法通过审核');
        error.statusCode = 409;
        error.errorCode = 40902;
        throw error;
    }

    // 创建正式用户（status=1 启用）
    if (!existingUser) await userModel.create({
        username: request.username,
        password: request.password, // 申请时已 bcrypt 加密，直接复用
        role: request.role,
        college: request.college,
        major: request.major,
        grade: request.grade,
        student_no: request.student_no,
        employee_no: request.employee_no,
        title: request.title,
        status: 1,
    });

    // 学生审核通过后，按学号自动匹配必修班（append 语义：只追加，不删已有其他必修班）
    if (request.role === 'student' && request.student_no) {
        try {
            const createdUser = await userModel.findByUsername(request.username);
            if (createdUser) {
                const classModel = require('../models/classModel');
                const matchedClass = await classModel.matchCompulsoryClassByStudentNo(request.student_no);
                if (matchedClass) {
                    // append：保留之前的必修班，只把新匹配到的班级追加进去（INSERT IGNORE）
                    await classModel.appendCompulsoryClasses(createdUser.id, [matchedClass.id]);
                }
            }
        } catch (_) {
            // 匹配不到不报错，留待管理员手动分班
        }
    }

    // 教师审核通过后，自动将申请的科目写入 teacher_subjects 表
    if (request.role === 'teacher' && request.subjects) {
        const subjects = String(request.subjects)
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (subjects.length > 0) {
            const createdUser = await userModel.findByUsername(request.username);
            if (createdUser) {
                await userModel.setTeacherSubjects(createdUser.id, subjects);
            }
        }
    }

    return registrationModel.updateStatus(id, {
        status: 'approved',
        reviewed_by: reviewerId,
    });
};

// 审核拒绝
const reject = async (id, reviewerId, reason) => {
    const request = await registrationModel.findById(id);
    if (!request) {
        const error = new Error('注册申请不存在');
        error.statusCode = 404;
        error.errorCode = 40404;
        throw error;
    }
    if (request.status !== 'pending') {
        const error = new Error(`该申请已处理（当前状态：${request.status}），无法重复审核`);
        error.statusCode = 400;
        error.errorCode = 40004;
        throw error;
    }

    return registrationModel.updateStatus(id, {
        status: 'rejected',
        reject_reason: reason,
        reviewed_by: reviewerId,
    });
};

module.exports = { submit, list, approve, reject };
