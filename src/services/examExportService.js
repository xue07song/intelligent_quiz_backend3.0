const XLSX = require('xlsx');
const { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType } = require('docx');
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

const buildDocxFromQuestions = (meta, questions, withAnswers) => {
    const children = [];

    children.push(new Paragraph({
        text: meta.title || '练习试卷',
        bold: true,
        size: 32,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
    }));
    children.push(new Paragraph({
        text: `科目：${meta.subject || '不限'}    题数：${meta.totalCount || questions.length}    客观题：${meta.objectiveCount || 0}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
    }));
    children.push(new Paragraph({
        text: `创建人：${meta.creatorName || '系统'}    创建时间：${formatDate(meta.createdAt)}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
    }));

    questions.forEach((q, index) => {
        children.push(new Paragraph({
            children: [new TextRun({ text: `${index + 1}. ${q.题目}`, bold: true })],
            spacing: { before: 160, after: 80 },
        }));
        if (q.选项) {
            splitLines(q.选项).forEach((line) => {
                children.push(new Paragraph({
                    children: [new TextRun({ text: line })],
                    indent: { left: 480 },
                    spacing: { after: 40 },
                }));
            });
        }
        if (!withAnswers && [5, 6].includes(Number(q.题型))) {
            children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        }
    });

    if (withAnswers) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({
            text: '参考答案与解析',
            bold: true,
            size: 28,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
        }));
        questions.forEach((q, index) => {
            children.push(new Paragraph({
                children: [new TextRun({ text: `${index + 1}. 答案：${q.答案 || '略'}`, bold: true })],
                spacing: { before: 120, after: 60 },
            }));
            if (q.解析) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: `解析：${q.解析}` })],
                    indent: { left: 240 },
                    spacing: { after: 80 },
                }));
            }
        });
    }

    return new Document({ sections: [{ children }] });
};

const buildExcelFromQuestions = (questions, withAnswers) => {
    const headers = ['序号', 'ID', '题型', '题目', '选项'];
    if (withAnswers) headers.push('答案', '解析');
    headers.push('难度', '知识点');

    const rows = questions.map((q, index) => {
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

const buildDocxBuffer = async (meta, questions, withAnswers) => {
    const doc = buildDocxFromQuestions(meta, questions, withAnswers);
    return Packer.toBuffer(doc);
};

const exportExam = async ({ examId, actor, format = 'docx', withAnswers = false }) => {
    const exam = await practiceService.getExam(examId, actor.id, actor.role);
    const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'docx';
    const answerLabel = withAnswers ? '含答案' : '不含答案';
    const baseName = cleanFilename(exam.title);

    if (normalizedFormat === 'xlsx') {
        return {
            buffer: buildExcelFromQuestions(exam.questions, withAnswers),
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `${baseName}_${answerLabel}.xlsx`,
        };
    }

    const buffer = await buildDocxBuffer({
        title: exam.title,
        subject: exam.subject,
        totalCount: exam.total_count,
        objectiveCount: exam.objective_count,
        creatorName: exam.creator_name,
        createdAt: exam.created_at,
    }, exam.questions, withAnswers);
    return {
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${baseName}_${answerLabel}.docx`,
    };
};

module.exports = { exportExam, buildDocxBuffer, buildExcelFromQuestions, cleanFilename };
