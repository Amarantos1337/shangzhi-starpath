'use strict';
// Pre-submission UI regression: node tests/submission-regression.test.js (Playwright).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/submission-regression');
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const target = file === root ? path.join(root, 'index.html') : file;
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return response.writeHead(404).end();
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  response.setHeader('content-type', (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(target).pipe(response);
});
function backup(title) {
  return { app: 'shangzhi-starpath', version: 1, favorites: [], plans: [{ id: 'import-plan', templateId: null, title, goal: '', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z', tasks: [] }] };
}
async function selectBackup(page, name, text) {
  await page.locator('#backup-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
}
async function finishRead(page, name, reject = false) {
  await page.evaluate(({ name, reject }) => {
    const pending = window.pendingFileReads.get(name);
    if (reject) pending.reject(); else pending.read();
  }, { name, reject });
  await page.waitForFunction(name => !window.pendingFileReads.has(name), name);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function createBlank(page, title) {
  await page.getByRole('button', { name: '创建空白计划', exact: true }).click();
  await page.getByRole('textbox', { name: '计划名称', exact: true }).fill(title);
  await page.getByRole('button', { name: '创建计划', exact: true }).click();
  await page.waitForFunction(title => document.getElementById('plan-title')?.textContent === title, title);
}
async function recovery(context, origin) {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto(origin + '#/growth');
  await createBlank(a, '原计划');
  await b.goto(origin + '#/growth');
  await a.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.failWrites = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.failWrites && key === window.StarPath.store.key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await a.getByRole('button', { name: '编辑计划目标', exact: true }).click();
  await a.getByRole('textbox', { name: '计划名称', exact: true }).fill('A 尚未保存的编辑');
  await a.getByRole('button', { name: '保存', exact: true }).click();
  await a.locator('#storage-notice').waitFor({ state: 'visible' });
  await createBlank(b, 'B 已保存的新计划');
  const disk = await b.evaluate(() => localStorage.getItem(window.StarPath.store.key));
  await a.evaluate(() => { window.failWrites = false; });
  await a.locator('.main-nav [data-nav="alumni"]').click();
  await a.locator('[data-action="favorite"][data-person="chen-liang"]').click();
  assert.match(await a.locator('#storage-notice').innerText(), /暂未保存.*其他页面变更/);
  assert.match(await a.locator('#toast').innerText(), /仅本次打开有效/);
  assert.equal(await b.evaluate(() => localStorage.getItem(window.StarPath.store.key)), disk);
  await b.reload();
  assert.equal(await b.locator('.plan-tab').count(), 2);
  const session = await a.evaluate(() => window.StarPath.store.exportBackup());
  assert.equal(JSON.parse(session).plans[0].title, 'A 尚未保存的编辑');
  await a.locator('.main-nav [data-nav="growth"]').click();
  await a.getByRole('button', { name: '导出备份', exact: true }).waitFor();
  await selectBackup(a, 'session.json', session);
  await a.getByRole('button', { name: '取消', exact: true }).click();
  await a.waitForFunction(() => !document.body.classList.contains('modal-open'));
  assert.equal(await b.evaluate(() => localStorage.getItem(window.StarPath.store.key)), disk);
  await selectBackup(a, 'session.json', session);
  await a.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
  assert.equal(await a.evaluate(() => window.StarPath.store.status()), 'persistent');
  await b.goto(origin + '#/growth');
  assert.equal(await b.locator('#plan-title').innerText(), 'A 尚未保存的编辑');
  assert.equal(await b.locator('.plan-tab').count(), 1);
  await a.close();
  await b.close();
}
async function largeBackup(page, origin) {
  await page.goto(origin + '#/growth');
  await page.evaluate(() => window.StarPath.store.replace({ version: 1, favorites: [], plans: Array.from({ length: 20 }, (_, index) => ({
    id: 'large-' + index, templateId: null, title: '计'.repeat(120), goal: '标'.repeat(1000), createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
    tasks: Array.from({ length: 100 }, (_, task) => ({ id: 'task-' + task, title: '学'.repeat(180), stage: '阶'.repeat(80), dueDate: '', completed: task % 2 === 0 }))
  })) }));
  await page.reload();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  const download = await downloadPromise;
  const text = fs.readFileSync(await download.path(), 'utf8');
  assert.ok(Buffer.byteLength(text, 'utf8') > 1024 * 1024);
  await page.locator('#backup-file').setInputFiles(await download.path());
  await page.locator('[data-form="import"]').waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
  assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 20);
  await selectBackup(page, 'large.json', text);
  await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
  await page.locator('#plan-title').waitFor();
  assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.flatMap(plan => plan.tasks).length), 2000);
  assert.equal(await page.evaluate(() => window.StarPath.store.progress(window.StarPath.store.get().plans[0]).percent), 50);
  const before = await page.evaluate(() => window.StarPath.store.exportBackup());
  await selectBackup(page, 'invalid.json', '{broken');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('有效的 JSON'));
  assert.match(await page.locator('#toast').innerText(), /有效的 JSON/);
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
  assert.deepEqual(JSON.parse(await page.evaluate(() => window.StarPath.store.exportBackup())).plans, JSON.parse(before).plans);
  await page.evaluate(() => {
    const file = new File([' '.repeat(window.StarPath.store.backupMaxBytes + 1)], 'oversized.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('backup-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  assert.match(await page.locator('#toast').innerText(), /32 MiB/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.equal(await page.evaluate(() => window.StarPath.store.get().plans.length), 20);
}
async function asyncImports(page, origin) {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    window.pendingFileReads = new Map();
    File.prototype.text = function () {
      if (!this.name.startsWith('slow-')) return read.call(this);
      return new Promise((resolve, reject) => {
        window.pendingFileReads.set(this.name, {
          read: async () => { resolve(await read.call(this)); window.pendingFileReads.delete(this.name); },
          reject: () => { reject(new Error('旧文件读取失败')); window.pendingFileReads.delete(this.name); }
        });
      });
    };
  });
  await page.reload();
  for (const mode of ['invalid-json', 'valid-old', 'read-error']) {
    await page.goto(origin + '#/growth');
    await selectBackup(page, 'slow-' + mode + '.json', mode === 'invalid-json' ? '{' : JSON.stringify(backup('旧备份')));
    await selectBackup(page, 'new.json', JSON.stringify(backup('新备份-' + mode)));
    await page.locator('[data-form="import"]').waitFor();
    const toast = await page.locator('#toast').textContent();
    await finishRead(page, 'slow-' + mode + '.json', mode === 'read-error');
    assert.equal(await page.locator('#toast').textContent(), toast);
    assert.match(await page.locator('.import-plan-list').innerText(), new RegExp('新备份-' + mode));
    await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
    await page.waitForFunction(title => document.getElementById('plan-title')?.textContent === title, '新备份-' + mode);
    assert.equal(await page.locator('#plan-title').innerText(), '新备份-' + mode);
  }
  for (const action of ['route', 'new-form', 'close']) {
    await page.goto(origin + '#/growth');
    const before = await page.evaluate(() => window.StarPath.store.get());
    if (action === 'close') {
      await selectBackup(page, 'preview.json', JSON.stringify(backup('先预览但不保存')));
      await page.locator('[data-form="import"]').waitFor();
    }
    await selectBackup(page, 'slow-' + action + '.json', JSON.stringify(backup('迟到备份')));
    if (action === 'route') {
      await page.locator('.main-nav [data-nav="alumni"]').click();
      await page.waitForURL(/#\/alumni$/);
    } else if (action === 'new-form') {
      await page.getByRole('button', { name: '创建空白计划', exact: true }).click();
      await page.getByRole('textbox', { name: '计划名称', exact: true }).fill('保留未提交输入');
    } else await page.getByRole('button', { name: '取消', exact: true }).click();
    await finishRead(page, 'slow-' + action + '.json');
    if (action === 'new-form') {
      assert.equal(await page.getByRole('textbox', { name: '计划名称', exact: true }).inputValue(), '保留未提交输入');
      assert.equal(await page.locator('[data-form="import"]').count(), 0);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
    } else assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
    assert.deepEqual(await page.evaluate(() => window.StarPath.store.get()), before);
  }
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserOptions());
  const report = [];
  const errors = [];
  try {
    const origins = [['http', 'http://127.0.0.1:' + server.address().port + '/'], ['file', pathToFileURL(path.join(root, 'index.html')).href]];
    for (const [name, origin] of origins) {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
        context.on('page', page => {
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        });
        await context.route('https://**/*', route => route.abort());
        await recovery(context, origin);
        console.log('Storage recovery verified: ' + name + ', ' + width + 'px');
        const page = await context.newPage();
        await largeBackup(page, origin);
        console.log('Large backup verified: ' + name + ', ' + width + 'px');
        await asyncImports(page, origin);
        await page.goto(origin + '#/growth');
        await page.screenshot({ path: path.join(output, name + '-' + width + '.png') });
        report.push({ origin: name, width, recoveryConflict: 'passed', largeBackup: 'passed', importRaces: 'passed', cancellation: 'passed' });
        await context.close();
        console.log('Submission regression passed: ' + name + ', ' + width + 'px');
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ report, errors }, null, 2));
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
