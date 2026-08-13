/**
 * 科目固定预定义列表
 * ----------------------------------------------------------------
 * 说明：所有科目在此处集中维护（后端单一数据源）。
 *   - 前端通过 GET /api/v1/subjects 接口获取，无需在前端硬编码。
 *   - 教师「教师科目」与题库「科目」字段均取自本列表中的名称。
 *   - 如需新增/删除科目，只需修改下方 SUBJECTS 数组即可，无需改库表。
 */
const SUBJECTS = [
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

// O(1) 校验某科目是否合法
const SUBJECT_SET = new Set(SUBJECTS);

const isValidSubject = (name) => {
    if (!name || typeof name !== 'string') return false;
    return SUBJECT_SET.has(name.trim());
};

// 过滤出合法科目（去重 + 去空白）
const filterValidSubjects = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const s of list) {
        if (typeof s !== 'string') continue;
        const trimmed = s.trim();
        if (SUBJECT_SET.has(trimmed) && !seen.has(trimmed)) {
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
