'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { compactPlan, isLearning, schoolEvidence } = require('./ai-fixtures');
const root = path.resolve(__dirname, '../project/js');
const profile = { level: '本科', major: '计算机网络技术', grade: '大四', baseline: '英语需要加强', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' };
const sources = [{ title: '教育部研考通知', url: 'https://www.moe.gov.cn/notice' }];
const generated = () => ({ title: '我的升学学习计划', goal: '建立基础学习节奏', summary: '官方通知提供信息线索；目标院校要求待核实。', examDate: '2026-12-19', examSourceUrl: sources[0].url, sourceUrls: [sources[0].url], tasks: Array.from({ length: 12 }, (_, index) => ({ title: '完成学习行动' + index, stage: '阶段' + Math.floor(index / 3), dueDate: index === 11 ? '2026-12-18' : '2026-10-08' })) });
const search = (extra = {}, count = 15) => ({ stop_reason: 'end_turn', content: [...Array.from({ length: count }, () => ({ type: 'server_tool_use', name: 'web_search' })), { type: 'web_search_tool_result', content: sources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '当年要求待核实。出处：' + sources[0].url }], ...extra });
const answer = (value = generated()) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] });
const plain = value => JSON.parse(JSON.stringify(value));
function load(responses = [], options = {}) {
  const requests = [];
  const firstSearch = responses[0];
  const answers = responses.filter(value => value && Array.isArray(value.content) && value.content.some(block => block.type === 'text' && /^\s*\{/.test(block.text)));
  const saved = new Map();
  const context = vm.createContext({ URL, TextEncoder, AbortController, DOMException, setTimeout, clearTimeout,
    window: { StarPath: {}, dispatchEvent() {} }, CustomEvent: class {},
    localStorage: { getItem(key) { return saved.get(key) ?? null; }, setItem(key, value) { if (options.blocked) throw new Error('Unavailable'); saved.set(key, value); }, removeItem(key) { saved.delete(key); } },
    fetch: async (url, request) => {
      requests.push({ url, ...request, body: JSON.parse(request.body) });
      if (options.fetch) return options.fetch(url, request);
      const body = requests.at(-1).body;
      let value = body.tools ? firstSearch : isLearning(body) ? answer() : answers.shift();
      if (value instanceof Error) throw value;
      if (body.tools && value && Array.isArray(value.content)) {
        value = plain(value);
        const count = value.content.filter(block => block.type === 'server_tool_use').length;
        if (count <= 18) value.content = [...Array.from({ length: Math.min(count, body.tools[0].max_uses) }, () => ({ type: 'server_tool_use', name: 'web_search' })), ...value.content.filter(block => block.type !== 'server_tool_use')];
        const task = JSON.parse(body.messages[0].content).task;
        if (task.id === 'discovery') {
          const retrieved = value.content.flatMap(block => block.type === 'web_search_tool_result' ? block.content : []);
          const candidatePlan = answers[0]?.content.find(block => block.type === 'text');
          let schools = [];
          try { schools = JSON.parse(candidatePlan.text).recommendations || []; } catch (_) {}
          const candidates = retrieved.slice(0, 3).map((source, index) => ({ name: schools[index]?.name || ['甲校', '乙校', '丙校'][index], province: '山东', city: '济南', sourceUrl: source.url }));
          const summary = value.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
          value.content = [...value.content.filter(block => block.type !== 'text'), { type: 'text', text: JSON.stringify({ candidates, summary }) }];
        }
        if (task.id.startsWith('school-')) {
          const valid = answers.map(item => { try { return JSON.parse(item.content.find(block => block.type === 'text').text); } catch (_) { return {}; } }).find(item => item.recommendations?.length >= 3);
          if (valid) value.content = [...value.content.filter(block => block.type !== 'text'), { type: 'text', text: JSON.stringify(schoolEvidence(valid, body)) }];
        }
      }
      if (!body.tools && value && Array.isArray(value.content)) {
        value = plain(value);
        value.content = value.content.map(block => {
          if (block.type !== 'text') return block;
          try { return { ...block, text: JSON.stringify(compactPlan(JSON.parse(block.text), body)) }; } catch (_) { return block; }
        });
      }
      return { ok: !value.status, status: value.status || 200, json: async () => value };
    }
  });
  for (const name of ['data', 'learning', 'storage']) vm.runInContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), context);
  context.window.StarPath.aiConfig = { endpoint: 'https://api.deepseek.com/anthropic/v1/messages', model: 'deepseek-flash', apiKey: 'test-only', reasoningEffort: 'high', timeoutMs: options.timeoutMs || 1000 };
  vm.runInContext(fs.readFileSync(path.join(root, 'ai.js'), 'utf8'), context);
  const app = context.window.StarPath;
  return { ...app, ai: { ...app.ai, generate: (input, options) => app.ai.generate(input, { apiKey: 'test-only', ...options }) }, requests, saved };
}
test('profiles accept the simplified form and validate degree-linked grades and dates', () => {
  const { ai } = load();
  assert.match(ai.validateProfile(profile).deadline, /初试的前一天/);
  assert.deepEqual(plain(ai.grades('本科')), ['大一', '大二', '大三', '大四']);
  assert.deepEqual(plain(ai.grades('专科')), ['大一', '大二', '大三']);
  assert.deepEqual(plain(ai.grades('')), []);
  for (const field of ['level', 'major', 'grade', 'baseline', 'region']) assert.throws(() => ai.validateProfile({ ...profile, [field]: '  ' }));
  assert.equal(ai.validateProfile({ ...profile, goal: '  ' }).goal, '');
  for (const fields of [{ level: '其他' }, { grade: '大五' }, { level: '专科', grade: '大四' }, { startDate: '2026-02-30' }, { baseline: 'x'.repeat(1001) }]) assert.throws(() => ai.validateProfile({ ...profile, ...fields }));
  const validated = ai.validateProfile({ ...profile, weeks: 12, hours: 4, constraints: '旧字段' });
  for (const removed of ['weeks', 'hours']) assert.equal(validated[removed], undefined);
  assert.deepEqual(plain(validated.constraints), { location: { type: 'province', name: '山东' }, tier: '', needsRecommendations: false });
});

