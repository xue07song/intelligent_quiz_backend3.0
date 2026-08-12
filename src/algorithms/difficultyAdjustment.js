const WINDOW_SIZE = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;

const difficultyGroup = (difficulty) => {
    const value = Number(difficulty);
    if (value <= 2) return '简单';
    if (value <= 4) return '中等';
    return '困难';
};

const evaluateDifficulty = ({ currentDifficulty, recentResults, signal = '', cooldown = 0 }) => {
    const difficulty = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Number(currentDifficulty) || 1));
    const window = recentResults.slice(-WINDOW_SIZE).map(Number);
    const correct = window.filter((value) => value === 1).length;
    const accuracy = window.length ? Math.round((correct / window.length) * 100) : 0;

    if (window.length < WINDOW_SIZE) {
        return {
            difficulty, signal: '', cooldown: Math.max(0, cooldown - 1), accuracy,
            changed: false,
            message: `再完成 ${WINDOW_SIZE - window.length} 题后，系统会根据最近 5 题的表现调整难度。`,
        };
    }
    if (cooldown > 0) {
        return {
            difficulty, signal: '', cooldown: cooldown - 1, accuracy, changed: false,
            message: `刚调整过难度，再完成 ${cooldown} 题后重新判断。`,
        };
    }

    const nextSignal = accuracy >= 80 ? 'up' : accuracy <= 40 ? 'down' : '';
    if (!nextSignal) {
        return {
            difficulty, signal: '', cooldown: 0, accuracy, changed: false,
            message: `最近 5 题答对 ${correct} 题，难度保持 ${difficulty} 级（${difficultyGroup(difficulty)}）。`,
        };
    }
    if (signal !== nextSignal) {
        const direction = nextSignal === 'up' ? '答得不错' : '目前有些吃力';
        return {
            difficulty, signal: nextSignal, cooldown: 0, accuracy, changed: false,
            message: `最近 5 题答对 ${correct} 题，${direction}。系统再观察一题，表现相近时再调整难度。`,
        };
    }

    const nextDifficulty = nextSignal === 'up'
        ? Math.min(MAX_DIFFICULTY, difficulty + 1)
        : Math.max(MIN_DIFFICULTY, difficulty - 1);
    if (nextDifficulty === difficulty) {
        return {
            difficulty, signal: '', cooldown: 0, accuracy, changed: false,
            message: difficulty === MAX_DIFFICULTY
                ? `最近表现很好，已经是最高的 5 级难度。`
                : `最近需要多巩固，目前已经是最低的 1 级难度。`,
        };
    }
    const action = nextSignal === 'up' ? '提高' : '降低';
    return {
        difficulty: nextDifficulty, signal: '', cooldown: 3, accuracy, changed: true,
        message: `最近两次查看都显示你答题表现${nextSignal === 'up' ? '很好' : '比较吃力'}，下一题难度从 ${difficulty} 级${action}到 ${nextDifficulty} 级。`,
    };
};

module.exports = { WINDOW_SIZE, difficultyGroup, evaluateDifficulty };
