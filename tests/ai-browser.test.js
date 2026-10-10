'use strict';
// Isolated mocked UI regression: node tests/ai-browser.test.js (Playwright; Edge on Windows, Chromium elsewhere).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { compactPlan, isLearning, schoolEvidence } = require('./ai-fixtures');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/ai-plan/test-temp');
const source = { title: '教育部研考通知 <img src=x onerror=alert(1)>', url: 'https://www.moe.gov.cn/notice' };
const unofficialSource = { title: '培训机构预测', url: 'https://training.example.com/news' };
const plan = { title: '我的升学计划 <img src=x onerror=alert(1)>', goal: '建立学习节奏，覆盖到考研初试前。', summary: '参考教育部研考日期；目标院校要求待核实，学习安排为 AI 建议。', examDate: '2026-12-19', examSourceUrl: source.url, sourceUrls: [source.url], tasks: Array.from({ length: 12 }, (_, index) => ({ title: '学习行动' + (index + 1), stage: ['核对信息', '盘点基础', '建立节奏', '自测调整'][Math.floor(index / 3)], dueDate: index === 11 ? '2026-12-18' : '2026-10-08' })) };
const search = { stop_reason: 'end_turn', content: [...Array.from({ length: 6 }, () => ({ type: 'server_tool_use', name: 'web_search' })), { type: 'web_search_tool_result', content: [source, unofficialSource].map(item => ({ type: 'web_search_result', ...item })) }, { type: 'text', text: '已找到官方资料，年度条件待核实。出处：' + source.url + '\n\n培训机构预测：' + unofficialSource.url }] };
const schoolSources = [
  { title: '<table><tr><td>甲校招生目录</td></tr></table>', url: 'https://yz.school-a.edu.cn/catalog' },
  { title: '乙校招生目录', url: 'https://yz.school-b.edu.cn/catalog' },
  { title: '丙校招生目录', url: 'https://yz.school-c.edu.cn/catalog' }
];
const freshmanSearch = { stop_reason: 'end_turn', content: [...Array.from({ length: 15 }, () => ({ type: 'server_tool_use', name: 'web_search' })), { type: 'web_search_tool_result', content: schoolSources.map(item => ({ type: 'web_search_result', ...item })) }, { type: 'text', text: '2029年初试日期未公布，提供候选院校与长期学习建议。出处：' + schoolSources[0].url }] };
const freshmanPlan = { ...plan, title: '大一至大四升学计划', dateStatus: 'estimated', examDate: '', examSourceUrl: '', sourceUrls: schoolSources.map(item => item.url),
  recommendations: schoolSources.map((item, index) => ({ name: ['甲校', '乙校', '丙校'][index], reason: '根据计算机专业、英语基础及山东地区偏好，建议比较招生方向与报考要求。', sourceUrl: item.url, location: { province: '山东', city: '济南', campus: '模拟计算机专业培养校区', sourceUrl: item.url }, criteriaEvidence: [] })),
  tasks: Array.from({ length: 12 }, (_, index) => ({ title: '分学年学习任务' + index, stage: '阶段' + Math.floor(index / 3), dueDate: new Date(Date.parse('2026-10-01') + (Date.parse('2029-12-14') - Date.parse('2026-10-01')) * index / 11).toISOString().slice(0, 10) })) };
