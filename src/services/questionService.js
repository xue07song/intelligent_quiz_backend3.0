const questionModel = require('../models/questionModel');

const createQuestion = async (data) => {
    const existing = await questionModel.findById(data.id);
    if (existing) {
        const error = new Error('题目ID已存在');
        error.statusCode = 409;
        error.errorCode = 40901;
        throw error;
    }
    return questionModel.create(data);
};

const getQuestions = async (options) => {
    return questionModel.findAll(options);
};

const getQuestionById = async (id) => {
    const question = await questionModel.findById(id);
    if (!question) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return question;
};

const updateQuestion = async (id, data) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return questionModel.update(id, data);
};

const deleteQuestion = async (id) => {
    const existing = await questionModel.findById(id);
    if (!existing) {
        const error = new Error('题目不存在');
        error.statusCode = 404;
        error.errorCode = 40401;
        throw error;
    }
    return questionModel.remove(id);
};

const getStatistics = async () => {
    return questionModel.statistics();
};

const searchQuestions = async (keyword) => {
    if (!keyword || !keyword.trim()) {
        const error = new Error('搜索关键词不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    return questionModel.searchByKeyword(keyword.trim());
};

module.exports = {
    createQuestion,
    getQuestions,
    getQuestionById,
    updateQuestion,
    deleteQuestion,
    getStatistics,
    searchQuestions,
};