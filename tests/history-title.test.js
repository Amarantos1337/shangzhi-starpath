'use strict';
// Optional browser regression runner: node tests/history-title.test.js (requires Playwright; Edge on Windows, Chromium elsewhere).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const title = '九秩薪火，照亮新的出发。';
const server = http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch (_) { response.writeHead(400).end(); return; }
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(target)] || 'application/octet-stream';
  response.setHeader('Content-Type', type);
  fs.createReadStream(target).pipe(response);
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const file = pathToFileURL(path.join(root, 'index.html')).href;
  const browser = await chromium.launch(browserOptions());
  try {
    for (const origin of [base, file]) {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const heading = page.locator('main .history-intro h1');
        await page.goto(origin + '#/history');
        const directHeight = await heading.evaluate(node => node.getBoundingClientRect().height);
        await heading.locator('.history-title-character.is-current').waitFor();
        assert.equal(await page.getByRole('heading', { name: title }).count(), 1);
        assert.equal(await heading.locator('.history-title-character').count(), 12);
        assert.ok(await heading.locator('.history-title-character.is-visible').count() < 12);
        await page.waitForFunction(() => {
          const node = document.querySelector('main .history-intro h1');
          return node && node.querySelectorAll('.history-title-character.is-visible').length === 12 && node.lastElementChild.classList.contains('is-current');
        });
        await page.waitForTimeout(800);
        assert.equal(await heading.locator('.history-title-character.is-current').count(), 1);
        assert.equal(await heading.innerText(), title);
        await page.reload();
        await heading.locator('.history-title-character.is-current').waitFor();
        assert.ok(await heading.locator('.history-title-character.is-visible').count() < 12);

        await page.locator('[data-nav="home"]').click();
        await page.locator('[data-nav="history"]').click();
        await heading.locator('.history-title-character.is-current').waitFor();
        assert.equal(await page.getByRole('heading', { name: title }).count(), 1);
        assert.equal(await heading.locator('.history-title-character').count(), 12);
        assert.ok(await heading.locator('.history-title-character.is-visible').count() < 12);
        assert.deepEqual(await heading.evaluate(node => {
          const current = node.querySelector('.history-title-character.is-current');
          return {
            caret: getComputedStyle(current, '::after').borderLeftColor,
            selection: getComputedStyle(current, '::selection').backgroundColor
          };
        }), { caret: 'rgb(142, 36, 48)', selection: 'rgb(142, 36, 48)' });
        assert.ok(Math.abs(await heading.evaluate(node => node.getBoundingClientRect().height) - directHeight) < 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.waitForFunction(() => {
          const node = document.querySelector('main .history-intro h1');
          return node && node.querySelectorAll('.history-title-character.is-visible').length === 12 && node.lastElementChild.classList.contains('is-current');
        });
        assert.equal(await heading.innerText(), title);
        assert.equal(await page.evaluate(() => {
          const selection = getSelection();
          selection.selectAllChildren(document.querySelector('main .history-intro h1'));
          const text = selection.toString();
          selection.removeAllRanges();
          return text;
        }), title);

        await page.locator('[data-nav="home"]').click();
        await page.goBack();
        await heading.locator('.history-title-character.is-current').waitFor();
        await page.evaluate(() => { location.hash = '#/alumni'; });
        await page.locator('main .history-intro').waitFor({ state: 'detached' });
        await page.waitForTimeout(400);
        assert.equal(await page.locator('main .history-title-character').count(), 0);
        await page.locator('[data-nav="history"]').click();
        await heading.locator('.history-title-character.is-current').waitFor();

        await page.goto(origin + '#/');
        await page.getByRole('link', { name: '回望校史', exact: true }).click();
        await heading.locator('.history-title-character.is-current').waitFor();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForFunction(() => {
          const node = document.querySelector('main .history-intro h1');
          return node && node.querySelectorAll('.history-title-character.is-visible').length === 12 && !node.querySelector('.is-current');
        });
        assert.equal(await heading.locator('.history-title-character.is-visible').count(), 12);
        assert.equal(await heading.locator('.history-title-character.is-current').count(), 0);
        await page.locator('[data-nav="home"]').click();
        await page.locator('[data-nav="history"]').click();
        assert.equal(await heading.locator('.history-title-character').count(), 0);
        assert.equal(await heading.innerText(), title);
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
    console.log('History title animation verified over HTTP and file:// at 1440px and 390px.');
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
