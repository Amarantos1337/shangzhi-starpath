'use strict';
// Explicit paid benchmark: node tools/ai-performance.js baseline|optimized|compare
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/ai-performance');
const profiles = [
  { id: 'named', input: { level: '本科', major: '计算机科学与技术', grade: '大四', baseline: '英语需要加强，数学刚开始复习', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' } },
  { id: 'local', input: { level: '本科', major: '计算机网络技术', grade: '大一', baseline: '英语基础较弱，数学刚开始复习。', goal: '济南本地一本院校，计算机相关专业', region: '山东', startDate: '2026-10-07' } }
];
const metrics = ['searchMs', 'generationMs', 'totalMs', 'firstSourceMs'];
const median = values => { const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
function summarizeUsage(requests) {
  const complete = requests.filter(request => request.usage?.cacheHitTokens !== null && request.usage?.cacheHitTokens !== undefined && request.usage?.cacheMissTokens !== null && request.usage?.cacheMissTokens !== undefined);
  const sum = key => complete.reduce((total, request) => total + request.usage[key], 0);
  const cacheHitTokens = complete.length ? sum('cacheHitTokens') : null;
  const cacheMissTokens = complete.length ? sum('cacheMissTokens') : null;
  const measuredInputTokens = complete.length ? cacheHitTokens + cacheMissTokens : null;
  const output = requests.filter(request => request.usage?.outputTokens !== null && request.usage?.outputTokens !== undefined);
  return { requests: requests.length, measuredRequests: complete.length, missingUsageRequests: requests.length - complete.length,
    cacheHitTokens, cacheMissTokens, measuredInputTokens, cacheHitRate: measuredInputTokens > 0 ? cacheHitTokens / measuredInputTokens : null,
    outputTokens: output.length ? output.reduce((total, request) => total + request.usage.outputTokens, 0) : null,
    measuredOutputRequests: output.length };
}
function comparison(before, after) {
  return profiles.map(profile => {
    const oldRuns = before.runs.filter(run => run.profile === profile.id && run.success);
    const newRuns = after.runs.filter(run => run.profile === profile.id && run.success);
    const reliable = oldRuns.length >= 2 && newRuns.length >= 2;
    return { profile: profile.id, baselineSuccesses: oldRuns.length, optimizedSuccesses: newRuns.length, reliable,
      metrics: Object.fromEntries(metrics.map(metric => {
        const a = oldRuns.map(run => run[metric]).filter(Number.isFinite);
        const b = newRuns.map(run => run[metric]).filter(Number.isFinite);
        const valid = reliable && a.length >= 2 && b.length >= 2;
        const baselineMs = a.length ? median(a) : null;
        const optimizedMs = b.length ? median(b) : null;
        return [metric, { baselineMs, optimizedMs, savedMs: valid ? baselineMs - optimizedMs : null,
          reductionPercent: valid ? (baselineMs - optimizedMs) / baselineMs * 100 : null, speedup: valid && optimizedMs > 0 ? baselineMs / optimizedMs : null }];
      })) };
  });
}
async function main() {
  const phase = process.argv[2];
  if (phase === 'cache') return require('./ai-cache-performance').main();
  if (phase === 'speed') return require('./ai-cache-performance').main({ kind: 'speed' });
  if (phase === 'compare') {
    const before = JSON.parse(fs.readFileSync(path.join(output, 'baseline.json'), 'utf8'));
    const after = JSON.parse(fs.readFileSync(path.join(output, 'optimized.json'), 'utf8'));
    if (JSON.stringify(before.profiles) !== JSON.stringify(after.profiles) || JSON.stringify(before.config) !== JSON.stringify(after.config)) throw new Error('测速输入或配置不一致。');
    const result = comparison(before, after);
    fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(result, null, 2));
    const labels = { named: '大四 · 山东大学', local: '大一 · 济南院校推荐', searchMs: '搜索阶段', generationMs: '思考生成（含修复）', totalMs: '完整生成', firstSourceMs: '首条官方来源' };
    const rows = result.flatMap(item => metrics.map(metric => { const value = item.metrics[metric]; const seconds = ms => ms === null ? '—' : (ms / 1000).toFixed(2); return '| ' + labels[item.profile] + ' | ' + labels[metric] + ' | ' + seconds(value.baselineMs) + ' | ' + seconds(value.optimizedMs) + ' | ' + seconds(value.savedMs) + ' | ' + (value.reductionPercent === null ? '样本不足' : value.reductionPercent.toFixed(1) + '%') + ' | ' + (value.speedup === null ? '—' : value.speedup.toFixed(2) + '×') + ' |'; }));
    const outcomes = result.map(item => '- ' + item.profile + '：优化前成功 ' + item.baselineSuccesses + '/' + before.runs.filter(run => run.profile === item.profile).length + '，优化后成功 ' + item.optimizedSuccesses + '/' + after.runs.filter(run => run.profile === item.profile).length + '。').join('\n');
    const samples = [before, after].flatMap(report => report.runs.map(run => '| ' + report.phase + ' | ' + run.profile + ' | ' + run.index + ' | ' + (run.success ? '成功' : '失败：' + run.error) + ' | ' + (run.searchMs / 1000).toFixed(2) + ' | ' + (run.generationMs === null ? '—' : (run.generationMs / 1000).toFixed(2)) + ' | ' + (run.totalMs / 1000).toFixed(2) + ' | ' + (run.firstSourceMs === null ? '—' : (run.firstSourceMs / 1000).toFixed(2)) + ' |'));
    const provenance = '模型：' + before.config.model + '；思考强度：' + before.config.effort + '；总超时：' + before.config.timeoutMs / 1000 + '秒。\n\n基线开始（UTC）：' + before.startedAt + '；最终版开始（UTC）：' + after.startedAt + '。\n\n代码摘要：基线 `' + before.sourceSha256 + '`；最终版 `' + after.sourceSha256 + '`。\n\n';
    fs.writeFileSync(path.join(output, 'report.md'), '# AI 真实测速对比\n\n' + provenance + '| 场景 | 指标 | 优化前中位数（秒） | 优化后中位数（秒） | 节省秒数 | 耗时下降 | 加速倍数 |\n|---|---|---:|---:|---:|---:|---:|\n' + rows.join('\n') + '\n\n' + outcomes + '\n\n搜索阶段包含搜索请求内部的思考；生成阶段包含校验修复。首条来源时间包含流式展示的改善。仅成功样本参与中位数；失败与超时详见原始 JSON。基线应用按工具调用块计数，优化版按实际返回结果计数并排除被上限拒绝的调用。输入、模型、高思考强度和300秒超时一致；真实服务的波动及有限样本不能保证每次均达到此提升幅度。\n\n## 全部样本\n\n| 版本 | 场景 | 样本 | 结果 | 搜索秒 | 生成秒 | 总秒 | 首条来源秒 |\n|---|---|---:|---|---:|---:|---:|---:|\n' + samples.join('\n') + '\n');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!['baseline', 'optimized'].includes(phase)) throw new Error('用法：node tools/ai-performance.js baseline|optimized|compare');
  const config = require('./deepseek-config')();
  fs.mkdirSync(output, { recursive: true });
  const filename = path.join(output, phase + '.json');
  const append = process.argv.includes('--append');
  if (fs.existsSync(filename) && !append) throw new Error('结果文件已存在，请先保留历史结果再重新测速。');
  const source = fs.readFileSync(phase === 'baseline' && append ? path.join(output, 'baseline-ai.js') : path.join(root, 'project/js/ai.js'), 'utf8');
  if (phase === 'baseline') fs.writeFileSync(path.join(output, 'baseline-ai.js'), source);
  let report = { phase, startedAt: new Date().toISOString(), sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    config: { model: config.model, effort: config.reasoningEffort, timeoutMs: config.timeoutMs }, profiles, runs: [] };
  if (append) {
    const existing = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (existing.sourceSha256 !== report.sourceSha256 || JSON.stringify(existing.config) !== JSON.stringify(report.config)) throw new Error('追加测速必须使用相同版本与配置。');
    report = existing;
  }
  const save = () => fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  save();
  const selected = process.argv.includes('--named') ? profiles.slice(0, 1) : process.argv.includes('--local') ? profiles.slice(1) : profiles;
  for (const profile of selected) for (let sample = 1; sample <= 3; sample++) {
    const index = report.runs.filter(run => run.profile === profile.id).length + 1;
    const started = performance.now();
    const run = { profile: profile.id, index, startedAt: new Date().toISOString(), success: false, searchMs: null, generationMs: null, totalMs: null, firstSourceMs: null, searches: 0, requests: 0, maxConcurrency: 0, repairs: 0 };
    let stage = 'search';
    let generationAt = null;
    let active = 0;
    let generationRequests = 0;
    let api;
    const trace = [];
    const saveTrace = () => fs.writeFileSync(path.join(output, phase + '-' + profile.id + '-' + index + '-trace.json'), JSON.stringify(trace, null, 2).replaceAll(config.apiKey, '[redacted]'));
    const measuredFetch = async (url, request) => {
      const body = JSON.parse(request.body);
      run.requests++;
      if (!body.tools) { generationRequests++; run.repairs = Math.max(0, generationRequests - 1); }
      active++;
      run.maxConcurrency = Math.max(run.maxConcurrency, active);
      let released = false;
      const release = () => { if (!released) { released = true; active--; } };
      try {
        const response = await fetch(url, request);
        if (!response.ok) release();
        const json = response.json.bind(response);
        response.json = async () => {
          try {
            const result = await json();
            trace.push({ stage: body.tools ? 'search' : 'generate', stopReason: result.stop_reason, sources: api.extractSources(result.content),
              text: (result.content || []).filter(block => block.type === 'text').map(block => ({ text: block.text, citations: block.citations })),
              queries: (result.content || []).filter(block => block.type === 'server_tool_use').map(block => block.input) });
            saveTrace();
            if (body.tools) {
              run.searches += (result.content || []).filter(block => block.type === 'server_tool_use' && block.name === 'web_search').length;
              if (run.firstSourceMs === null && api.extractSources(result.content).length) run.firstSourceMs = performance.now() - started;
            }
            return result;
          } finally { release(); }
        };
        if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const entry = { stage: 'search', stopReason: null, blocks: [] };
          const inputs = new Map();
          const readEvents = () => {
            let match;
            while ((match = /\r?\n\r?\n/.exec(buffer))) {
              const frame = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
              const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (!data) continue;
              let event; try { event = JSON.parse(data); } catch (_) { continue; }
              if (event.type === 'content_block_start' && ['text', 'server_tool_use', 'web_search_tool_result'].includes(event.content_block.type)) {
                entry.blocks[event.index] = { ...event.content_block };
                if (Array.isArray(event.content_block.content)) entry.blocks[event.index].content = event.content_block.content.map(item => ({ type: item.type, title: item.title, url: item.url, error_code: item.error_code }));
              }
              const block = entry.blocks[event.index];
              if (event.type === 'content_block_delta' && block) {
                if (event.delta.type === 'text_delta') block.text = (block.text || '') + event.delta.text;
                if (event.delta.type === 'input_json_delta') inputs.set(event.index, (inputs.get(event.index) || '') + event.delta.partial_json);
                if (event.delta.type === 'citations_delta') block.citations = [...(block.citations || []), event.delta.citation];
              }
              if (event.type === 'content_block_stop' && inputs.has(event.index)) { try { block.input = JSON.parse(inputs.get(event.index)); } catch (_) {} }
              if (event.type === 'message_delta') entry.stopReason = event.delta.stop_reason;
            }
          };
          trace.push(entry);
          const stream = new ReadableStream({ async pull(controller) {
            try {
              const item = await reader.read(); buffer += decoder.decode(item.value || new Uint8Array(), { stream: !item.done }); readEvents();
              if (item.done) { release(); saveTrace(); controller.close(); } else controller.enqueue(item.value);
            } catch (error) { release(); saveTrace(); controller.error(error); }
          }, async cancel(reason) { release(); saveTrace(); await reader.cancel(reason); } });
          return new Response(stream, { status: response.status, headers: response.headers });
        }
        return response;
      } catch (error) { release(); throw error; }
    };
    const context = vm.createContext({ window: { StarPath: { aiConfig: config } }, fetch: measuredFetch, URL, AbortController, DOMException, setTimeout, clearTimeout, TextDecoder, performance });
    vm.runInContext(source, context);
    api = context.window.StarPath.ai;
    console.log(phase + ' ' + profile.id + ' ' + index + '/3 started');
    try {
      const draft = await api.generate(profile.input, { apiKey: config.apiKey, onStage(value) {
        stage = value;
        if (value === 'generate' && generationAt === null) { generationAt = performance.now(); run.searchMs = generationAt - started; }
      }, onProgress(value) {
        run.searches = value.searches;
        if (run.firstSourceMs === null && value.sources.length) run.firstSourceMs = performance.now() - started;
        run.progress = { tasks: value.tasks, sources: value.sources, summaries: value.summaries };
      } });
      run.success = true;
      run.tasks = draft.tasks.length;
      run.sources = draft.generation.sources.length;
      run.recommendations = (draft.generation.recommendations || []).length;
    } catch (error) { run.error = String(error.message || error).replaceAll(config.apiKey, '[redacted]'); run.failedStage = stage; }
    run.totalMs = performance.now() - started;
    if (generationAt !== null) run.generationMs = performance.now() - generationAt;
    else run.searchMs = run.totalMs;
    report.runs.push(run);
    save();
    const { progress, ...summary } = run;
    console.log(JSON.stringify(summary));
  }
  report.completedAt = new Date().toISOString();
  save();
}
module.exports = { comparison, median, summarizeUsage };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
