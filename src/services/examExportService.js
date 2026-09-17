const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { Document, Packer, Paragraph, TextRun, Tab, PageBreak, AlignmentType, Table, TableRow, TableCell, WidthType, UnderlineType, PageOrientation, convertMillimetersToTwip, LineRuleType, HeightRule, TabStopType } = require('docx');
const practiceService = require('./practiceService');

const SOFFICE_PATH = 'C:\\Users\\Administrator\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\vm\\tools\\bin\\soffice.exe';

const docxToPdf = async (docxBuffer) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-pdf-'));
    const docxPath = path.join(tmpDir, 'temp.docx');
    fs.writeFileSync(docxPath, docxBuffer);
    try {
        execFileSync(SOFFICE_PATH, [
            '--headless', '--convert-to', 'pdf',
            '--outdir', tmpDir, docxPath,
        ], { timeout: 30000, windowsHide: true });
        const pdfPath = path.join(tmpDir, 'temp.pdf');
        if (!fs.existsSync(pdfPath)) throw new Error('PDF生成失败：LibreOffice未输出文件');
        return fs.readFileSync(pdfPath);
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
};

const TYPE_NAMES = {
    1: '判断题',
    2: '单选题',
    3: '多选题',
    4: '填空题',
    5: '简答题',
    6: '程序论述题',
    7: '组合题',
};

