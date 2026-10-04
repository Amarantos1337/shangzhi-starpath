'use strict';
// node tests/history-motion.test.js; --profile before|after records the same scrolling workload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/history-motion');
const server = http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch (_) { response.writeHead(400).end(); return; }
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
  response.setHeader('Content-Type', (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(target).pipe(response);
});

async function profile(browser, base, label) {
  const report = [];
  for (const width of [1440, 390]) {
    for (const cpu of [1, 4]) {
      for (let repeat = 0; repeat < 3; repeat++) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.historyCharacterReads = 0;
          const read = Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect = function () {
            if (this.classList.contains('history-character')) window.historyCharacterReads++;
            return read.call(this);
          };
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
        await cdp.send('Performance.enable');
        await page.goto(base);
        await page.waitForTimeout(250);
        const start = (await cdp.send('Performance.getMetrics')).metrics;
        const events = [];
        cdp.on('Tracing.dataCollected', event => events.push(...event.value));
        await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
        await page.getByRole('link', { name: '回望校史', exact: true }).click();
        await page.locator('.history-intro').waitFor();
        for (let step = 0; step < 8; step++) {
          await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'instant' }));
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(1000);
        const end = (await cdp.send('Performance.getMetrics')).metrics;
        const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        await complete;
        const result = await page.evaluate(() => ({
          characterReads: window.historyCharacterReads,
          characters: document.querySelectorAll('.history-timeline .history-character').length,
          unfinishedCharacters: document.getAnimations().filter(animation => animation.animationName === 'history-character-reveal' && animation.playState !== 'finished').length
        }));
        for (const name of ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'LayoutCount']) {
          result[name] = end.find(metric => metric.name === name).value - start.find(metric => metric.name === name).value;
        }
        result.paintMs = events.filter(event => event.name === 'Paint' && event.ph === 'X').reduce((total, event) => total + event.dur / 1000, 0);
        report.push({ width, cpu, repeat, ...result });
        fs.writeFileSync(path.join(output, label + '-' + width + '-' + cpu + '-' + repeat + '.trace.json.gz'), zlib.gzipSync(JSON.stringify({ traceEvents: events })));
        if (label === 'after' && repeat === 0) {
          await page.goto(base);
          await page.locator('.anniversary-home').waitFor();
          await page.evaluate(() => document.querySelector('[data-history-fill]').click());
          await page.waitForTimeout(70);
          await page.screenshot({ path: path.join(output, 'cover-' + width + '-' + cpu + '.png') });
          await page.locator('.history-intro').waitFor();
          await page.waitForTimeout(70);
          await page.screenshot({ path: path.join(output, 'fade-' + width + '-' + cpu + '.png') });
          await page.locator('.history-screen-fill').waitFor({ state: 'detached' });
          await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
          await page.waitForTimeout(160);
          await page.screenshot({ path: path.join(output, 'characters-' + width + '-' + cpu + '.png') });
          await page.waitForTimeout(750);
          await page.screenshot({ path: path.join(output, 'settled-' + width + '-' + cpu + '.png') });
        }
        await context.close();
      }
      console.log(label + ': completed ' + width + 'px, CPU ' + cpu + 'x (3 runs)');
    }
  }
  fs.writeFileSync(path.join(output, label + '.json'), JSON.stringify({ browser: browser.version(), report }, null, 2));
}

