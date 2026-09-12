const XLSX = require('xlsx');
const { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType, Table, TableRow, TableCell, WidthType } = require('docx');
const practiceService = require('./practiceService');

const TYPE_NAMES = {
    1: '判断题',
    2: '单选题',
    3: '多选题',
    4: '填空题',
    5: '简答题',
    6: '程序论述题',
};

const cleanFilename = (name) => String(name || '试卷').replace(/[\\/:*?"<>|]/g, '_').trim() || '试卷';

const formatDate = (value) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '');

const typeName = (type) => TYPE_NAMES[Number(type)] || `题型${type}`;

const splitLines = (text) => String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const finalHeading = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 32, color: '000000' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
});

const finalSectionTitle = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: '000000' })],
    spacing: { before: 200, after: 120 },
});

const createScoreTable = () => {
    const cells = ['题号', '一', '二', '三', '四', '五', '六', '七', '总分'];
    const row = (values) => new TableRow({ children: values.map((text) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })], alignment: AlignmentType.CENTER })],
    })) });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [row(cells), row(['得分', '', '', '', '', '', '', '', ''])],
    });
};

const SCORE_RULES = {
    1: { numeral: '一', name: '判断题', score: 1 },
    2: { numeral: '二', name: '单选题', score: 1 },
    3: { numeral: '三', name: '多选题', score: 2 },
    4: { numeral: '四', name: '填空题', score: 1 },
    5: { numeral: '五', name: '问答题', score: 10 },
    6: { numeral: '七', name: '程序题', score: 10 },
};

const isAiFoundation = (exam) => String(exam.subject || '').replace(/\s/g, '').includes('人工智能基础');

const buildQuestionSections = (exam) => {
    const grouped = exam.questions.reduce((result, question) => {
        const type = Number(question.题型);
        if (!result[type]) result[type] = [];
        result[type].push(question);
        return result;
    }, {});
    const sections = [];
    [1, 2, 3, 4, 5].forEach((type) => {
        const questions = grouped[type] || [];
        if (!questions.length) return;
        const rule = SCORE_RULES[type];
        const total = questions.length * rule.score;
        sections.push({ title: `${rule.numeral}、${rule.name}（共${questions.length}题，每题${rule.score}分，共${total}分）`, questions });
    });
    const typeSix = grouped[6] || [];
    if (isAiFoundation(exam) && typeSix.length >= 2) {
        sections.push({ title: '六、组合题（10分）', questions: [typeSix[0]] });
        sections.push({ title: typeSix.length === 2 ? '七、程序题（10分）' : `七、程序题（共${typeSix.length - 1}题，每题10分，共${(typeSix.length - 1) * 10}分）`, questions: typeSix.slice(1) });
    } else if (typeSix.length) {
        const total = typeSix.length * SCORE_RULES[6].score;
        sections.push({ title: `七、程序题（共${typeSix.length}题，每题10分，共${total}分）`, questions: typeSix });
    }
    Object.entries(grouped).filter(([type]) => ![1,2,3,4,5,6].includes(Number(type))).forEach(([type, questions]) => {
        if (questions.length) sections.push({ title: `${typeName(type)}（共${questions.length}题）`, questions });
    });
    return sections;
};

const buildFinalDocx = (exam, withAnswers) => {
    const children = [
        new Paragraph({ spacing: { before: 1000 } }),
        finalHeading('XXX大学'),
        finalHeading('XXX-XXX学年XX学期'),
        finalHeading('XXX期末考试（X卷）'),
        new Paragraph({ children: [new TextRun({ text: '考试方式：闭卷', bold: true, size: 26, color: '000000' })], alignment: AlignmentType.CENTER, spacing: { before: 180, after: 700 } }),
        new Paragraph({ children: [new TextRun({ text: '班级：______________', size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 260 } }),
        new Paragraph({ children: [new TextRun({ text: '姓名：______________', size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 260 } }),
        new Paragraph({ children: [new TextRun({ text: '学号：______________', size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 700 } }),
        createScoreTable(),
        new Paragraph({ text: '注：请将答案填写在答题区域内。', spacing: { before: 280 } }),
        new Paragraph({ children: [new PageBreak()] }),
    ];

    buildQuestionSections(exam).forEach((section, groupIndex) => {
        if (groupIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(finalSectionTitle(section.title));
        section.questions.forEach((question, questionIndex) => {
            children.push(new Paragraph({ children: [new TextRun({ text: `${questionIndex + 1}. ${question.题目}`, size: 23 })], spacing: { before: 80, after: 70 } }));
            splitLines(question.选项).forEach((line) => children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })], indent: { left: 360 }, spacing: { after: 45 } })));
            if (!withAnswers && [5, 6].includes(Number(question.题型))) children.push(new Paragraph({ text: '', spacing: { after: 360 } }));
        });
    });

    if (withAnswers) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({ children: [new TextRun({ text: '参考答案与解析', bold: true, size: 30, color: '000000' })], alignment: AlignmentType.CENTER, spacing: { after: 220 } }));
        exam.questions.forEach((question, index) => {
            children.push(new Paragraph({ children: [new TextRun({ text: `${index + 1}. 答案：${question.答案 || '略'}`, bold: true })], spacing: { before: 100, after: 50 } }));
            if (question.解析) children.push(new Paragraph({ children: [new TextRun({ text: `解析：${question.解析}` })], indent: { left: 240 }, spacing: { after: 70 } }));
        });
    }
    return new Document({ sections: [{ children }] });
};

const buildDocx = (exam, withAnswers) => buildFinalDocx(exam, withAnswers);

const buildExcel = (exam, withAnswers) => {
    const headers = ['序号', 'ID', '题型', '题目', '选项'];
    if (withAnswers) headers.push('答案', '解析');
    headers.push('难度', '知识点');

    const rows = exam.questions.map((q, index) => {
        const row = [
            index + 1,
            q.id,
            typeName(q.题型),
            q.题目,
            q.选项 || '',
        ];
        if (withAnswers) row.push(q.答案 || '', q.解析 || '');
        row.push(q.难度 || '', q.知识点 || '');
        return row;
    });

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 10 },
        { wch: 42 },
        { wch: 42 },
        ...(withAnswers ? [{ wch: 20 }, { wch: 42 }] : []),
        { wch: 8 },
        { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '试卷');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const exportExam = async ({ examId, actor, format = 'docx', withAnswers = false }) => {
    const exam = await practiceService.getExam(examId, actor.id, actor.role);
    const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'docx';
    const answerLabel = withAnswers ? '含答案' : '不含答案';
    const baseName = cleanFilename(exam.title);

    if (normalizedFormat === 'xlsx') {
        return {
            buffer: buildExcel(exam, withAnswers),
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `${baseName}_${answerLabel}.xlsx`,
        };
    }

    const doc = buildDocx(exam, withAnswers);
    const buffer = await Packer.toBuffer(doc);
    return {
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${baseName}_${answerLabel}.docx`,
    };
};

module.exports = { exportExam };
