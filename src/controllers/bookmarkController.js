const bookmarkService = require('../services/bookmarkService');
const { success, paginated } = require('../utils/response');

const toggle = async (req, res, next) => {
    try {
        const result = await bookmarkService.toggleBookmark(req.user.id, req.body);
        res.json(success(result, result.bookmarked ? '✅ 已收藏' : '已取消收藏'));
    } catch (err) {
        next(err);
    }
};

const list = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const result = await bookmarkService.listBookmarks(req.user.id, {
            page,
            pageSize,
            source_type: req.query.source_type,
        });
        res.json(paginated(result.rows, result.total, page, pageSize));
    } catch (err) {
        next(err);
    }
};

const updateNote = async (req, res, next) => {
    try {
        await bookmarkService.updateBookmarkNote(req.user.id, req.params.id, req.body.note);
        res.json(success(null, '✅ 备注更新成功'));
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await bookmarkService.removeBookmark(req.user.id, req.params.id);
        res.json(success(null, '✅ 已取消收藏'));
    } catch (err) {
        next(err);
    }
};

const check = async (req, res, next) => {
    try {
        const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : [];
        const marked = await bookmarkService.checkBookmarks(req.user.id, ids, req.query.source_type || 'public');
        res.json(success({ marked_ids: marked }));
    } catch (err) {
        next(err);
    }
};

module.exports = { toggle, list, updateNote, remove, check };
