'use strict';
// Run: node tests/method-motion.test.js (optional Playwright/Edge browser check).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/method-motion');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch (_) { response.writeHead(400).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(target).pipe(response);
});
async function settle(page) {
  await page.evaluate(() => document.querySelectorAll('.reading-details.is-animating').forEach(card => card.getAnimations().forEach(animation => animation.finish())));
  await page.waitForFunction(() => !document.querySelector('.reading-details.is-animating'));
  await page.evaluate(() => document.querySelectorAll('.method-card,.stage-guide').forEach(card => card.getAnimations({ subtree:true }).forEach(animation => animation.finish())));
}
async function sampleToggle(page, fractions, selector = '.method-card') {
  return page.locator(selector).first().evaluate((card, fractions) => {
    card.querySelector('summary').click();
    const body = card.querySelector('.reading-body');
    const animations = [...card.getAnimations(), ...body.getAnimations()];
    animations.forEach(animation => animation.pause());
    return fractions.map(fraction => {
      animations.forEach(animation => { animation.currentTime = animation.effect.getTiming().duration * fraction; });
      return { height:card.getBoundingClientRect().height, opacity:Number(getComputedStyle(body).opacity), open:card.open, inert:body.inert };
    });
  }, fractions);
}
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const errors = [];
  const report = [];
  const stageReport = [];
  try {
    browser = await chromium.launch(browserOptions());
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    fs.mkdirSync(output, { recursive:true });
    const origins = { http:'http://127.0.0.1:' + server.address().port + '/', file:pathToFileURL(path.join(root, 'index.html')).href };
    for (const [protocol, origin] of Object.entries(origins)) {
      for (const width of [390, 1042, 1440]) {
        await page.setViewportSize({ width, height:871 });
        await page.goto(origin + '#/paths');
        await page.reload();
        const card = page.locator('.method-card').first();
        const summary = card.locator('summary');
        await summary.waitFor();
        const closedHeight = await card.evaluate(node => node.getBoundingClientRect().height);
        const opening = await sampleToggle(page, [0, 0.25, 0.5, 1]);
        assert.ok(Math.abs(opening[0].height - closedHeight) < 1);
        assert.ok(opening[0].height < opening[1].height && opening[1].height < opening[2].height && opening[2].height < opening[3].height, JSON.stringify({ protocol, width, opening }));
        assert.ok(opening[1].opacity > 0 && opening[1].opacity < 1);
        await settle(page);
        assert.equal(await card.getAttribute('open'), '');
        const naturalHeight = await card.evaluate(node => node.getBoundingClientRect().height);
        assert.ok(Math.abs(naturalHeight - opening[3].height) < 1, 'Opening must not snap on completion');
        const closing = await sampleToggle(page, [0, 0.25, 0.5, 1]);
        assert.ok(closing[0].height > closing[1].height && closing[1].height > closing[2].height && closing[2].height > closing[3].height);
        assert.ok(closing.every(frame => frame.open && frame.inert), 'Keep details renderable but content unfocusable while closing');
        await settle(page);
        assert.equal(await card.getAttribute('open'), null);
        assert.ok(Math.abs(await card.evaluate(node => node.getBoundingClientRect().height) - closedHeight) < 1, 'Closing must not snap on completion');
        // Reverse twice at a deterministic intermediate frame, without a jump.
        await sampleToggle(page, [0.4]);
        const reversal = await card.evaluate(card => {
          const measure = () => card.getBoundingClientRect().height;
          const before = measure();
          card.querySelector('summary').click();
          let animations = [...card.getAnimations(), ...card.querySelector('.reading-body').getAnimations()];
          animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
          const after = measure();
          animations.forEach(animation => { animation.currentTime = animation.effect.getTiming().duration * 0.4; });
          const beforeSecond = measure();
          card.querySelector('summary').click();
          animations = [...card.getAnimations(), ...card.querySelector('.reading-body').getAnimations()];
          animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
          return [before, after, beforeSecond, measure()];
        });
        assert.ok(Math.abs(reversal[0] - reversal[1]) < 1 && Math.abs(reversal[2] - reversal[3]) < 1);
        await settle(page);
        assert.equal(await card.getAttribute('open'), '');
        await summary.focus();
        await page.keyboard.press('Space');
        await settle(page);
        assert.equal(await card.getAttribute('open'), null);
        await page.keyboard.press('Enter');
        await settle(page);
        assert.equal(await card.getAttribute('open'), '');
        assert.equal(await summary.evaluate(node => node === document.activeElement), true);
        assert.equal(await card.locator('summary').getAttribute('aria-expanded'), null);
        assert.equal(await card.locator('.reading-body').evaluate(node => node.inert), false);
        await page.locator('.method-card').nth(1).locator('summary').click();
        await settle(page);
        assert.equal(await page.locator('.method-card[open]').count(), 2);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.locator('#methods').scrollIntoViewIfNeeded();
        await page.screenshot({ path:path.join(output, 'methods-' + protocol + '-' + width + '.png') });
        report.push({ protocol, width, closedHeight, openHeight:naturalHeight, opening:opening.map(frame => frame.height), closing:closing.map(frame => frame.height), rapidReversal:'passed', keyboard:'passed' });
      }
    }
    for (const [protocol, origin] of Object.entries(origins)) {
      for (const width of [390, 1042, 1440]) {
        await page.setViewportSize({ width, height:871 });
        await page.goto(origin + '#/paths/education');
        await page.reload();
        const card = page.locator('.stage-guide').first();
        const summary = card.locator('summary');
        await summary.waitFor();
        assert.equal(await page.locator('.stage-guide').count(), 4);
        assert.equal(await page.locator('.stage-guide[open]').count(), 1, 'First stage stays open by default');
        const openHeight = await card.evaluate(node => node.getBoundingClientRect().height);
        const closing = await sampleToggle(page, [0, 0.25, 0.5, 1], '.stage-guide');
        assert.ok(closing[0].height > closing[1].height && closing[1].height > closing[2].height && closing[2].height > closing[3].height);
        assert.ok(closing.every(frame => frame.open && frame.inert));
        await settle(page);
        const closedHeight = await card.evaluate(node => node.getBoundingClientRect().height);
        assert.ok(Math.abs(closedHeight - closing[3].height) < 1);
        const opening = await sampleToggle(page, [0, 0.25, 0.5, 1], '.stage-guide');
        assert.ok(opening[0].height < opening[1].height && opening[1].height < opening[2].height && opening[2].height < opening[3].height);
        assert.ok(opening[1].opacity > 0 && opening[1].opacity < 1);
        await settle(page);
        assert.ok(Math.abs(await card.evaluate(node => node.getBoundingClientRect().height) - openHeight) < 1);
        await summary.focus();
        await page.keyboard.press('Space');
        await settle(page);
        assert.equal(await card.getAttribute('open'), null);
        await page.keyboard.press('Enter');
        await settle(page);
        assert.equal(await card.getAttribute('open'), '');
        assert.equal(await summary.evaluate(node => node === document.activeElement), true);
        await sampleToggle(page, [0.4], '.stage-guide');
        const reverse = await sampleToggle(page, [0, 0.4], '.stage-guide');
        const reverseAgain = await sampleToggle(page, [0], '.stage-guide');
        assert.ok(Math.abs(reverse[1].height - reverseAgain[0].height) < 1);
        await settle(page);
        assert.equal(await card.getAttribute('open'), null);
        const directory = page.locator('.reading-toc [data-value="stage-2"]');
        await directory.click();
        await settle(page);
        assert.equal(await page.locator('#stage-2').getAttribute('open'), '');
        assert.equal(await page.locator('#stage-2>summary').evaluate(node => node === document.activeElement), true);
        assert.equal(new URL(page.url()).hash, '#/paths/education');
        await page.locator('#stage-2>summary').evaluate(node => node.click());
        await directory.evaluate(node => node.click());
        await settle(page);
        assert.equal(await page.locator('#stage-2').getAttribute('open'), '');
        assert.equal(await page.locator('#stage-2>.reading-body').evaluate(node => node.inert), false);
        assert.equal(await page.locator('#stage-2>summary').getAttribute('aria-expanded'), null);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.locator('#stage-2').evaluate(node => node.scrollIntoView({ behavior:'instant', block:'start' }));
        await page.screenshot({ path:path.join(output, 'stages-' + protocol + '-' + width + '.png') });
        stageReport.push({ protocol, width, openHeight, closedHeight, opening:opening.map(frame => frame.height), closing:closing.map(frame => frame.height), rapidReversal:'passed', keyboard:'passed', directory:'passed' });
      }
    }
    await sampleToggle(page, [0.4], '.stage-guide');
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.waitForFunction(() => !document.querySelector('.stage-guide.is-animating'));
    assert.equal(await page.locator('.stage-guide').first().getAttribute('open'), '');
    await page.locator('.stage-guide').first().locator('summary').click();
    assert.equal(await page.locator('.stage-guide').first().getAttribute('open'), null);
    assert.equal(await page.locator('.stage-guide').first().evaluate(card => card.getAnimations({ subtree:true }).length), 0);
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await sampleToggle(page, [0.4], '.stage-guide');
    await page.goto(origins.http + '#/paths');
    await page.locator('.method-card').first().waitFor();
    await sampleToggle(page, [0.4]);
    await page.setViewportSize({ width:390, height:871 });
    await page.waitForFunction(() => !document.querySelector('.method-card.is-animating'));
    assert.equal(await page.locator('.method-card').first().getAttribute('open'), '');
    await sampleToggle(page, [0.4]);
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.waitForFunction(() => !document.querySelector('.method-card.is-animating'));
    assert.equal(await page.locator('.method-card').first().getAttribute('open'), null);
    await page.locator('.method-card').first().locator('summary').click();
    assert.equal(await page.locator('.method-card').first().getAttribute('open'), '');
    assert.equal(await page.locator('.method-card').first().evaluate(card => card.getAnimations({ subtree:true }).length), 0);
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await sampleToggle(page, [0.4]);
    await page.evaluate(() => { location.hash = '/paths/education'; });
    await page.locator('.path-hero h1').waitFor();
    assert.equal(await page.locator('.method-card.is-animating').count(), 0);
    const link = page.locator('.stage-guide[open] [data-action="scroll-to"][data-value^="method-"]').first();
    const targetId = await link.getAttribute('data-value');
    await link.click();
    await settle(page);
    assert.equal(await page.locator('#' + targetId).getAttribute('open'), '');
    assert.equal(await page.locator('#' + targetId + '>summary').evaluate(node => node === document.activeElement), true);
    // Browsers without Web Animations retain instant native disclosure behavior.
    await page.addInitScript(() => { Element.prototype.animate = undefined; });
    await page.goto(origins.file + '#/paths');
    await page.locator('.method-card').first().locator('summary').click();
    assert.equal(await page.locator('.method-card').first().getAttribute('open'), '');
    await page.locator('.method-card').first().locator('summary').click();
    assert.equal(await page.locator('.method-card').first().getAttribute('open'), null);
    await page.goto(origins.file + '#/paths/education');
    await page.locator('.stage-guide').first().locator('summary').click();
    assert.equal(await page.locator('.stage-guide').first().getAttribute('open'), null);
    await page.locator('.stage-guide').first().locator('summary').click();
    assert.equal(await page.locator('.stage-guide').first().getAttribute('open'), '');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks:report, stages:stageReport, resize:'passed', reducedMotion:'passed', navigationCleanup:'passed', methodLinks:'passed', fallback:'passed', consoleErrors:errors }, null, 2));
    console.log('PASS: method and stage opening/closing, reversal continuity, keyboard, directory links, independent cards, responsive layouts, reduced motion, resize, routing and fallback over HTTP/file; twelve screenshots saved.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