test('natural-language cities and province-only goals retain valid locations and named schools', () => {
  const { ai } = load();
  for (const [goal, type, name, needsRecommendations] of [
    ['想在济南读研，计算机专业', 'city', '济南', true],
    ['希望在济南的大学读研', 'city', '济南', true],
    ['只想在济南考研', 'city', '济南', true],
    ['想在济南升学', 'city', '济南', true],
    ['只考虑济南市', 'city', '济南', true],
    ['只考虑山东省', 'province', '山东', true],
    ['只考虑广西壮族自治区', 'province', '广西', true],
    ['只考虑山东省的院校', 'province', '山东', true],
    ['只考虑山东省济南市的院校', 'city', '济南', true],
    ['法学相关专业，只考虑公办院校', 'province', '山东', true],
    ['法学相关专业，只考虑民办院校', 'province', '山东', true],
    ['济南本地一本院校，计算机相关专业', 'city', '济南', true],
    ['山东大学，计算机相关专业', 'province', '山东', false],
    ['济南大学，计算机相关专业', 'province', '山东', false]
  ]) {
    const constraints = ai.validateProfile({ ...profile, grade: '大一', goal }).constraints;
    assert.deepEqual(plain(constraints.location), { type, name }, goal);
    assert.equal(constraints.needsRecommendations, needsRecommendations, goal);
  }
});
test('real tool evidence is required; text-only and unsafe search links are excluded', async () => {
  const { ai } = load([search({ content: [{ type: 'text', text: '我已搜索：' + sources[0].url }] })]);
  await assert.rejects(ai.generate(profile), /未取得有效联网检索结果/);
  assert.deepEqual(plain(ai.extractSources([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '不安全', url: 'javascript:alert(1)' }, { type: 'web_search_result', title: '凭据网址', url: 'https://user:pass@example.com' }] }])), []);
});
test('high effort research and low effort generation produce plans without persisting inputs or credentials', async () => {
  const { ai, store, requests } = load([search(), answer()]);
  const stages = [];
  const draft = await ai.generate(profile, { onStage: stage => stages.push(stage) });
  assert.deepEqual(stages, ['search', 'generate']);
  assert.equal(requests.length, 7);
  for (const request of requests) { assert.equal(request.body.output_config.effort, request.body.tools ? 'high' : 'low'); assert.equal(request.body.thinking.type, 'enabled'); assert.equal(request.body.model, 'deepseek-flash'); }
  assert.equal(requests[0].body.tools[0].max_uses, 1);
  assert.deepEqual(requests[0].body.tools[0].allowed_domains, ['gov.cn', 'edu.cn', 'chsi.com.cn', 'sdzk.cn']);
  assert.equal(requests.slice(0, 6).reduce((sum, request) => sum + request.body.tools[0].max_uses, 0), 6);
  assert.equal(requests.at(-1).body.tools, undefined);
  assert.equal(store.get().plans.length, 0);
  const created = store.createAiPlan(draft);
  const plan = store.get().plans[0];
  assert.equal(plan.templateId, 'education');
  assert.equal(plan.id, created.id);
  assert.equal(new Set(plan.tasks.map(task => task.id)).size, 12);
  assert.ok(plan.tasks.every(task => !task.completed && task.dueDate));
  assert.equal(plan.generation.period.endDate, '2026-12-18');
  assert.equal(plan.generation.period.examDate, '2026-12-19');
  assert.equal(plan.profile, undefined);
  assert.ok(!store.exportBackup().includes('test-only'));
  store.editPlan(plan.id, item => { item.tasks[0].completed = true; item.tasks[1].dueDate = '2026-10-15'; });
  assert.deepEqual(plain(store.parseBackup(store.exportBackup())), plain(store.get()));
  assert.equal(store.progress(store.get().plans[0]).percent, 8);
});
test('plan validation rejects missing tasks, wrong stages, invented sources and impossible dates', () => {
  const { ai } = load();
  const normalized = ai.validateProfile(profile);
  for (const mutate of [value => { value.tasks = []; }, value => { value.tasks[0].stage = '第五阶段'; }, value => { value.tasks[0].dueDate = '2026-02-30'; }, value => { value.tasks[0].dueDate = '2027-01-01'; }, value => { value.sourceUrls = ['https://invented.example.com/']; }, value => { value.tasks[0].title = ''; }]) {
    const value = generated(); mutate(value);
    assert.throws(() => ai.parsePlan(JSON.stringify(value), normalized, sources));
  }
});
test('exam deadline requires a future official search result and covers the day before the exam', () => {
  const { ai } = load();
  const normalized = ai.validateProfile(profile);
  for (const mutate of [value => { value.examDate = ''; }, value => { value.examDate = '2026-09-20'; }, value => { value.examSourceUrl = 'https://invented.example.com/'; }, value => { value.tasks[11].dueDate = '2026-12-19'; }, value => { value.tasks[11].dueDate = '2026-12-17'; }]) {
    const value = generated(); mutate(value);
    assert.throws(() => ai.parsePlan(JSON.stringify(value), normalized, sources));
  }
  const value = generated();
  value.examSourceUrl = 'https://commercial.example.com/notice';
  value.sourceUrls = [value.examSourceUrl];
  assert.throws(() => ai.parsePlan(JSON.stringify(value), normalized, [{ title: '第三方预测', url: value.examSourceUrl }]));
  const examBoard = generated();
  examBoard.examSourceUrl = 'https://www.neea.edu.cn/html1/report/2609/73-1.htm';
  examBoard.sourceUrls = [examBoard.examSourceUrl];
  assert.equal(ai.parsePlan(JSON.stringify(examBoard), normalized, [{ title: '教育部教育考试院公布研考时间', url: examBoard.examSourceUrl }]).generation.period.endDate, '2026-12-18');
});
test('JSON repair happens once; exhausted repair leaves storage unchanged', async () => {
  const repaired = load([search(), answer({}), answer()]);
  await repaired.ai.generate(profile);
  assert.equal(repaired.requests.filter(request => !request.body.tools).length, 2);
  const failed = load([search(), answer({}), answer({})]);
  await assert.rejects(failed.ai.generate(profile));
  assert.equal(failed.requests.filter(request => !request.body.tools).length, 2);
  assert.equal(failed.store.get().plans.length, 0);
});
test('invalid key, balance, forbidden access, rate limits and server errors give safe messages', async () => {
  for (const [status, pattern] of [[400, /拒绝了请求/], [401, /密钥无效/], [402, /余额不足/], [403, /访问被拒绝/], [429, /过于频繁/], [500, /暂时不可用/]]) {
    const { ai, store } = load([{ status }]);
    await assert.rejects(ai.generate(profile), pattern);
    assert.equal(store.get().plans.length, 0);
  }
});
test('caller cancellation and overall timeout abort fetch and cannot create a plan', async () => {
  const fetch = (_, request) => new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true }));
  const cancelled = load([], { fetch });
  const controller = new AbortController();
  const promise = cancelled.ai.generate(profile, { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(cancelled.store.get().plans.length, 0);
  const timeout = load([], { fetch, timeoutMs: 10 });
  await assert.rejects(timeout.ai.generate(profile), /超过1秒/);
});
test('network failures and already-cancelled requests have safe errors and no saved records', async () => {
  const network = load([new TypeError('fetch failed')]);
  await assert.rejects(network.ai.generate(profile), /无法连接 AI 服务/);
  const cancelled = load();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cancelled.ai.generate(profile, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(cancelled.requests.length, 0);
  assert.equal(network.store.get().plans.length, 0);
});
test('AI storage validates atomically and invalid metadata cannot replace previous records', async () => {
  const { ai, store, saved } = load([search(), answer()]);
  store.createPlan('career');
  const draft = plain(await ai.generate(profile));
  draft.generation.durationSeconds = 125;
  const before = plain(store.get());
  const raw = saved.get(store.key);
  for (const mutate of [value => { value.generation.sources[0].url = 'javascript:alert(1)'; }, value => { value.tasks[0].dueDate = '2026-02-30'; }, value => { value.generation.sources = []; }, value => { value.generation.durationSeconds = -1; }, value => { value.generation.durationSeconds = 1.5; }, value => { value.generation.period.endDate = '2026-12-19'; }, value => { value.generation.period.examSourceUrl = 'https://unknown.example.com/'; }]) {
    const invalid = structuredClone(draft); mutate(invalid);
    assert.throws(() => store.createAiPlan(invalid));
    assert.deepEqual(plain(store.get()), before);
    assert.equal(saved.get(store.key), raw);
  }
  const backup = JSON.parse(store.exportBackup());
  backup.plans[0].generation = { ...draft.generation, sources: [] };
  assert.throws(() => store.parseBackup(JSON.stringify(backup)));
  assert.deepEqual(plain(store.get()), before);
  store.createAiPlan(draft);
  const roundtrip = store.parseBackup(store.exportBackup());
  assert.equal(roundtrip.plans[0].generation.durationSeconds, 125);
  assert.equal(roundtrip.plans[0].generation.period.endDate, '2026-12-18');
});
test('AI plans remain usable in session storage and respect the 20-plan limit', async () => {
  const { ai, store } = load([search(), answer()], { blocked: true });
  const draft = await ai.generate(profile);
  assert.equal(store.createAiPlan(draft).persisted, false);
  for (let i = 0; i < 19; i++) store.createPlan(null);
  assert.throws(() => store.createAiPlan(draft), /20/);
});

const schoolSources = [
  { title: '甲校招生专业目录', url: 'https://yz.school-a.edu.cn/catalog' },
  { title: '乙校招生说明', url: 'https://yz.school-b.edu.cn/catalog' },
  { title: '丙校招生说明', url: 'https://yz.school-c.edu.cn/catalog' }
];
function freshmanPlan(ai) {
  const normalized = ai.validateProfile({ ...profile, grade: '大一', goal: '' });
  const last = new Date(normalized.estimatedExamDate + 'T00:00:00Z');
  last.setUTCDate(last.getUTCDate() - 1);
  const endDate = last.toISOString().slice(0, 10);
  const start = Date.parse(normalized.startDate);
  const end = Date.parse(endDate);
  const value = { ...generated(), dateStatus: 'estimated', examDate: '', examSourceUrl: '', sourceUrls: schoolSources.map(source => source.url),
    recommendations: schoolSources.map((source, index) => ({ name: ['甲校', '乙校', '丙校'][index], reason: '结合计算机专业方向、英语基础与山东地区偏好，建议核对招生方向和报考条件。', sourceUrl: source.url, location: { province: '山东', city: '济南', campus: '模拟计算机专业培养校区', sourceUrl: source.url }, criteriaEvidence: [] })),
    tasks: Array.from({ length: 12 }, (_, index) => ({ title: '分学年学习行动' + index, stage: '阶段' + Math.floor(index / 3), dueDate: new Date(start + (end - start) * index / 11).toISOString().slice(0, 10) })) };
  return { normalized, value, endDate };
}

test('academic years target senior autumn instead of the nearest exam, including spring and diploma assumptions', () => {
  const { ai } = load();
  for (const [grade, year] of [['大一', 2029], ['大二', 2028], ['大三', 2027], ['大四', 2026]]) assert.equal(ai.validateProfile({ ...profile, grade }).targetExamYear, year);
  assert.equal(ai.validateProfile({ ...profile, grade: '大一', startDate: '2027-02-01' }).targetExamYear, 2029);
  assert.equal(ai.validateProfile({ ...profile, grade: '大一', startDate: '2027-09-01' }).targetExamYear, 2030);
  assert.equal(ai.validateProfile({ ...profile, grade: '大四', startDate: '2027-02-01' }).targetExamYear, 2027);
  const diploma = ai.validateProfile({ ...profile, level: '专科', grade: '大一' });
  assert.equal(diploma.targetExamYear, 2030);
  assert.match(diploma.planningBasis, /须核实/);
  assert.throws(() => ai.parsePlan(JSON.stringify(generated()), ai.validateProfile({ ...profile, grade: '大一' }), sources), /2029年/);
});

test('unannounced senior-year dates remain provisional, span all years, and survive backup with recommendations', () => {
  const { ai, store } = load();
  const { normalized, value, endDate } = freshmanPlan(ai);
  const draft = ai.parsePlan(JSON.stringify(value), normalized, schoolSources);
  assert.equal(draft.generation.period.targetExamYear, 2029);
  assert.equal(draft.generation.period.examDate, '');
  assert.equal(draft.generation.period.examSourceUrl, '');
  assert.equal(draft.generation.period.dateStatus, 'estimated');
  assert.equal(draft.generation.period.endDate, endDate);
  store.createAiPlan(draft);
  const restored = store.parseBackup(store.exportBackup()).plans[0];
  assert.deepEqual(plain(restored.generation), plain(draft.generation));
  const invalid = plain(draft);
  invalid.generation.period.examDate = '2029-12-15';
  assert.throws(() => store.createAiPlan(invalid), /暂定/);
  invalid.generation.period.examDate = '';
  invalid.generation.recommendations[0].sourceUrl = 'https://unsearched.edu.cn/';
  assert.throws(() => store.createAiPlan(invalid), /出处/);
  assert.equal(store.get().plans.length, 1);
  const compressed = plain(value);
  compressed.tasks.forEach((task, index) => { if (index !== 11) task.dueDate = profile.startDate; });
  assert.throws(() => ai.parsePlan(JSON.stringify(compressed), normalized, schoolSources), /长线/);
});

test('blank university goals require distinct recommendations grounded in actual official school search results', async () => {
  const loaded = load();
  const { normalized, value } = freshmanPlan(loaded.ai);
  for (const mutate of [item => { item.recommendations = []; }, item => { item.recommendations[1].name = item.recommendations[0].name; }, item => { item.recommendations[0].sourceUrl = 'https://invented.edu.cn/'; }, item => { item.examDate = '2026-12-19'; }, item => { item.dateStatus = 'unknown'; }]) {
    const invalid = plain(value); mutate(invalid);
    assert.throws(() => loaded.ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources));
  }
  const searchResult = search({ content: [...Array.from({ length: 15 }, () => ({ type: 'server_tool_use', name: 'web_search' })), { type: 'web_search_tool_result', content: schoolSources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '目标年度日期未公布，院校信息作为参考。出处：' + schoolSources[0].url }] });
  const live = load([searchResult, answer(value)]);
  const result = await live.ai.generate({ ...profile, grade: '大一', goal: '' });
  assert.equal(result.generation.recommendations.length, 3);
  const submitted = JSON.parse(live.requests.find(request => !request.body.tools && !isLearning(request.body)).body.messages[0].content);
  assert.equal(submitted.profile.targetExamYear, 2029);
  assert.equal(submitted.profile.goal, '');
  assert.equal(submitted.schools.length, 3);
});

