'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { compactPlan, isLearning, schoolEvidence } = require('./ai-fixtures');
const profile = { level: '本科', major: '计算机网络技术', grade: '大四', baseline: '英语需要加强', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' };
const source = { title: '教育部通知', url: 'https://www.moe.gov.cn/notice' };
const schoolSources = ['甲大学', '乙大学', '丙大学'].map((name, i) => ({ name, title: name + '招生', url: 'https://school-' + i + '.edu.cn/catalog' }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function result(body) {
  const task = JSON.parse(body.messages.find(message => message.role === 'user').content).task;
  const sources = task.id === 'discovery' || task.id.startsWith('school-') ? schoolSources : [source];
  const discovery = task.id === 'discovery' ? JSON.stringify({ candidates: schoolSources.map(item => ({ name: item.name, province: '山东', city: '济南', sourceUrl: item.url })), summary: '候选学校需要进一步核实。出处：' + sources[0].url }) : task.id.startsWith('school-') ? JSON.stringify(schoolEvidence(plan({ ...profile, goal: '' }), body)) : task.title + '的资料摘要。出处：' + sources[0].url;
  return { stop_reason: 'end_turn', content: [...Array.from({ length: body.tools[0].max_uses }, (_, i) => ({ type: 'server_tool_use', name: 'web_search', id: task.id + '-' + i })), { type: 'web_search_tool_result', content: sources.map(item => ({ type: 'web_search_result', ...item })) }, { type: 'text', text: discovery }] };
}
function plan(input = profile) {
  const local = !input.goal.includes('山东大学');
  const end = local ? '2029-12-14' : '2026-12-18';
  return { title: '升学学习计划', goal: '持续提升专业基础', summary: '目标年度的要求以官方资料为准，学习安排为建议。', dateStatus: local ? 'estimated' : 'official', examDate: local ? '' : '2026-12-19', examSourceUrl: local ? '' : source.url, sourceUrls: [source.url, ...(local ? schoolSources.map(item => item.url) : [])],
    recommendations: local ? schoolSources.map(item => ({ name: item.name, reason: '根据地区和专业方向比较。', sourceUrl: item.url, location: { province: '山东', city: '济南', campus: '计算机培养校区', sourceUrl: item.url }, criteriaEvidence: [] })) : [],
    tasks: Array.from({ length: 12 }, (_, i) => ({ title: '学习行动' + i, stage: '阶段' + Math.floor(i / 3), dueDate: new Date(Date.parse(input.startDate) + (Date.parse(end) - Date.parse(input.startDate)) * i / 11).toISOString().slice(0, 10) })) };
}
function load(fetcher, input = profile, timeoutMs = 2000) {
  const requests = [];
  const context = vm.createContext({ window: { StarPath: { aiConfig: { endpoint: 'https://test.invalid', apiKey: 'test-only', model: 'deepseek-flash', reasoningEffort: 'high', timeoutMs } } }, URL, TextDecoder, AbortController, DOMException, setTimeout, clearTimeout,
    fetch: async (url, request) => {
      const body = JSON.parse(request.body); requests.push({ body, signal: request.signal });
      if (fetcher) return fetcher(body, request, requests.length);
      return new Response(JSON.stringify(body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] }), { headers: { 'content-type': 'application/json' } });
    } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../project/js/ai.js'), 'utf8'), context);
  return { ai: context.window.StarPath.ai, requests };
}
function sse(value, truncate = false) {
  const events = [{ type: 'message_start', message: { content: [], stop_reason: null } }];
  value.content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { ...block, text: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    } else events.push({ type: 'content_block_start', index, content_block: block });
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'ping' }, { type: 'future_event' }, { type: 'message_delta', delta: { stop_reason: value.stop_reason } });
  if (!truncate) events.push({ type: 'message_stop' });
  const bytes = new TextEncoder().encode(events.map(event => 'event: ' + event.type + '\r\ndata: ' + JSON.stringify(event) + '\r\n\r\n').join(''));
  let position = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (position === bytes.length) return controller.close();
    controller.enqueue(bytes.slice(position, position += 7));
  } }), { headers: { 'content-type': 'text/event-stream' } });
}
test('six searches overlap, first results publish before remaining tasks finish and budgets are reserved', async () => {
  const gates = Array.from({ length: 6 }, deferred);
  const updates = [];
  const fixture = load(async (body, _, index) => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }));
    await gates[index - 1].promise;
    return sse(result(body));
  });
  const promise = fixture.ai.generate(profile, { onProgress: update => updates.push(update) });
  await tick(); assert.equal(fixture.requests.length, 6);
  assert.equal(fixture.requests.reduce((sum, request) => sum + request.body.tools[0].max_uses, 0), 6);
  gates[3].resolve(); await tick(); await tick();
  assert.ok(updates.some(update => update.sources.length && update.tasks.some(task => task.status === 'searching')));
  gates.forEach(gate => gate.resolve()); await promise;
  const last = updates.at(-1);
  assert.equal(last.searches, 6);
  assert.equal(last.sources.length, 1);
  assert.equal(fixture.requests.at(-1).body.tools, undefined);
});
test('candidate discovery gates six school tasks, all evidence is merged and actual count reaches fifteen', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const fixture = load(null, input);
  const updates = [];
  const draft = await fixture.ai.generate(input, { onProgress: update => updates.push(update) });
  assert.equal(draft.generation.recommendations.length, 3);
  assert.equal(fixture.requests.filter(request => request.body.tools).length, 9);
  assert.equal(updates.at(-1).searches, 15);
  const schoolRequests = fixture.requests.filter(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id.startsWith('school-'));
  assert.equal(schoolRequests.length, 6);
  const evidence = JSON.parse(fixture.requests.at(-1).body.messages[0].content);
  assert.ok(evidence.policies.includes('国家') && evidence.schools.some(school => school.name === '甲大学'));
});
test('SSE reconstruction handles UTF-8, citations, tool inputs and signatures, but rejects truncation', async () => {
  const events = { stop_reason: 'end_turn', content: [{ type: 'text', text: '中文资料', citations: [{ url: source.url }] }, { type: 'thinking', thinking: 'private', signature: 'opaque' }, { type: 'server_tool_use', id: 'a', name: 'web_search', input: { query: '招生' } }] };
  const { ai } = load();
  const value = await ai.readResponse(sse(events));
  assert.deepEqual(JSON.parse(JSON.stringify(value.content)), events.content);
  await assert.rejects(ai.readResponse(sse(events, true)), /未完整结束/);
});
test('SSE tool JSON, citation and thinking deltas survive reconstruction for pause continuations', async () => {
  const events = [
    { type: 'message_start', message: { content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'a', name: 'web_search', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"官方"}' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'opaque reasoning' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'signature_delta', signature: 'signed' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '有出处' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'citations_delta', citation: { url: source.url } } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'pause_turn' } }, { type: 'message_stop' }
  ];
  const response = new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  const { ai } = load(); const value = await ai.readResponse(response);
  assert.equal(value.stop_reason, 'pause_turn');
  assert.equal(value.content[0].input.query, '官方');
  assert.equal(value.content[1].signature, 'signed');
  assert.equal(value.content[2].citations[0].url, source.url);
  const failed = new Response('data: {"type":"error","error":{"type":"overloaded_error"}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(ai.readResponse(failed), /暂时不可用/);
});
test('failure aborts all other requests and does not replace the useful error with cancellation', async () => {
  const fixture = load((body, request, index) => index === 1 ? Promise.resolve(new Response('{}', { status: 401 })) : new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true })));
  await assert.rejects(fixture.ai.generate(profile), /密钥无效/);
  assert.ok(fixture.requests.every(request => request.signal.aborted));
});
test('caller cancellation and timeout abort the complete concurrent batch without late progress', async () => {
  for (const timedOut of [false, true]) {
    const fixture = load((body, request) => new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true })), profile, timedOut ? 15 : 2000);
    const controller = new AbortController(); const updates = [];
    const promise = fixture.ai.generate(profile, { signal: controller.signal, onProgress: update => updates.push(update) });
    await tick(); if (!timedOut) controller.abort();
    await assert.rejects(promise, timedOut ? /超过/ : { name: 'AbortError' });
    const count = updates.length; await tick(); assert.equal(updates.length, count);
    assert.equal(fixture.requests.length, 6);
    assert.ok(fixture.requests.every(request => request.signal.aborted));
  }
});
test('pause_turn keeps opaque assistant blocks and resumes within the remaining shared budget', async () => {
  let resumed;
  const fixture = load(body => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }));
    const value = result(body);
    const task = JSON.parse(body.messages[0].content).task;
    if (task.id === 'policy' && body.messages.length === 1) {
      value.stop_reason = 'pause_turn'; value.content.unshift({ type: 'thinking', thinking: 'opaque', signature: 'signed' });
    } else if (task.id === 'policy') {
      resumed = body; value.content[0].id += '-continued';
    }
    return sse(value);
  });
  await fixture.ai.generate(profile);
  assert.equal(resumed.messages[1].role, 'assistant');
  assert.equal(resumed.messages[1].content[0].signature, 'signed');
  assert.equal(resumed.tools[0].max_uses, 1);
  const initial = fixture.requests.find(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id === 'policy').body;
  assert.equal(resumed.system, initial.system);
  assert.equal(resumed.messages[0].content, initial.messages[0].content);
  assert.equal(fixture.requests.filter(request => request.body.tools).length, 7);
});
test('empty first searches retry different queries and future school budgets remain available', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const attempts = new Map(); let last;
  const fixture = load(body => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] }));
    const task = JSON.parse(body.messages[0].content).task;
    const attempt = (attempts.get(task.id) || 0) + 1; attempts.set(task.id, attempt);
    const value = result(body);
    value.content.filter(block => block.type === 'server_tool_use').forEach(block => { block.id += '-' + attempt; });
    if (!task.id.startsWith('school-') && attempt === 1) {
      value.content = value.content.filter(block => block.type === 'server_tool_use');
      value.content.push({ type: 'web_search_tool_result', tool_use_id: value.content[0].id, content: [] });
    }
    return sse(value);
  }, input);
  await fixture.ai.generate(input, { onProgress: value => { last = value; } });
  assert.equal(last.searches, 18);
  assert.equal(last.tasks.filter(task => task.status === 'complete').length, 9);
});
test('per-request budget violations and two rounds without searches fail without generating', async () => {
  for (const excessive of [true, false]) {
    const fixture = load(body => {
      const value = result(body);
      value.content = excessive ? [...Array.from({ length: 19 }, (_, i) => ({ type: 'server_tool_use', name: 'web_search', id: '' + i })), ...value.content.slice(1)] : value.content.filter(block => block.type !== 'server_tool_use');
      return new Response(JSON.stringify(value));
    });
    await assert.rejects(fixture.ai.generate(profile), /限定次数/);
    assert.ok(fixture.requests.every(request => request.body.tools));
    assert.ok(fixture.requests.length <= 12);
  }
});
test('a policy failure while discovery is pending remains the error reported to the caller', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const fixture = load((body, request) => JSON.parse(body.messages[0].content).task?.id === 'policy' ? new Response('{}', { status: 401 }) : new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true })), input);
  await assert.rejects(fixture.ai.generate(input), /密钥无效/);
  assert.ok(fixture.requests.every(request => request.signal.aborted));
});
test('tool calls rejected by server max_uses are excluded from actual searches', async () => {
  let last;
  const fixture = load(body => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }));
    const value = result(body); const id = value.content[0].id;
    value.content[1].tool_use_id = id;
    value.content.splice(1, 0, { type: 'server_tool_use', name: 'web_search', id: id + '-rejected' });
    value.content.push({ type: 'web_search_tool_result', tool_use_id: id + '-rejected', content: [{ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }] });
    return sse(value);
  });
  await fixture.ai.generate(profile, { onProgress: value => { last = value; } });
  assert.equal(last.searches, 6);
  assert.ok(last.tasks.every(task => task.status === 'complete'));
});
test('candidate titles resolve to original returned URLs without accepting invented paths', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const fixture = load(body => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] }));
    const value = result(body);
    if (JSON.parse(body.messages[0].content).task.id === 'discovery') {
      const candidate = JSON.parse(value.content.at(-1).text);
      candidate.candidates.forEach((item, index) => { item.sourceTitle = schoolSources[index].title; item.sourceUrl += '/invented'; });
      value.content.at(-1).text = '```json\n' + JSON.stringify(candidate) + '\n```';
    }
    return sse(value);
  }, input);
  await fixture.ai.generate(input);
  const schoolRequest = fixture.requests.find(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id.startsWith('school-'));
  assert.ok(schoolRequest.body.messages[0].content.includes(schoolSources[0].url));
  assert.ok(!schoolRequest.body.messages[0].content.includes('/invented'));
});
test('verified historical candidate leads stay separate from live source counts and still require school searches', async () => {
  const input = { ...profile, grade: '大一', goal: '济南本地一本院校，计算机相关专业' };
  let last;
  const fixture = load(body => {
    if (!body.tools) {
      const value = plan(input); value.recommendations.forEach((item, index) => { item.name = ['济南大学', '山东师范大学', '山东财经大学'][index]; });
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(value, body)) }] }));
    }
    const value = result(body);
    if (JSON.parse(body.messages[0].content).task.id === 'discovery') {
      value.content[1].content = [];
      value.content.at(-1).text = JSON.stringify({ candidates: [] });
    }
    return sse(value);
  }, input);
  const draft = await fixture.ai.generate(input, { onProgress: update => { last = update; } });
  assert.equal(last.searches, 15);
  assert.ok(last.summaries.some(text => text.includes('不是本轮搜索结果')));
  assert.ok(!last.sources.some(item => /2016年官方历史招生记录/.test(item.title)));
  assert.equal(fixture.requests.filter(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id.startsWith('school-')).length, 6);
  assert.equal(draft.generation.recommendations.length, 3);
});
test('verified local historical leads are prioritized even when discovery returns three other candidates', async () => {
  const input = { ...profile, grade: '大一', goal: '济南本地一本院校，计算机相关专业' };
  const fixture = load(null, input);
  const draft = await fixture.ai.generate(input);
  assert.deepEqual(Array.from(draft.generation.recommendations, school => school.name), ['济南大学', '山东师范大学', '山东财经大学']);
  const evidence = JSON.parse(fixture.requests.at(-1).body.messages[0].content);
  assert.ok(evidence.schools.every(school => school.criteriaEvidence.some(item => item.explanation.includes('2016') && item.explanation.includes('2026年10月7日'))));
  assert.equal(fixture.requests.filter(request => request.body.tools).reduce((sum, request) => sum + request.body.tools[0].max_uses, 0), 15);
});
test('official-domain forum pages are excluded from evidence', () => {
  const { ai } = load();
  assert.equal(ai.extractSources([{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '在线论坛', url: 'https://yz.chsi.com.cn/zxdy/forum--method-listDefault.dhtml' }] }]).length, 0);
});
module.exports = { load, result, plan, profile, source, sse, schoolSources };

