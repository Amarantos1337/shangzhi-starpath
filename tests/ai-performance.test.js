'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { comparison, median } = require('../tools/ai-performance');
test('benchmark compares successful medians, records regressions and excludes failed runs', () => {
  const run = (value, success = true) => ({ profile: 'named', success, searchMs: value, generationMs: value, totalMs: value, firstSourceMs: value });
  assert.equal(median([100, 10, 20]), 20);
  assert.equal(median([10, 20]), 15);
  const result = comparison({ runs: [run(100), run(200), run(300), run(10000, false)] }, { runs: [run(50), run(100), run(150)] });
  assert.equal(result[0].metrics.searchMs.baselineMs, 200);
  assert.equal(result[0].metrics.searchMs.reductionPercent, 50);
  assert.equal(result[0].metrics.searchMs.speedup, 2);
  assert.equal(result[1].reliable, false);
  const slower = comparison({ runs: [run(100), run(100)] }, { runs: [run(200), run(200)] });
  assert.equal(slower[0].metrics.totalMs.reductionPercent, -100);
});
test('benchmark refuses an improvement conclusion from one successful sample or missing source times', () => {
  const run = value => ({ profile: 'named', success: true, searchMs: value, totalMs: value, firstSourceMs: null });
  const result = comparison({ runs: [run(100), run(110)] }, { runs: [run(50)] });
  assert.equal(result[0].reliable, false);
  assert.equal(result[0].metrics.totalMs.speedup, null);
  assert.equal(result[0].metrics.firstSourceMs.baselineMs, null);
});

test('cache statistics weight by input tokens and keep missing or zero usage unavailable', () => {
  const { summarizeUsage } = require('../tools/ai-performance');
  const measured = (hit, miss) => ({ usage: { cacheHitTokens: hit, cacheMissTokens: miss, outputTokens: 10 } });
  const value = summarizeUsage([measured(90, 10), measured(0, 900), { usage: null }]);
  assert.equal(value.cacheHitRate, 0.09);
  assert.equal(value.cacheMissTokens, 910);
  assert.equal(value.missingUsageRequests, 1);
  assert.equal(value.outputTokens, 20);
  assert.equal(summarizeUsage([]).cacheHitRate, null);
  assert.equal(summarizeUsage([measured(0, 0)]).cacheHitRate, null);
  assert.equal(summarizeUsage([{ usage: null }]).cacheMissTokens, null);
});

test('cache benchmark refuses improvement when outputs or requests grow or a run fails', () => {
  const { compareRuns } = require('../tools/ai-cache-performance');
  const run = (version, sample, hit, miss, output = 10) => ({ profile: 'named', version, sample, success: true,
    requests: [{ usage: { cacheHitTokens: hit, cacheMissTokens: miss, outputTokens: output } }] });
  const before = [run('baseline', 1, 20, 80), run('baseline', 2, 20, 80)];
  const after = [run('optimized', 1, 80, 20), run('optimized', 2, 80, 20)];
  assert.equal(compareRuns([...before, ...after])[0].improved, true);
  after[0].requests[0].usage.outputTokens = 11;
  assert.equal(compareRuns([...before, ...after])[0].improved, false);
  after[0].requests[0].usage.outputTokens = 10;
  after[0].success = false;
  assert.equal(compareRuns([...before, ...after])[0].improved, false);
  after[0].success = true;
  after[0].requests.push({ usage: { cacheHitTokens: 80, cacheMissTokens: 0, outputTokens: 0 } });
  assert.equal(compareRuns([...before, ...after])[0].improved, false);
});

test('speed comparison uses successful medians and refuses a conclusion from missing or failed samples', () => {
  const { compareSpeed } = require('../tools/ai-speed-performance');
  const run = (version, sample, duration, success = true) => ({ profile: 'named', version, sample, success, searchMs: 10, generationMs: duration - 10, totalMs: duration, firstSourceMs: 1, requests: [] });
  const before = [run('baseline', 1, 100), run('baseline', 2, 120)];
  const after = [run('optimized', 1, 50), run('optimized', 2, 60)];
  const result = compareSpeed([...before, ...after])[0];
  assert.equal(result.metrics.totalMs.baselineMs, 110);
  assert.equal(result.metrics.totalMs.optimizedMs, 55);
  assert.equal(result.metrics.totalMs.reductionPercent, 50);
  assert.equal(result.improved, true);
  assert.equal(compareSpeed([...before, after[0]])[0].improved, false);
  after[1].success = false;
  assert.equal(compareSpeed([...before, ...after])[0].improved, false);
});

test('overlap benchmark counts interval unions and includes failures in the acceptance decision', () => {
  const { overlapMs, compare } = require('../tools/ai-overlap-performance');
  assert.equal(overlapMs([[0, 10], [5, 20]], [[3, 7], [6, 12]]), 9);
  assert.equal(overlapMs([[0, 10]], [[10, 20]]), 0);
  const run = (version, sample, totalMs, success = true) => ({ profile: 'local', version, sample, totalMs, success });
  const before = [1, 2, 3].map(sample => run('baseline', sample, 100));
  const after = [1, 2, 3].map(sample => run('optimized', sample, 70));
  assert.equal(compare([...before, ...after])[0].meetsTarget, true);
  after[0].success = false;
  assert.equal(compare([...before, ...after])[0].meetsTarget, false);
  assert.equal(compare([before[0], after[1]])[0].reductionPercent, null);
});
