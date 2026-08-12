const normalizeDifficulty = (value) => {
    const text = String(value ?? '').trim();
    if (/^[1-5]$/.test(text)) return Number(text);
    if (text === '简单') return 2;
    if (text === '中等') return 3;
    return null;
};

const normalizeDistribution = (input, min, max) => {
    const result = {};
    Object.entries(input || {}).forEach(([key, value]) => {
        const numberKey = Number(key);
        const amount = Number(value);
        if (Number.isInteger(numberKey) && numberKey >= min && numberKey <= max && Number.isInteger(amount) && amount >= 0) {
            result[numberKey] = amount;
        }
    });
    for (let key = min; key <= max; key += 1) if (result[key] === undefined) result[key] = 0;
    return result;
};

const sumValues = (object) => Object.values(object).reduce((sum, value) => sum + Number(value), 0);

const allocateCells = (questions, typeQuota, difficultyQuota) => {
    const types = Object.keys(typeQuota).map(Number);
    const levels = Object.keys(difficultyQuota).map(Number);
    const source = 's';
    const sink = 't';
    const capacity = new Map();
    const graph = new Map();
    const addEdge = (from, to, cap) => {
        const key = `${from}>${to}`;
        const reverse = `${to}>${from}`;
        capacity.set(key, cap);
        if (!capacity.has(reverse)) capacity.set(reverse, 0);
        if (!graph.has(from)) graph.set(from, []);
        if (!graph.has(to)) graph.set(to, []);
        graph.get(from).push(to);
        graph.get(to).push(from);
    };
    types.forEach((type) => addEdge(source, `type:${type}`, typeQuota[type]));
    levels.forEach((level) => addEdge(`difficulty:${level}`, sink, difficultyQuota[level]));
    types.forEach((type) => levels.forEach((level) => {
        const stock = questions.filter((q) => q.normalizedType === type && q.normalizedDifficulty === level).length;
        addEdge(`type:${type}`, `difficulty:${level}`, stock);
    }));

    const flow = new Map();
    let totalFlow = 0;
    while (true) {
        const parent = new Map([[source, null]]);
        const queue = [source];
        while (queue.length && !parent.has(sink)) {
            const current = queue.shift();
            for (const next of graph.get(current) || []) {
                const residual = (capacity.get(`${current}>${next}`) || 0) - (flow.get(`${current}>${next}`) || 0);
                if (residual > 0 && !parent.has(next)) { parent.set(next, current); queue.push(next); }
            }
        }
        if (!parent.has(sink)) break;
        let amount = Infinity;
        for (let node = sink; node !== source; node = parent.get(node)) {
            const prev = parent.get(node);
            amount = Math.min(amount, (capacity.get(`${prev}>${node}`) || 0) - (flow.get(`${prev}>${node}`) || 0));
        }
        for (let node = sink; node !== source; node = parent.get(node)) {
            const prev = parent.get(node);
            flow.set(`${prev}>${node}`, (flow.get(`${prev}>${node}`) || 0) + amount);
            flow.set(`${node}>${prev}`, (flow.get(`${node}>${prev}`) || 0) - amount);
        }
        totalFlow += amount;
    }
    const cells = {};
    types.forEach((type) => levels.forEach((level) => {
        cells[`${type}-${level}`] = Math.max(0, flow.get(`type:${type}>difficulty:${level}`) || 0);
    }));
    return { totalFlow, cells };
};

const selectQuestions = (questions, cells, minKnowledgePoints) => {
    const selected = [];
    const covered = new Set();
    Object.entries(cells).filter(([, amount]) => amount > 0).forEach(([cell, amount]) => {
        const [type, difficulty] = cell.split('-').map(Number);
        const pool = questions.filter((q) => q.normalizedType === type && q.normalizedDifficulty === difficulty);
        for (let index = 0; index < amount; index += 1) {
            pool.sort((a, b) => {
                const aNew = !covered.has(a.normalizedKnowledge) && covered.size < minKnowledgePoints ? 1 : 0;
                const bNew = !covered.has(b.normalizedKnowledge) && covered.size < minKnowledgePoints ? 1 : 0;
                return bNew - aNew || a.usedCount - b.usedCount || Math.random() - 0.5;
            });
            const question = pool.shift();
            if (!question) break;
            selected.push(question);
            if (question.normalizedKnowledge) covered.add(question.normalizedKnowledge);
        }
    });
    return { selected, covered };
};