// Cache tests use the same budget and plan fixtures as the concurrent regression.
test('search prefixes remain shared while recommendation integration uses a focused prompt', async () => {
  const named = load();
  const input = { ...profile, grade: '大一', goal: '' };
  const local = load(null, input);
  await named.ai.generate(profile);
  await local.ai.generate(input);
  const searches = [...named.requests, ...local.requests].filter(request => request.body.tools);
  assert.equal(new Set(searches.map(request => request.body.system)).size, 1);
  assert.notEqual(named.requests.at(-1).body.system, local.requests.at(-1).body.system);
  assert.ok(local.requests.at(-1).body.system.includes('不重新筛选院校'));
  assert.ok(!searches[0].body.system.includes('2026年'));
  const payload = JSON.parse(searches[0].body.messages[0].content);
  assert.deepEqual(Object.keys(payload), ['profile', 'task', 'round', 'sources', 'research', 'candidates']);
  assert.equal(payload.task.requiredSearches, undefined);
  assert.equal(payload.round.requiredSearches, searches[0].body.tools[0].max_uses);
});

test('usage normalization distinguishes native, Anthropic, unavailable and zero totals', () => {
  const { ai } = load();
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(ai.normalizeUsage({ prompt_tokens: 300, prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 100, completion_tokens: 50 })),
    { inputTokens: 300, cacheHitTokens: 200, cacheMissTokens: 100, outputTokens: 50, cacheHitRate: 2 / 3 });
  assert.equal(ai.normalizeUsage({ input_tokens: 80, cache_read_input_tokens: 200, cache_creation_input_tokens: 20, output_tokens: 50 }).inputTokens, 300);
  assert.equal(ai.normalizeUsage({ input_tokens: 300, input_tokens_details: { cached_tokens: 200 } }).cacheMissTokens, 100);
  assert.equal(ai.normalizeUsage({ input_tokens: 300 }).cacheHitTokens, null);
  assert.equal(ai.normalizeUsage().inputTokens, null);
  assert.equal(ai.normalizeUsage({ prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 }).cacheHitRate, null);
  assert.equal(ai.normalizeUsage({ input_tokens: -1, cache_read_input_tokens: '20' }).inputTokens, null);
});

