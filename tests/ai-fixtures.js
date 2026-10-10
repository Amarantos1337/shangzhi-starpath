'use strict';
// Convert existing full plan fixtures to the new model-only compact response.
function compactPlan(value, body) {
  const input = JSON.parse(body.messages[0].content);
  if (isLearning(body)) return { taskTitles: Array.from({ length: 16 }, (_, index) => value.tasks?.[index % value.tasks.length]?.title || '核对官方目录并安排学习' + index) };
  if (Array.isArray(input.schools)) {
    if (!value || !Array.isArray(value.tasks)) return value;
    const { title, goal, summary, recommendationNotice = '', dateStatus = 'official', examDate } = value;
    const result = { title, goal, summary, recommendationNotice, dateStatus, examDate, examSourceId: value.examSourceUrl ? input.sources.find(source => source.url === value.examSourceUrl)?.id || 'unknown-source' : '', taskEdits: value.taskEdits || [] };
    if (value.recommendations?.length < 3) result.recommendations = value.recommendations;
    return result;
  }
  if (!value || !Array.isArray(value.tasks)) return value;
  const sources = input.sources;
  const id = url => sources.find(source => source.url === url)?.id || 'unknown-source';
  const { tasks, sourceUrls, examSourceUrl, ...rest } = value;
  return { ...rest, dateStatus: value.dateStatus || 'official', taskTitles: tasks.map(task => task.title),
    examSourceId: examSourceUrl ? id(examSourceUrl) : '', sourceIds: (sourceUrls || []).map(id),
    recommendations: (value.recommendations || []).map(school => {
      const { sourceUrl, location, criteriaEvidence, ...fields } = school;
      const { sourceUrl: locationUrl, ...place } = location || {};
      return { ...fields, sourceId: id(sourceUrl), location: { ...place, sourceId: id(locationUrl) },
        criteriaEvidence: (criteriaEvidence || []).map(item => { const { sourceUrl: evidenceUrl, ...evidence } = item; return { ...evidence, sourceId: id(evidenceUrl) }; }) };
    }) };
}
function isLearning(body) { return body.system?.startsWith('你是中文学习行动设计助手。') || false; }
function schoolEvidence(value, body) {
  const task = JSON.parse(body.messages[0].content).task;
  const index = Number(task.id.match(/^school-(\d+)/)?.[1]);
  const school = value.recommendations[index];
  const name = task.title.split(' · ')[0];
  if (task.id.endsWith('-program')) return { name, reason: school.reason, sourceUrl: school.sourceUrl, facts: [
    { kind: 'program', year: 2026, text: '模拟资料：相关专业方向；未来年度目录待核实。', sourceUrl: school.sourceUrl },
    { kind: 'requirements', year: 2026, text: '模拟资料：学历报考条件；目标年度资格待核实。', sourceUrl: school.sourceUrl }
  ] };
  return { name, location: school.location, criteriaEvidence: school.criteriaEvidence || [] };
}
module.exports = { compactPlan, isLearning, schoolEvidence };
