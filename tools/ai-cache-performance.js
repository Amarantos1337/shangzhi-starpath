'use strict';
// Explicit paid check, limited to eight full runs; never prewarm or auto-retry.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { summarizeUsage } = require('./ai-performance');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const profiles = [
  { id: 'named', input: { level: '本科', major: '计算机科学与技术', grade: '大四', baseline: '英语需要加强，数学刚开始复习', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' } },
  { id: 'local', input: { level: '本科', major: '计算机网络技术', grade: '大一', baseline: '英语基础较弱，数学刚开始复习。', goal: '济南本地一本院校，计算机相关专业', region: '山东', startDate: '2026-10-07' } }
];
function load(source, config, fetcher) {
  const context = vm.createContext({ window: { StarPath: { aiConfig: config } }, fetch: fetcher, URL, AbortController,
    DOMException, setTimeout, clearTimeout, TextDecoder });
  vm.runInContext(source, context);
  return context.window.StarPath.ai;
}
function compareRuns(runs) {
  return profiles.map(profile => {
    const before = runs.filter(run => run.profile === profile.id && run.version === 'baseline');
    const after = runs.filter(run => run.profile === profile.id && run.version === 'optimized');
    const baseline = summarizeUsage(before.flatMap(run => run.requests));
    const optimized = summarizeUsage(after.flatMap(run => run.requests));
    const allSuccessful = before.length === 2 && after.length === 2 && [...before, ...after].every(run => run.success);
    const measured = baseline.missingUsageRequests === 0 && optimized.missingUsageRequests === 0 && baseline.cacheHitRate !== null && optimized.cacheHitRate !== null;
    const outputsMeasured = baseline.measuredOutputRequests === baseline.requests && optimized.measuredOutputRequests === optimized.requests;
    const improved = allSuccessful && measured && outputsMeasured && optimized.cacheHitRate > baseline.cacheHitRate &&
      optimized.cacheMissTokens < baseline.cacheMissTokens && optimized.requests <= baseline.requests && optimized.outputTokens <= baseline.outputTokens;
    return { profile: profile.id, baseline, optimized, allSuccessful, improved,
      hitRateChangePercentagePoints: measured ? (optimized.cacheHitRate - baseline.cacheHitRate) * 100 : null };
  });
}
function reportMarkdown(report) {
  if (report.kind === 'speed') return require('./ai-speed-performance').reportMarkdown(report);
  const pct = value => value === null ? '不可用' : (value * 100).toFixed(2) + '%';
  const rows = report.runs.map(run => '| ' + [run.profile, run.version, run.sample === 1 ? '首次' : '重复', run.success ? '成功' : '失败：' + run.error,
    run.requests.length, pct(run.usage.cacheHitRate), run.usage.cacheMissTokens ?? '不可用', run.usage.outputTokens ?? '不可用', (run.totalMs / 1000).toFixed(2)].join(' | ') + ' |');
  const comparisons = compareRuns(report.runs).map(item => '- ' + item.profile + '：输入加权命中率 ' + pct(item.baseline.cacheHitRate) + ' → ' + pct(item.optimized.cacheHitRate) +
    '；未命中输入 ' + item.baseline.cacheMissTokens + ' → ' + item.optimized.cacheMissTokens + '；' +
    (item.improved ? '本次小样本满足改善条件。' : '未满足完整改善条件（须全部成功、统计完整、命中率提升且未命中输入下降、请求及输出不增加）。'));
  return '# AI 输入缓存实测\n\n开始（UTC）：' + report.startedAt + '\n\n模型：' + report.config.model + '；思考强度：' + report.config.effort + '。优化前后交替执行，两个场景各两次，最多八轮；无额外预热或补测。\n\n' +
    '| 场景 | 版本 | 次序 | 结果 | 请求数 | 输入命中率 | 未命中输入 | 输出 | 总秒数 |\n|---|---|---|---|---:|---:|---:|---:|---:|\n' + rows.join('\n') + '\n\n' + comparisons.join('\n') +
    '\n\n首次指此实测中的首次，不能证明服务端缓存为空。命中率为命中输入 ÷（命中输入 + 未命中输入），不是请求命中数或含输出的比例。缺失用量不记零；部分统计不能代表整轮。失败及其已取得用量保留。只有两次重复样本，结论属于观察，不能保证后续提升幅度。\n';
}
async function main({ kind = 'cache' } = {}) {
  if (!['cache', 'speed'].includes(kind)) throw new Error('未知实测类型。');
  const output = path.join(root, 'artifacts/ai-' + kind + '-performance');
  fs.mkdirSync(output, { recursive: true });
  const filename = path.join(output, 'results.json');
  if (fs.existsSync(filename)) throw new Error('此轮实测已执行；保留报告，不自动补测或覆盖。');
  const baselineSource = fs.readFileSync(path.join(output, 'baseline-ai.js'), 'utf8');
  const optimizedSource = fs.readFileSync(path.join(root, 'project/js/ai.js'), 'utf8');
  fs.writeFileSync(path.join(output, 'optimized-ai.js'), optimizedSource);
  const setup = vm.createContext({ window: { StarPath: {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'project/js/ai-config.js'), 'utf8'), setup);
  const config = setup.window.StarPath.aiConfig;
  const observer = load(optimizedSource, config);
  const report = { kind, startedAt: new Date().toISOString(), config: { model: config.model, effort: config.reasoningEffort, timeoutMs: config.timeoutMs },
    sourceSha256: { baseline: hash(baselineSource), optimized: hash(optimizedSource) }, profiles, runs: [] };
  const redact = value => String(value).replaceAll(config.apiKey, '[redacted]');
  const save = () => {
    fs.writeFileSync(filename, redact(JSON.stringify(report, null, 2)));
    fs.writeFileSync(path.join(output, 'report.md'), redact(reportMarkdown(report)));
  };
  save();
  paidRuns: for (const profile of profiles) for (let sample = 1; sample <= 2; sample++) for (const version of ['baseline', 'optimized']) {
    const started = performance.now();
    const run = { profile: profile.id, version, sample, success: false, startedAt: new Date().toISOString(), requests: [], searches: 0, repairs: 0 };
    const observers = [];
    let generationAt = null;
    let firstSourceAt = null;
    let generationRequests = 0;
    const measuredFetch = async (url, request) => {
      const body = JSON.parse(request.body);
      const requestedAt = performance.now();
      const search = Boolean(body.tools);
      const entry = { stage: search ? 'search' : 'generate', taskId: search ? JSON.parse(body.messages[0].content).task.id : null,
        systemSha256: hash(body.system), effort: body.output_config.effort, stream: body.stream, usage: null, rawUsage: null };
      run.requests.push(entry);
      if (!search) { generationRequests++; run.repairs = generationRequests - 1; }
      try {
        const response = await fetch(url, request);
        entry.status = response.status;
        if (response.ok) {
          // Both versions receive identical observation overhead. No content is saved.
          observers.push(observer.readResponse(response.clone(), undefined, request.signal).then(value => {
            entry.rawUsage = value.usage || null;
            entry.usage = observer.normalizeUsage(value.usage);
            entry.stopReason = value.stop_reason;
            if (!search) {
              try {
                const data = JSON.parse(value.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
                entry.responseFormat = Array.isArray(data.taskTitles) ? 'compact' : Array.isArray(data.tasks) ? 'full' : 'invalid';
              } catch (_) { entry.responseFormat = 'invalid'; }
            }
          }, error => { entry.observationError = redact(error.message); }).finally(() => { entry.totalMs = performance.now() - requestedAt; }));
        } else entry.totalMs = performance.now() - requestedAt;
        return response;
      } catch (error) {
        entry.error = redact(error.message); entry.totalMs = performance.now() - requestedAt;
        throw error;
      }
    };
    const ai = load(version === 'baseline' ? baselineSource : optimizedSource, config, measuredFetch);
    console.log(profile.id + ' ' + version + ' ' + sample + '/2 started');
    try {
      const draft = await ai.generate(profile.input, {
        onStage(value) { if (value === 'generate' && generationAt === null) generationAt = performance.now(); },
        onProgress(value) { run.searches = value.searches; if (firstSourceAt === null && value.sources.length) firstSourceAt = performance.now(); }
      });
      run.success = true;
      run.plan = { tasks: draft.tasks.length, sources: draft.generation.sources.length, recommendations: draft.generation.recommendations.length };
    } catch (error) { run.error = redact(error.message); }
    run.totalMs = performance.now() - started;
    await Promise.allSettled(observers);
    run.searchMs = generationAt === null ? run.totalMs : generationAt - started;
    run.generationMs = generationAt === null ? null : run.totalMs - run.searchMs;
    run.firstSourceMs = firstSourceAt === null ? null : firstSourceAt - started;
    run.usage = summarizeUsage(run.requests);
    run.stageUsage = Object.fromEntries(['search', 'generate'].map(stage => [stage, summarizeUsage(run.requests.filter(request => request.stage === stage))]));
    report.runs.push(run);
    save();
    console.log(JSON.stringify({ profile: run.profile, version, sample, success: run.success, error: run.error, totalMs: run.totalMs, usage: run.usage }));
    // No other profile can fix credentials, billing, or a network outage.
    if (run.requests.some(request => [401, 402, 403].includes(request.status)) || run.requests.every(request => request.error)) {
      report.stoppedEarly = '认证、余额、访问或网络失败，停止付费测试。';
      break paidRuns;
    }
  }
  report.completedAt = new Date().toISOString();
  report.comparison = kind === 'speed' ? require('./ai-speed-performance').compareSpeed(report.runs) : compareRuns(report.runs);
  save();
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, compareRuns, reportMarkdown };
