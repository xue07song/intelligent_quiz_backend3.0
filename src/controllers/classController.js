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
        res.json(success(result, `✅ 已成功分班 ${result.assigned} 名学生`));
    } catch (err) {
        next(err);
    }
};

// 把学生移出班级
const removeStudents = async (req, res, next) => {
    try {
        let { studentIds } = req.body;
        // 兼容 DELETE /:id/students/:sid 的路径参数方式
        if (!studentIds && req.params.studentId) {
            studentIds = [Number(req.params.studentId)];
        }
        const result = await classService.removeStudents(studentIds);
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
        // assignStudentsToClass 内部会先删除旧的 student_classes，再入新班，天然支持调班语义
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

module.exports = {
    list, detail, create, update, remove, assignStudents, removeStudents, unassigned, transfer,
};