const countBy = (items, keyOf) => items.reduce((result, item) => {
    const key = keyOf(item);
    result[key] = (result[key] || 0) + 1;
    return result;
}, {});

const buildInventory = (rawQuestions) => {
    const questions = rawQuestions.map((question) => ({
        ...question,
        normalizedType: Number(question.题型),
        normalizedDifficulty: normalizeDifficulty(question.难度),
        normalizedKnowledge: String(question.知识点 || '').trim(),
        usedCount: Number(question.used_count) || 0,
    }));
    const valid = questions.filter((q) => q.normalizedType >= 1 && q.normalizedType <= 6 && q.normalizedDifficulty);
    const cross = {};
    valid.forEach((q) => { const key = `${q.normalizedType}-${q.normalizedDifficulty}`; cross[key] = (cross[key] || 0) + 1; });
    return {
        questions: valid,
        report: {
            total: valid.length,
            byType: countBy(valid, (q) => q.normalizedType),
            byDifficulty: countBy(valid, (q) => q.normalizedDifficulty),
            cross,
            knowledgePoints: [...new Set(valid.map((q) => q.normalizedKnowledge).filter(Boolean))].sort(),
            invalidDifficultyCount: questions.length - valid.length,
        },
    };
};

const buildFeasibleDifficultySuggestion = (inventory, typeQuota, difficultyQuota, tieOrder = 'asc') => {
    const remainingStock = { ...inventory.cross };
    const suggested = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const types = Object.keys(typeQuota).map(Number).sort((a, b) => {
        const aChoices = [1, 2, 3, 4, 5].filter((level) => (remainingStock[`${a}-${level}`] || 0) > 0).length;
        const bChoices = [1, 2, 3, 4, 5].filter((level) => (remainingStock[`${b}-${level}`] || 0) > 0).length;
        return aChoices - bChoices;
    });

    for (const type of types) {
        for (let index = 0; index < typeQuota[type]; index += 1) {
            const available = [1, 2, 3, 4, 5].filter((level) => (remainingStock[`${type}-${level}`] || 0) > 0);
            if (!available.length) return null;
            available.sort((a, b) => {
                const aGap = (difficultyQuota[a] || 0) - suggested[a];
                const bGap = (difficultyQuota[b] || 0) - suggested[b];
                const tie = tieOrder === 'desc' ? b - a : a - b;
                return bGap - aGap || suggested[a] - suggested[b] || tie;
            });
            const level = available[0];
            suggested[level] += 1;
            remainingStock[`${type}-${level}`] -= 1;
        }
    }
    return suggested;
};

const buildFeasibleTypeSuggestion = (inventory, typeQuota, difficultyQuota, tieOrder = 'asc') => {
    const remainingStock = { ...inventory.cross };
    const suggested = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const levels = Object.keys(difficultyQuota).map(Number).sort((a, b) => {
        const aChoices = [1, 2, 3, 4, 5, 6].filter((type) => (remainingStock[`${type}-${a}`] || 0) > 0).length;
        const bChoices = [1, 2, 3, 4, 5, 6].filter((type) => (remainingStock[`${type}-${b}`] || 0) > 0).length;
        return aChoices - bChoices;
    });

    for (const level of levels) {
        for (let index = 0; index < difficultyQuota[level]; index += 1) {
            const available = [1, 2, 3, 4, 5, 6].filter((type) => (remainingStock[`${type}-${level}`] || 0) > 0);
            if (!available.length) return null;
            available.sort((a, b) => {
                const aGap = (typeQuota[a] || 0) - suggested[a];
                const bGap = (typeQuota[b] || 0) - suggested[b];
                const tie = tieOrder === 'desc' ? b - a : a - b;
                return bGap - aGap || suggested[a] - suggested[b] || tie;
            });
            const type = available[0];
            suggested[type] += 1;
            remainingStock[`${type}-${level}`] -= 1;
        }
    }
    return suggested;
};