const cleanFilename = (name) => String(name || '试卷').replace(/[\\/:*?"<>|]/g, '_').trim() || '试卷';

const formatDate = (value) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '');

const typeName = (type) => TYPE_NAMES[Number(type)] || `题型${type}`;

const splitLines = (text) => String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const parseOptions = (optionsText) => {
    const raw = String(optionsText || '').replace(/\u200B/g, '').replace(/\u00AD/g, '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    // Try 1: dot/punctuation separator "A. xxx B. yyy"
    const parts = raw.split(/\s*([A-D])[.．、]\s*/).filter(Boolean);
    if (parts.length >= 3) {
        const result = [];
        for (let i = 0; i < parts.length - 1; i += 2) {
            if (/^[A-D]$/.test(parts[i])) {
                result.push({ letter: parts[i], text: parts[i + 1].trim() });
            }
        }
        if (result.length >= 2) return result;
    }
    // Try 2: space separator "A xxx B yyy"
    const matches2 = [...raw.matchAll(/(?:^|\s)([A-D])\s+/g)];
    if (matches2.length >= 2) {
        const result = [];
        for (let i = 0; i < matches2.length; i++) {
            const start = matches2[i].index + matches2[i][0].length;
            const end = i + 1 < matches2.length ? matches2[i + 1].index : raw.length;
            result.push({ letter: matches2[i][1], text: raw.substring(start, end).trim() });
        }
        if (result.length >= 2) return result;
    }
    // Try 3: no separator "AxxxByyy" - split by lookahead for next option letter
    const matches3 = [...raw.matchAll(/([A-D])/g)];
    if (matches3.length >= 2) {
        const positions = [];
        for (const m of matches3) {
            const idx = m.index;
            if (idx === raw.length - 1) continue;
            const isMarker = idx === 0 || raw[idx - 1] === ' ' ||
                (idx + 1 < raw.length && (raw[idx + 1] === ' ' || raw[idx + 1] === '.' || raw[idx + 1] === '、' || raw[idx + 1] === '．'));
            if (isMarker) positions.push(idx);
        }
        if (positions.length >= 2) {
            const result = [];
            for (let i = 0; i < positions.length; i++) {
                const start = positions[i] + 1;
                const end = i + 1 < positions.length ? positions[i + 1] : raw.length;
                let text = raw.substring(start, end).replace(/^[.．、\s]+/, '').trim();
                result.push({ letter: raw[positions[i]], text });
            }
            if (result.length >= 2) return result;
        }
    }
    // Try 4: aggressive - assume ABCD order, split by detecting letter boundaries
    const letters = ['A', 'B', 'C', 'D'];
    const positions = [];
    for (const letter of letters) {
        let searchFrom = positions.length > 0 ? positions[positions.length - 1].start + 1 : 0;
        let found = -1;
        for (let i = searchFrom; i < raw.length; i++) {
            if (raw[i] === letter) {
                const isMarker = i === 0 || raw[i - 1] === ' ' ||
                    (i + 1 < raw.length && (raw[i + 1] === ' ' || raw[i + 1] === '.' || raw[i + 1] === '、' || raw[i + 1] === '．'));
                if (isMarker) {
                    found = i;
                    break;
                }
            }
        }
        if (found >= 0) {
            if (positions.length > 0) {
                positions[positions.length - 1].end = found;
            }
            positions.push({ letter, start: found, end: raw.length });
        }
    }
    if (positions.length >= 2) {
        return positions.map(p => ({
            letter: p.letter,
            text: raw.substring(p.start + 1, p.end).replace(/^[.．、\s]+/, '').trim(),
        }));
    }
    return [{ letter: '', text: raw }];
};

const OPTION_TAB = 4500;

const renderOptionTable = (options) => {
    const rows = [];
    for (let i = 0; i < options.length; i += 2) {
        const left = options[i];
        const right = options[i + 1];
        const leftText = `${left.letter}. ${left.text}`;
        const isLeftLong = left.text.length > 15;
        const isRightLong = right && right.text.length > 15;

        if (right && !isLeftLong && !isRightLong) {
            // Two options in one row
            rows.push(new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: leftText, size: 22 })],
                            spacing: { after: 40, line: 320, lineRule: LineRuleType.EXACT },
                        })],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        margins: { top: 0, bottom: 0, left: 0, right: 60 },
                    }),
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: `${right.letter}. ${right.text}`, size: 22 })],
                            spacing: { after: 40, line: 320, lineRule: LineRuleType.EXACT },
                        })],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        margins: { top: 0, bottom: 0, left: 60, right: 0 },
                    }),
                ],
            }));
        } else {
            // Left option alone in row
            rows.push(new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: leftText, size: 22 })],
                            spacing: { after: 40, line: 320, lineRule: LineRuleType.EXACT },
                        })],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        margins: { top: 0, bottom: 0, left: 0, right: 60 },
                        columnSpan: 2,
                    }),
                ],
            }));
            if (right) {
                rows.push(new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({ text: `${right.letter}. ${right.text}`, size: 22 })],
                                spacing: { after: 40, line: 320, lineRule: LineRuleType.EXACT },
                            })],
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            margins: { top: 0, bottom: 0, left: 0, right: 60 },
                            columnSpan: 2,
                        }),
                    ],
                }));
            }
        }
    }
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
        borders: {
            top: { style: 'none', size: 0 },
            bottom: { style: 'none', size: 0 },
            left: { style: 'none', size: 0 },
            right: { style: 'none', size: 0 },
            insideHorizontal: { style: 'none', size: 0 },
            insideVertical: { style: 'none', size: 0 },
        },
    });
};

const finalHeading = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 32, color: '000000' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
});

const finalSectionTitle = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: '000000' })],
    spacing: { before: 120, after: 80 },
    keepLines: true,
});

const CHINESE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

const createScoreTable = (sectionCount = 7) => {
    const headers = ['题号', ...CHINESE_NUMERALS.slice(0, sectionCount), '总分'];
    const scoreRow = ['得分', ...Array(sectionCount + 1).fill('')];
    const makeRow = (values) => new TableRow({
        height: { value: 420, type: HeightRule.EXACT },
        children: values.map((text) => new TableCell({
            children: [new Paragraph({
                children: [new TextRun({ text, size: 20, bold: text === '题号' || text === '得分' })],
                alignment: AlignmentType.CENTER,
                spacing: { line: 300, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
            })],
            width: { size: Math.floor(100 / (sectionCount + 2)), type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 0, left: 60, right: 60 },
        })),
    });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [makeRow(headers), makeRow(scoreRow)],
    });
};

