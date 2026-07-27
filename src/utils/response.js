const success = (data = null, message = '操作成功') => {
    return {
        code: 0,
        message,
        data,
    };
};

const error = (code, message, errors = null) => {
    return {
        code,
        message,
        errors,
    };
};

const paginated = (list, total, page, pageSize) => {
    return {
        code: 0,
        message: '操作成功',
        data: {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        },
    };
};

module.exports = { success, error, paginated };