test('source titles remove HTML fragments and encoded tags while remaining escaped by the UI', () => {
  const { ai } = load();
  assert.equal(ai.sourceTitle('<table><tr><td colspan="5">招生目录</td></tr></table>'), '招生目录');
  assert.equal(ai.sourceTitle('&lt;b&gt;招生&#32;通知&lt;/b&gt;'), '招生 通知');
  assert.equal(ai.sourceTitle('<script>alert(1)</script><style>x</style>官方 &amp; 说明'), '官方 & 说明');
  assert.equal(ai.sourceTitle('<img src=x onerror=alert(1)>'), '参考资料');
  assert.equal(ai.sourceTitle('招生目录 <td...'), '招生目录');
});

test('official sources exclude commercial pages, credentials and lookalike domains', () => {
  const { ai } = load();
  const urls = ['https://www.moe.gov.cn/notice', 'https://www.sdzk.cn/notice', 'https://yz.sdu.edu.cn/catalog', 'https://yz.chsi.com.cn/notice', 'https://www.example.com/news', 'https://moe.gov.cn.example.com/notice', 'https://fakeedu.cn/catalog', 'https://fakechsi.com.cn/notice', 'https://user:pass@yz.sdu.edu.cn/catalog'];
  const extracted = ai.extractSources([{ type: 'web_search_tool_result', content: urls.map(url => ({ type: 'web_search_result', title: '资料', url })) }]);
  assert.deepEqual(plain(extracted.map(source => source.url)), [urls[0], urls[1], urls[2], urls[3]]);
});

