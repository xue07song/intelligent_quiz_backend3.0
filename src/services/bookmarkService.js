const bookmarkModel = require('../models/bookmarkModel');

const toggleBookmark = async (userId, data) => {
    const { question_id, source_type = 'public', note = '' } = data || {};
    if (!question_id) {
        const error = new Error('题目ID不能为空');
        error.statusCode = 400;
        error.errorCode = 40001;
        throw error;
    }
    return bookmarkModel.toggle(userId, question_id, source_type, note);
};

const listBookmarks = async (userId, options) => {
    return bookmarkModel.findByUser(userId, options);
};

const updateBookmarkNote = async (userId, id, note) => {
    const existing = await bookmarkModel.findByUser(userId, { page: 1, pageSize: 1 });
    if (!existing.rows.length) {
        const error = new Error('收藏不存在');
        error.statusCode = 404;
        throw error;
    }
    return bookmarkModel.update(id, userId, { note });
};

const removeBookmark = async (userId, id) => {
    const result = await bookmarkModel.remove(id, userId);
    if (result.affectedRows === 0) {
        const error = new Error('收藏不存在');
        error.statusCode = 404;
        throw error;
    }
    return result;
};

const checkBookmarks = async (userId, questionIds, source_type) => {
    return bookmarkModel.batchCheck(userId, questionIds, source_type);
};

module.exports = {
    toggleBookmark,
    listBookmarks,
    updateBookmarkNote,
    removeBookmark,
    checkBookmarks,
};
