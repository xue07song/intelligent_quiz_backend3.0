const classService = require('../services/classService');
const { success, paginated } = require('../utils/response');

// 班级列表
const list = async (req, res, next) => {
    try {
        const rows = await classService.listClasses({ keyword: req.query.keyword });
        res.json(success(rows));
    } catch (err) {
        next(err);
    }
};

// 班级详情（含学生分页列表）
const detail = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const cls = await classService.getClass(req.params.id, { page, pageSize });
        res.json(success(cls));
    } catch (err) {
        next(err);
    }
};

// 创建班级
const create = async (req, res, next) => {
    try {
        await classService.createClass(req.body);
        res.status(201).json(success(null, '✅ 班级创建成功'));
    } catch (err) {
        next(err);
    }
};

// 更新班级
const update = async (req, res, next) => {
    try {
        await classService.updateClass(req.params.id, req.body);
        res.json(success(null, '✅ 班级更新成功'));
    } catch (err) {
        next(err);
    }
};

// 删除班级
const remove = async (req, res, next) => {
    try {
        await classService.deleteClass(req.params.id);
        res.json(success(null, '✅ 班级删除成功，原班级学生已转为未分班'));
    } catch (err) {
        next(err);
    }
};

// 学生分班 / 调班（批量）
const assignStudents = async (req, res, next) => {
    try {
        const { studentIds, studentId } = req.body;
        const ids = Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
        const result = await classService.assignStudents(req.params.id, ids);
        res.json(success(result, `✅ 已成功添加 ${result.assigned} 名学生`));
    } catch (err) {
        next(err);
    }
};

// 把学生移出班级（仅移出当前班级，不影响其他班级关系）
const removeStudents = async (req, res, next) => {
    try {
        let { studentIds } = req.body;
        // 兼容 DELETE /:id/students/:sid 的路径参数方式
        if (!studentIds && req.params.studentId) {
            studentIds = [Number(req.params.studentId)];
        }
        const classId = Number(req.params.id);
        const result = await classService.removeStudents(classId, studentIds);
        res.json(success(result, `✅ 已移出 ${result.removed} 名学生`));
    } catch (err) {
        next(err);
    }
};

// 调班（学生从一个班移动到另一个班）
const transfer = async (req, res, next) => {
    try {
        const { fromClassId, toClassId, studentId, studentIds } = req.body;
        if (!toClassId) { next(new Error('缺少目标班级')); return; }
        const ids = Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
        if (ids.length === 0) { next(new Error('请选择要调班的学生')); return; }
        // 多对多模式：先从原班移出，再加入新班
        if (fromClassId) {
            await classService.removeStudents(fromClassId, ids);
        }
        const result = await classService.assignStudents(toClassId, ids);
        res.json(success(result, `✅ 已成功调班 ${result.assigned} 名学生`));
    } catch (err) {
        next(err);
    }
};

// 未分班学生列表
const unassigned = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const keyword = req.query.keyword;
        const result = await classService.listUnassignedStudents({ page, pageSize, keyword });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const teachers = async (req, res, next) => {
    try { res.json(success(await classService.listTeachers(req.query.keyword))); }
    catch (err) { next(err); }
};
const structure = async (req, res, next) => { try { res.json(success(await classService.getAcademicStructure())); } catch (err) { next(err); } };
const addCollege = async (req, res, next) => { try { res.status(201).json(success(await classService.addCollege(req.body.name), '学院创建成功')); } catch (err) { next(err); } };
const addMajor = async (req, res, next) => { try { res.status(201).json(success(await classService.addMajor(req.body.collegeId, req.body.name), '专业创建成功')); } catch (err) { next(err); } };

module.exports = {
    list, detail, create, update, remove, assignStudents, removeStudents, unassigned, transfer, teachers, structure, addCollege, addMajor,
};