test('unofficial links are rejected even when included in the supplied source list', () => {
  const { ai } = load();
  const value = generated();
  const unofficial = { title: '机构转载', url: 'https://training.example.com/policy' };
  value.sourceUrls.push(unofficial.url);
  assert.throws(() => ai.parsePlan(JSON.stringify(value), ai.validateProfile(profile), [...sources, unofficial]), /只能引用/);
});

test('research passed to planning includes only paragraphs with known official evidence', async () => {
  const official = '官方政策待核实。出处：' + sources[0].url;
  const unofficial = '机构声称包录取 https://training.example.com/news';
  const unsupported = '没有出处的分数预测';
  const { ai, requests } = load([search({ content: [...search().content.slice(0, -1), { type: 'text', text: [official, unofficial, unsupported].join('\n\n') }] }), answer()]);
  await ai.generate(profile);
  const evidence = JSON.parse(requests.find(request => !request.body.tools).body.messages[0].content);
  assert.equal(evidence.research, '官方政策待核实。出处：S1');
  assert.equal(evidence.sources[0].url, sources[0].url);
  assert.ok(!JSON.stringify(evidence).includes('training.example.com'));
  const cited = ai.extractResearch([
    { type: 'text', text: '有官方引用的政策', citations: [{ url: sources[0].url }] },
    { type: 'text', text: '有非官方引用的预测', citations: [{ url: 'https://training.example.com/news' }] },
    { type: 'text', text: '未经检索的官方链接 https://www.moe.gov.cn/unknown' }
  ], sources);
  assert.match(cited, /有官方引用的政策/);
  assert.ok(!cited.includes('预测') && !cited.includes('/unknown'));
});

