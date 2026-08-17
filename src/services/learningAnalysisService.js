const model = require('../models/learningAnalysisModel');
const { normalizeDifficultyLevel } = require('../utils/difficulty');

const pct = (correct, total) => total ? Math.round(correct * 100 / total) : 0;
const daysSince = (value) => value ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000) : null;
const group = (rows, key) => Object.values(rows.reduce((map, row) => {
    const value = row[key] == null || String(row[key]).trim() === '' ? '未标注' : String(row[key]);
    const item = map[value] ||= { key: value, answered: 0, correct: 0, latestAt: null, sources: new Set() };
    item.answered += 1; item.correct += Number(row.isCorrect) === 1 ? 1 : 0;
    if (!item.latestAt || new Date(row.answeredAt) > new Date(item.latestAt)) item.latestAt = row.answeredAt;
    item.sources.add(row.source);
    if (row.source === '试卷') { item.examAnswered=(item.examAnswered||0)+1; item.examCorrect=(item.examCorrect||0)+(Number(row.isCorrect)===1?1:0); }
    if (row.source === '自适应练习') { item.adaptiveAnswered=(item.adaptiveAnswered||0)+1; item.adaptiveCorrect=(item.adaptiveCorrect||0)+(Number(row.isCorrect)===1?1:0); }
    return map;
}, {})).map(item => { const accuracy=pct(item.correct,item.answered); const masteryScore=Math.round((item.correct+3)*100/(item.answered+5)); return { ...item, accuracy, masteryScore, sampleLevel:item.answered>=10?'充分':item.answered>=5?'一般':'较少', sourceCount:item.sources.size, sources:undefined }; });

const teacherExamIds = async (teacherId) => {
    const practiceModel = require('../models/practiceModel');
    return practiceModel.findExamIdsByUser(teacherId);
};

const analyze = async (userId, examIds = null) => {
    const student = await model.getStudent(userId);
    if (!student) throw Object.assign(new Error('学生不存在'), { statusCode: 404 });
    const [records, examRows, adaptiveRows] = await Promise.all([
        model.getExamRecords(userId, examIds), model.getExamAnswers(userId, examIds), model.getAdaptiveAnswers(userId),
    ]);
    const normalizedExamRows = examRows.map((row) => ({
        ...row,
        difficulty: normalizeDifficultyLevel(row.difficulty),
        knowledgePoint: String(row.knowledgePoint || '').trim() || '未标注知识点',
    }));
    const answers = [
        ...normalizedExamRows.map(row => ({ ...row, source: '试卷' })),
        ...adaptiveRows.map(row => ({ ...row, source: '自适应练习' })),
    ].sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt));
    const answered = answers.length, correct = answers.filter(row => Number(row.isCorrect) === 1).length;
    const chapters = group(answers.filter(row => row.chapter), 'chapter').sort((a,b)=>Number(a.key)-Number(b.key));
    const knowledge = group(answers, 'knowledgePoint').sort((a,b)=>a.accuracy-b.accuracy || b.answered-a.answered).slice(0, 15);
    const types = group(answers, 'questionType').sort((a,b)=>Number(a.key)-Number(b.key));
    const difficulty = group(answers.filter(row => row.difficulty), 'difficulty').sort((a,b)=>Number(a.key)-Number(b.key));
    const recent = answers.slice(-10), previous = answers.slice(-20, -10);
    const recentAccuracy = pct(recent.filter(x=>Number(x.isCorrect)===1).length, recent.length);
    const previousAccuracy = pct(previous.filter(x=>Number(x.isCorrect)===1).length, previous.length);
    const wrongByQuestion = group(answers, 'questionId').filter(x=>x.correct < x.answered);
    const recovered = wrongByQuestion.filter(item => {
        const trail=answers.filter(x=>String(x.questionId)===item.key); return Number(trail.at(-1)?.isCorrect)===1;
    }).length;
    const wrongQuestions = wrongByQuestion.map(item => {
        const trail=answers.filter(x=>String(x.questionId)===item.key);
        const latest=trail.at(-1); const lastCorrect=Number(latest?.isCorrect)===1;
        return { questionId:item.key, content:latest?.content||'题目内容暂不可用', source:latest?.source, chapter:latest?.chapter,
            knowledgePoint:latest?.knowledgePoint, attempts:trail.length, wrongCount:trail.filter(x=>Number(x.isCorrect)!==1).length,
            lastCorrect, latestAt:latest?.answeredAt };
    }).filter(x=>!x.lastCorrect).sort((a,b)=>b.wrongCount-a.wrongCount).slice(0,12);
    const dailyMap = answers.reduce((map,row)=>{ const date=new Date(row.answeredAt).toISOString().slice(0,10);
        const day=map[date]||={date,examAnswered:0,examCorrect:0,adaptiveAnswered:0,adaptiveCorrect:0};
        const prefix=row.source==='试卷'?'exam':'adaptive'; day[`${prefix}Answered`]++; day[`${prefix}Correct`]+=Number(row.isCorrect)===1?1:0; map[date]=day; return map; },{});
    let examAnswered=0,examCorrect=0,adaptiveAnswered=0,adaptiveCorrect=0;
    const dailyTrend=Object.values(dailyMap).sort((a,b)=>a.date.localeCompare(b.date)).map(day=>{ examAnswered+=day.examAnswered;examCorrect+=day.examCorrect;adaptiveAnswered+=day.adaptiveAnswered;adaptiveCorrect+=day.adaptiveCorrect;
        return {...day,examCumulative:examAnswered?pct(examCorrect,examAnswered):null,adaptiveCumulative:adaptiveAnswered?pct(adaptiveCorrect,adaptiveAnswered):null,examTotal:examAnswered,adaptiveTotal:adaptiveAnswered}; }).slice(-14);
    const stableDifficulty = [...difficulty].filter(x=>x.answered>=3 && x.accuracy>=70).at(-1)?.key || null;
    const confidence = Math.min(100, Math.round((1-Math.exp(-answered/20))*100));
    const retention = knowledge.filter(x=>x.accuracy>=70 && daysSince(x.latestAt)>=21).map(x=>({ ...x, days:daysSince(x.latestAt) })).slice(0,5);
    const migration = knowledge.filter(x=>x.sourceCount>1 && x.answered>=4).map(x=>({ ...x, status:x.accuracy>=70?'跨场景表现稳定':'不同练习场景仍有波动' })).slice(0,6);
    const avgSeconds = records.reduce((s,r)=>s+Number(r.duration_seconds||0),0) / Math.max(1,records.reduce((s,r)=>s+Number(r.answered_count||0),0));
    const weak = knowledge.find(x=>x.answered>=2 && x.accuracy<70);
    const weakChapter = chapters.find(x=>x.answered>=2 && x.accuracy<70);
    const recommendations = [];
    if (weak) recommendations.push({ title:`巩固“${weak.key}”`, reason:`已完成${weak.answered}题，正确率${weak.accuracy}%`, action:'adaptive', filters:{knowledgeKeyword:weak.key} });
    if (weakChapter) recommendations.push({ title:`复习第${weakChapter.key}章`, reason:`本章正确率${weakChapter.accuracy}%`, action:'adaptive', filters:{chapters:[Number(weakChapter.key)]} });
    if (stableDifficulty) recommendations.push({ title:`从${stableDifficulty}星附近继续挑战`, reason:'这是目前有足够样本且正确率达到70%的最高难度', action:'adaptive', filters:{} });
    return { student, generatedAt:new Date(), coverage:{ examAnswers:examRows.length, examCorrect:examRows.filter(x=>Number(x.isCorrect)===1).length, adaptiveAnswers:adaptiveRows.length, adaptiveCorrect:adaptiveRows.filter(x=>Number(x.isCorrect)===1).length, examCount:records.length },
        summary:{ answered, correct, accuracy:pct(correct,answered), confidence, recentAccuracy, change:previous.length?recentAccuracy-previousAccuracy:null, stableDifficulty, recovered, wrongQuestions:wrongByQuestion.length },
        chapters, knowledge, types, difficulty, examTrend:records.slice(-12).map(r=>({ label:r.title||`试卷${r.id}`, score:Number(r.score), accuracy:Number(r.accuracy), date:r.submitted_at })),
        insights:{ retention, migration, pace:{ averageSeconds:Math.round(avgSeconds), meaning:'按整卷总用时估算每题节奏；目前未采集单题停留时间，因此不判断某一道题是否过快。' } }, wrongQuestions:{ exam:wrongQuestions.filter(x=>x.source==='试卷'), adaptive:wrongQuestions.filter(x=>x.source==='自适应练习') }, dailyTrend, recommendations };
};

