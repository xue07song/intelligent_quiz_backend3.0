const subjectModel = require('../models/subjectModel');
const userModel = require('../models/userModel');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
    try { res.json(success((await subjectModel.list({ hasQuestions: req.query.hasQuestions === '1' })).map((item) => item.name))); } catch (error) { next(error); }
};

const create = async (req, res, next) => {
    try {
        const name = subjectModel.normalizeName(req.body.name);
        if (name.length < 2 || name.length > 100) {
            const error = new Error('科目名称长度需为 2-100 个字符');
            error.statusCode = 400;
            throw error;
        }
        const subject = await subjectModel.create(name, req.user.id);
        await subjectModel.ensureDefaultChapter(name);
        res.status(201).json(success(subject, '科目已创建'));
    } catch (error) { next(error); }
};

const chapters = async (req, res, next) => {
    try { res.json(success(await subjectModel.listChapters(req.params.name))); } catch (error) { next(error); }
};
const knowledgePoints = async (req, res, next) => {
    try { const chapters = String(req.query.chapters || '').split(',').filter(Boolean); res.json(success(await subjectModel.listKnowledgePoints(req.params.name, chapters))); } catch (error) { next(error); }
};

const updateMine = async (req, res, next) => {
    try {
        if (req.user.role !== 'teacher') {
            const error = new Error('只有教师可修改所教科目'); error.statusCode = 403; throw error;
        }
        const names = await subjectModel.ensureMany(req.body.subjects, req.user.id);
        if (!names.length) { const error = new Error('请至少保留一个所教科目'); error.statusCode = 400; throw error; }
        for (const name of names) await subjectModel.ensureDefaultChapter(name);
        await userModel.setTeacherSubjects(req.user.id, names);
        res.json(success(names, '所教科目已更新'));
    } catch (error) { next(error); }
};

module.exports = { list, create, chapters, knowledgePoints, updateMine };
