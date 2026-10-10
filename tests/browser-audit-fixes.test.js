'use strict';
// Focused audit regression: node tests/browser-audit-fixes.test.js (Playwright/Edge).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/browser-audit-fixes-2026-10-10');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const file = target === root ? path.join(root, 'index.html') : target;
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserOptions());
  const report = [];
  const errors = [];
  const origins = [['http', 'http://127.0.0.1:' + server.address().port + '/'], ['file', pathToFileURL(path.join(root, 'index.html')).href]];
  try {
    for (const [name, origin] of origins) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      context.on('page', page => {
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      });
      // No real AI request is permitted by this runner.
      await context.route('https://api.deepseek.com/**', route => route.abort());
      const a = await context.newPage();
      const b = await context.newPage();
      // Keep A's document/state stale until its next operation; this also
      // reproduces the audit's original create-in-B / favorite-in-A failure.
      await a.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()));
      await a.goto(origin + '#/growth');
      await a.evaluate(() => window.StarPath.store.replace({ version: 1, favorites: [], plans: [] }));
      await b.goto(origin + '#/growth');
      const created = await b.evaluate(() => window.StarPath.store.createPlan('competition', { title: 'B 新计划（已保留）' }));
      await a.locator('.main-nav [data-nav="alumni"]').click();
      await a.locator('[data-action="favorite"][data-person="chen-liang"]').click();
      await b.reload();
      assert.equal(await b.locator('.plan-tab').count(), 1);
      assert.equal(await b.locator('#plan-title').innerText(), 'B 新计划（已保留）');
      assert.deepEqual(await b.evaluate(() => window.StarPath.store.get().favorites), ['chen-liang']);

      // Deliberately delay storage-event delivery to A; writes must still read
      // the latest persisted record, not the tab's old in-memory snapshot.
      await a.goto(origin + '#/growth/' + created.id);
      const initial = await b.evaluate(() => window.StarPath.store.get().plans[0].tasks.map(task => task.id));
      await b.evaluate(({ id }) => window.StarPath.store.editPlan(id, plan => { plan.tasks[0].completed = true; }), created);
      await a.evaluate(({ id }) => window.StarPath.store.editPlan(id, plan => { plan.tasks[1].dueDate = '2026-10-20'; }), created);
      await b.waitForFunction(() => window.StarPath.store.get().plans[0].tasks[1].dueDate === '2026-10-20');
      assert.equal(await b.locator('.task-check input').first().isChecked(), true);
      assert.equal(await b.evaluate(() => window.StarPath.store.get().plans[0].tasks[1].dueDate), '2026-10-20');
      await b.getByRole('button', { name: '编辑计划目标', exact: true }).click();
      await b.getByRole('textbox', { name: '我的目标', exact: true }).fill('未提交输入保留');
      await a.evaluate(() => window.StarPath.store.toggleFavorite('wang-zongyu'));
      await b.waitForFunction(() => document.querySelector('.stats-grid').textContent.includes('2位'));
      assert.equal(await b.locator('#modal').evaluate(element => element.open), true);
      assert.equal(await b.getByRole('textbox', { name: '我的目标', exact: true }).inputValue(), '未提交输入保留');
      assert.equal(await b.evaluate(() => document.activeElement.name), 'goal');
      await b.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await b.evaluate(() => document.activeElement.dataset.action), 'edit-plan');

      await b.locator('[data-action="edit-task"][data-task="' + initial[0] + '"]').click();
      await b.getByRole('textbox', { name: '任务内容', exact: true }).fill('被删除任务的未提交输入');
      await a.evaluate(({ id }) => window.StarPath.store.editPlan(id, plan => { plan.tasks.shift(); }), created);
      await b.locator('#modal-error').waitFor({ state: 'visible' });
      assert.match(await b.locator('#modal-error').innerText(), /已在其他页面删除/);
      await b.getByRole('button', { name: '保存修改', exact: true }).click();
      assert.match(await b.locator('#modal-error').innerText(), /已不存在/);
      assert.equal(await b.getByRole('textbox', { name: '任务内容', exact: true }).inputValue(), '被删除任务的未提交输入');
      await b.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await b.evaluate(() => document.activeElement.dataset.action), 'add-task');
      await b.screenshot({ path: path.join(output, 'edge-multitab-' + name + '.png'), fullPage: false });
      report.push(name + ': new plan/favorites retained; delayed storage events preserve distinct task edits; live UI synchronization retains modal input/focus; external task deletion rejects stale save without resurrection');

      for (const width of [320, 390, 1440]) {
        await b.setViewportSize({ width, height: 900 });
        for (const hash of ['#/', '#/history', '#/alumni/wang-zongyu', '#/paths', '#/practice/campus-guide', '#/growth', '#/about']) {
          await b.goto(origin + hash);
          const metrics = await b.evaluate(() => {
            const visible = element => !!element.getClientRects().length;
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              nav: [...document.querySelectorAll('.main-nav a')].filter(visible).map(element => ({ text: element.textContent.trim(), font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height })),
              current: [...document.querySelectorAll('[data-nav][aria-current], [data-nav-action][aria-current]')].filter(visible).map(element => element.dataset.nav || element.dataset.navAction),
              sources: [...document.querySelectorAll('.history-entry .inline-source,.reading-links .inline-source,.timeline .inline-source,.source-list a')].filter(visible).map(element => parseFloat(getComputedStyle(element).fontSize)),
              hiddenGuide: document.querySelector('.growth-learning')?.hidden,
              hiddenMethods: Boolean(document.querySelector('.growth-learning #methods')?.closest('[hidden]'))
            };
          });
          assert.equal(metrics.overflow, false, name + ' ' + width + ' ' + hash);
          if (width < 640) {
            assert.equal(metrics.nav.length, 5);
            assert.ok(metrics.nav.every(link => link.font >= 12 && link.height >= 44));
            assert.ok(metrics.sources.every(font => font >= 13));
          }
          if (hash.startsWith('#/paths') || hash.startsWith('#/practice')) assert.deepEqual(metrics.current, ['paths']);
          if (hash === '#/growth') assert.equal(metrics.hiddenGuide, true);
          report.push({ origin: name, width, hash, ...metrics });
        }
      }
      await b.setViewportSize({ width: 390, height: 844 });
      await b.goto(origin + '#/history');
      await b.locator('.main-nav [data-nav="paths"]').focus();
      await b.keyboard.press('Tab');
      assert.equal(await b.evaluate(() => document.activeElement.dataset.nav), 'growth');
      await b.keyboard.press('Shift+Tab');
      await b.keyboard.press('Enter');
      await b.waitForURL(/#\/paths$/);
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'edge-focused-results.json'), JSON.stringify({ report, errors }, null, 2));
    console.log('Audit fixes: HTTP/file multi-tab flows, modal/focus, 42 page/viewport combinations, keyboard navigation and console checks passed.');
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