const buildAlternativePlans = (questions, inventory, count, typeQuota, difficultyQuota) => {
    const candidates = [];
    const addPlan = (plan) => {
        if (!plan.typeDistribution || !plan.difficultyDistribution) return;
        if (allocateCells(questions, plan.typeDistribution, plan.difficultyDistribution).totalFlow !== count) return;
        const signature = `${JSON.stringify(plan.typeDistribution)}|${JSON.stringify(plan.difficultyDistribution)}`;
        if (!candidates.some((item) => item.signature === signature)) candidates.push({ ...plan, signature });
    };

    ['asc', 'desc'].forEach((tieOrder, index) => {
        const difficulty = buildFeasibleDifficultySuggestion(inventory, typeQuota, difficultyQuota, tieOrder);
        addPlan({
            id: `keep-type-${index + 1}`,
            title: index === 0 ? '优先保留题型结构' : '保留题型的另一种搭配',
            description: '题型数量不变，只调整五级难度数量',
            typeDistribution: { ...typeQuota },
            difficultyDistribution: difficulty,
            changedField: 'difficulty',
        });
    });

    ['asc', 'desc'].forEach((tieOrder, index) => {
        const typeDistribution = buildFeasibleTypeSuggestion(inventory, typeQuota, difficultyQuota, tieOrder);
        addPlan({
            id: `keep-difficulty-${index + 1}`,
            title: index === 0 ? '优先保留难度结构' : '保留难度的另一种搭配',
            description: '五级难度数量不变，只调整六种题型数量',
            typeDistribution,
            difficultyDistribution: { ...difficultyQuota },
            changedField: 'type',
        });
    });

    return candidates.slice(0, 4).map(({ signature, ...plan }) => plan);
};

const analyzeRuleExamConfiguration = ({ rawQuestions, count, typeDistribution, difficultyDistribution, minKnowledgePoints = 1 }) => {
    const typeQuota = normalizeDistribution(typeDistribution, 1, 6);
    const difficultyQuota = normalizeDistribution(difficultyDistribution, 1, 5);
    const { questions, report: inventory } = buildInventory(rawQuestions);
    const checks = {
        typeTotal: sumValues(typeQuota) === count,
        difficultyTotal: sumValues(difficultyQuota) === count,
        totalStock: questions.length >= count,
        knowledgeStock: inventory.knowledgePoints.length >= Number(minKnowledgePoints),
    };
    const basicFeasible = Object.values(checks).every(Boolean);
    const allocation = basicFeasible
        ? allocateCells(questions, typeQuota, difficultyQuota)
        : { totalFlow: 0, cells: {} };
    const feasible = basicFeasible && allocation.totalFlow === count;
    const reasons = [];

    if (!checks.typeTotal) reasons.push(`题型数量合计为 ${sumValues(typeQuota)}，应等于总题数 ${count}`);
    if (!checks.difficultyTotal) reasons.push(`难度数量合计为 ${sumValues(difficultyQuota)}，应等于总题数 ${count}`);
    if (!checks.totalStock) reasons.push(`当前章节范围只有 ${questions.length} 道有效题，少于要求的 ${count} 道`);
    if (!checks.knowledgeStock) reasons.push(`当前范围只有 ${inventory.knowledgePoints.length} 个知识点，少于要求的 ${minKnowledgePoints} 个`);

    const typeAllocated = {};
    const difficultyAllocated = {};
    Object.entries(allocation.cells).forEach(([key, amount]) => {
        const [type, level] = key.split('-').map(Number);
        typeAllocated[type] = (typeAllocated[type] || 0) + amount;
        difficultyAllocated[level] = (difficultyAllocated[level] || 0) + amount;
    });
    const typeShortages = Object.keys(typeQuota).map(Number).filter((type) => (typeAllocated[type] || 0) < typeQuota[type]).map((type) => ({
        type,
        requested: typeQuota[type],
        allocated: typeAllocated[type] || 0,
        availableByDifficulty: [1, 2, 3, 4, 5].reduce((result, level) => {
            result[level] = inventory.cross[`${type}-${level}`] || 0;
            return result;
        }, {}),
    }));
    const difficultyShortages = Object.keys(difficultyQuota).map(Number).filter((level) => (difficultyAllocated[level] || 0) < difficultyQuota[level]).map((level) => ({
        difficulty: level,
        requested: difficultyQuota[level],
        allocated: difficultyAllocated[level] || 0,
    }));

    if (basicFeasible && !feasible) {
        reasons.push(`题型和难度单独看都有库存，但交叉组合最多只能满足 ${allocation.totalFlow}/${count} 道题`);
        typeShortages.forEach((item) => {
            const availableLevels = Object.entries(item.availableByDifficulty).filter(([, stock]) => stock > 0).map(([level, stock]) => `难度${level}有${stock}道`).join('、');
            reasons.push(`题型${item.type}计划 ${item.requested} 道，当前组合只能分配 ${item.allocated} 道（${availableLevels || '没有可用题目'}）`);
        });
    }

    const alternativePlans = basicFeasible && !feasible
        ? buildAlternativePlans(questions, inventory, count, typeQuota, difficultyQuota)
        : [];

    return {
        feasible,
        checks,
        maxAssignable: allocation.totalFlow,
        reasons,
        typeShortages,
        difficultyShortages,
        suggestedDifficultyDistribution: basicFeasible && !feasible
            ? buildFeasibleDifficultySuggestion(inventory, typeQuota, difficultyQuota)
            : null,
        alternativePlans,
        inventory,
    };
};

