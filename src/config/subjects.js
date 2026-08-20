/**
 * 历史兼容科目列表
 * ----------------------------------------------------------------
 * 说明：所有科目在此处集中维护（后端单一数据源）。
 * 新版科目以 subjects 表为唯一数据源；本列表仅供旧数据和导入流程兼容。
 */
const SUBJECTS = [
    '人工智能基础',
    '中国历史',
    'Python程序设计',
    'JavaScript程序设计',
    '高等数学',
    '线性代数',
    '概率论与数理统计',
    '大学物理',
    '大学英语',
    '数据结构',
    '操作系统',
    '计算机网络',
    '计算机组成原理',
    '数据库原理',
    '软件工程',
    '人工智能',
    '机器学习',
    '思想政治',
];

const isValidSubject = (name) => {
    if (!name || typeof name !== 'string') return false;
    const normalized = name.trim();
    return normalized.length >= 2 && normalized.length <= 100 && !/[<>]/.test(normalized);
};

// 过滤出合法科目（去重 + 去空白）
const filterValidSubjects = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const s of list) {
        if (typeof s !== 'string') continue;
        const trimmed = s.trim();
        if (isValidSubject(trimmed) && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result;
};

module.exports = {
    SUBJECTS,
    isValidSubject,
    filterValidSubjects,
};
