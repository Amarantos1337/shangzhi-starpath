'use strict';
// Optional browser regression runner: node tests/browser.test.js (requires Playwright; Edge on Windows, Chromium elsewhere).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/anniversary');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.zip': 'application/zip' };
const server = http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch (_) { response.writeHead(400).end(); return; }
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', (mime[path.extname(target)] || 'application/octet-stream') + (['.html', '.js', '.css', '.txt'].includes(path.extname(target)) ? '; charset=utf-8' : ''));
  fs.createReadStream(target).pipe(response);
});
const backup = { app: 'shangzhi-starpath', version: 1, favorites: ['wang-zongyu'], plans: [{ id: 'legacy-plan', templateId: 'competition', title: '旧备份计划', goal: '保留原任务', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', tasks: [{ id: 'legacy-task', title: '原先任务', stage: '旧阶段', dueDate: '', completed: true }] }] };
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const file = pathToFileURL(path.join(root, 'index.html')).href;
  const browser = await chromium.launch(browserOptions());
  const failures = [];
  const report = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text() + ' ' + message.location().url); });
    const hashes = ['#/', '#/history', '#/alumni', '#/alumni/wang-zongyu', '#/alumni/shi-zhenbang', '#/alumni/wang-gongming', '#/alumni/chen-liang', '#/paths', '#/paths/competition', '#/paths/education', '#/paths/career', '#/practice/campus-guide', '#/practice/study-stats', '#/practice/local-server', '#/growth', '#/about'];
    for (const origin of [base, file]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const hash of hashes) {
          await page.goto(origin + hash);
          await page.locator('main h1').waitFor();
          assert.ok(!(await page.locator('main h1').innerText()).includes('没有找到'));
          const result = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            broken: [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.src),
            duplicates: [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, i, all) => all.indexOf(id) !== i)
          }));
          assert.equal(result.overflow, false, origin + hash + ' at ' + width);
          assert.deepEqual(result.broken, [], hash);
          assert.deepEqual(result.duplicates, [], hash);
        }
      }
    }
    report.push('16 pages checked at 1440px and 390px over HTTP and file://; no overflow, broken loaded images or duplicate IDs');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '#/');
    await page.getByRole('link', { name: '探索全部校友', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索校友' }).fill('王宗宇');
    assert.equal(await page.locator('#alumni-results .person-card').count(), 1);
    await page.getByRole('button', { name: '收藏王宗宇', exact: true }).click();
    await page.getByRole('link', { name: '阅读成长故事', exact: true }).click();
    await page.locator('.related-routes a[href="#/paths/competition"]').click();
    const routeHash = new URL(page.url()).hash;
    await page.locator('[data-value="stage-2"]').click();
    assert.equal(await page.locator('#stage-2').getAttribute('open'), '');
    assert.equal(new URL(page.url()).hash, routeHash);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#stage-2').getAttribute('open'), null);
    await page.locator('.practice-card a[href="#/practice/campus-guide"]').first().click();
    assert.equal(await page.locator('[data-nav="paths"]').getAttribute('aria-current'), 'page');
    await page.goBack();
    assert.equal(new URL(page.url()).hash, '#/paths/competition');
    await page.goForward();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('link', { name: '下载起始材料与成品' }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'campus-guide.zip');
    assert.equal(await download.failure(), null);
    await page.getByRole('button', { name: '创建技能竞赛计划', exact: true }).click();
    assert.match(await page.locator('.modal-description').innerText(), /4个阶段、12项任务/);
    await page.locator('input[name="title"]').fill('<b>我的练习</b>');
    await page.getByRole('button', { name: '创建计划', exact: true }).click();
    await page.locator('#plan-title').waitFor();
    assert.equal(await page.locator('#plan-title').innerText(), '<b>我的练习</b>');
    assert.equal(await page.locator('#plan-title b').count(), 0);
    assert.equal(await page.locator('.task-check input').count(), 12);
    await page.locator('.task-check input').first().check();
    await page.reload();
    assert.equal(await page.locator('.task-check input').first().isChecked(), true);
    await page.locator('[data-action="edit-task"]').first().click();
    await page.locator('input[name="title"]').fill('记录三个测试结果');
    await page.locator('input[name="dueDate"]').fill('2026-10-01');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.locator('.task-text').first().innerText(), '记录三个测试结果');
    assert.ok(await page.getByRole('link', { name: '返回技能竞赛学习指导', includeHidden: true }).count());
    const exportEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份', exact: true }).click();
    const exported = await exportEvent;
    const exportedValue = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
    assert.equal(exportedValue.plans[0].tasks.length, 12);
    const importFile = async value => {
      await page.getByRole('button', { name: '导入备份', exact: true }).click();
      await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(value) });
    };
    await importFile('{broken');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('JSON'));
    assert.equal(await page.locator('.task-check input').count(), 12);
    await importFile(JSON.stringify(backup));
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.locator('.task-check input').count(), 12);
    await importFile(JSON.stringify(backup));
    await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('plan-title')?.textContent === '旧备份计划');
    assert.equal(await page.locator('.task-check input').count(), 1);
    assert.equal(await page.locator('.task-check input').isChecked(), true);
    await page.reload();
    assert.equal(await page.locator('.task-text').innerText(), '原先任务');
    report.push('Alumni → route → practice → plan; hash/history, keyboard details, ZIP download, 12-task creation/edit/persistence, escaping, export/import/cancel and legacy v1 verified');
    await page.getByRole('button', { name: '创建空白计划', exact: true }).click();
    await page.getByRole('button', { name: '创建计划', exact: true }).click();
    await page.locator('.empty-tasks').waitFor();
    assert.equal(await page.locator('.method-card').count(), 6);
    await page.getByRole('button', { name: '添加任务', exact: true }).click();
    await page.locator('input[name="title"]').fill('第一项自定义任务');
    await page.getByRole('button', { name: '添加任务', exact: true }).last().click();
    assert.equal(await page.locator('.task-text').innerText(), '第一项自定义任务');
    report.push('Empty plan retains six hidden method cards for the simplified layout and still accepts custom tasks');
    await page.goto(file + '#/paths/career');
    await page.getByRole('button', { name: '使用这条路线', exact: true }).click();
    await page.getByRole('button', { name: '创建计划', exact: true }).click();
    await page.locator('.task-check input').first().check();
    await page.reload();
    assert.equal(await page.locator('.task-check input').first().isChecked(), true);
    report.push('Direct-file plan creation, progress and refresh persistence verified');
    await page.goto(base + 'materials/campus-guide/reference/index.html');
    assert.match(await page.locator('#result').innerText(), /8/);
    await page.locator('#search').fill('借阅');
    assert.equal(await page.locator('#questions article:visible').count(), 1);
    await page.locator('#search').fill('火星');
    assert.equal(await page.locator('#questions article:visible').count(), 0);
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#search').fill('');
    assert.equal(await page.locator('#questions article:visible').count(), 8);
    for (const [category, expected] of [['学习', 3], ['生活', 3], ['服务', 2]]) {
      await page.locator('#category').selectOption(category);
      assert.equal(await page.locator('#questions article:visible').count(), expected);
    }
    await page.locator('#category').selectOption('学习');
    await page.locator('#search').fill('借阅');
    assert.equal(await page.locator('#questions article:visible').count(), 0);
    report.push('Web reference checked: all categories, matched/empty/cleared/combined searches');
    await page.goto(base + '#/practice/campus-guide');
    const renderLesson = await page.evaluate(() => window.StarPath.data.practiceProjects.find(item => item.id === 'campus-guide').steps[2].code);
    let starter = fs.readFileSync(path.join(root, 'materials/campus-guide/starter/index.html'), 'utf8');
    const questions = fs.readFileSync(path.join(root, 'materials/campus-guide/questions.txt'), 'utf8').split(/\r?\n/).filter(line => line.includes(' | '));
    const extra = questions.slice(2).map(line => { const [category, question, answer] = line.split(' | '); return '<article data-category="' + category + '"><h2>' + question + '</h2><p>' + answer + '</p></article>'; }).join('');
    starter = starter.replace('<!-- TODO：从 questions.txt 补齐其余六条 article。 -->', extra).replace('// TODO：把案例中的 render 函数和事件监听放在这里。', renderLesson);
    const learner = await context.newPage();
    await learner.setContent(starter);
    assert.equal(await learner.locator('#questions article:visible').count(), 8);
    await learner.locator('#search').fill('借阅');
    assert.equal(await learner.locator('#questions article:visible').count(), 1);
    await learner.close();
    report.push('Web starter completed using the exact lesson snippet and supplied questions');
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unavailable'); } }); });
    const session = await blocked.newPage();
    await session.goto(base + '#/paths/education');
    assert.equal(await session.locator('#storage-notice').isVisible(), true);
    await session.getByRole('button', { name: '使用这条路线', exact: true }).click();
    await session.getByRole('button', { name: '使用原始模板', exact: true }).click();
    await session.getByRole('button', { name: '创建计划', exact: true }).click();
    await session.locator('#plan-title').waitFor();
    assert.equal(await session.locator('.task-check input').count(), 12);
    await blocked.close();
    report.push('Unavailable storage: notice and session-only plan creation remain usable');
    const legacyBackup = JSON.parse(fs.readFileSync(path.join(output, 'legacy-backup.json'), 'utf8'));
    for (const origin of [base, file]) {
      const tributeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
      await tributeContext.addInitScript(value => {
        if (!localStorage.getItem('shangzhi-starpath:v1')) localStorage.setItem('shangzhi-starpath:v1', JSON.stringify(value));
      }, legacyBackup);
      const tribute = await tributeContext.newPage();
      tribute.on('pageerror', error => failures.push(error.message));
      tribute.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
      await tribute.goto(origin + '#/');
      const original = await tribute.evaluate(() => window.StarPath.store.get());
      assert.deepEqual(original.plans, legacyBackup.plans);
      await tribute.getByRole('link', { name: '回望校史', exact: true }).click();
      assert.equal(await tribute.locator('[data-nav="history"]').getAttribute('aria-current'), 'page');
      assert.equal(await tribute.evaluate(() => document.activeElement.id), 'main');
      assert.equal(await tribute.locator('.history-entry').count(), 9);
      assert.equal(await tribute.locator('.history-source-note').count(), 0);
      assert.equal(await tribute.locator('.history-entry .inline-source').count(), 9);
      assert.equal(await tribute.locator('.commemoration h2').innerText(), '九秩同行，续写星途');
      await tribute.goBack();
      assert.equal(new URL(tribute.url()).hash, '#/');
      await tribute.goForward();
      assert.equal(new URL(tribute.url()).hash, '#/history');
      for (const width of [1440, 390]) {
        await tribute.setViewportSize({ width, height: 900 });
        await tribute.goto(origin + '#/');
        for (const selector of ['.header-action', '.anniversary-copy .hero-actions a[href="index.html#/paths"]', '.tribute-bottom a']) {
          const entry = tribute.locator(selector);
          assert.equal((await entry.innerText()).trim().replace(/\s+/g, ' '), selector === '.header-action' ? '选择成长计划 ↗' : '选择成长计划');
          assert.equal(await entry.getAttribute('href'), 'index.html#/paths');
          assert.equal(await entry.getAttribute('data-action'), null);
        }
        assert.equal(await tribute.locator('.tribute-section').isVisible(), false);
        assert.equal(await tribute.locator('[data-action="create-tribute"]').count(), 0);
        const entries = [
          ['#/', '.anniversary-copy .hero-actions a[href="index.html#/paths"]'],
          ['#/history', '.history-next a[href="index.html#/paths"]']
        ];
        if (width === 1440) entries.push(['#/', '.header-action']);
        for (const [hash, selector] of entries) {
          await tribute.goto(origin + hash);
          const previousUrl = tribute.url();
          const entry = tribute.locator(selector);
          assert.match(await entry.innerText(), /选择成长计划/);
          assert.equal(await entry.getAttribute('href'), 'index.html#/paths');
          await entry.focus();
          await tribute.keyboard.press('Enter');
          await tribute.waitForURL(url => url.pathname.endsWith('/index.html') && url.hash === '#/paths');
          await tribute.locator('.paths-page').waitFor();
          assert.equal(await tribute.locator('#modal').evaluate(node => node.open), false);
          assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), original);
          await tribute.goBack();
          await tribute.waitForURL(previousUrl);
          await tribute.goForward();
          await tribute.waitForURL(url => url.hash === '#/paths');
          assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), original);
        }
      }
      await tribute.setViewportSize({ width: 1440, height: 1000 });
      await tribute.goto(origin + '#/paths/competition');
      const opener = tribute.getByRole('button', { name: '使用这条路线', exact: true });
      await opener.click();
      assert.match(await tribute.locator('.modal-description').innerText(), /4个阶段、12项任务/);
      assert.equal(await tribute.locator('input[name="title"]').inputValue(), '我的技能竞赛计划');
      await tribute.keyboard.press('Escape');
      assert.equal(await opener.evaluate(node => node === document.activeElement), true);
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), original);
      await opener.click();
      await tribute.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), original);
      await opener.click();
      await tribute.screenshot({ path: path.join(output, 'growth-dialog-desktop.png') });
      await tribute.setViewportSize({ width: 390, height: 844 });
      await tribute.screenshot({ path: path.join(output, 'growth-dialog-mobile.png') });
      assert.equal(await tribute.locator('#modal').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      await tribute.locator('input[name="title"]').fill('我的献礼 <b>成长记录</b>');
      await tribute.locator('textarea[name="goal"]').fill('完成一份真实的小作品');
      await tribute.getByRole('button', { name: '创建计划', exact: true }).click();
      await tribute.locator('#plan-title').waitFor();
      assert.equal(await tribute.locator('#plan-title').innerText(), '我的献礼 <b>成长记录</b>');
      assert.equal(await tribute.locator('#plan-title b').count(), 0);
      assert.equal(await tribute.locator('.task-check input').count(), 12);
      assert.equal(await tribute.locator('[data-nav="growth"]').getAttribute('aria-current'), 'page');
      const first = await tribute.evaluate(() => window.StarPath.store.get().plans[0]);
      assert.equal(first.templateId, 'competition');
      assert.ok(first.tasks.every(task => task.dueDate === '' && !task.completed));
      await tribute.locator('[data-action="edit-task"]').first().click();
      await tribute.locator('input[name="title"]').fill('记录1936年的办学起点');
      await tribute.locator('input[name="dueDate"]').fill('2026-10-01');
      await tribute.getByRole('button', { name: '保存修改', exact: true }).click();
      for (let index = 0; index < 12; index++) await tribute.locator('.task-check input').nth(index).check();
      await tribute.reload();
      assert.equal(await tribute.locator('[role="progressbar"]').getAttribute('aria-valuenow'), '100');
      assert.equal(await tribute.locator('.completion-note').isVisible(), true);
      assert.equal(await tribute.locator('.task-text').first().innerText(), '记录1936年的办学起点');
      await tribute.screenshot({ path: path.join(output, 'growth-plan-mobile.png'), fullPage: true });
      await tribute.setViewportSize({ width: 1440, height: 1000 });
      await tribute.screenshot({ path: path.join(output, 'growth-plan-desktop.png'), fullPage: true });
      await tribute.locator('.header-action').click();
      await tribute.waitForURL(url => url.hash === '#/paths');
      assert.equal(await tribute.locator('#modal').evaluate(node => node.open), false);
      assert.equal(await tribute.evaluate(() => window.StarPath.store.get().plans.length), 2);
      await tribute.goto(origin + '#/paths/competition');
      await tribute.getByRole('button', { name: '使用这条路线', exact: true }).click();
      await tribute.getByRole('button', { name: '创建计划', exact: true }).click();
      await tribute.waitForFunction(() => window.StarPath.store.get().plans.length === 3);
      const repeated = await tribute.evaluate(() => window.StarPath.store.get());
      assert.equal(new Set(repeated.plans.map(plan => plan.id)).size, 3);
      assert.deepEqual(repeated.plans[2], original.plans[0]);
      assert.deepEqual(repeated.favorites, original.favorites);
      const downloadPromise = tribute.waitForEvent('download');
      await tribute.getByRole('button', { name: '导出备份', exact: true }).click();
      const backupDownload = await downloadPromise;
      const savedBackup = fs.readFileSync(await backupDownload.path(), 'utf8');
      fs.writeFileSync(path.join(output, 'growth-backup.json'), savedBackup);
      const importTribute = async value => {
        await tribute.getByRole('button', { name: '导入备份', exact: true }).click();
        await tribute.locator('#backup-file').setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(value) });
      };
      await importTribute('{broken');
      await tribute.waitForFunction(() => document.getElementById('toast').textContent.includes('JSON'));
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), repeated);
      await importTribute(JSON.stringify(legacyBackup));
      await tribute.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), repeated);
      await importTribute(JSON.stringify(legacyBackup));
      await tribute.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
      await tribute.waitForFunction(() => window.StarPath.store.get().plans.length === 1);
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), original);
      await importTribute(savedBackup);
      await tribute.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
      await tribute.waitForFunction(() => window.StarPath.store.get().plans.length === 3);
      await tribute.reload();
      assert.deepEqual(await tribute.evaluate(() => window.StarPath.store.get()), repeated);
      await tributeContext.close();
    }
    report.push('Growth selection over HTTP and file at 1440px/390px: all four link labels/targets, visible entries via keyboard, back/forward, no dialog or data changes; route plans retain cancel/Escape, creation/edit/completion/refresh, repeat creation, escaping and backups');
    const tributeBlocked = await browser.newContext();
    await tributeBlocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unavailable'); } }); });
    const tributeSession = await tributeBlocked.newPage();
    await tributeSession.goto(base + '#/');
    await tributeSession.locator('.anniversary-copy a[href="index.html#/paths"]').click();
    await tributeSession.waitForURL(url => url.hash === '#/paths');
    assert.equal(await tributeSession.locator('#modal').evaluate(node => node.open), false);
    assert.equal(await tributeSession.evaluate(() => window.StarPath.store.get().plans.length), 0);
    await tributeSession.goto(base + 'index.html#/paths/competition');
    await tributeSession.getByRole('button', { name: '使用这条路线', exact: true }).click();
    await tributeSession.getByRole('button', { name: '创建计划', exact: true }).click();
    await tributeSession.locator('#plan-title').waitFor();
    assert.equal(await tributeSession.locator('.task-check input').count(), 12);
    assert.equal(await tributeSession.locator('#storage-notice').isVisible(), true);
    assert.match(await tributeSession.locator('#toast').innerText(), /仅本次打开有效/);
    await tributeBlocked.close();
    report.push('Unavailable storage: growth selection navigates without creating a plan; explicit route creation keeps 12 tasks in session and shows backup notice');
    const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const motionPage = await motionContext.newPage();
    await motionPage.goto(base + '#/');
    await motionPage.locator('[data-nav="history"]').click();
    await motionPage.locator('main .history-page-enter').waitFor();
    await motionPage.locator('.page-transition-snapshot').waitFor({ state: 'detached' });
    assert.equal(await motionPage.evaluate(() => document.activeElement.id), 'main');
    await motionPage.emulateMedia({ reducedMotion: 'reduce' });
    await motionPage.locator('[data-nav="home"]').click();
    assert.equal(await motionPage.locator('main .page-enter').count(), 0);
    assert.equal(await motionPage.locator('.page-transition-snapshot').count(), 0);
    await motionContext.close();
    report.push('Page transition cleanup, focus and reduced-motion preference verified on anniversary navigation');
    for (const [name, hash, width] of [['home-desktop', '#/', 1440], ['home-mobile', '#/', 390], ['history-desktop', '#/history', 1440], ['history-mobile', '#/history', 390], ['paths-desktop', '#/paths', 1440], ['paths-mobile', '#/paths', 390], ['practice-desktop', '#/practice/campus-guide', 1440], ['practice-mobile', '#/practice/campus-guide', 390], ['route-mobile', '#/paths/competition', 390], ['profile-desktop', '#/alumni/wang-zongyu', 1440]]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(base + hash);
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
      if (hash === '#/') await page.screenshot({ path: path.join(output, name + '-first-screen.png') });
    }
    assert.deepEqual(failures, []);
    report.push('No page or console errors during checked flows');
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2));
    console.log(report.join('\n'));
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