const SCORE_RULES = {
    1: { name: '判断题', score: 1 },
    2: { name: '单选题', score: 1 },
    3: { name: '多选题', score: 2 },
    4: { name: '填空题', score: 1 },
    5: { name: '问答题', score: 10 },
    6: { name: '程序题', score: 10 },
    7: { name: '组合题', score: 10 },
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
        sections.push({ title: `${rule.name}（共${questions.length}题，每题${rule.score}分，共${total}分）`, questions });
    });
    const typeSeven = grouped[7] || [];
    if (typeSeven.length) {
        const rule = SCORE_RULES[7];
        const total = typeSeven.length * rule.score;
        sections.push({ title: `${rule.name}（共${typeSeven.length}题，每题${rule.score}分，共${total}分）`, questions: typeSeven });
    }
    const typeSix = grouped[6] || [];
    if (typeSix.length) {
        const rule = SCORE_RULES[6];
        const total = typeSix.length * rule.score;
        sections.push({ title: `${rule.name}（共${typeSix.length}题，每题${rule.score}分，共${total}分）`, questions: typeSix });
    }
    Object.entries(grouped).filter(([type]) => ![1,2,3,4,5,6,7].includes(Number(type))).forEach(([type, questions]) => {
        if (questions.length) sections.push({ title: `${typeName(type)}（共${questions.length}题）`, questions });
    });
    return sections.map((section, index) => ({
        ...section,
        title: `${CHINESE_NUMERALS[index] || index + 1}、${section.title}`,
    }));
};

const getCurrentSemester = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month >= 8 ? year : year - 1;
    const endYear = startYear + 1;
    const semester = month >= 8 || month < 2 ? '秋季' : '春季';
    return `${startYear}—${endYear}学年${semester}学期`;
};