test('stream usage merges start and cumulative deltas instead of counting updates twice', async () => {
  const { ai } = load();
  const events = [
    { type: 'message_start', message: { content: [], usage: { input_tokens: 100, cache_read_input_tokens: 200, output_tokens: 0 } } },
    { type: 'message_delta', delta: {}, usage: { output_tokens: 5 } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } },
    { type: 'message_stop' }
  ];
  const value = await ai.readResponse(new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } }));
  assert.equal(value.usage.input_tokens, 100);
  assert.equal(value.usage.output_tokens, 12);
  assert.equal(ai.normalizeUsage(value.usage).inputTokens, 300);
});

test('usage callback publishes one record per request without changing the saved plan', async () => {
  const fixture = load(body => new Response(JSON.stringify({ ...(body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }),
    usage: { input_tokens: 100, cache_read_input_tokens: 200, output_tokens: 12 } })));
  const updates = [];
  const draft = await fixture.ai.generate(profile, { onUsage: usage => updates.push(usage) });
  assert.equal(updates.length, 7);
  assert.equal(updates.filter(update => update.stage === 'search' && update.taskId).length, 6);
  assert.equal(updates.at(-1).attempt, 0);
  assert.equal(updates.at(-1).cacheMissTokens, 100);
  assert.equal(draft.generation.usage, undefined);
});