test('unofficial-only results and summaries without official attribution fail safely', async () => {
  const unofficial = load([search({ content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '培训机构', url: 'https://training.example.com/news' }] }] })]);
  await assert.rejects(unofficial.ai.generate(profile), /仅接受官方来源/);
  const unsupported = load([search({ content: [...search().content.slice(0, -1), { type: 'text', text: '没有来源的政策摘要' }] })]);
  await assert.rejects(unsupported.ai.generate(profile), /未取得附官方出处/);
  assert.equal(unsupported.store.get().plans.length, 0);
  assert.ok(unsupported.requests.every(request => request.body.tools));
});

function localSchoolPlan(ai) {
  const { value } = freshmanPlan(ai);
  const normalized = ai.validateProfile({ ...profile, grade: '大一', goal: '济南本地一本院校，计算机相关专业' });
  value.summary = '目标初试年份为2029年，正式日期尚未公布，学习安排暂定至2029年12月14日。推荐范围限定在济南，院校条件按历史招生资料核对。';
  value.recommendations.forEach(school => { school.criteriaEvidence = [{ criterion: '一本', explanation: '模拟测试资料记载该校在山东历史本科一批招生，现行批次与目标年度招生要求须另行核对。', sourceUrl: school.sourceUrl }]; });
  return { normalized, value };
}

test('a city in a descriptive goal overrides a broad region and still requires recommendations', () => {
  const { ai } = load();
  for (const goal of ['济南本地一本院校', '济南的一本院校', '济南市内一本大学', '想去济南本地一本院校']) {
    const constraints = ai.validateProfile({ ...profile, goal }).constraints;
    assert.deepEqual(plain(constraints), { location: { type: 'city', name: '济南' }, tier: '一本', needsRecommendations: true });
  }
  assert.equal(ai.validateProfile({ ...profile, goal: '只考虑济南' }).constraints.location.name, '济南');
  assert.equal(ai.validateProfile({ ...profile, goal: '山东大学，计算机专业' }).constraints.needsRecommendations, false);
  assert.equal(ai.validateProfile({ ...profile, goal: '济南大学' }).constraints.needsRecommendations, false);
  assert.equal(ai.validateProfile({ ...profile, goal: '山东本地一本院校' }).constraints.location.type, 'province');
});

test('local recommendations reject out-of-city campuses and require actual official location evidence', () => {
  const { ai } = load();
  const { normalized, value } = localSchoolPlan(ai);
  assert.equal(ai.parsePlan(JSON.stringify(value), normalized, schoolSources).generation.recommendations.length, 3);
  for (const city of ['上海', '北京', '沈阳', '青岛']) {
    const wrong = plain(value);
    wrong.recommendations[0].location.city = city;
    wrong.recommendations[0].reason = '仅作对标，此校不在济南。';
    assert.throws(() => ai.parsePlan(JSON.stringify(wrong), normalized, schoolSources), /不符合济南/);
  }
  for (const mutate of [school => { delete school.location; }, school => { school.location.sourceUrl = 'https://unsearched.edu.cn/location'; }]) {
    const invalid = plain(value); mutate(invalid.recommendations[0]);
    assert.throws(() => ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources), /所在地|官方来源/);
  }
});

