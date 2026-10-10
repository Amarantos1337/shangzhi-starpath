'use strict';
// Explicit paid comparison: six local and two named runs, no prewarm or automatic rerun.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { median, summarizeUsage } = require('./ai-performance');
const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'artifacts/ai-overlap-performance');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const profiles = [
  { id: 'local', samples: 3, input: { level: '本科', major: '计算机网络技术', grade: '大一', baseline: '英语基础较弱，数学刚开始复习。', goal: '济南本地一本院校，计算机相关专业', region: '山东', startDate: '2026-10-07' } },
  { id: 'named', samples: 1, input: { level: '本科', major: '计算机科学与技术', grade: '大四', baseline: '英语需要加强，数学刚开始复习', goal: '山东大学，计算机相关专业', region: '山东', startDate: '2026-10-01' } }
];
function load(source, config, fetcher = fetch) {
  const context = vm.createContext({ window: { StarPath: { aiConfig: config } }, fetch: fetcher, URL, AbortController, DOMException, setTimeout, clearTimeout, TextDecoder });
  vm.runInContext(source, context);
  return context.window.StarPath.ai;
}
function overlapMs(first, second) {
  const intervals = first.flatMap(a => second.map(b => [Math.max(a[0], b[0]), Math.min(a[1], b[1])])).filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  let total = 0; let end = -Infinity;
  for (const interval of intervals) { total += Math.max(0, interval[1] - Math.max(interval[0], end)); end = Math.max(end, interval[1]); }
  return total;
}
function compare(runs, selectedProfiles = profiles) {
  return selectedProfiles.map(profile => {
    const before = runs.filter(run => run.profile === profile.id && run.version === 'baseline');
    const after = runs.filter(run => run.profile === profile.id && run.version === 'optimized');
    const baselineSuccesses = before.filter(run => run.success);
    const optimizedSuccesses = after.filter(run => run.success);
    const reliable = baselineSuccesses.length >= 2 && optimizedSuccesses.length >= 2;
    const baselineMs = median(baselineSuccesses.map(run => run.totalMs));
    const optimizedMs = median(optimizedSuccesses.map(run => run.totalMs));
    const reductionPercent = reliable ? (baselineMs - optimizedMs) / baselineMs * 100 : null;
    const successRateNotLower = before.length === profile.samples && after.length === profile.samples && optimizedSuccesses.length / after.length >= baselineSuccesses.length / before.length;
    return { profile: profile.id, baselineSuccesses: baselineSuccesses.length, optimizedSuccesses: optimizedSuccesses.length, samples: profile.samples, reliable, baselineMs, optimizedMs, reductionPercent,
      meetsTarget: reliable && successRateNotLower && reductionPercent >= 25 };
  });
}
function markdown(report) {
  const seconds = value => value === null || value === undefined ? '—' : (value / 1000).toFixed(2);
  const rows = report.runs.map(run => '| ' + [run.profile, run.version, run.sample, run.success ? '成功' : '失败：' + run.error, seconds(run.searchMs), seconds(run.learningMs), seconds(run.overlapMs), seconds(run.integrationMs), seconds(run.totalMs), run.searches, run.maxConcurrent, run.repairs, run.usage.outputTokens ?? '—'].join(' | ') + ' |');
  const comparison = compare(report.runs, report.profiles).map(item => '- ' + item.profile + '：成功 ' + item.baselineSuccesses + '/' + item.samples + ' → ' + item.optimizedSuccesses + '/' + item.samples + '；成功样本总耗时中位数 ' + seconds(item.baselineMs) + ' → ' + seconds(item.optimizedMs) + ' 秒；' + (item.reliable ? '耗时下降 ' + item.reductionPercent.toFixed(1) + '%；' + (item.meetsTarget ? '达到本次25%目标。' : '未达到本次25%及成功率目标。') : '成功样本不足，不报告可靠提升比例。'));
  const protocol = report.reusedBaselineReport ? '本报告为修正版3次条件推荐，复用完整首轮的3次基线；本报告未再次调用基线或指定院校请求。' : '两版本冻结代码交替执行，未指定院校各3次、指定院校各1次，共最多8轮；不预热、不自动补测。';
  return '# AI 并行学习行动与结构化核验实测\n\n开始（UTC）：' + report.startedAt + '\n\n' + protocol + '相同模型、输入、检索high、生成low、15/18搜索预算及300秒超时。基线最多6请求并发，优化版最多8请求。\n\n' +
    (report.reusedBaselineReport ? '此修正版针对首轮地域核验失败调整了候选线索排序及校区字段提示；只追加修正版3轮，复用首轮3个基线样本。首轮优化样本保留在原报告，不与修正版混合。复用基线并非重新交替测试，存在服务时间波动的影响。\n\n' : '') +
    '| 场景 | 版本 | 样本 | 结果 | 检索秒 | 行动草稿秒 | 重叠秒 | 最终整合秒 | 总秒 | 搜索数 | 最大并发 | 修复数 | 输出token |\n|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n' + rows.join('\n') + '\n\n' + comparison.join('\n') +
    '\n\n检索按开始至检索完成的墙钟时间计；草稿及整合包含实际请求和思考。重叠为草稿请求与全部检索请求时间区间交集的并集，不重复累计并发搜索。总耗时直接测量，不能将检索、草稿和整合简单相加；失败不计入成功耗时中位数，但纳入成功率。缺少对应阶段时标为不可用。指定院校各一个样本只作兼容观察。用量、阶段、任务ID、状态和时间落盘，不保存密钥、请求头、响应文本或思考内容。小样本不能保证每次请求达到同样幅度。\n';
}
async function main({ revised = false } = {}) {
  const output = revised ? path.join(outputRoot, 'revised') : outputRoot;
  fs.mkdirSync(output, { recursive: true });
  const filename = path.join(output, 'results.json');
  if (fs.existsSync(filename)) throw new Error('本轮付费实测已开始，禁止自动补测或覆盖。');
  const baseline = fs.readFileSync(path.join(outputRoot, 'baseline-ai.js'), 'utf8');
  const optimized = fs.readFileSync(path.join(root, 'project/js/ai.js'), 'utf8');
  fs.writeFileSync(path.join(output, 'optimized-ai.js'), optimized);
  const context = vm.createContext({ window: { StarPath: {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'project/js/ai-config.js'), 'utf8'), context);
  const config = context.window.StarPath.aiConfig;
  const observer = load(optimized, config);
  const redact = value => String(value).replaceAll(config.apiKey, '[redacted]');
  const selectedProfiles = revised ? profiles.filter(profile => profile.id === 'local') : profiles;
  const report = { startedAt: new Date().toISOString(), config: { model: config.model, effort: config.reasoningEffort, timeoutMs: config.timeoutMs }, sourceSha256: { baseline: hash(baseline), optimized: hash(optimized) }, profiles: selectedProfiles, runs: [] };
  if (revised) {
    const original = JSON.parse(fs.readFileSync(path.join(outputRoot, 'results.json'), 'utf8'));
    if (!original.completedAt || original.sourceSha256.baseline !== hash(baseline) || JSON.stringify(original.config) !== JSON.stringify(report.config) || JSON.stringify(original.profiles.find(profile => profile.id === 'local')) !== JSON.stringify(selectedProfiles[0])) throw new Error('基线必须完整，且源码、输入和配置一致。');
    report.reusedBaselineReport = '../results.json';
    report.runs = original.runs.filter(run => run.version === 'baseline' && run.profile === 'local');
    fs.writeFileSync(path.join(output, 'baseline-ai.js'), baseline);
  }
  const save = () => { fs.writeFileSync(filename, redact(JSON.stringify(report, null, 2))); fs.writeFileSync(path.join(output, 'report.md'), redact(markdown(report))); };
  save();
  paidRuns: for (const profile of selectedProfiles) for (let sample = 1; sample <= profile.samples; sample++) for (const version of revised ? ['optimized'] : ['baseline', 'optimized']) {
    const started = performance.now();
    const run = { profile: profile.id, version, sample, success: false, requests: [], searches: 0, maxConcurrent: 0, repairs: 0, firstSourceMs: null };
    let active = 0; let searchEnded = null; let ai; let integrations = 0;
    const observers = [];
    const measuredFetch = async (url, request) => {
      const body = JSON.parse(request.body); const input = JSON.parse(body.messages[0].content);
      const phase = body.tools ? 'search' : body.system.startsWith('你是中文学习行动设计助手。') ? 'learning' : 'integration';
      const entry = { phase, taskId: input.task?.id || null, startMs: performance.now() - started, endMs: null, effort: body.output_config.effort, stream: body.stream, usage: null };
      if (phase === 'integration') run.repairs = integrations++;
      active++; run.maxConcurrent = Math.max(run.maxConcurrent, active); run.requests.push(entry);
      let released = false;
      const release = () => { if (!released) { released = true; active--; entry.endMs = performance.now() - started; } };
      try {
        const response = await fetch(url, request); entry.status = response.status;
        if (response.ok) {
          observers.push(observer.readResponse(response.clone(), undefined, request.signal).then(value => {
            entry.stopReason = value.stop_reason; entry.usage = observer.normalizeUsage(value.usage);
          }, error => { entry.observationError = redact(error.message); }).finally(release));
        } else release();
        return response;
      } catch (error) { entry.error = redact(error.message); release(); throw error; }
    };
    ai = load(version === 'baseline' ? baseline : optimized, config, measuredFetch);
    console.log(profile.id + ' ' + version + ' ' + sample + '/' + profile.samples + ' started');
    try {
      const draft = await ai.generate(profile.input, {
        onStage(stage) { if (stage === 'generate' && searchEnded === null) searchEnded = performance.now() - started; },
        onProgress(progress) { run.searches = progress.searches; if (progress.searchComplete && searchEnded === null) searchEnded = performance.now() - started; if (progress.sources.length && run.firstSourceMs === null) run.firstSourceMs = performance.now() - started; }
      });
      run.success = true;
      run.plan = { tasks: draft.tasks.length, sources: draft.generation.sources.length, recommendations: draft.generation.recommendations.length };
    } catch (error) { run.error = redact(error.message); }
    run.totalMs = performance.now() - started;
    await Promise.allSettled(observers);
    const intervals = phase => run.requests.filter(entry => entry.phase === phase && entry.endMs !== null).map(entry => [entry.startMs, entry.endMs]);
    const searches = intervals('search'); const learning = intervals('learning'); const integration = intervals('integration');
    run.searchMs = searchEnded ?? run.totalMs;
    run.learningMs = learning.length ? Math.max(...learning.map(interval => interval[1])) - Math.min(...learning.map(interval => interval[0])) : null;
    run.overlapMs = learning.length ? overlapMs(searches, learning) : null;
    run.integrationMs = integration.length ? run.totalMs - Math.min(...integration.map(interval => interval[0])) : null;
    run.usage = summarizeUsage(run.requests);
    report.runs.push(run); save();
    console.log(JSON.stringify({ profile: run.profile, version, sample, success: run.success, error: run.error, totalMs: run.totalMs, searches: run.searches, requests: run.requests.length }));
    if (run.requests.some(entry => [401, 402, 403].includes(entry.status)) || run.requests.every(entry => entry.error)) { report.stoppedEarly = '认证、余额、访问或网络失败，停止付费实测。'; break paidRuns; }
  }
  report.completedAt = new Date().toISOString(); report.comparison = compare(report.runs, selectedProfiles); save();
}
if (require.main === module) main({ revised: process.argv.includes('--revised') }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { overlapMs, compare, markdown };