test('generation repair appends messages without changing the original system or input', async () => {
  let generated = 0;
  const fixture = load(body => new Response(JSON.stringify(body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: ++generated === 1 ? '{}' : JSON.stringify(compactPlan(plan(), body)) }] })));
  await fixture.ai.generate(profile);
  const requests = fixture.requests.filter(request => !request.body.tools);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.system, requests[1].body.system);
  assert.equal(requests[0].body.messages[0].content, requests[1].body.messages[0].content);
  assert.equal(requests[1].body.messages[1].role, 'assistant');
});

test('ordinary retries keep the fixed profile and task prefix while updating round data', async () => {
  let first = true;
  const fixture = load(body => {
    if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }));
    const value = result(body);
    if (JSON.parse(body.messages[0].content).task.id === 'policy' && first) {
      first = false;
      value.content = [{ type: 'server_tool_use', id: 'empty', name: 'web_search' }, { type: 'web_search_tool_result', tool_use_id: 'empty', content: [] }];
    }
    return new Response(JSON.stringify(value));
  });
  await fixture.ai.generate(profile);
  const requests = fixture.requests.filter(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id === 'policy');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.system, requests[1].body.system);
  const inputs = requests.map(request => JSON.parse(request.body.messages[0].content));
  assert.deepEqual(inputs[0].profile, inputs[1].profile);
  assert.deepEqual(inputs[0].task, inputs[1].task);
  assert.equal(inputs[1].round.isContinuation, true);
});

