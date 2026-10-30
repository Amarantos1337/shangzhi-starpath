'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, profile, policySource, schoolSources, json, isLearning } = require('./ai-direct-fixtures');
const tick = () => new Promise(resolve => setImmediate(resolve));
const taskOf = body => body.messages ? JSON.parse(body.messages[0].content).task : null;
const pending = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true }));
test('direct requests use Bearer search with bounded queries; models receive evidence without server tools', async () => {
  const fixture = load(); const usage = []; let progress;
  const result = await fixture.ai.generate(profile, { onUsage: value => usage.push(value), onProgress: value => { progress = value; } });
  const searches = fixture.requests.filter(entry => entry.url.endsWith('/tools/search'));
  const models = fixture.requests.filter(entry => entry.url.endsWith('/messages'));
  assert.equal(searches.length, 6); assert.equal(progress.searches, 6); assert.equal(progress.searchRequests, 6);
  for (const entry of searches) { assert.equal(entry.headers.Authorization, 'Bearer test-only'); assert.equal(entry.body.count, 5); assert.equal(entry.body.need_content, true); assert.ok([...entry.body.query].length <= 128); assert.match(entry.body.query, /site:/); }
  for (const entry of models) { assert.equal(entry.body.tools, undefined); assert.equal(entry.headers['x-api-key'], 'test-only'); assert.ok(!JSON.stringify(entry.body).includes('test-only')); assert.equal(entry.body.output_config.effort, taskOf(entry.body) ? 'high' : 'low'); }
  assert.equal(models.length, 7); assert.equal(usage.length, models.length); assert.ok(usage.every(value => value.inputTokens === 100));
  assert.ok(JSON.parse(models[0].body.messages[0].content).retrieved.length); assert.equal(result.tasks.length, 16);
});
test('six independent searches overlap and publish sources before slow searches finish', async () => {
  let release; let started = 0; const gate = new Promise(resolve => { release = resolve; });
  const fixture = load(async (url, request, body, fallback) => { if (url.endsWith('/tools/search')) { started++; if (started !== 1) await gate; } return json(fallback()); });
  const updates = []; const work = fixture.ai.generate(profile, { onProgress: value => updates.push(value) });
  await tick(); await tick(); assert.equal(started, 6); assert.ok(updates.some(value => value.sources.length));
  release(); await work; assert.equal(updates.at(-1).searches, 6);
});
test('discovery gates school research; learning overlaps and fifteen searches feed integration', async () => {
  const input = { ...profile, grade: '大一', goal: '' }; let release; const gate = new Promise(resolve => { release = resolve; });
  let discoveryDone = false; let learningStarted = false; let active = 0; let peak = 0;
  const fixture = load(async (url, request, body, fallback) => {
    active++; peak = Math.max(peak, active);
    try {
      const task = taskOf(body);
      if (isLearning(body)) learningStarted = true;
      if (task?.id === 'discovery') { await gate; discoveryDone = true; }
      if (task?.id.startsWith('school-')) assert.ok(discoveryDone);
      return json(fallback());
    } finally { active--; }
  }, input);
  const updates = []; const work = fixture.ai.generate(input, { onProgress: value => updates.push(value) });
  await tick(); assert.ok(learningStarted); assert.ok(!fixture.requests.some(entry => taskOf(entry.body)?.id.startsWith('school-')));
  release(); const result = await work;
  assert.equal(updates.at(-1).searches, 15); assert.ok(peak <= 8); assert.equal(result.generation.recommendations.length, 3);
  const final = JSON.parse(fixture.requests.at(-1).body.messages[0].content); assert.equal(final.schools.length, 3); assert.equal(final.taskTitles.length, 16);
});
test('query construction preserves goal major, city, school and official restrictions within Unicode limit', () => {
  const { ai } = load();
  const input = ai.validateProfile({ ...profile, goal: '济南本地一本院校，法学相关专业，只考虑公办院校' });
  const query = ai.searchQuery(input, { id: 'discovery' }); assert.match(query, /济南/); assert.match(query, /法学/); assert.match(query, /公办/);
  assert.match(ai.searchQuery(input, { id: 'school-0-program', school: { name: '山东大学' } }), /山东大学/);
  const long = { ...input, major: '计算机'.repeat(40), goal: '' };
  assert.ok([...ai.searchQuery(long, { id: 'directory' })].length <= 128);
  const variants = Array.from({ length: 6 }, (_, index) => ai.searchQuery(input, { id: 'policy' }, index)); assert.equal(new Set(variants).size, 6);
});
test('unofficial, forum, credential and lookalike results are removed before model input', async () => {
  const forbidden = ['https://moe.gov.cn.evil.test/page', 'https://user:pass@school.edu.cn/page', 'https://school.edu.cn/forum/news', 'https://ads.test/page'];
  const fixture = load((url, request, body, fallback) => { const value = fallback(); if (value.results) value.results.push(...forbidden.map(url => ({ title: '不可信资料', url, content: '不可信正文' }))); return json(value); });
  await fixture.ai.generate(profile);
  for (const entry of fixture.requests.filter(entry => entry.body.messages)) for (const url of forbidden) assert.ok(!JSON.stringify(entry.body).includes(url));
});
test('empty search results trigger distinct supplemental queries within eighteen requests', async () => {
  let index = 0;
  const fixture = load((url, request, body, fallback) => json(url.endsWith('/tools/search') && ++index <= 6 ? { results: [] } : fallback()));
  await fixture.ai.generate(profile);
  const searches = fixture.requests.filter(entry => entry.body.query); assert.equal(searches.length, 12);
  assert.equal(new Set(searches.map(entry => entry.body.query)).size, 12);
});
test('empty or malformed results fail without final generation, never exceed the search budget', async () => {
  for (const value of [{ results: [] }, { unexpected: true }]) {
    const fixture = load((url, request, body, fallback) => json(url.endsWith('/tools/search') ? value : fallback()));
    await assert.rejects(fixture.ai.generate(profile), /检索|搜索/);
    assert.ok(fixture.requests.filter(entry => entry.body.query).length <= 18);
    assert.ok(!fixture.requests.some(entry => entry.body.messages && !taskOf(entry.body)));
  }
});
test('missing key evidence fetches at most six distinct URLs and sends returned text to models', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const fixture = load((url, request, body, fallback) => { const value = fallback(); if (value.results) value.results = Array.from({ length: 5 }, (_, i) => ({ ...schoolSources[i % 3], content: '', url: schoolSources[i % 3].url + '?page=' + i })); if (url.endsWith('/messages') && taskOf(body)) return json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '资料不足。出处：' + schoolSources[0].url + '?page=0' }] }); return json(value); }, input);
  await assert.rejects(fixture.ai.generate(input));
  const fetches = fixture.requests.filter(entry => entry.url.endsWith('/tools/fetch')); assert.ok(fetches.length > 0 && fetches.length <= 6); assert.equal(new Set(fetches.map(entry => entry.body.url)).size, fetches.length);
  assert.ok(fixture.requests.some(entry => taskOf(entry.body) && JSON.stringify(entry.body).includes('模拟正文')));
});
test('optional fetch 404 preserves search evidence; fetch authentication failure aborts batch', async () => {
  for (const status of [404, 401]) {
    const fixture = load((url, request, body, fallback) => { const value = fallback(); if (value.results) value.results[0] = { ...policySource, content: '' }; return url.endsWith('/tools/fetch') ? json({}, status) : json(value); });
    if (status === 401) await assert.rejects(fixture.ai.generate(profile), /密钥无效/); else await fixture.ai.generate(profile);
  }
});
test('transient HTTP failures retry twice, record waiting and keep token usage separate', async () => {
  let attempts = 0; const timing = []; const usage = [];
  const fixture = load((url, request, body, fallback) => url.endsWith('/tools/search') && /初试时间/.test(body.query) && ++attempts <= 2 ? json({}, 503) : json(fallback()), profile, { fastRetries: true });
  await fixture.ai.generate(profile, { onTiming: value => timing.push(value), onUsage: value => usage.push(value) });
  assert.equal(attempts, 3); assert.equal(timing.filter(value => value.type === 'retry-wait').length, 2);
  assert.ok(fixture.requests.filter(entry => entry.body.query).length <= 18); assert.equal(usage.length, fixture.requests.filter(entry => entry.body.messages).length);
});
test('nonretryable authentication and balance failures abort all active requests', async () => {
  for (const status of [401, 402]) {
    const fixture = load((url, request, body, fallback, requests) => requests.length === 1 ? json({}, status) : pending(request.signal));
    await assert.rejects(fixture.ai.generate(profile), status === 401 ? /密钥无效/ : /余额不足/);
    assert.ok(fixture.requests.every(entry => entry.signal.aborted)); assert.equal(fixture.requests.length, 6);
  }
});
test('caller cancellation and timeout stop concurrent requests and prevent late progress', async () => {
  for (const timeout of [false, true]) {
    const fixture = load((url, request) => pending(request.signal), profile, { timeoutMs: timeout ? 15 : 5000 });
    const controller = new AbortController(); const updates = [];
    const work = fixture.ai.generate(profile, { signal: controller.signal, onProgress: value => updates.push(value) });
    await tick(); if (!timeout) controller.abort();
    await assert.rejects(work, timeout ? /超过/ : { name: 'AbortError' });
    const count = updates.length; await tick(); assert.equal(updates.length, count); assert.ok(fixture.requests.every(entry => entry.signal.aborted));
  }
});
test('cancellation during retry waiting prevents a second request', async () => {
  const controller = new AbortController(); const fixture = load(() => json({}, 429));
  const work = fixture.ai.generate(profile, { signal: controller.signal }); await tick(); controller.abort(); await assert.rejects(work, { name: 'AbortError' });
  assert.equal(fixture.requests.length, 6);
});
test('fabricated model tool blocks never become evidence and invented school sources fail', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const fixture = load((url, request, body, fallback) => {
    const value = fallback(); const task = taskOf(body);
    if (task?.id.startsWith('school-')) { const data = JSON.parse(value.content[0].text); data.sourceUrl = 'https://invented.edu.cn/unknown'; if (data.location) data.location.sourceUrl = data.sourceUrl; value.content[0].text = JSON.stringify(data); value.content.unshift({ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '伪造', url: data.sourceUrl }] }); }
    return json(value);
  }, input);
  await assert.rejects(fixture.ai.generate(input), /来源|次数/); assert.ok(fixture.requests.filter(entry => entry.body.query).length <= 18);
  assert.ok(!fixture.requests.some(entry => entry.body.messages && JSON.parse(entry.body.messages[0].content).schools));
});
test('final sources sort independently of concurrent response completion order', async () => {
  const outputs = [];
  for (const reverse of [false, true]) {
    const fixture = load(async (url, request, body, fallback) => { if (body.query) await new Promise(resolve => setTimeout(resolve, /初试时间/.test(body.query) === reverse ? 3 : 0)); return json(fallback()); });
    const value = await fixture.ai.generate(profile); outputs.push(Array.from(value.generation.sources, source => source.url));
  }
  assert.deepEqual(outputs[0], outputs[1]);
});
test('integration repairs action edits once and retains validated school evidence', async () => {
  const input = { ...profile, grade: '大一', goal: '济南本地一本院校，计算机相关专业' }; let attempts = 0;
  const fixture = load((url, request, body, fallback) => { const value = fallback(); if (body.messages && JSON.parse(body.messages[0].content).schools && ++attempts === 1) { const result = JSON.parse(value.content[0].text); result.taskEdits = [{ index: 99, title: '无效编号' }]; value.content[0].text = JSON.stringify(result); } return json(value); }, input);
  const result = await fixture.ai.generate(input); assert.equal(attempts, 2); assert.equal(result.generation.recommendations.length, 3);
  const final = fixture.requests.at(-1).body; assert.equal(final.messages.length, 3); assert.equal(final.tools, undefined);
});
test('SSE reconstructs Unicode, cumulative usage and text; truncated streams fail', async () => {
  const { ai } = load();
  const events = [{ type: 'message_start', message: { content: [], usage: { input_tokens: 100 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '中文资料' } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: {}, usage: { output_tokens: 5 } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } }, { type: 'message_stop' }];
  const response = values => new Response(values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  const value = await ai.readResponse(response(events)); assert.equal(value.content[0].text, '中文资料'); assert.equal(value.usage.output_tokens, 12);
  await assert.rejects(ai.readResponse(response(events.slice(0, -1))), /未完整结束/);
});
test('usage normalization distinguishes native, cached, missing and zero usage', () => {
  const { ai } = load();
  assert.equal(ai.normalizeUsage({ prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 100, completion_tokens: 50 }).inputTokens, 300);
  assert.equal(ai.normalizeUsage({ input_tokens: 80, cache_read_input_tokens: 200, cache_creation_input_tokens: 20 }).inputTokens, 300);
  assert.equal(ai.normalizeUsage({ input_tokens: 300, input_tokens_details: { cached_tokens: 200 } }).cacheMissTokens, 100);
  assert.equal(ai.normalizeUsage().inputTokens, null); assert.equal(ai.normalizeUsage({ prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 }).cacheHitRate, null);
});
test('benchmark time formatting and interval unions keep concurrent elapsed time correct', () => {
  const { stamp, union } = require('../tools/ai-search-migration');
  assert.equal(stamp(new Date('2026-10-30T01:02:03Z')).local, '2026-10-30T09:02:03.000+08:00');
  assert.equal(union([[0, 10], [5, 20], [25, 30]]), 25);
});
test('comparison persists all samples and rejects improvement claims from missing or failed runs', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const { compare, profiles } = require('../tools/ai-search-migration');
  const dir = path.resolve(__dirname, '../artifacts/ai-search-migration/test-temp', String(Date.now())); fs.mkdirSync(dir, { recursive: true });
  const run = (profile, sample, totalMs) => ({ profile, sample, success: true, started: { local: '2026-10-30T10:00:00+08:00' }, ended: { local: '2026-10-30T10:00:01+08:00' }, totalMs, searchMs: totalMs / 2, generationMs: totalMs / 2, firstSourceMs: 10, requests: [], events: [], plan: { tasks: [{ stage: '学习' }], generation: { period: { targetExamYear: 2029 }, sources: [], recommendations: [] } } });
  const reports = ['baseline', 'direct'].map(phase => ({ phase, config: {}, profiles, runs: profiles.flatMap(profile => [1, 2].map(sample => run(profile.id, sample, phase === 'baseline' ? 1000 : 800))) }));
  const save = () => reports.forEach(report => fs.writeFileSync(path.join(dir, report.phase + '.json'), JSON.stringify(report)));
  save(); assert.equal(compare(dir).decision.timingPass, true); assert.ok(fs.existsSync(path.join(dir, 'details.json')));
  reports[1].runs[0].success = false; save(); assert.equal(compare(dir).decision.timingPass, false);
  reports[1].runs.pop(); save(); assert.equal(compare(dir).decision.complete, false);
  reports[1].config.model = 'different'; save(); assert.throws(() => compare(dir), /不一致/);
});