test('requested school tier needs official matching evidence and cannot be silently relaxed', () => {
  const { ai } = load();
  const { normalized, value } = localSchoolPlan(ai);
  for (const mutate of [school => { school.criteriaEvidence = []; }, school => { school.criteriaEvidence[0].criterion = '本科'; }, school => { school.criteriaEvidence[0].explanation = '一本要求无法核实。'; }, school => { school.criteriaEvidence[0].explanation = '这是985学校，所以满足一本条件。'; }, school => { school.criteriaEvidence[0].sourceUrl = 'https://unsearched.edu.cn/history'; }]) {
    const invalid = plain(value); mutate(invalid.recommendations[0]);
    assert.throws(() => ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources), /一本|官方资料/);
  }
  const qualified = plain(value);
  qualified.recommendations[0].criteriaEvidence[0].explanation = '模拟资料显示该校2016年在山东本科一批招生；一本不等于硕士招生等级，目标年度科目待核实。';
  assert.equal(ai.parsePlan(JSON.stringify(qualified), normalized, schoolSources).generation.recommendations.length, 3);
  for (const count of [0, 1, 2]) {
    const partial = plain(value);
    partial.recommendations.length = count;
    assert.throws(() => ai.parsePlan(JSON.stringify(partial), normalized, schoolSources), /不能用外地院校凑数/);
    partial.recommendationNotice = '尚未取得足够的济南本地院校历史招生依据，请确认希望采用的院校范围后继续核对。';
    assert.throws(() => ai.parsePlan(JSON.stringify(partial), normalized, schoolSources), /筛选说明不能代替/);
  }
});

test('three to five historical-tier candidates save and roundtrip, while six and empty repaired lists fail', async () => {
  const { ai, store } = load();
  const { normalized, value } = localSchoolPlan(ai);
  const extendedSources = [...schoolSources, { title: '丁校模拟招生', url: 'https://yz.school-d.edu.cn/catalog' }, { title: '戊校模拟招生', url: 'https://yz.school-e.edu.cn/catalog' }, { title: '己校模拟招生', url: 'https://yz.school-f.edu.cn/catalog' }];
  for (const count of [3, 4, 5, 6]) {
    const candidate = plain(value);
    candidate.sourceUrls = extendedSources.slice(0, count).map(source => source.url);
    candidate.recommendations = extendedSources.slice(0, count).map((source, index) => ({ ...plain(value.recommendations[0]), name: '模拟院校' + index, sourceUrl: source.url, location: { ...value.recommendations[0].location, sourceUrl: source.url }, criteriaEvidence: [{ criterion: '一本', explanation: '模拟官方2016年山东普通本科一批招生记录，作为取消批次前的历史层次参考；未来硕士科目另行核实。', sourceUrl: source.url }] }));
    if (count === 6) assert.throws(() => ai.parsePlan(JSON.stringify(candidate), normalized, extendedSources), /3–5所/);
    else {
      const draft = ai.parsePlan(JSON.stringify(candidate), normalized, extendedSources);
      store.createAiPlan(draft);
      assert.equal(store.parseBackup(store.exportBackup()).plans[0].generation.recommendations.length, count);
    }
  }
  const empty = { ...value, recommendations: [], recommendationNotice: '尚未核实足够候选。' };
  const evidence = search({ content: [...search().content.slice(0, 15), { type: 'web_search_tool_result', content: schoolSources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '模拟官方资料：' + schoolSources[0].url }] });
  const repaired = load([evidence, answer(empty), answer(value)]);
  assert.equal((await repaired.ai.generate({ ...profile, grade: '大一', goal: '济南本地一本院校' })).generation.recommendations.length, 3);
  assert.equal(repaired.requests.filter(request => !request.body.tools && !isLearning(request.body)).length, 2);
  const failed = load([evidence, answer(empty), answer(empty)]);
  await assert.rejects(failed.ai.generate({ ...profile, grade: '大一', goal: '济南本地一本院校' }), /院校|校区|检索|JSON/);
  assert.equal(failed.store.get().plans.length, 0);
});

test('internal fields or code in public text are rejected and repaired into Chinese', async () => {
  const { ai } = load();
  const { normalized, value } = localSchoolPlan(ai);
  for (const leaked of ['profile.targetExamYear=2029', '按profile.planningBasis安排', 'dateStatus=estimated，examDate与examSourceUrl留空', '截止为profile.estimatedExamDate的前一天', '```json\n{}\n```', '{"summary":"这里是JSON片段"}', 'const deadline = 2029;']) {
    const invalid = plain(value); invalid.summary = leaked;
    assert.throws(() => ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources), /内部字段或代码/);
  }
  for (const mutate of [item => { item.goal = 'profile.targetExamYear'; }, item => { item.tasks[0].title = '检查examDate'; }, item => { item.recommendations[0].reason = '根据profile.major推荐'; }]) {
    const invalid = plain(value); mutate(invalid);
    assert.throws(() => ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources), /内部字段或代码/);
  }
  const withCode = plain(value); withCode.summary = 'profile.targetExamYear=2029，dateStatus=estimated。';
  const evidence = search({ content: [...search().content.slice(0, 15), { type: 'web_search_tool_result', content: schoolSources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '官方资料待核实。出处：' + schoolSources[0].url }] });
  const repaired = load([evidence, answer(withCode), answer(value)]);
  const draft = await repaired.ai.generate({ ...profile, grade: '大一', goal: '济南本地一本院校，计算机相关专业' });
  assert.match(draft.generation.summary, /目标初试年份为2029年/);
  assert.equal(repaired.requests.filter(request => !request.body.tools && !isLearning(request.body)).length, 2);
  assert.match(repaired.requests.at(-1).body.messages.at(-1).content, /自然中文/);
  assert.match(repaired.requests.at(-1).body.system, /不重新筛选院校/);
});

