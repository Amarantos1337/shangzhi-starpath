'use strict';
const { comparison, summarizeUsage } = require('./ai-performance');
function compareSpeed(runs) {
  const result = comparison({ runs: runs.filter(run => run.version === 'baseline') }, { runs: runs.filter(run => run.version === 'optimized') });
  return result.map(item => {
    const before = runs.filter(run => run.profile === item.profile && run.version === 'baseline');
    const after = runs.filter(run => run.profile === item.profile && run.version === 'optimized');
    const complete = before.length === 2 && after.length === 2 && [...before, ...after].every(run => run.success);
    return { ...item, allSuccessful: complete,
      improved: complete && item.reliable && item.metrics.totalMs.reductionPercent > 0 && item.metrics.generationMs.reductionPercent > 0,
      baselineUsage: summarizeUsage(before.flatMap(run => run.requests)), optimizedUsage: summarizeUsage(after.flatMap(run => run.requests)) };
  });
}
function reportMarkdown(report) {
  const label = { named: '指定院校', local: '条件推荐', searchMs: '检索', generationMs: '计划生成（含修复）', totalMs: '完整生成', firstSourceMs: '首条来源' };
  const seconds = value => value === null ? '不可用' : (value / 1000).toFixed(2);
  const result = compareSpeed(report.runs);
  const rows = result.flatMap(item => ['searchMs', 'generationMs', 'totalMs', 'firstSourceMs'].map(metric => {
    const value = item.metrics[metric];
    return '| ' + [label[item.profile], label[metric], seconds(value.baselineMs), seconds(value.optimizedMs), seconds(value.savedMs),
      value.reductionPercent === null ? '样本不足' : value.reductionPercent.toFixed(1) + '%', value.speedup === null ? '不可用' : value.speedup.toFixed(2) + '×'].join(' | ') + ' |';
  }));
  const samples = report.runs.map(run => '| ' + [label[run.profile], run.version, run.sample, run.success ? '成功' : '失败：' + run.error,
    seconds(run.searchMs), seconds(run.generationMs), seconds(run.totalMs), run.requests.length, run.repairs, run.usage.outputTokens ?? '不可用'].join(' | ') + ' |');
  return '# AI 计划生成提速实测\n\n开始（UTC）：' + report.startedAt + '\n\n模型：' + report.config.model + '；检索思考强度：' + report.config.effort + '；总超时：' + report.config.timeoutMs / 1000 + '秒。\n\n' +
    '基线为本轮提速前、已做缓存优化的版本。优化版检索保持原配置，计划生成使用low思考强度，以来源编号和学习行动字符串输出，阶段及日期由程序组装。两场景各执行优化前后两次，版本交替，共最多八轮，不额外预热或补测。\n\n' +
    '| 场景 | 指标 | 优化前中位数（秒） | 优化后中位数（秒） | 节省秒数 | 耗时下降 | 加速倍数 |\n|---|---|---:|---:|---:|---:|---:|\n' + rows.join('\n') +
    '\n\n| 场景 | 版本 | 样本 | 结果 | 检索秒数 | 生成秒数 | 总秒数 | 请求数 | 修复次数 | 输出token |\n|---|---|---:|---|---:|---:|---:|---:|---:|---:|\n' + samples.join('\n') +
    '\n\n' + result.map(item => '- ' + label[item.profile] + '：基线成功' + item.baselineSuccesses + '/2，优化版成功' + item.optimizedSuccesses + '/2；' + (item.improved ? '本次小样本完整生成和计划生成均提速。' : '本次未满足完整生成及计划生成均提速且全部成功的条件。')).join('\n') +
    '\n\n耗时包含实际联网、模型思考、输出、程序组装和校验；生成阶段也包含允许的一次修复，不能称为纯推理耗时。只有成功样本进入中位数，不足两个成功样本不报告可靠加速比例。失败及已取得用量保留。小样本与实际服务波动不能保证每次都达到该幅度。未增加计划流式展示。\n';
}
module.exports = { compareSpeed, reportMarkdown };