const buildFinalDocx = (exam, withAnswers) => {
    const sections = buildQuestionSections(exam);
    const sectionCount = sections.length || 7;
    const subjectName = exam.subject || '计算机导论';
    const nature = exam.examNature || {};
    const university = nature.university || 'XXXX大学';
    const semester = nature.yearStart && nature.yearEnd
        ? `${nature.yearStart}—${nature.yearEnd}学年${nature.semester || '秋季'}学期`
        : getCurrentSemester();
    const examPrefix = nature.examPrefix || subjectName;
    const paperType = nature.paperType || 'A';
    const examMethod = nature.examMethod || '闭卷';
    const BLUE = '1F4E79';

    const coverHeading = (text, size, line, before = 0, after = 0) => new Paragraph({
        children: [new TextRun({ text, bold: true, size, color: BLUE })],
        alignment: AlignmentType.CENTER,
        spacing: { before, after, line, lineRule: LineRuleType.EXACT },
    });

    const underlineRun = (text, size, color = BLUE) => new TextRun({ text, bold: true, size, color, underline: { type: UnderlineType.SINGLE } });

    const studentInfo = (label, after = 200) => new Paragraph({
        children: [new TextRun({ text: `${label}：______________________`, size: 24 })],
        alignment: AlignmentType.LEFT,
        indent: { left: 2400 },
        spacing: { before: 200, after, line: 420, lineRule: LineRuleType.EXACT },
    });

    const noteLine = (text, isLast = false) => new Paragraph({
        children: isLast
            ? [new TextRun({ text, size: 21 }), new PageBreak()]
            : [new TextRun({ text, size: 21 })],
        spacing: { after: isLast ? 0 : 40, line: 340, lineRule: LineRuleType.EXACT },
        indent: { left: 360 },
    });

    const children = [
        coverHeading(university, 28, 480, 2000, 60),
        coverHeading(semester, 28, 480, 0, 60),
        coverHeading(`《${examPrefix}》期末考试试卷`, 36, 540, 0, 60),
        coverHeading(`（${paperType}卷）`, 24, 420, 0, 300),
        new Paragraph({
            children: [
                new TextRun({ text: '考试方式：', bold: true, size: 24, color: BLUE }),
                new TextRun({ text: '    ', bold: true, size: 24, color: BLUE }),
                underlineRun(examMethod, 24),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 1200, line: 420, lineRule: LineRuleType.EXACT },
        }),
        studentInfo('班级', 200),
        studentInfo('姓名', 200),
        studentInfo('学号', 400),
        createScoreTable(sectionCount),
        new Paragraph({
            children: [new TextRun({ text: '注：', bold: true, size: 21 })],
            spacing: { before: 500, after: 40, line: 340, lineRule: LineRuleType.EXACT },
        }),
        noteLine('1. 试卷共多页（含封面），请勿漏答。'),
        noteLine('2. 试卷不得拆开，所有答案均写在答题卡上。'),
        noteLine('3. 请将答题卡和试卷一同上交，切勿将试卷带出考场。', true),
    ];

    sections.forEach((section, groupIndex) => {
        children.push(finalSectionTitle(section.title));
        section.questions.forEach((question, questionIndex) => {
            const qType = Number(question.题型);
            if (qType === 1) {
                let title = String(question.题目 || '')
                    .replace(/["""']*\s*[（(]\s*[)）]\s*["""']*\s*$/,'')
                    .replace(/["""']+\s*$/,'')
                    .trim();
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${questionIndex + 1}. ${title}`, size: 23 }),
                        new TextRun({ text: '\t' }),
                        new TextRun({ text: '（  ）', size: 23 }),
                    ],
                    tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
                    spacing: { before: 80, after: 70 },
                }));
            } else if (qType === 2 || qType === 3) {
                // 选择题/多选题：题干一行，选项每行2个
                const titleText = String(question.题目 || '').replace(/\s*[（(]\s*[)）]\s*$/, '（  ）');
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${questionIndex + 1}. ${titleText}`, size: 23 })],
                    spacing: { before: 80, after: 60 },
                    keepLines: true,
                }));
                const opts = parseOptions(question.选项);
                children.push(renderOptionTable(opts));
            } else {
                // 填空题/简答题/程序题
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${questionIndex + 1}. ${question.题目}`, size: 23 })],
                    spacing: { before: 80, after: 70 },
                    keepLines: true,
                }));
                splitLines(question.选项).forEach((line) => children.push(new Paragraph({
                    children: [new TextRun({ text: line, size: 22 })],
                    indent: { left: 360 },
                    spacing: { after: 45 },
                })));
                if (!withAnswers && [5, 6, 7].includes(qType)) children.push(new Paragraph({ text: '', spacing: { after: 360 } }));
            }
        });
    });

    if (withAnswers) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({ children: [new TextRun({ text: '参考答案与解析', bold: true, size: 30, color: '000000' })], alignment: AlignmentType.CENTER, spacing: { after: 220 } }));
        const answerSections = buildQuestionSections(exam);
        let questionNum = 0;
        answerSections.forEach((section) => {
            const sectionTitleText = section.title.replace(/（.*$/, '');
            children.push(new Paragraph({
                children: [new TextRun({ text: sectionTitleText, bold: true, size: 26, color: '000000' })],
                spacing: { before: 200, after: 100 },
            }));
            section.questions.forEach((question) => {
                questionNum++;
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${questionNum}. 答案：${question.答案 || '略'}`, bold: true, size: 23 })],
                    spacing: { before: 80, after: 40 },
                }));
                if (question.解析) children.push(new Paragraph({
                    children: [new TextRun({ text: `解析：${question.解析}`, size: 22 })],
                    indent: { left: 360 },
                    spacing: { after: 60 },
                }));
            });
        });
    }
    return new Document({
        sections: [{
            children,
            properties: {
                page: {
                    size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
                    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
                },
            },
        }],
    });
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
    const normalizedFormat = ['xlsx', 'pdf'].includes(format) ? format : 'docx';
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
    const docxBuffer = await Packer.toBuffer(doc);

    if (normalizedFormat === 'pdf') {
        const pdfBuffer = await docxToPdf(docxBuffer);
        return {
            buffer: pdfBuffer,
            mime: 'application/pdf',
            filename: `${baseName}_${answerLabel}.pdf`,
        };
    }

    return {
        buffer: docxBuffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${baseName}_${answerLabel}.docx`,
    };
};

module.exports = { exportExam };
