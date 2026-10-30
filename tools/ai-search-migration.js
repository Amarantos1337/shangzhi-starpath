'use strict';
// Explicit paid benchmark. DEEPSEEK_API_KEY is read only from the process environment.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const stamp = date => ({ utc: date.toISOString(), local: new Date(date.getTime() + 8 * 3600000).toISOString().replace('Z', '+08:00'), timeZone: 'Asia/Taipei' });
const profiles = [
  { id: 'named', level: '本科', grade: '大四', major: '计算机科学与技术', goal: '山东大学，计算机相关专业', baseline: '英语需要加强，数学刚开始复习', startDate: '2026-10-01', region: '山东' },
  { id: 'freshman', level: '本科', grade: '大一', major: '计算机科学与技术', goal: '', baseline: '英语需要加强，数学刚开始复习', startDate: '2026-10-01', region: '山东' },
  { id: 'local', level: '本科', grade: '大一', major: '计算机网络技术', goal: '济南本地一本院校，计算机相关专业', baseline: '英语基础较弱，数学刚开始复习。', startDate: '2026-10-07', region: '山东' }
];
function union(intervals) {
  let end = 0; let total = 0;
  for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  return total;
}
function compare(dir) {
  const reports = ['baseline', 'direct'].map(phase => JSON.parse(fs.readFileSync(path.join(dir, phase + '.json'), 'utf8')));
  if (JSON.stringify(reports[0].config) !== JSON.stringify(reports[1].config) || JSON.stringify(reports[0].profiles) !== JSON.stringify(reports[1].profiles)) throw new Error('两轮输入或模型配置不一致，不能比较。');
  const seconds = value => Number.isFinite(value) ? (value / 1000).toFixed(2) : '—';
  const rows = reports.flatMap(report => report.runs.map(run => '| ' + [report.phase, run.profile, run.sample, run.success ? '成功' : '失败', run.started.local, run.ended?.local || '—', seconds(run.totalMs), seconds(run.searchMs), seconds(run.learningMs), seconds(run.generationMs), seconds(run.firstSourceMs), run.searches, run.fetches, (run.error || '').replace(/\|/g, '／')].join(' | ') + ' |'));
  const median = values => { const a = values.sort((a, b) => a - b); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null; };
  const comparisons = profiles.map(profile => {
    const groups = reports.map(report => report.runs.filter(run => run.profile === profile.id));
    const successful = groups.map(group => group.filter(run => run.success));
    return { profile: profile.id, attempts: groups.map(group => group.length), successes: successful.map(group => group.length), metrics: Object.fromEntries(['totalMs', 'searchMs', 'learningMs', 'generationMs', 'firstSourceMs'].map(metric => {
      const samples = successful.map(group => group.map(run => run[metric]).filter(Number.isFinite));
      const medians = samples.map(median);
      return [metric, { baseline: medians[0], direct: medians[1], reductionPercent: samples.every(group => group.length >= 2) && medians[0] > 0 ? (medians[0] - medians[1]) / medians[0] * 100 : null }];
    })) };
  });
  fs.writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(comparisons, null, 2));
  const complete = reports.every(report => report.runs.length === 6 && report.runs.every(run => run.ended));
  const adequate = comparisons.every(item => item.successes.every(count => count === 2));
  const faster = adequate && comparisons.every(item => item.metrics.totalMs.direct <= item.metrics.totalMs.baseline) && comparisons.some(item => item.metrics.totalMs.direct < item.metrics.totalMs.baseline);
  const decision = { complete, adequate, faster, timingPass: complete && faster, note: '只有完整样本、每场景成功率不降低且耗时中位数均不退步，至少一个场景变快，才通过性能门槛；推送还需全部回归及浏览器验证通过、人工检查证据质量。' };
  fs.writeFileSync(path.join(dir, 'decision.json'), JSON.stringify(decision, null, 2));
  const details = reports.flatMap(report => report.runs.map(run => {
    const intervals = stage => run.requests.filter(entry => entry.stage === stage).map(entry => [entry.startMs, entry.endMs ?? run.totalMs]);
    const known = new Set();
    const key = url => { try { const value = new URL(url); value.hash = ''; return value.href; } catch (_) { return ''; } };
    for (const entry of run.requests) {
      for (const result of entry.response?.results || []) known.add(key(result.url));
      if (Array.isArray(entry.response?.content)) for (const block of entry.response.content) if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) for (const result of block.content) known.add(key(result.url));
    }
    const sources = (run.plan?.generation.sources || []).map(source => ({ url: source.url, provenance: known.has(key(source.url)) ? '本轮接口返回' : /官方历史招生记录（核验2026-10-07）/.test(source.title) ? '已有官方历史资料库' : '需核对' }));
    return { phase: report.phase, profile: run.profile, sample: run.sample, success: run.success, totalMs: run.totalMs, searchMs: run.searchMs, learningMs: run.learningMs, generationMs: run.generationMs, firstSourceMs: run.firstSourceMs,
      searchRequestIntervalUnionMs: union(intervals('search')), learningRequestIntervalUnionMs: union(intervals('learning')), generationRequestIntervalUnionMs: union(intervals('generation')),
      repairMs: run.repairMs ?? union(intervals('generation').slice(1)), retryWaitMs: run.retryWaitMs ?? 0,
      requests: run.requests.length, searchRequests: run.requests.filter(entry => entry.kind === 'search').length, fetchRequests: run.requests.filter(entry => entry.kind === 'fetch').length,
      usage: require('./ai-performance').summarizeUsage(run.requests.filter(entry => entry.kind === 'model')),
      validation: run.success ? { tasks: run.plan.tasks.length, stages: new Set(run.plan.tasks.map(task => task.stage)).size, targetExamYear: run.plan.generation.period.targetExamYear, sources, recommendations: (run.plan.generation.recommendations || []).map(school => ({ name: school.name, location: school.location, criteriaEvidence: school.criteriaEvidence })) } : { error: run.error, failedStage: run.failedStage } };
  }));
  fs.writeFileSync(path.join(dir, 'details.json'), JSON.stringify(details, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), '# AI 搜索迁移真实测试\n\n时间为 Asia/Taipei（UTC+08:00）；耗时由单调时钟测量，表内单位为秒。失败计入尝试，未补跑。并发请求按区间并集计时，不累加重叠耗时。完整输入、代码摘要、逐请求时间与脱敏响应见两组 JSON 和每次结果文件。\n\n' + reports.map(report => '- ' + report.phase + '：成功 ' + report.runs.filter(run => run.success).length + '/' + report.runs.length + '；代码 SHA256：`' + report.sourceSha256 + '`。').join('\n') + '\n\n| 版本 | 场景 | 次数 | 结果 | 开始时间 | 结束时间 | 总耗时 | 检索 | 学习行动 | 最终生成与校验 | 首条来源 | 搜索次数 | 抓取次数 | 错误 |\n|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n' + rows.join('\n') + '\n\n## 对比\n\n' + comparisons.map(item => '- ' + item.profile + '：成功数 ' + item.successes.join(' → ') + '；完整流程成功样本中位数 ' + seconds(item.metrics.totalMs.baseline) + ' → ' + seconds(item.metrics.totalMs.direct) + ' 秒；' + (item.metrics.totalMs.reductionPercent === null ? '样本不足，不计算改善比例。' : '耗时变化 ' + item.metrics.totalMs.reductionPercent.toFixed(1) + '%（正值为降低）。')).join('\n') + '\n\n每场景仅两次样本，服务波动、顺序及缓存会影响结果。来源匹配和结构校验不等于人工事实核验，不能仅凭耗时认定新方案更准确。模型用量缺失时保留空值；未取得完整用量与适用价格时不估算费用。\n');
  fs.appendFileSync(path.join(dir, 'report.md'), '\n## 请求与用量\n\n| 版本 | 场景 | 次数 | HTTP请求总数 | 搜索接口请求 | 抓取接口请求 | 模型输入token | 模型输出token | 修复耗时（秒） | 重试等待（秒） |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n' + details.map(run => '| ' + [run.phase, run.profile, run.sample, run.requests, run.searchRequests, run.fetchRequests, run.usage.measuredInputTokens ?? '—', run.usage.outputTokens ?? '—', seconds(run.repairMs), seconds(run.retryWaitMs)].join(' | ') + ' |').join('\n') + '\n\n旧方案的搜索由模型服务端工具执行，因此直接搜索接口请求数为零；实际搜索次数见上表。不同阶段可并发，请勿累加阶段或请求耗时推算完整耗时。details.json 保存来源可追溯性和逐校结构校验信息；未人工逐条核查全部招生事实。\n\n## 提交与推送门槛\n\n性能门槛：' + (decision.timingPass ? '通过，仍需回归、浏览器与证据质量检查通过后才可推送。' : '未通过，不提交或推送到 GitHub。') + '\n');
  return { comparisons, decision };
}
async function main() {
  const [phase, requestedDir] = process.argv.slice(2);
  const dir = requestedDir ? path.resolve(requestedDir) : path.join(root, 'artifacts/ai-search-migration', new Date().toISOString().replace(/[:.]/g, '-'));
  if (!dir.startsWith(path.join(root, 'artifacts') + path.sep)) throw new Error('结果目录必须在 artifacts 内。');
  if (phase === 'compare') return console.log(JSON.stringify(compare(dir)));
  if (!['baseline', 'direct'].includes(phase)) throw new Error('用法：node tools/ai-search-migration.js baseline|direct|compare [结果目录]');
  const config = require('./deepseek-config')();
  fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, phase + '.json');
  if (fs.existsSync(filename)) throw new Error('结果已存在，禁止覆盖。');
  const source = fs.readFileSync(path.join(root, 'project/js/ai.js'), 'utf8');
  fs.writeFileSync(path.join(dir, phase + '-ai.js'), source);
  const report = { phase, started: stamp(new Date()), sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), config: { model: config.model, reasoningEffort: config.reasoningEffort, timeoutMs: config.timeoutMs }, profiles, runs: [] };
  const redact = value => String(value).replaceAll(config.apiKey, '[redacted]').replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]');
  const save = () => fs.writeFileSync(filename, redact(JSON.stringify(report, null, 2)));
  save(); console.log('RESULT_DIR=' + dir);
  for (let sample = 1; sample <= 2; sample++) for (const profile of profiles) {
    const started = performance.now(); const pending = []; let api; let generationAt = null; let searchCompletedAt = null; let fatal = false;
    const run = { profile: profile.id, sample, started: stamp(new Date()), success: false, firstSourceMs: null, searches: 0, fetches: 0, requests: [], events: [] };
    report.runs.push(run); save();
    const elapsed = () => performance.now() - started;
    const measuredFetch = async (url, request) => {
      const body = JSON.parse(request.body); const kind = url.endsWith('/tools/search') ? 'search' : url.endsWith('/tools/fetch') ? 'fetch' : 'model';
      const learning = typeof body.system === 'string' && body.system.startsWith('你是中文学习行动设计助手。');
      const stage = kind !== 'model' ? 'search' : body.tools || /中文升学资料研究助手/.test(body.system || '') ? 'search' : learning ? 'learning' : 'generation';
      const entry = { kind, stage, url, started: stamp(new Date()), startMs: elapsed(), request: body, usage: null };
      run.requests.push(entry); if (kind === 'fetch') run.fetches++;
      try {
        const response = await fetch(url, request); entry.status = response.status;
        if ([401, 402].includes(response.status)) fatal = true;
        const observation = (async () => {
          try {
            const value = kind === 'model' ? await api.readResponse(response.clone(), undefined, request.signal) : await response.clone().json();
            entry.response = value;
            if (kind === 'model') entry.usage = api.normalizeUsage(value.usage);
          } catch (error) { entry.observationError = redact(error.message); }
          finally { entry.endMs = elapsed(); entry.ended = stamp(new Date()); entry.durationMs = entry.endMs - entry.startMs; save(); }
        })();
        pending.push(observation); return response;
      } catch (error) { entry.endMs = elapsed(); entry.ended = stamp(new Date()); entry.durationMs = entry.endMs - entry.startMs; entry.error = redact(error.message); throw error; }
    };
    const context = vm.createContext({ window: { StarPath: { aiConfig: config } }, fetch: measuredFetch, URL, AbortController, DOMException, setTimeout, clearTimeout, TextDecoder, performance });
    vm.runInContext(source, context); api = context.window.StarPath.ai;
    console.log(phase + ' ' + profile.id + ' ' + sample + '/2 started');
    try {
      const { id, ...input } = profile;
      run.plan = await api.generate(input, { apiKey: config.apiKey, onStage(stage) { run.stage = stage; run.events.push({ type: 'stage', stage, atMs: elapsed() }); if (stage === 'generate') generationAt = elapsed(); }, onProgress(value) { run.searches = value.searches; run.progress = value; if (value.searchComplete && searchCompletedAt === null) searchCompletedAt = elapsed(); if (run.firstSourceMs === null && value.sources.length) { run.firstSourceMs = elapsed(); run.firstSourceAt = stamp(new Date()); } }, onTiming(value) { run.events.push({ type: 'timing', atMs: elapsed(), ...value }); } });
      run.success = true;
      fs.writeFileSync(path.join(dir, phase + '-' + profile.id + '-' + sample + '-plan.json'), redact(JSON.stringify(run.plan, null, 2)));
    } catch (error) { run.error = redact(error.message); run.failedStage = run.stage; }
    run.totalMs = elapsed(); run.ended = stamp(new Date());
    await Promise.allSettled(pending);
    run.searchMs = searchCompletedAt ?? generationAt ?? run.totalMs; run.generationMs = generationAt === null ? null : run.totalMs - generationAt;
    run.learningMs = run.requests.some(entry => entry.stage === 'learning') ? union(run.requests.filter(entry => entry.stage === 'learning').map(entry => [entry.startMs, entry.endMs ?? run.totalMs])) : null;
    run.repairs = Math.max(0, run.requests.filter(entry => entry.stage === 'generation').length - 1);
    run.repairMs = union(run.requests.filter(entry => entry.stage === 'generation').slice(1).map(entry => [entry.startMs, entry.endMs ?? run.totalMs]));
    run.retryWaitMs = run.events.filter(event => event.type === 'retry-wait').reduce((total, event) => total + event.durationMs, 0);
    run.searchRequestCount = run.requests.filter(entry => entry.kind === 'search').length;
    run.usage = require('./ai-performance').summarizeUsage(run.requests.filter(entry => entry.kind === 'model'));
    save(); console.log(JSON.stringify({ phase, profile: profile.id, sample, success: run.success, totalMs: run.totalMs, error: run.error }));
    if (fatal || (report.runs.length >= 2 && report.runs.slice(-2).every(value => /无法连接/.test(value.error || '')))) { report.blocked = '鉴权、余额或持续网络错误，停止后续尝试。'; report.ended = stamp(new Date()); save(); return; }
  }
  report.ended = stamp(new Date()); save();
}
module.exports = { stamp, union, compare, profiles };
if (require.main === module) main().catch(error => { console.error(String(error.message).replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')); process.exitCode = 1; });