const assembleRuleExam = ({ rawQuestions, count, typeDistribution, difficultyDistribution, minKnowledgePoints = 1 }) => {
    const typeQuota = normalizeDistribution(typeDistribution, 1, 6);
    const difficultyQuota = normalizeDistribution(difficultyDistribution, 1, 5);
    if (sumValues(typeQuota) !== count) throw Object.assign(new Error(`题型数量合计必须等于总题数 ${count}`), { statusCode: 400, errorCode: 40003 });
    if (sumValues(difficultyQuota) !== count) throw Object.assign(new Error(`难度数量合计必须等于总题数 ${count}`), { statusCode: 400, errorCode: 40004 });
    const analysis = analyzeRuleExamConfiguration({ rawQuestions, count, typeDistribution, difficultyDistribution, minKnowledgePoints });
    const { questions, report: inventory } = buildInventory(rawQuestions);
    if (questions.length < count) throw Object.assign(new Error(`当前章节范围只有 ${questions.length} 道有效题，无法生成 ${count} 道试卷`), { statusCode: 400, errorCode: 40002 });
    const allocation = allocateCells(questions, typeQuota, difficultyQuota);
    if (allocation.totalFlow !== count) throw Object.assign(new Error(analysis.reasons.join('；') || '当前题库无法同时满足所设置的题型与难度组合'), { statusCode: 400, errorCode: 40005 });
    const { selected, covered } = selectQuestions(questions, allocation.cells, Number(minKnowledgePoints) || 1);
    if (selected.length !== count) throw Object.assign(new Error('候选题数量不足，组卷未完成'), { statusCode: 400, errorCode: 40006 });
    for (let index = selected.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [selected[index], selected[randomIndex]] = [selected[randomIndex], selected[index]];
    }
    const warnings = [];
    if (covered.size < Number(minKnowledgePoints)) warnings.push(`实际覆盖 ${covered.size} 个知识点，未达到目标 ${minKnowledgePoints} 个`);
    return {
        questions: selected,
        report: {
            targetTypeDistribution: typeQuota,
            actualTypeDistribution: countBy(selected, (q) => q.normalizedType),
            targetDifficultyDistribution: difficultyQuota,
            actualDifficultyDistribution: countBy(selected, (q) => q.normalizedDifficulty),
            knowledgePoints: [...covered],
            targetKnowledgePointCount: Number(minKnowledgePoints),
            unusedQuestionCount: selected.filter((q) => q.usedCount === 0).length,
            warnings,
            inventory,
        },
    };
};

module.exports = { normalizeDifficulty, buildInventory, allocateCells, analyzeRuleExamConfiguration, assembleRuleExam };