test('final source order is independent of request completion order', async () => {
  async function run(reverse) {
    const gates = Array.from({ length: 6 }, deferred);
    const fixture = load(async (body, _, index) => {
      if (!body.tools) return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(), body)) }] }));
      const value = result(body);
      const task = JSON.parse(body.messages[0].content).task;
      value.content.find(block => block.type === 'web_search_tool_result').content.push({ type: 'web_search_result', title: task.id, url: 'https://www.moe.gov.cn/' + task.id });
      await gates[index - 1].promise;
      return new Response(JSON.stringify(value));
    });
    const pending = fixture.ai.generate(profile);
    await tick();
    for (const gate of reverse ? gates.slice().reverse() : gates) { gate.resolve(); await tick(); }
    await pending;
    return JSON.parse(fixture.requests.at(-1).body.messages[0].content).sources;
  }
  assert.deepEqual(await run(false), await run(true));
});

test('learning overlaps school research, all requests share eight slots and integration waits for both', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const gates = []; let released = false; let active = 0; let maximum = 0;
  const updates = [];
  const fixture = load(async body => {
    active++; maximum = Math.max(maximum, active);
    const task = body.tools ? JSON.parse(body.messages[0].content).task : null;
    if ((body.tools && task.id !== 'discovery' || isLearning(body)) && !released) {
      const gate = deferred(); gates.push(gate); await gate.promise;
    }
    active--;
    return new Response(JSON.stringify(body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] }));
  }, input);
  const pending = fixture.ai.generate(input, { onProgress: update => updates.push(update) });
  await tick(); await tick();
  assert.equal(maximum, 8);
  assert.equal(gates.length, 8);
  assert.equal(fixture.requests.filter(request => request.body.tools && JSON.parse(request.body.messages[0].content).task.id.startsWith('school-')).length, 5);
  assert.ok(updates.some(update => update.learning.status === 'generating' && update.tasks.some(task => task.id.startsWith('school-') && task.status === 'searching')));
  assert.ok(!fixture.requests.some(request => JSON.parse(request.body.messages[0].content).schools));
  released = true; gates.forEach(gate => gate.resolve());
  const draft = await pending;
  assert.equal(updates.at(-1).searches, 15);
  assert.equal(draft.tasks.length, 16);
  assert.equal(draft.generation.recommendations.length, 3);
  assert.equal(maximum, 8);
  const final = JSON.parse(fixture.requests.at(-1).body.messages[0].content);
  assert.equal(final.research, undefined);
  assert.equal(final.schools.length, 3);
  assert.equal(final.schoolFacts.length, 3);
  assert.equal(final.taskTitles.length, 16);
  assert.ok(fixture.requests.filter(request => request.body.tools).every(request => JSON.parse(request.body.messages[0].content).profile.baseline === undefined));
});