test('legacy summaries render in Chinese without changing the saved content', () => {
  const { ai } = load();
  const old = '目标年度：profile.targetExamYear=2029，招生入学年度为2030；按profile.planningBasis规划。因此dateStatus=estimated，examDate与examSourceUrl留空，计划截止为profile.estimatedExamDate（2029-12-15）的前一天2029-12-14。';
  const rendered = ai.displayText(old);
  assert.ok(!/profile\.|targetExamYear|planningBasis|dateStatus|examDate|examSourceUrl|estimatedExamDate/.test(rendered));
  assert.match(rendered, /目标初试年份为2029/);
  assert.match(rendered, /尚未正式公布/);
  assert.match(rendered, /2029-12-14/);
});

test('recommendation constraints, evidence and shortage notice persist and imports fail atomically', () => {
  const { ai, store } = load();
  const { normalized, value } = localSchoolPlan(ai);
  const draft = ai.parsePlan(JSON.stringify(value), normalized, schoolSources);
  store.createAiPlan(draft);
  const restored = store.parseBackup(store.exportBackup()).plans[0];
  assert.deepEqual(plain(restored.generation), plain(store.get().plans[0].generation));
  const before = store.exportBackup();
  const unchanged = plain(store.get());
  for (const mutate of [item => { item.constraints.location.type = 'unknown'; }, item => { item.recommendations[0].location.city = '上海'; }, item => { item.recommendations[0].location.sourceUrl = 'https://unknown.edu.cn/location'; }, item => { item.recommendations[0].criteriaEvidence[0].sourceUrl = 'https://unknown.edu.cn/history'; }]) {
    const invalid = JSON.parse(before); mutate(invalid.plans[0].generation);
    assert.throws(() => store.parseBackup(JSON.stringify(invalid)));
    assert.deepEqual(plain(store.get()), unchanged);
  }
  // Previously saved shortage records remain importable, but new AI output cannot use this escape hatch.
  const legacy = JSON.parse(before);
  legacy.plans[0].generation.recommendations = [];
  legacy.plans[0].generation.recommendationNotice = '符合济南地域和院校条件的官方证据不足，暂不推荐。';
  assert.match(store.parseBackup(JSON.stringify(legacy)).plans[0].generation.recommendationNotice, /济南/);
});

test('official source anchors match the same page while different paths and queries remain distinct', () => {
  const { ai } = load();
  const anchoredSources = schoolSources.map(source => ({ ...source, url: source.url + '#1#1' }));
  const paragraph = '模拟官方招生资料出处：' + schoolSources[0].url;
  assert.equal(ai.extractResearch([{ type: 'text', text: paragraph }], anchoredSources), paragraph);
  assert.equal(ai.extractResearch([{ type: 'text', text: '其他年度 ' + schoolSources[0].url + '?year=2025' }], anchoredSources), '');
  assert.equal(ai.extractSources([{ type: 'web_search_tool_result', content: [...schoolSources, ...anchoredSources].map(source => ({ type: 'web_search_result', ...source })) }]).length, 3);
  const { normalized, value } = localSchoolPlan(ai);
  const draft = ai.parsePlan(JSON.stringify(value), normalized, anchoredSources);
  assert.equal(draft.generation.recommendations[0].sourceUrl, anchoredSources[0].url);
  assert.equal(draft.generation.recommendations[0].location.sourceUrl, anchoredSources[0].url);
  assert.equal(draft.generation.recommendations[0].criteriaEvidence[0].sourceUrl, anchoredSources[0].url);
  const altered = plain(value);
  altered.sourceUrls[0] += '?year=2025';
  assert.throws(() => ai.parsePlan(JSON.stringify(altered), normalized, anchoredSources), /未经检索/);
});

test('referenced official school evidence omitted from the top-level list is retained and late search results are available', () => {
  const { ai, store } = load();
  const { normalized, value } = localSchoolPlan(ai);
  value.sourceUrls = [schoolSources[0].url];
  const draft = ai.parsePlan(JSON.stringify(value), normalized, schoolSources);
  assert.equal(draft.generation.sources.length, 3);
  store.createAiPlan(draft);
  assert.equal(store.parseBackup(store.exportBackup()).plans[0].generation.recommendations.length, 3);
  const early = Array.from({ length: 65 }, (_, index) => ({ title: '模拟政策' + index, url: 'https://www.moe.gov.cn/policy/' + index }));
  const retrieved = ai.extractSources([{ type: 'web_search_tool_result', content: [...early, ...schoolSources].map(source => ({ type: 'web_search_result', ...source })) }]);
  assert.ok(retrieved.some(source => source.url === schoolSources[2].url));
});

