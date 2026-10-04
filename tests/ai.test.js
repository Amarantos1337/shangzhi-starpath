'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../project/js');
const profile = { level: '本科', major: '计算机网络技术', grade: '大四', baseline: '英语需要加强', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' };
const sources = [{ title: '教育部研考通知', url: 'https://www.moe.gov.cn/notice' }];
const generated = () => ({ title: '我的升学学习计划', goal: '建立基础学习节奏', summary: '官方通知提供信息线索；目标院校要求待核实。', examDate: '2026-12-19', examSourceUrl: sources[0].url, sourceUrls: [sources[0].url], tasks: Array.from({ length: 12 }, (_, index) => ({ title: '完成学习行动' + index, stage: '阶段' + Math.floor(index / 3), dueDate: index === 11 ? '2026-12-18' : '2026-10-08' })) });
const search = (extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: sources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '当年要求待核实。' }], ...extra });
const answer = (value = generated()) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] });
const plain = value => JSON.parse(JSON.stringify(value));
function load(responses = [], options = {}) {
  const requests = [];
  const saved = new Map();
  const context = vm.createContext({ URL, AbortController, DOMException, setTimeout, clearTimeout,
    window: { StarPath: {}, dispatchEvent() {} }, CustomEvent: class {},
    localStorage: { getItem(key) { return saved.get(key) ?? null; }, setItem(key, value) { if (options.blocked) throw new Error('Unavailable'); saved.set(key, value); }, removeItem(key) { saved.delete(key); } },
    fetch: async (url, request) => {
      requests.push({ url, ...request, body: JSON.parse(request.body) });
      if (options.fetch) return options.fetch(url, request);
      const value = responses.shift();
      if (value instanceof Error) throw value;
      return { ok: !value.status, status: value.status || 200, json: async () => value };
    }
  });
  for (const name of ['data', 'learning', 'storage']) vm.runInContext(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), context);
  context.window.StarPath.aiConfig = { endpoint: 'https://api.deepseek.com/anthropic/v1/messages', model: 'deepseek-flash', apiKey: 'test-only', reasoningEffort: 'high', timeoutMs: options.timeoutMs || 1000 };
  vm.runInContext(fs.readFileSync(path.join(root, 'ai.js'), 'utf8'), context);
  return { ...context.window.StarPath, requests, saved };
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
  for (const removed of ['weeks', 'hours', 'constraints']) assert.equal(validated[removed], undefined);
});
test('real tool evidence is required; text-only and unsafe search links are excluded', async () => {
  const { ai } = load([search({ content: [{ type: 'text', text: '我已搜索：' + sources[0].url }] })]);
  await assert.rejects(ai.generate(profile), /未取得有效联网检索结果/);
  assert.deepEqual(plain(ai.extractSources([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '不安全', url: 'javascript:alert(1)' }, { type: 'web_search_result', title: '凭据网址', url: 'https://user:pass@example.com' }] }])), []);
});
test('high effort generation uses search then structured planning without persisting inputs or credentials', async () => {
  const { ai, store, requests } = load([search(), answer()]);
  const stages = [];
  const draft = await ai.generate(profile, { onStage: stage => stages.push(stage) });
  assert.deepEqual(stages, ['search', 'generate']);
  assert.equal(requests.length, 2);
  for (const request of requests) { assert.equal(request.body.output_config.effort, 'high'); assert.equal(request.body.thinking.type, 'enabled'); assert.equal(request.body.model, 'deepseek-flash'); }
  assert.equal(requests[0].body.tools[0].max_uses, 3);
  assert.equal(requests[1].body.tools, undefined);
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
  assert.equal(repaired.requests.length, 3);
  const failed = load([search(), answer({}), answer({})]);
  await assert.rejects(failed.ai.generate(profile));
  assert.equal(failed.requests.length, 3);
  assert.equal(failed.store.get().plans.length, 0);
});
test('pause_turn is resumed with original blocks, remaining search budget and bounded continuations', async () => {
  const success = load([search({ stop_reason: 'pause_turn' }), search(), answer()]);
  await success.ai.generate(profile);
  assert.equal(success.requests[1].body.tools[0].max_uses, 2);
  assert.equal(success.requests[1].body.messages[1].role, 'assistant');
  const failed = load([search({ stop_reason: 'pause_turn' }), search({ stop_reason: 'pause_turn' }), search({ stop_reason: 'pause_turn' })]);
  await assert.rejects(failed.ai.generate(profile), /限定次数/);
  assert.equal(failed.requests.length, 3);
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
  await assert.rejects(timeout.ai.generate(profile), /超过180秒/);
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
  { title: '乙校招生说明', url: 'https://yz.school-b.edu.cn/catalog' }
];
function freshmanPlan(ai) {
  const normalized = ai.validateProfile({ ...profile, grade: '大一', goal: '' });
  const last = new Date(normalized.estimatedExamDate + 'T00:00:00Z');
  last.setUTCDate(last.getUTCDate() - 1);
  const endDate = last.toISOString().slice(0, 10);
  const start = Date.parse(normalized.startDate);
  const end = Date.parse(endDate);
  const value = { ...generated(), dateStatus: 'estimated', examDate: '', examSourceUrl: '', sourceUrls: schoolSources.map(source => source.url),
    recommendations: schoolSources.map((source, index) => ({ name: ['甲校', '乙校'][index], reason: '结合计算机专业方向、英语基础与山东地区偏好，建议核对招生方向和报考条件。', sourceUrl: source.url })),
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
  const searchResult = search({ content: [{ type: 'web_search_tool_result', content: schoolSources.map(source => ({ type: 'web_search_result', ...source })) }, { type: 'text', text: '目标年度日期未公布，院校信息作为参考。' }] });
  const live = load([searchResult, answer(value)]);
  const result = await live.ai.generate({ ...profile, grade: '大一', goal: '' });
  assert.equal(result.generation.recommendations.length, 2);
  const submitted = JSON.parse(live.requests[1].body.messages[0].content);
  assert.equal(submitted.profile.targetExamYear, 2029);
  assert.equal(submitted.profile.goal, '');
  assert.match(live.requests[0].body.messages[0].content, /推荐2–3所/);
});

test('source titles remove HTML fragments and encoded tags while remaining escaped by the UI', () => {
  const { ai } = load();
  assert.equal(ai.sourceTitle('<table><tr><td colspan="5">招生目录</td></tr></table>'), '招生目录');
  assert.equal(ai.sourceTitle('&lt;b&gt;招生&#32;通知&lt;/b&gt;'), '招生 通知');
  assert.equal(ai.sourceTitle('<script>alert(1)</script><style>x</style>官方 &amp; 说明'), '官方 & 说明');
  assert.equal(ai.sourceTitle('<img src=x onerror=alert(1)>'), '参考资料');
  assert.equal(ai.sourceTitle('招生目录 <td...'), '招生目录');
});