async function regression(browser, base) {
  for (const origin of [base, pathToFileURL(path.join(root, 'index.html')).href]) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(origin + '#/history');
      const last = page.locator('.history-entry').last();
      assert.equal(await last.locator('.history-character').count(), 0, 'offscreen text is not split eagerly');
      const names = await page.locator('.history-entry .inline-source').allTextContents();
      await last.locator('p').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await last.locator('p .history-character-visible').first().waitFor({ state: 'attached' });
      assert.ok(await last.evaluate(node => node.getAnimations({ subtree: true }).every(animation => {
        const timing = animation.effect.getTiming();
        return timing.duration === 420 && timing.delay <= 240;
      })));
      await page.waitForTimeout(750);
      assert.equal(await last.locator('.history-character-visible').count(), 0, 'last paragraph finishes independently');
      assert.equal(await last.locator('.history-line-pending,.history-character-pending').count(), 0);
      const source = last.locator('.inline-source');
      await source.focus();
      assert.equal(await source.getAttribute('aria-label'), null);
      assert.equal(await source.evaluate(node => node.querySelector('.sr-only')?.textContent || node.textContent), names[names.length - 1]);
      assert.equal(await page.getByRole('link', { name: names[names.length - 1], exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);

      // A still-hidden source must become readable immediately on focus, without playing a reveal.
      await page.reload();
      const hiddenSource = page.locator('.history-entry .inline-source').last();
      await hiddenSource.focus();
      assert.equal(await hiddenSource.locator('.history-character-visible,.history-character-pending').count(), 0);
      assert.equal(await hiddenSource.evaluate(node => getComputedStyle(node).opacity), '1');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !document.querySelector('.history-line-pending,.history-character-visible,.history-character-pending'));
      assert.equal(await page.locator('.history-line-pending,.history-character-visible,.history-character-pending').count(), 0);
      await page.reload();
      assert.equal(await page.locator('.history-timeline .history-character').count(), 0);

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(origin + '#/');
      await page.locator('.anniversary-home').waitFor();
      await page.getByRole('link', { name: '回望校史', exact: true }).click();
      await page.locator('.history-intro').waitFor();
      await page.locator('.history-screen-fill').waitFor({ state: 'detached' });
      await page.goBack();
      await page.locator('.anniversary-home').waitFor();
      await page.goForward();
      await page.locator('.history-intro').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');

      // Leaving while the reveal fade is running must remove its overlay as well.
      await page.goto(origin + '#/');
      await page.locator('.anniversary-home').waitFor();
      // Trigger synchronously and sample each frame so polling cannot skip the short fade.
      await page.evaluate(() => document.querySelector('[data-history-fill]').click());
      await page.waitForFunction(() => document.querySelector('.history-screen-fill')?.classList.contains('is-revealing'));
      await page.evaluate(() => { location.hash = '#/alumni'; });
      await page.locator('.filter-panel').waitFor();
      assert.equal(await page.locator('.history-screen-fill').count(), 0);

      await page.goto(origin + '#/');
      await page.locator('.anniversary-index a[href="#/history"]').click();
      await page.locator('.history-intro').waitFor();
      await page.locator('.page-transition-snapshot').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.history-screen-fill').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');

      await page.goto(origin + '#/');
      await page.locator('.anniversary-home').waitFor();
      await page.evaluate(() => document.querySelector('[data-history-fill]').click());
      await page.evaluate(() => { location.hash = '#/alumni'; });
      await page.locator('.filter-panel').waitFor();
      await page.waitForTimeout(600);
      assert.equal(new URL(page.url()).hash, '#/alumni', 'cancelled transition cannot navigate later');
      assert.equal(await page.locator('.history-screen-fill').count(), 0);

      await page.goto(origin + '#/');
      await page.locator('.anniversary-home').waitFor();
      await page.evaluate(() => document.querySelector('[data-history-fill]').click());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('.history-intro').waitFor();
      await page.waitForFunction(() => !document.querySelector('.history-screen-fill'));
      assert.equal(await page.locator('.history-screen-fill').count(), 0);
      assert.equal(await page.locator('.history-line-pending,.history-character-visible').count(), 0);
      await page.screenshot({ path: path.join(output, 'history-' + width + (origin === base ? '-http' : '-file') + '.png'), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
      console.log('History motion verified: ' + width + 'px, ' + (origin === base ? 'HTTP' : 'file'));
    }
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => { delete window.IntersectionObserver; });
  await page.goto(base + '#/history');
  assert.equal(await page.locator('.history-line-pending,.history-timeline .history-character').count(), 0);
  await context.close();
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch(browserOptions());
  try {
    if (process.argv[2] === '--profile') {
      const label = process.argv[3];
      if (!['before', 'after'].includes(label)) throw new Error('Profile label must be before or after');
      await profile(browser, base, label);
    } else await regression(browser, base);
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
