// 全系统统一的难度口径：文本/星数/emoji 一律归一为数字 1-5
// 约定：1入门 2简单 3中等 4困难 5挑战

const TEXT_TO_LEVEL = {
    '入门': 1,
    '简单': 2,
    '容易': 2,
    '一般': 3,
    '中等': 3,
    '困难': 4,
    '较难': 4,
    '挑战': 5,
};

const STAR_TO_LEVEL = {
    '1星': 1,
    '2星': 2,
    '3星': 3,
    '4星': 4,
    '5星': 5,
    '⭐': 1,
    '⭐⭐': 2,
    '⭐⭐⭐': 3,
    '⭐⭐⭐⭐': 4,
    '⭐⭐⭐⭐⭐': 5,
};

const normalizeDifficultyLevel = (value) => {
    const text = String(value ?? '').trim();
    if (/^[1-5]$/.test(text)) return Number(text);
    if (TEXT_TO_LEVEL[text] !== undefined) return TEXT_TO_LEVEL[text];
    if (STAR_TO_LEVEL[text] !== undefined) return STAR_TO_LEVEL[text];
    const starMatch = text.match(/^(\d)\s*星$/);
    if (starMatch) {
        const level = Number(starMatch[1]);
        if (level >= 1 && level <= 5) return level;
    }
    const emojiMatch = text.match(/^(⭐{1,5})$/);
    if (emojiMatch) return emojiMatch[1].length;
    return null;
};

module.exports = { normalizeDifficultyLevel, TEXT_TO_LEVEL, STAR_TO_LEVEL };
