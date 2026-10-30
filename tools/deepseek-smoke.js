'use strict';
// Explicit, paid integration check: node tools/deepseek-smoke.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: { StarPath: {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../project/js/ai-config.js'), 'utf8'), context);
let config;
try { config = require('./deepseek-config')(); } catch (error) { console.error(error.message); process.exit(1); }
const freshman = process.argv.includes('--freshman');
const localSchools = process.argv.includes('--local');
(async () => {
  if (process.argv.includes('--browser')) {
    const { chromium, browserOptions } = require('./browser-runtime');
    const { pathToFileURL } = require('node:url');
    const browser = await chromium.launch(browserOptions({ ignoreDefaultArgs: ['--hide-scrollbars'] }));
    const output = path.join(__dirname, '../artifacts/ai-plan', freshman ? 'freshman' : '.');
    fs.mkdirSync(output, { recursive: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const efforts = [];
      const errors = [];
      page.on('request', request => {
        if (request.url() === config.endpoint && request.method() === 'POST') {
          const body = request.postDataJSON();
          efforts.push({ stage: body.tools ? 'search' : 'generate', effort: body.output_config.effort });
        }
      });
      page.on('pageerror', error => errors.push(error.name));
      await page.goto(pathToFileURL(path.join(__dirname, '../project/index.html')).href + '#/paths/education');
      await page.getByRole('button', { name: '使用这条路线', exact: true }).click();
      await page.locator('#ai-api-key').fill(config.apiKey);
      await page.locator('[name="level"]').selectOption('本科');
      await page.locator('[name="grade"]').selectOption(freshman ? '大一' : '大四');
      for (const [name, value] of Object.entries({ major: '计算机科学与技术', baseline: '英语需要加强，数学刚开始复习', goal: freshman ? '' : '山东大学，计算机相关专业', startDate: '2026-10-01' })) await page.locator('[name="' + name + '"]').fill(value);
      await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
      console.log('Browser: real high-effort research and low-effort planning started');
      await page.locator('[data-ai-step="search"].is-active').waitFor();
      await page.screenshot({ path: path.join(output, 'live-browser-search-1440.png') });
      await page.waitForFunction(() => document.querySelector('[data-ai-step="generate"].is-active') || !document.querySelector('#modal-error').hidden, null, { timeout: config.timeoutMs + 10000 });
      if (await page.locator('[data-ai-step="generate"].is-active').count()) await page.screenshot({ path: path.join(output, 'live-browser-thinking-1440.png') });
      await page.waitForFunction(() => document.querySelector('[data-form="ai-save"]') || !document.querySelector('#modal-error').hidden, null, { timeout: config.timeoutMs + 10000 });
      if (await page.locator('[data-form="ai-save"]').count() === 0) {
        console.error(await page.locator('#modal-error').innerText());
        process.exitCode = 1;
        return;
      }
      await page.screenshot({ path: path.join(output, 'live-browser-preview-1440.png') });
      await page.locator('#modal').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
      await page.screenshot({ path: path.join(output, 'live-browser-sources-1440.png') });
      await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
      await page.locator('#plan-title').waitFor();
      await page.screenshot({ path: path.join(output, 'live-browser-saved-1440.png'), fullPage: true });
      const backup = await page.evaluate(() => window.StarPath.store.exportBackup());
      if (backup.includes(config.apiKey)) throw new Error('Credential isolation failed.');
      fs.writeFileSync(path.join(output, 'live-browser-backup.json'), backup);
      const saved = JSON.parse(backup).plans[0];
      if (freshman && (saved.generation.period.targetExamYear !== 2029 || saved.generation.recommendations.length < 2)) throw new Error('Freshman horizon or recommendations failed validation.');
      const report = { origin: 'file', effort: efforts, tasks: saved.tasks.length, stages: new Set(saved.tasks.map(task => task.stage)).size, sources: saved.generation.sources.length, recommendations: saved.generation.recommendations, durationSeconds: saved.generation.durationSeconds, period: saved.generation.period, pageErrors: errors };
      fs.writeFileSync(path.join(output, 'live-browser-results.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      if (errors.length || efforts.some(request => request.effort !== (request.stage === 'search' ? 'high' : 'low'))) process.exitCode = 1;
    } finally { await browser.close(); }
    return;
  }
  if (process.argv.includes('--plan')) {
    const trace = [];
    Object.assign(context, { fetch: async (url, request) => {
      const response = await fetch(url, request);
      if (process.argv.includes('--diagnose')) {
        const value = await response.clone().json();
        const requestBody = JSON.parse(request.body);
        let planFields = {};
        if (!requestBody.tools) {
          try {
            const raw = value.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            const result = JSON.parse(raw);
            planFields = { examDate: result.examDate, examSourceUrl: result.examSourceUrl, sourceUrls: result.sourceUrls, recommendations: result.recommendations, recommendationNotice: result.recommendationNotice };
          } catch (_) { planFields = { parseError: true }; }
        }
        trace.push({ stage: requestBody.tools ? 'search' : 'generate', stopReason: value.stop_reason, searches: value.content.filter(block => block.type === 'server_tool_use' && block.name === 'web_search').length, sources: context.window.StarPath.ai.extractSources(value.content), research: requestBody.tools ? value.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : undefined, ...planFields });
        const output = path.join(__dirname, '../artifacts/ai-plan');
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, localSchools ? 'live-local-trace.json' : 'live-date-trace.json'), JSON.stringify(trace, null, 2));
      }
      return response;
    }, URL, AbortController, DOMException, setTimeout, clearTimeout });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../project/js/ai.js'), 'utf8'), context);
    const draft = await context.window.StarPath.ai.generate({ level: '本科', major: localSchools ? '计算机网络技术' : '计算机科学与技术', grade: localSchools || freshman ? '大一' : '大四', baseline: '英语基础较弱，数学刚开始复习。', goal: localSchools ? '济南本地一本院校，计算机相关专业' : freshman ? '' : '山东大学，计算机相关专业', region: '山东', startDate: localSchools ? '2026-10-07' : '2026-10-01' }, { apiKey: config.apiKey, onStage: stage => console.log('Stage: ' + stage) });
    const output = path.join(__dirname, '../artifacts/ai-plan');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, localSchools ? 'live-local-plan.json' : 'live-plan.json'), JSON.stringify(draft, null, 2));
    console.log(JSON.stringify({ model: draft.generation.model, effort: config.reasoningEffort, tasks: draft.tasks.length, stages: new Set(draft.tasks.map(task => task.stage)).size, sources: draft.generation.sources }, null, 2));
    return;
  }
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({ model: config.model, max_tokens: 6000, stream: false,
      thinking: { type: 'enabled' }, output_config: { effort: config.reasoningEffort },
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: '请必须联网搜索山东省教育招生考试院专升本最新通知。只简短列出官方资料标题和网址，不要推测考试条件。' }] })
  });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, model: result.model, stopReason: result.stop_reason,
    blocks: (result.content || []).map(block => ({ type: block.type, name: block.name,
      resultTypes: Array.isArray(block.content) ? block.content.map(item => item.type) : undefined })),
    errorType: result.error && result.error.type }, null, 2));
  if (!response.ok) process.exitCode = 1;
})().catch(error => { console.error(String(error.message || 'Integration check failed.').replaceAll(config.apiKey, '[redacted]')); process.exitCode = 1; });