test('out of order school responses keep discovery order and validated exact evidence', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  const gates = new Map(); const updates = [];
  const fixture = load(async body => {
    if (body.tools && JSON.parse(body.messages[0].content).task.id.startsWith('school-')) {
      const id = JSON.parse(body.messages[0].content).task.id;
      const gate = deferred(); gates.set(id, gate); await gate.promise;
    }
    return new Response(JSON.stringify(body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] }));
  }, input);
  const pending = fixture.ai.generate(input, { onProgress: update => updates.push(update) });
  await tick(); await tick();
  for (const gate of [...gates.values()].reverse()) { gate.resolve(); await tick(); }
  const draft = await pending;
  assert.deepEqual(Array.from(draft.generation.recommendations, school => school.name), schoolSources.map(school => school.name));
  assert.ok(updates.every(update => update.summaries.every(summary => !summary.includes('"facts":') && !summary.includes('"location":'))));
});

test('action edits repair once for duplicate, out of range, invalid title and forbidden recommendation replacement', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  for (const invalid of [{ taskEdits: [{ index: 16, title: '学习' }] }, { taskEdits: [{ index: 0, title: '学习' }, { index: 0, title: '重复' }] }, { taskEdits: [{ index: 0, title: 'profile.targetExamYear' }] }, { recommendations: [] }]) {
    let attempt = 0;
    const fixture = load(body => {
      const value = body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] };
      if (!body.tools && !isLearning(body)) {
        const output = JSON.parse(value.content[0].text);
        Object.assign(output, attempt++ === 0 ? invalid : { taskEdits: [{ index: 15, title: '考前核对官方考试安排并复盘' }] });
        value.content[0].text = JSON.stringify(output);
      }
      return new Response(JSON.stringify(value));
    }, input);
    const draft = await fixture.ai.generate(input);
    assert.equal(attempt, 2);
    assert.equal(draft.tasks[15].title, '考前核对官方考试安排并复盘');
    assert.equal(draft.tasks[15].dueDate, draft.generation.period.endDate);
  }
});