test('verified official historical records support reference tiers without fabricating future admission facts', async () => {
  const loaded = load();
  const { normalized, value } = localSchoolPlan(loaded.ai);
  const names = ['济南大学', '山东师范大学', '山东财经大学'];
  value.recommendations.forEach((school, index) => { school.name = names[index]; school.criteriaEvidence = []; });
  const evidence = search({ content: [...search().content.slice(0, 15), { type: 'web_search_tool_result', content: schoolSources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '模拟本轮专业与所在地资料：' + schoolSources[0].url }] });
  const live = load([evidence, answer(value)]);
  const draft = await live.ai.generate({ ...profile, grade: '大一', goal: '济南本地一本院校' });
  for (const school of draft.generation.recommendations) {
    assert.match(school.criteriaEvidence[0].explanation, /2016|2026年10月7日/);
    assert.match(school.criteriaEvidence[0].explanation, /本科一批/);
    assert.ok(draft.generation.sources.some(source => source.url === school.criteriaEvidence[0].sourceUrl));
  }
  assert.match(draft.generation.recommendations[1].criteriaEvidence[0].explanation, /河北|天津/);
  assert.ok(draft.generation.sources.some(source => /核验2026-10-07/.test(source.title)));
  live.store.createAiPlan(draft);
  assert.equal(live.store.parseBackup(live.store.exportBackup()).plans[0].generation.recommendations.length, 3);
  assert.throws(() => loaded.ai.parsePlan(JSON.stringify(value), normalized, schoolSources), /历史招生依据/);
});

test('historical tier labels and current-policy caveats remain usable while negative classifications fail', () => {
  const { ai, store } = load();
  const { normalized, value } = localSchoolPlan(ai);
  for (const label of ['历史一本', '历史本科一批', '一本（非现行认定）']) {
    value.recommendations[0].criteriaEvidence[0].criterion = label;
    const draft = ai.parsePlan(JSON.stringify(value), normalized, schoolSources);
    store.createAiPlan(draft);
    assert.equal(store.parseBackup(store.exportBackup()).plans[0].generation.recommendations.length, 3);
  }
  value.recommendations[0].criteriaEvidence[0].criterion = '非一本';
  assert.throws(() => ai.parsePlan(JSON.stringify(value), normalized, schoolSources), /历史招生依据/);
});

test('compact plans assemble stages, deadlines and exact source URLs locally', () => {
  const { ai } = load();
  const normalized = ai.validateProfile(profile);
  const body = { messages: [{ content: JSON.stringify({ sources: sources.map((item, index) => ({ id: 'S' + (index + 1), ...item })) }) }] };
  const value = compactPlan(generated(), body);
  value.taskTitles = Array.from({ length: 16 }, (_, i) => '完成专业学习行动' + i);
  const result = ai.parsePlan(JSON.stringify(value), normalized, sources);
  assert.equal(result.tasks.length, 16);
  assert.equal(result.tasks[0].dueDate, profile.startDate);
  assert.equal(result.tasks.at(-1).dueDate, '2026-12-18');
  assert.equal(new Set(result.tasks.map(task => task.stage)).size, 4);
  assert.equal(result.generation.sources[0].url, sources[0].url);
  assert.equal(result.generation.period.examSourceUrl, sources[0].url);
  assert.equal(result.generation.sourceIds, undefined);
  const later = { ...value, examDate: '2026-12-26' };
  assert.equal(ai.parsePlan(JSON.stringify(later), normalized, sources).tasks.at(-1).dueDate, '2026-12-25');
});

test('compact estimated long plans cover all years and reject invented evidence or malformed tasks', () => {
  const { ai } = load();
  const { normalized, value } = freshmanPlan(ai);
  const body = { messages: [{ content: JSON.stringify({ sources: schoolSources.map((item, index) => ({ id: 'S' + (index + 1), ...item })) }) }] };
  const compact = compactPlan(value, body);
  const result = ai.parsePlan(JSON.stringify(compact), normalized, schoolSources);
  assert.equal(result.tasks.at(-1).dueDate, '2029-12-14');
  assert.ok(result.tasks.some(task => task.dueDate.startsWith('2027')));
  assert.ok(result.tasks.some(task => task.dueDate.startsWith('2028')));
  for (const mutate of [
    item => { item.sourceIds = ['S999']; },
    item => { item.sourceIds = [schoolSources[0].url]; },
    item => { item.recommendations[0].sourceId = 'S0'; },
    item => { item.recommendations[0].location.sourceId = 'S999'; },
    item => { item.taskTitles.pop(); },
    item => { item.taskTitles[0] = { title: '不能输出对象' }; },
    item => { item.examSourceId = 'S1'; },
    item => { item.recommendations[0].criteriaEvidence = [{ criterion: '一本', explanation: '历史本科一批', sourceId: 'S999' }]; }
  ]) {
    const invalid = plain(compact); mutate(invalid);
    assert.throws(() => ai.parsePlan(JSON.stringify(invalid), normalized, schoolSources));
  }
});

test('compact generation sends no task dates and keeps generation non-streaming with low effort', async () => {
  const fixture = load([search(), answer()]);
  await fixture.ai.generate(profile);
  const body = fixture.requests.at(-1).body;
  const input = JSON.parse(body.messages[0].content);
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.stream, false);
  assert.equal(input.suggestedTasks, undefined);
  assert.equal(input.taskStages.length, 4);
  assert.equal(input.sources[0].id, 'S1');
  assert.ok(!input.research.includes(sources[0].url));
});