const overview = async (actor) => {
    let examIds = null;
    if (actor && actor.role === 'teacher') {
        examIds = await teacherExamIds(actor.id);
        if (examIds.length === 0) {
            return { generatedAt: new Date(), students: [], commonWeaknesses: [] };
        }
    }
    const students = await model.getStudents(examIds);
    const analyses = await Promise.all(students.map(student => analyze(student.id, examIds)));
    return { generatedAt:new Date(), students:analyses.map(a=>{const examAccuracy=pct(a.coverage.examCorrect||0,a.coverage.examAnswers),adaptiveAccuracy=pct(a.coverage.adaptiveCorrect||0,a.coverage.adaptiveAnswers);const concernReasons=[];if(a.coverage.examAnswers&&examAccuracy<60)concernReasons.push(`普通试卷正确率${examAccuracy}%`);if(a.coverage.adaptiveAnswers&&adaptiveAccuracy<60)concernReasons.push(`自适应练习正确率${adaptiveAccuracy}%`);return ({ ...a.student, ...a.summary, coverage:a.coverage,examAccuracy,adaptiveAccuracy,concernReasons,
        status:concernReasons.length?'需要关注':a.summary.answered<5?'数据积累中':a.summary.change>=10?'近期进步':a.summary.change<=-10?'近期波动':'表现稳定' });}),
        commonWeaknesses:Object.values(analyses.flatMap(a=>a.knowledge).reduce((m,x)=>{const i=m[x.key]||={key:x.key,answered:0,correct:0,students:0};i.answered+=x.answered;i.correct+=x.correct;i.students++;m[x.key]=i;return m},{})).map(x=>({...x,accuracy:pct(x.correct,x.answered)})).filter(x=>x.students>=2).sort((a,b)=>a.accuracy-b.accuracy).slice(0,8) };
};

module.exports = { analyze, overview, teacherExamIds };
