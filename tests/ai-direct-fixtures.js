'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { compactPlan, isLearning, schoolEvidence } = require('./ai-fixtures');
const profile = { level: '本科', major: '计算机科学与技术', grade: '大四', baseline: '英语需要加强', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' };
const policySource = { title: '教育部官方通知', url: 'https://www.moe.gov.cn/notice', content: '模拟官方通知，2026年初试日期。' };
const schoolSources = ['济南大学', '山东师范大学', '山东财经大学'].map((name, index) => ({ name, title: name + '招生目录', url: 'https://school-' + index + '.edu.cn/catalog', content: '模拟官方资料：招生专业、学历要求、科目、济南培养校区和历史本科一批资料。' }));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function plan(input = profile) {
  const estimated = input.grade !== '大四';
  const end = estimated ? '2029-12-14' : '2026-12-18';
  return { title: '升学学习计划', goal: '持续提升专业基础', summary: '目标年度要求以官方资料为准，学习安排为建议。', dateStatus: estimated ? 'estimated' : 'official', examDate: estimated ? '' : '2026-12-19', examSourceUrl: estimated ? '' : policySource.url, sourceUrls: [policySource.url, ...schoolSources.map(item => item.url)],
    recommendations: estimated ? schoolSources.map(item => ({ name: item.name, reason: '结合专业基础与地区比较招生条件。', sourceUrl: item.url, location: { province: '山东', city: '济南', campus: '模拟资料：校区参考、硕士培养地点待核实', sourceUrl: item.url }, criteriaEvidence: /一本/.test(input.goal) ? [{ criterion: '历史一本', explanation: '模拟资料：学校2016年在山东本科一批招生，不能泛称全部专业。', sourceUrl: item.url }] : [] })) : [],
    tasks: Array.from({ length: 16 }, (_, index) => ({ title: '核对官方目录并完成学习行动' + index, stage: '阶段' + Math.floor(index / 4), dueDate: new Date(Date.parse(input.startDate) + Math.round((Date.parse(end) - Date.parse(input.startDate)) / 86400000 * index / 15) * 86400000).toISOString().slice(0, 10) })) };
}
function defaultValue(url, body, input = profile) {
  if (url.endsWith('/tools/search')) return { results: [policySource, ...schoolSources] };
  if (url.endsWith('/tools/fetch')) return { title: '模拟官方正文', content: '模拟正文，未来年度要求待核实。' };
  const data = JSON.parse(body.messages[0].content);
  let value;
  if (data.task) {
    const task = data.task;
    if (task.id === 'discovery') value = JSON.stringify({ candidates: schoolSources.map(item => ({ name: item.name, province: '山东', city: '济南', sourceUrl: item.url })) });
    else if (task.id.startsWith('school-')) value = JSON.stringify(schoolEvidence(plan(input), body));
    else value = '模拟官方资料，未来年度要求待核实。出处：' + policySource.url;
  } else value = JSON.stringify(compactPlan(plan(input), body));
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: value }], usage: { input_tokens: 100, output_tokens: 20 } };
}
function load(handler, input = profile, settings = {}) {
  const requests = [];
  const fastTimeout = (fn, ms) => setTimeout(fn, settings.fastRetries && [1000, 2000].includes(ms) ? 0 : ms);
  const context = vm.createContext({ window: { StarPath: { aiConfig: { endpoint: 'https://test.invalid/messages', searchEndpoint: 'https://test.invalid/tools/search', fetchEndpoint: 'https://test.invalid/tools/fetch', model: 'deepseek-flash', reasoningEffort: 'high', timeoutMs: settings.timeoutMs || 5000 } } }, URL, TextDecoder, AbortController, DOMException, setTimeout: fastTimeout, clearTimeout, performance,
    fetch: async (url, request) => {
      const body = JSON.parse(request.body);
      const entry = { url, body, signal: request.signal, headers: request.headers, startMs: performance.now() }; requests.push(entry);
      try { return handler ? await handler(url, request, body, () => defaultValue(url, body, input), requests) : json(defaultValue(url, body, input)); }
      finally { entry.endMs = performance.now(); }
    } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../project/js/ai.js'), 'utf8'), context);
  const api = context.window.StarPath.ai;
  return { api, requests, ai: { ...api, generate: (value, options) => api.generate(value, { apiKey: 'test-only', ...options }) } };
}
module.exports = { load, profile, policySource, schoolSources, plan, json, defaultValue, isLearning };
