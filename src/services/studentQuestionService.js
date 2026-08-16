const userModel = require('../models/userModel');
const studentQuestionModel = require('../models/studentQuestionModel');
const studentModeratorModel = require('../models/studentModeratorModel');
const { buildDocxBuffer, buildExcelFromQuestions, cleanFilename } = require('./examExportService');

const makeError = (message, statusCode = 400, errorCode = 40001) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
};

const normalizeQuestionData = (data) => {
    const 题目 = String(data.题目 || '').trim();
    if (!题目) throw makeError('题目内容不能为空', 400, 40001);
    return {
        章节: Number(data.章节) || 0,
        题型: Number(data.题型) || 2,
        序号: Number(data.序号) || 0,
        题目,
        选项: data.选项 != null ? String(data.选项) : '',
        答案: data.答案 != null ? String(data.答案) : '',
        解析: data.解析 != null ? String(data.解析) : '',
        难度: data.难度 != null ? String(data.难度) : '',
        知识点: data.知识点 != null ? String(data.知识点) : '',
        科目: data.科目 != null && String(data.科目).trim() !== '' ? String(data.科目).trim() : null,
    };
};

const getActorMajor = async (actor) => {
    const user = await userModel.findById(actor.id);
    return user && user.major ? String(user.major).trim() : '';
};

const getQuestions = async ({ actor, scope = 'own', options = {} }) => {
    if (scope === 'admin') {
        if (actor.role !== 'admin') throw makeError('仅管理员可查看全部学生题库', 403, 40301);
        return studentQuestionModel.findAllAdmin(options);
    }
    if (scope === 'community') {
        const major = await getActorMajor(actor);
        if (!major) return { rows: [], total: 0 };
        return studentQuestionModel.findCommunity(major, options);
    }
    return studentQuestionModel.findByOwner(actor.id, options);
};

const getReviewQueue = async ({ actor, options = {} }) => {
    const major = await getActorMajor(actor);
    if (!major) return { rows: [], total: 0 };
    const isModerator = await studentModeratorModel.findByUserMajor(actor.id, major);
    if (!isModerator) return { rows: [], total: 0 };
    return studentQuestionModel.findPending(major, options);
};

const create = async ({ actor, data, source = 'manual', share = false }) => {
    const major = await getActorMajor(actor);
    const normalized = normalizeQuestionData(data);
    const result = await studentQuestionModel.create({
        owner_id: actor.id,
        major: major || null,
        ...normalized,
        source,
        is_public: share ? 1 : 0,
        review_status: share ? 'pending' : 'private',
    });
    return studentQuestionModel.findById(result.insertId);
};

const update = async ({ actor, id, data }) => {
    const row = await studentQuestionModel.findById(id);
    if (!row) throw makeError('题目不存在', 404, 40401);
    if (row.owner_id !== actor.id) throw makeError('只能修改自己的题目', 403, 40301);

    const normalized = normalizeQuestionData(data);
    await studentQuestionModel.update(id, normalized);
    if (row.is_public === 1 || ['pending', 'approved'].includes(row.review_status)) {
        await studentQuestionModel.resetToPending(id);
    }
    return studentQuestionModel.findById(id);
};

const remove = async ({ actor, id }) => {
    const row = await studentQuestionModel.findById(id);
    if (!row) throw makeError('题目不存在', 404, 40401);
    if (row.owner_id !== actor.id && actor.role !== 'admin') {
        throw makeError('无权删除该题目', 403, 40301);
    }
    await studentQuestionModel.remove(id);
    return row;
};

const share = async ({ actor, id }) => {
    const row = await studentQuestionModel.findById(id);
    if (!row) throw makeError('题目不存在', 404, 40401);
    if (row.owner_id !== actor.id) throw makeError('只能共享自己的题目', 403, 40301);
    const major = await getActorMajor(actor);
    if (!major) throw makeError('请先在个人中心完善专业信息，才能共享到同专业社区', 400, 40001);
    await studentQuestionModel.submitForShare(id, actor.id);
    return studentQuestionModel.findById(id);
};

const review = async ({ actor, id, action, reason }) => {
    const row = await studentQuestionModel.findById(id);
    if (!row) throw makeError('题目不存在', 404, 40401);
    if (row.review_status !== 'pending') throw makeError('该题目不在待审核状态', 400, 40001);
    if (!['approve', 'reject'].includes(action)) throw makeError('审核动作无效', 400, 40001);

    const isAdmin = actor.role === 'admin';
    const isModerator = !isAdmin && row.major
        ? await studentModeratorModel.findByUserMajor(actor.id, row.major)
        : null;
    if (!isAdmin && !isModerator) {
        throw makeError('仅管理员或同专业学生版主可审核', 403, 40301);
    }

    await studentQuestionModel.review(id, { reviewerId: actor.id, action, reason });
    return studentQuestionModel.findById(id);
};

const exportQuestions = async ({ actor, scope = 'own', format = 'docx', withAnswers = true }) => {
    const result = await getQuestions({ actor, scope, options: { page: 1, pageSize: 10000 } });
    const questions = result.rows;
    if (!questions.length) throw makeError('没有可导出的题目', 400, 40001);

    const meta = {
        title: scope === 'community' ? '同专业共享题目' : '我的题库题目',
        subject: (questions.find((q) => q.科目) || {}).科目 || '学生题库',
        totalCount: questions.length,
        objectiveCount: questions.filter((q) => [1, 2, 3, 4].includes(Number(q.题型))).length,
        creatorName: actor.username || '学生',
        createdAt: new Date(),
    };
    const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'docx';
    const answerLabel = withAnswers ? '含答案' : '不含答案';
    const baseName = cleanFilename(meta.title);

    if (normalizedFormat === 'xlsx') {
        return {
            buffer: buildExcelFromQuestions(questions, withAnswers),
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `${baseName}_${answerLabel}.xlsx`,
        };
    }
    const buffer = await buildDocxBuffer(meta, questions, withAnswers);
    return {
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${baseName}_${answerLabel}.docx`,
    };
};

const listModerators = async (options = {}) => studentModeratorModel.findAll(options);

const createModerator = async ({ actor, userId, major }) => {
    const user = await userModel.findById(userId);
    if (!user || user.role !== 'student') {
        throw makeError('版主必须是学生用户', 400, 40001);
    }
    if (!major || !String(major).trim()) {
        throw makeError('请选择要负责审核的专业', 400, 40001);
    }
    const exists = await studentModeratorModel.findByUserMajor(userId, String(major).trim());
    if (exists) throw makeError('该学生已是此专业版主', 409, 40901);
    await studentModeratorModel.create({
        userId,
        major: String(major).trim(),
        createdBy: actor.id,
    });
    return { userId, major: String(major).trim() };
};

const removeModerator = async (id) => {
    const result = await studentModeratorModel.remove(id);
    if (result.affectedRows === 0) throw makeError('版主记录不存在', 404, 40401);
    return result;
};

module.exports = {
    getQuestions,
    getReviewQueue,
    create,
    update,
    remove,
    share,
    review,
    exportQuestions,
    listModerators,
    createModerator,
    removeModerator,
};