const localPlan = { ...freshmanPlan, goal: '核对济南本地院校的计算机专业，按学年持续准备。', summary: '目标初试年份为2029年，正式日期尚未公布，学习安排暂定至2029年12月14日。院校及培养校区限定在济南，历史招生口径依据模拟官方资料核对。', recommendations: freshmanPlan.recommendations.map(school => ({ ...school, criteriaEvidence: [{ criterion: '一本', explanation: '模拟资料记录该校在山东历史本科一批招生，目标年度要求另行核对。', sourceUrl: school.sourceUrl }] })) };
const wrongLocalPlan = { ...localPlan, summary: 'profile.targetExamYear=2029，dateStatus=estimated。', recommendations: localPlan.recommendations.map(school => ({ ...school, location: { ...school.location, city: '上海' } })) };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('content-type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream');
  response.end(fs.readFileSync(file));
});
async function openForm(page, base) {
  await page.goto(base + '#/paths/education');
  await page.getByRole('button', { name: '使用这条路线', exact: true }).click();
  await page.locator('[data-form="ai-profile"]').waitFor();
}
async function fillForm(page) {
  await page.locator('[name="level"]').selectOption('本科');
  await page.locator('[name="grade"]').selectOption('大四');
  for (const [name, value] of Object.entries({ major: '计算机网络技术', baseline: '英语需要加强', goal: '山东大学，计算机相关专业', startDate: '2026-10-01' })) await page.locator('[name="' + name + '"]').fill(value);
}
async function waitForRelease(getRelease) {
  const deadline = Date.now() + 10000;
  while (!getRelease()) {
    if (Date.now() > deadline) throw new Error('Pending network interception did not arrive.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origins = [['file', pathToFileURL(path.join(root, 'index.html')).href], ['http', 'http://127.0.0.1:' + server.address().port + '/']];
  const browser = await chromium.launch(browserOptions({ ignoreDefaultArgs: ['--hide-scrollbars'] }));
  const report = [];
  try {
    for (const [name, base] of origins) {
      for (const width of [390, 1042, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: width === 1042 ? 871 : 960 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let mode = 'success';
        let requests = 0;
        const releases = [];
        const schoolRounds = new Map();
        const release = () => releases.splice(0).forEach(resolve => resolve());
        const efforts = [];
        await context.route('https://api.deepseek.com/anthropic/v1/messages', async route => {
          requests++;
          const body = route.request().postDataJSON();
          efforts.push(body.output_config.effort);
          if (body.tools) {
            assert.ok(body.tools[0].max_uses >= 1 && body.tools[0].max_uses <= 2);
            assert.deepEqual(body.tools[0].allowed_domains, ['gov.cn', 'edu.cn', 'chsi.com.cn', 'sdzk.cn']);
          } else {
            assert.ok(!body.messages[0].content.includes(unofficialSource.url));
          }
          if (mode === 'pending' || mode === 'timed' && body.tools || mode === 'live' && body.tools && JSON.parse(body.messages[0].content).task.id !== 'policy') await new Promise(resolve => { releases.push(resolve); });
          if (mode === 'local-live' && (isLearning(body) || body.tools && JSON.parse(body.messages[0].content).task.id !== 'discovery')) await new Promise(resolve => { releases.push(resolve); });
          try {
            const status = mode === 'error' ? 401 : 200;
            const candidate = mode === 'local-live' || mode === 'local-repair' ? localPlan : mode === 'code-repair' ? (body.messages.length > 1 ? localPlan : { ...localPlan, summary: wrongLocalPlan.summary }) : mode === 'local-shortage' ? (body.messages.length > 1 ? localPlan : { ...localPlan, recommendations: [], recommendationNotice: '济南本地院校的历史招生依据不足，暂不推荐外地学校作为替代。' }) : mode === 'freshman' ? freshmanPlan : plan;
            let result = mode === 'text-only' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: '自称已经检索，但没有真实工具结果。' }] } : mode === 'unofficial-only' ? { stop_reason: 'end_turn', content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', ...unofficialSource }] }] } : body.tools ? (mode === 'freshman' || mode.startsWith('local-') || mode === 'code-repair' ? freshmanSearch : search) : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(candidate, body)) }] };
            if (body.tools && !['text-only', 'unofficial-only'].includes(mode)) {
              const task = JSON.parse(body.messages[0].content).task;
              result = { ...result, content: [...Array.from({ length: body.tools[0].max_uses }, () => ({ type: 'server_tool_use', name: 'web_search' })), ...result.content.filter(block => block.type !== 'server_tool_use')] };
              if (mode === 'live' && task.id === 'policy') result.content.push({ type: 'web_search_tool_result', content: Array.from({ length: 5 }, (_, index) => ({ type: 'web_search_result', title: '官方资料' + index + ' <img src=x onerror=alert(1)>', url: 'https://www.moe.gov.cn/notice/' + index })) });
              if (task.id === 'discovery') result.content = [...result.content.filter(block => block.type !== 'text'), { type: 'text', text: JSON.stringify({ candidates: schoolSources.map((source, index) => ({ name: ['甲校', '乙校', '丙校'][index], province: '山东', city: '济南', sourceUrl: source.url })), summary: '候选院校还需逐校核对。出处：' + schoolSources[0].url }) }];
              if (task.id.startsWith('school-')) {
                const evidence = schoolEvidence(mode === 'freshman' ? freshmanPlan : localPlan, body);
                const round = schoolRounds.get(mode + task.id) || 0;
                schoolRounds.set(mode + task.id, round + 1);
                if (mode === 'local-repair' && task.id === 'school-0-location' && round === 0) evidence.location = { ...evidence.location, city: '上海' };
                result.content = [...result.content.filter(block => block.type !== 'text'), { type: 'text', text: JSON.stringify(evidence) }];
              }
            }
            await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(result) });
          } catch (_) { /* Request was aborted by closing or navigation. */ }
        });
        await openForm(page, base);
        for (const removed of ['weeks', 'hours', 'constraints']) assert.equal(await page.locator('[name="' + removed + '"]').count(), 0);
        assert.deepEqual(await page.locator('[name="level"] option').allTextContents(), ['请选择', '专科', '本科']);
        assert.equal(await page.locator('[name="goal"]').getAttribute('placeholder'), '请输入心仪院校和专业');
        assert.equal(await page.locator('[name="goal"]').getAttribute('required'), null);
        assert.equal(await page.getByRole('button', { name: '使用原始模板', exact: true }).isVisible(), true);
        assert.equal(await page.locator('[name="grade"]').isDisabled(), true);
        await page.locator('[name="level"]').selectOption('本科');
        assert.deepEqual(await page.locator('[name="grade"] option').allTextContents(), ['请选择年级', '大一', '大二', '大三', '大四']);
        await page.locator('[name="grade"]').selectOption('大四');
        await page.locator('[name="level"]').selectOption('专科');
        assert.deepEqual(await page.locator('[name="grade"] option').allTextContents(), ['请选择年级', '大一', '大二', '大三']);
        assert.equal(await page.locator('[name="grade"]').inputValue(), '');
        assert.equal(await page.locator('[name="region"]').inputValue(), '山东');
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        assert.equal(requests, 0);
        await fillForm(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#modal').evaluate(dialog => { dialog.scrollTop = 0; });
        await page.screenshot({ path: path.join(output, name + '-form-' + width + '.png') });
        // First finished worker is visible while five other workers are still searching.
        mode = 'live';
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await waitForRelease(() => releases.length === 5);
        await page.locator('.ai-live-source-list li').first().waitFor({ state: 'visible' });
        assert.equal(await page.locator('.ai-live-source-list li:visible').count(), 5);
        assert.equal(await page.locator('.ai-live-results img').count(), 0);
        assert.match(await page.locator('.ai-live-summaries').innerText(), /已找到官方资料/);
        assert.equal(await page.locator('.ai-task-searching').count(), 5);
        await page.locator('.ai-live-more summary').click();
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.ai-live-source-list li')).filter(node => !node.hidden).length === 6);
        assert.equal(await page.locator('.ai-live-source-list li:visible').count(), 6);
        assert.equal(await page.locator('#modal').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
        await page.screenshot({ path: path.join(output, name + '-live-results-' + width + '.png') });
        await page.keyboard.press('Escape'); release();
        mode = 'success';
        await openForm(page, base); await fillForm(page);
        await page.clock.install();
        mode = 'timed';
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await waitForRelease(() => releases.length === 6);
        assert.equal(await page.locator('[data-ai-step="search"]').evaluate(node => node.classList.contains('is-active')), true);
        assert.equal(await page.getByText('AI 思考并生成计划', { exact: true }).isVisible(), true);
        assert.equal(await page.locator('fieldset').isVisible(), false);
        assert.equal(await page.locator('[data-action="ai-template"]').isVisible(), false);
        await page.clock.fastForward(65000);
        assert.match(await page.locator('.ai-elapsed').innerText(), /已用时1分钟5秒/);
        await page.screenshot({ path: path.join(output, name + '-progress-' + width + '.png') });
        mode = 'success'; release();
        await page.locator('[data-form="ai-save"]').waitFor();
        assert.match(await page.locator('.ai-duration').innerText(), /用时1分钟5秒/);
        assert.match(await page.locator('.ai-period-summary').innerText(), /2026-12-18/);
        assert.equal(await page.locator('.ai-task-preview li').count(), 12);
        assert.equal(await page.locator('.ai-task-preview section').count(), 4);
        assert.equal(await page.locator('#modal img').count(), 0);
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(output, name + '-preview-' + width + '.png') });
        await page.getByRole('button', { name: '返回修改', exact: true }).click();
        assert.equal(await page.locator('[name="major"]').inputValue(), '计算机网络技术');
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.locator('[data-form="ai-save"]').waitFor();
        await page.getByRole('button', { name: '重新生成', exact: true }).click();
        await page.locator('[data-form="ai-save"]').waitFor();
        await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
        await page.locator('#plan-title').waitFor();
        assert.equal(await page.evaluate(() => Number.isInteger(window.StarPath.store.get().plans[0].generation.durationSeconds)), true);
        assert.equal(await page.locator('.task-check input').count(), 12);
        assert.equal(await page.locator('.ai-saved-evidence a').count(), 1);
        assert.equal(await page.locator('.ai-saved-evidence img').count(), 0);
        await page.locator('.task-check input').first().check();
        await page.getByRole('button', { name: /^编辑任务：/ }).first().click();
        await page.locator('[name="title"]').fill('调整后的学习任务');
        await page.locator('[name="dueDate"]').fill('2026-10-15');
        await page.getByRole('button', { name: '保存修改', exact: true }).click();
        await page.reload();
        assert.equal(await page.locator('.task-check input').first().isChecked(), true);
        assert.match(await page.locator('.task-text').first().innerText(), /调整后的学习任务/);
        const backup = await page.evaluate(() => window.StarPath.store.exportBackup());
        await page.getByRole('button', { name: '导入备份', exact: true }).click();
        await page.locator('#backup-file').setInputFiles({ name: 'ai-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
        await page.getByRole('button', { name: '取消', exact: true }).click();
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 1);
        await page.getByRole('button', { name: '导入备份', exact: true }).click();
        await page.locator('#backup-file').setInputFiles({ name: 'ai-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
        await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
        await page.locator('.ai-saved-evidence').waitFor();
        assert.equal(await page.locator('.task-check input').first().isChecked(), true);
        await page.screenshot({ path: path.join(output, name + '-saved-' + width + '.png'), fullPage: true });
        // Failure preserves form values and existing records.
        mode = 'error';
        await openForm(page, base);
        await fillForm(page);
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.locator('#modal-error').waitFor({ state: 'visible' });
        assert.match(await page.locator('#modal-error').innerText(), /密钥无效/);
        assert.equal(await page.locator('[name="major"]').inputValue(), '计算机网络技术');
        assert.equal(await page.locator('[name="major"]').isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: '使用原始模板', exact: true }).isVisible(), true);
        mode = 'text-only';
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.getByText('未取得有效联网检索结果（仅接受官方来源），请重试或使用原始模板。', { exact: true }).waitFor();
        mode = 'unofficial-only';
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.getByText('未取得有效联网检索结果（仅接受官方来源），请重试或使用原始模板。', { exact: true }).waitFor();
        assert.equal(await page.locator('[name="major"]').inputValue(), '计算机网络技术');
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 1);
        await page.getByRole('button', { name: '取消', exact: true }).click();
        assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'create-plan');
        // In-flight duplicate submit, Escape and late response.
        mode = 'pending';
        await openForm(page, base);
        await fillForm(page);
        const before = requests;
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.locator('.ai-status').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('[data-form="ai-profile"]').getAttribute('aria-busy') === 'true');
        await page.locator('[data-form="ai-profile"]').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(await page.getByRole('button', { name: '检索并生成计划', exact: true }).isDisabled(), true);
        await page.waitForFunction(() => true);
        // Wait for network interception rather than a fixed delay.
        await waitForRelease(() => releases.length === 6);
        assert.equal(requests, before + 6);
        await page.keyboard.press('Escape');
        release();
        await page.waitForFunction(() => !document.querySelector('#modal').open);
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 1);
        // Cancel on hash navigation; no late preview should re-open.
        await openForm(page, base);
        await fillForm(page);
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await waitForRelease(() => releases.length === 6);
        await page.evaluate(() => { location.hash = '/alumni'; });
        await page.locator('#alumni-query').waitFor();
        release();
        assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 1);
        mode = 'success';
        await openForm(page, base);
        await page.getByRole('button', { name: '使用原始模板', exact: true }).click();
        await page.getByRole('button', { name: '创建计划', exact: true }).click();
        await page.locator('#plan-title').waitFor();
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans[0].generation), undefined);
        // A blank goal generates school recommendations and a grade-based multi-year horizon.
        mode = 'local-live';
        await openForm(page, base); await fillForm(page);
        await page.locator('[name="grade"]').selectOption('大一');
        await page.locator('[name="goal"]').fill('');
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await waitForRelease(() => releases.length === 8);
        assert.equal(await page.locator('[data-ai-step="learning"]').isVisible(), true);
        assert.equal(await page.locator('[data-ai-step="learning"]').evaluate(node => node.classList.contains('is-active')), true);
        assert.equal(await page.locator('.ai-task-searching').count(), 7);
        assert.equal(await page.locator('[data-form="ai-save"]').count(), 0);
        assert.equal(await page.locator('#modal').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
        await page.screenshot({ path: path.join(output, name + '-parallel-learning-' + width + '.png') });
        await page.keyboard.press('Escape'); release();
        mode = 'freshman';
        await openForm(page, base);
        await fillForm(page);
        await page.locator('[name="grade"]').selectOption('大一');
        await page.locator('[name="goal"]').fill('');
        await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
        await page.locator('[data-form="ai-save"]').waitFor();
        assert.match(await page.locator('.ai-period-summary').innerText(), /2029.*暂定安排/);
        assert.equal(await page.locator('.ai-task-preview li').count(), 16);
        assert.equal(await page.locator('.ai-school-recommendations article').count(), 3);
        assert.equal(await page.locator('.ai-source-list a').first().innerText(), '甲校招生目录');
        assert.equal(await page.locator('#modal').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
        const scrollbar = await page.locator('#modal').evaluate(dialog => ({ width: getComputedStyle(dialog, '::-webkit-scrollbar').width, thumb: getComputedStyle(dialog, '::-webkit-scrollbar-thumb').backgroundColor, radius: getComputedStyle(dialog, '::-webkit-scrollbar-thumb').borderRadius, buttons: getComputedStyle(dialog, '::-webkit-scrollbar-button').display }));
        assert.equal(scrollbar.width, '9px');
        assert.ok(['rgb(150, 113, 61)', 'rgb(142, 36, 48)'].includes(scrollbar.thumb));
        assert.equal(scrollbar.radius, '10px');
        assert.equal(scrollbar.buttons, 'none');
        await page.locator('#modal').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
        await page.screenshot({ path: path.join(output, name + '-freshman-sources-' + width + '.png') });
        await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
        await page.locator('#plan-title').waitFor();
        await page.reload();
        assert.equal(await page.locator('.ai-school-recommendations article').count(), 3);
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans[0].generation.period.targetExamYear), 2029);
        assert.equal(await page.evaluate(() => window.StarPath.store.get().plans[0].generation.period.examDate), '');
        // City constraints and leaked internal fields trigger repair before preview.
        for (const scenario of ['local-repair', 'code-repair', 'local-shortage']) {
          mode = scenario;
          await openForm(page, base);
          await fillForm(page);
          await page.locator('[name="grade"]').selectOption('大一');
          await page.locator('[name="goal"]').fill('济南本地一本院校，计算机相关专业');
          const before = requests;
          await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
          await page.locator('[data-form="ai-save"]').waitFor();
          assert.equal(requests - before, 12);
          const evidence = await page.locator('.ai-school-recommendations').innerText();
          assert.match(evidence, /筛选要求：济南/);
          assert.ok(!evidence.includes('上海'));
          assert.ok(!/profile\.|dateStatus|targetExamYear/.test(await page.locator('.ai-research-summary').innerText()));
          assert.equal(await page.locator('.ai-school-recommendations article').count(), 3);
          assert.match(evidence, /专业培养地点：山东 · 济南/);
          assert.equal(await page.locator('#modal').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
          if (scenario === 'code-repair') {
            await page.locator('#modal').evaluate(dialog => { document.querySelector('.ai-school-recommendations').scrollIntoView(); });
            await page.screenshot({ path: path.join(output, name + '-local-recommendations-' + width + '.png') });
            await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
            await page.locator('#plan-title').waitFor();
            await page.reload();
            assert.match(await page.locator('.ai-school-recommendations').innerText(), /筛选要求：济南/);
            assert.equal(await page.locator('.ai-school-recommendations article').count(), 3);
            // Legacy saved summaries remain readable without rewriting stored facts.
            await page.evaluate(() => window.StarPath.store.editPlan(window.StarPath.store.get().plans[0].id, item => { item.generation.summary = 'profile.targetExamYear=2029，按profile.planningBasis规划，dateStatus=estimated，截止为profile.estimatedExamDate的前一天2029-12-14。'; }));
            await page.reload();
            const readable = await page.locator('.ai-research-summary').innerText();
            assert.match(readable, /目标初试年份为2029/);
            assert.ok(!/profile\.|dateStatus|targetExamYear|estimatedExamDate/.test(readable));
          } else await page.getByRole('button', { name: '取消', exact: true }).click();
        }
        assert.ok(efforts.includes('high') && efforts.includes('low'));
        assert.ok(efforts.every(effort => ['high', 'low'].includes(effort)));
        assert.deepEqual(errors, []);
        report.push(name + ' ' + width + 'px: form, preview, editing, regenerate, save, progress, refresh, import/cancel, escaping, failure/retry, duplicate submit, cancellation, template fallback, city constraints, readable text repair, 3-school repair and legacy rendering passed');
        await context.close();
      }
    }
    // AI session-only persistence.
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unavailable'); } }));
    const page = await context.newPage();
    await context.route('https://api.deepseek.com/anthropic/v1/messages', route => {
      const body = route.request().postDataJSON();
      const value = body.tools ? { ...search, content: [...Array.from({ length: body.tools[0].max_uses }, () => ({ type: 'server_tool_use', name: 'web_search' })), ...search.content.filter(block => block.type !== 'server_tool_use')] } : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(compactPlan(plan, body)) }] };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    });
    await openForm(page, origins[1][1]);
    await fillForm(page);
    await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
    await page.locator('[data-form="ai-save"]').waitFor();
    await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
    await page.locator('#plan-title').waitFor();
    assert.equal(await page.evaluate(() => window.StarPath.store.status()), 'session');
    assert.equal(await page.locator('.task-check input').count(), 12);
    await context.close();
    report.push('Unavailable localStorage: AI plan saved for the session and warning displayed');
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2));
    console.log(report.join('\n'));
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