test('school evidence failures cannot reach integration and supplemental searches stay under eighteen', async () => {
  const input = { ...profile, grade: '大一', goal: '济南本地二本院校' };
  for (const kind of ['source', 'city', 'tier', 'name', 'facts']) {
    let last;
    const fixture = load(body => {
      const response = body.tools ? result(body) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan(input), body)) }] };
      const id = JSON.parse(body.messages[0].content).task?.id;
      if (id?.startsWith('school-')) {
        const value = JSON.parse(response.content.at(-1).text);
        if (id.endsWith('-location')) value.criteriaEvidence = [{ criterion: '二本', explanation: '模拟2016年山东普通本科二批招生记录。', sourceUrl: schoolSources[Number(id.split('-')[1])].url }];
        if (id === 'school-0-program' && kind === 'source') value.facts[0].sourceUrl = 'https://unsearched.edu.cn/catalog';
        if (id === 'school-0-program' && kind === 'facts') value.facts = value.facts.slice(0, 1);
        if (id === 'school-0-program' && kind === 'name') value.name = '其他大学';
        if (id === 'school-0-location' && kind === 'city') value.location.city = '上海';
        if (id === 'school-0-location' && kind === 'tier') value.criteriaEvidence = [];
        response.content.at(-1).text = JSON.stringify(value);
      }
      return new Response(JSON.stringify(response));
    }, input);
    await assert.rejects(fixture.ai.generate(input, { onProgress: value => { last = value; } }), /院校|校区|专业|报考/);
    assert.ok(last.searches <= 18);
    assert.ok(!fixture.requests.some(request => JSON.parse(request.body.messages[0].content).schools));
    assert.ok(fixture.requests.every(request => request.signal.aborted));
  }
});

test('local batch cancellation and timeout abort learning and searches without late updates', async () => {
  const input = { ...profile, grade: '大一', goal: '' };
  for (const timeout of [false, true]) {
    const fixture = load((body, request) => new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('取消', 'AbortError')), { once: true })), input, timeout ? 15 : 2000);
    const controller = new AbortController(); const updates = [];
    const pending = fixture.ai.generate(input, { signal: controller.signal, onProgress: update => updates.push(update) });
    await tick(); if (!timeout) controller.abort();
    await assert.rejects(pending, timeout ? /超过/ : { name: 'AbortError' });
    assert.equal(fixture.requests.length, 4);
    assert.ok(fixture.requests.some(request => isLearning(request.body)));
    assert.ok(fixture.requests.every(request => request.signal.aborted));
    const count = updates.length; await tick(); assert.equal(updates.length, count);
  }
});

test('blank, major only, and diploma goals keep the minimum search and academic coverage requirements', async () => {
  for (const input of [{ ...profile, grade: '大一', goal: '' }, { ...profile, grade: '大一', goal: '计算机相关专业' }, { ...profile, level: '专科', grade: '大一', goal: '' }]) {
    const fixture = load(null, input); let last;
    const draft = await fixture.ai.generate(input, { onProgress: update => { last = update; } });
    assert.equal(last.searches, 15);
    assert.equal(draft.generation.period.targetExamYear, input.level === '专科' ? 2030 : 2029);
    assert.equal(new Set(Array.from(draft.tasks, task => task.stage)).size, 4);
    assert.equal(draft.tasks[0].dueDate, input.startDate);
    assert.equal(draft.tasks[15].dueDate, draft.generation.period.endDate);
  }
});

test('recommendation research and learning keep cross-major and public/private preferences', async () => {
  for (const goal of ['法学相关专业，只考虑公办院校', '法学相关专业，只考虑民办院校']) {
    const input = { ...profile, grade: '大一', goal };
    const fixture = load(null, input);
    await fixture.ai.generate(input);
    const research = fixture.requests.filter(request => request.body.tools);
    assert.equal(research.length, 9);
    for (const { body } of [...research, ...fixture.requests.filter(request => isLearning(request.body))]) {
      const sent = JSON.parse(body.messages[0].content).profile;
      assert.equal(sent.goal, goal);
      assert.equal(sent.major, input.major);
      assert.match(body.system, /目标专业优先/);
    }
    assert.match(JSON.parse(research.find(request => JSON.parse(request.body.messages[0].content).task.id === 'discovery').body.messages[0].content).task.instruction, /公办、民办/);
    assert.ok(research.every(request => request.body.system.includes('区分本科校区资料与硕士专业培养地点')));
  }
});
