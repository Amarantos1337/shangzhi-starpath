'use strict';
// node tests/alumni-motion.test.js; included in node tools/dev.js browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../tools/browser-runtime');
const root = path.resolve(__dirname, '../project');
const output = path.resolve(__dirname, '../artifacts/alumni-motion/test-temp');
const ids = ['wang-zongyu', 'shi-zhenbang', 'wang-gongming', 'chen-liang'];
const entries = ['.person-cover > a', '.person-name-row a', '.card-link', '.card-link'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch (_) { response.writeHead(400).end(); return; }
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (target === root) target = path.join(root, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(target).pipe(response);
});

async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('.alumni-motion-layer,.page-transition-snapshot'));
  assert.equal(await page.locator('.alumni-motion-hidden,.alumni-motion-anchor').count(), 0, 'real content is revealed after cleanup');
}

async function armMotion(page) {
  await page.evaluate(() => {
    window.alumniMotionReport = null;
    window.alumniMotionObserver?.disconnect();
    window.alumniMotionObserver = new MutationObserver(() => {
      const layers = [...document.querySelectorAll('.alumni-motion-layer')];
      if (!layers.length) return;
      window.alumniMotionObserver.disconnect();
      const animations = [...layers.flatMap(layer => layer.getAnimations({ subtree: true })), ...document.querySelector('main > div').getAnimations()];
      const bounds = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      animations.forEach(animation => animation.pause());
      const target = bounds('main .alumni-motion-hidden');
      const image = document.querySelector('.alumni-motion-photo > img');
      const frames = [0, 110, 220, 330, 439].map(time => {
        animations.forEach(animation => { animation.currentTime = time; });
        return { photo: bounds('.alumni-motion-photo'), bitmap: bounds('.alumni-motion-photo > img'), page: bounds('main > div'), opacity: getComputedStyle(document.querySelector('.alumni-motion-photo')).opacity };
      });
      const allIds = [...document.querySelectorAll('[id]')].map(node => node.id);
      window.alumniMotionReport = {
        direction: layers[0].dataset.direction,
        frames, target, imageRatio: image.naturalWidth / image.naturalHeight,
        durations: animations.map(animation => animation.effect.getTiming().duration),
        inaccessible: layers.every(layer => layer.inert && layer.getAttribute('aria-hidden') === 'true' && getComputedStyle(layer).pointerEvents === 'none'),
        duplicateIds: allIds.filter((id, index) => allIds.indexOf(id) !== index),
        genericAnimation: Boolean(document.querySelector('main .page-enter,.page-transition-snapshot'))
      };
      animations.forEach(animation => { animation.currentTime = 0; animation.play(); });
    });
    window.alumniMotionObserver.observe(document.body, { childList: true });
  });
}

function closeBounds(actual, expected, label, tolerance = 1) {
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) <= tolerance, label + ' ' + key + ': ' + actual[key] + ' vs ' + expected[key]);
}

async function verifyMotion(page, direction, screenshot) {
  await page.waitForFunction(() => window.alumniMotionReport !== null, null, { timeout: 5000 });
  const report = await page.evaluate(() => window.alumniMotionReport);
  assert.equal(report.direction, direction);
  assert.ok(report.durations.length >= 4);
  assert.ok(report.durations.every(duration => duration === 440), 'every motion lasts 440ms');
  assert.equal(report.inaccessible, true);
  assert.equal(report.genericAnimation, false, 'card motion does not overlap generic page motion');
  assert.deepEqual(report.duplicateIds, []);
  closeBounds(report.frames[4].photo, report.target, 'photo lands exactly in the destination image frame');
  assert.ok(report.frames.every(frame => Math.abs(frame.bitmap.width / frame.bitmap.height / report.imageRatio - 1) < .001), 'the actual photograph keeps its natural aspect ratio throughout');
  assert.ok(report.frames.every(frame => frame.opacity === '1'), 'one opaque photograph stays visible throughout');
  report.frames.forEach(frame => closeBounds(frame.page, report.frames[0].page, 'page content never scales or moves'));
  const [start, middle, end] = [report.frames[0].photo, report.frames[2].photo, report.frames[4].photo];
  for (const key of ['x', 'y', 'width', 'height']) {
    if (Math.abs(start[key] - end[key]) < 1) continue;
    assert.ok(middle[key] > Math.min(start[key], end[key]) && middle[key] < Math.max(start[key], end[key]), 'photo interpolates its ' + key + ' between the two real frames');
  }
  if (screenshot) {
    await page.evaluate(() => [...document.querySelectorAll('.alumni-motion-layer'), document.querySelector('main > div')].forEach(layer => layer.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 160; })));
    await page.screenshot({ path: path.join(output, screenshot) });
    await page.evaluate(() => [...document.querySelectorAll('.alumni-motion-layer'), document.querySelector('main > div')].forEach(layer => layer.getAnimations({ subtree: true }).forEach(animation => animation.play())));
  }
  await settled(page);
  return report;
}

async function openCard(page, id, entry = '.card-link', keyboard = false) {
  const card = page.locator('main .people-grid [data-alumni-id="' + id + '"]');
  await card.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(id => {
    const image = document.querySelector('main .people-grid [data-alumni-id="' + id + '"] img');
    return image?.complete && image.naturalWidth > 0;
  }, id);
  await settled(page);
  await card.locator(entry).focus();
  if (!keyboard) {
    // The stretched story link covers the card. Use the actual name/photo
    // coordinates so this follows the same hit testing as a user's pointer.
    const bounds = await card.locator(entry).boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    // Focus scrolling can cancel a hover transition; cancellation is a settled state too.
    await card.evaluate(node => Promise.allSettled(node.getAnimations().map(animation => animation.finished)));
  }
  // Focusing a link can start native smooth scrolling; establish a visible photo after it.
  await card.locator('.portrait').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const source = await card.locator('.portrait').boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  await armMotion(page);
  await page.evaluate(() => {
    document.addEventListener('click', event => {
      const portrait = event.target.closest('[data-alumni-id]')?.querySelector('.portrait');
      window.alumniPhotoClick = portrait ? { photo: portrait.getBoundingClientRect().toJSON(), header: document.querySelector('.site-header').getBoundingClientRect().bottom, scroll: scrollY } : null;
    }, { once: true, capture: true });
  });
  // Keyboard also avoids pointer hover offsets when comparing the two endpoints.
  if (keyboard) await page.keyboard.press('Enter');
  else {
    const bounds = await card.locator(entry).boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }
  return { source, scrollY };
}

async function assertHealthy(page) {
  const status = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    broken: [...document.querySelectorAll('main img')].filter(image => image.complete && image.naturalWidth === 0).map(image => image.getAttribute('src')),
    focusHidden: Boolean(document.activeElement.closest('.alumni-motion-layer,.alumni-motion-hidden'))
  }));
  assert.deepEqual(status, { overflow: false, broken: [], focusHidden: false });
}

async function regression(browser, origin, width, label) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // No test may use the configured, billable AI endpoint.
  await context.route('https://**/*', route => route.abort());
  try {
    // Home cards share the list's photo motion and return to their own source page.
    for (const [index, id] of ids.entries()) {
      await page.goto(origin + '#/');
      const before = await openCard(page, id, entries[index], index % 2 === 0);
      const forward = await verifyMotion(page, 'enter', index === 0 ? label + '-' + width + '-home-enter.png' : null);
      closeBounds(forward.frames[0].photo, before.source, 'home source is the clicked photograph');
      assert.equal(await page.locator('main .back-link').getAttribute('href'), '#/');
      assert.equal(await page.locator('main .back-link').textContent(), '返回校庆首页');
      await armMotion(page);
      if (index === 1) await page.locator('main .back-link').evaluate(link => link.click());
      else if (index === 2) await page.locator('[data-nav="home"]').click();
      else await page.goBack();
      const reverse = await verifyMotion(page, 'return', index === 0 ? label + '-' + width + '-home-return.png' : null);
      assert.equal(new URL(page.url()).hash, '#/');
      closeBounds(reverse.frames[4].photo, before.source, 'returns to the home photograph', index % 2 === 0 ? 1 : 4.1);
      assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before.scrollY) <= 1, 'restores home scroll');
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-alumni-id]')?.dataset.alumniId), id);
      await assertHealthy(page);
      if (index === 0) {
        await armMotion(page);
        await page.goForward();
        await verifyMotion(page, 'enter');
        await armMotion(page);
        await page.goBack();
        await verifyMotion(page, 'return');
      }
    }
    // Choosing the alumni navigation explicitly still opens the exploration list.
    await page.goto(origin + '#/');
    await openCard(page, ids[0], '.card-link', true);
    await verifyMotion(page, 'enter');
    await armMotion(page);
    await page.locator('[data-nav="alumni"]').click();
    await settled(page);
    assert.equal(new URL(page.url()).hash, '#/alumni');
    assert.equal(await page.locator('#alumni-results').count(), 1);
    assert.equal(await page.evaluate(() => window.alumniMotionReport), null);

    for (const [index, id] of ids.entries()) {
      await page.goto(origin + '#/alumni');
      const before = await openCard(page, id, entries[index], index % 2 === 0);
      const forward = await verifyMotion(page, 'enter', index !== 1 ? label + '-' + width + '-' + id + '-enter.png' : null);
      closeBounds(forward.frames[0].photo, before.source, 'source is the clicked card photograph');
      assert.equal(await page.locator('main [data-alumni-profile]').getAttribute('data-alumni-profile'), id);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      await armMotion(page);
      if (index === 1) await page.locator('main .back-link').evaluate(link => link.click());
      else if (index === 2) await page.locator('[data-nav="alumni"]').click();
      else await page.goBack();
      const reverse = await verifyMotion(page, 'return', index !== 1 ? label + '-' + width + '-' + id + '-return.png' : null);
      // The existing mouse hover lift is 4px and may end when the pointer moves to a return control.
      closeBounds(reverse.frames[4].photo, before.source, 'returns to the original photograph', index % 2 === 0 ? 1 : 4.1);
      assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before.scrollY) <= 1, 'restores list scroll');
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-alumni-id]')?.dataset.alumniId), id);
      await assertHealthy(page);
      if (index === 0) {
        await armMotion(page);
        await page.goForward();
        await verifyMotion(page, 'enter');
        // A photograph that has scrolled offscreen must not be invented in the middle of the page.
        await page.evaluate(() => window.scrollTo({ top: 1050, behavior: 'instant' }));
        await armMotion(page);
        await page.goBack();
        await settled(page);
        assert.equal(await page.evaluate(() => window.alumniMotionReport), null);
        assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before.scrollY) <= 1);
      }
    }

    // Reading a card's text while its photo is above the viewport must preserve that scroll.
    if (width === 390) {
      await page.goto(origin + '#/alumni');
      const story = page.locator('main [data-alumni-id="shi-zhenbang"] .card-link');
      await story.evaluate(link => {
        link.focus({ preventScroll: true });
        const top = document.querySelector('.site-header').getBoundingClientRect().bottom + 24;
        window.scrollTo({ top: window.scrollY + link.getBoundingClientRect().top - top, behavior: 'instant' });
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      const sourceScroll = await page.evaluate(() => window.scrollY);
      assert.equal(await page.locator('main [data-alumni-id="shi-zhenbang"] .portrait').evaluate(photo => photo.getBoundingClientRect().bottom <= document.querySelector('.site-header').getBoundingClientRect().bottom), true);
      await armMotion(page);
      await page.keyboard.press('Enter');
      await page.locator('main [data-alumni-profile]').waitFor();
      await settled(page);
      assert.equal(await page.evaluate(() => window.alumniMotionReport), null);
      await page.goBack();
      await settled(page);
      assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - sourceScroll) <= 1, 'offscreen source does not cause a recenter on return');
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-alumni-id]')?.dataset.alumniId), ids[1]);
    }

    // Separate history entries retain their own filters and source identities.
    await page.goto(origin + '#/alumni');
    await page.locator('#alumni-query').fill('王宗宇');
    await openCard(page, ids[0], '.card-link', true);
    await verifyMotion(page, 'enter');
    await page.locator('main .back-link').click();
    await settled(page);
    await page.locator('#alumni-query').fill('石振邦');
    await openCard(page, ids[1], '.person-name-row a', true);
    await verifyMotion(page, 'enter');
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('#alumni-query').inputValue(), '石振邦');
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('main [data-alumni-profile]').getAttribute('data-alumni-profile'), ids[0]);
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('#alumni-query').inputValue(), '王宗宇');

    // Favorite, field, direction and query filters all survive the round trip.
    await page.goto(origin + '#/alumni');
    await page.locator('[data-action="favorite"][data-person="wang-zongyu"]').click();
    await page.locator('[data-action="filter-favorites"]').click();
    const field = await page.evaluate(() => window.StarPath.data.alumni[0].field);
    await page.locator('#field-filter').selectOption(field);
    await page.locator('[data-action="filter-direction"][data-value="技术就业"]').click();
    await page.locator('#alumni-query').fill('王宗宇');
    await openCard(page, ids[0], '.card-link', true);
    await verifyMotion(page, 'enter');
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('#alumni-query').inputValue(), '王宗宇');
    assert.equal(await page.locator('#field-filter').inputValue(), field);
    assert.equal(await page.locator('[data-action="filter-direction"][data-value="技术就业"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-action="filter-favorites"]').getAttribute('aria-pressed'), 'true');
    await openCard(page, ids[0], '.card-link', true);
    await verifyMotion(page, 'enter');
    await page.locator('main [data-action="favorite"]').click();
    assert.equal(new URL(page.url()).hash, '#/alumni/' + ids[0]);
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('#alumni-results .person-card').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'alumni-query');

    // Refresh and direct entry intentionally discard the animation origin.
    await page.goto(origin + '#/alumni');
    await page.locator('[data-action="reset-filters"]').first().click();
    await openCard(page, ids[0], '.card-link', true);
    await settled(page);
    await page.reload();
    await armMotion(page);
    await page.locator('main .back-link').click();
    await settled(page);
    assert.equal(await page.evaluate(() => window.alumniMotionReport), null);
    await page.goto(origin + '#/alumni/' + ids[1]);
    await armMotion(page);
    await page.locator('[data-nav="alumni"]').click();
    await settled(page);
    assert.equal(await page.evaluate(() => window.alumniMotionReport), null);

    // Cancelling an in-flight transition must never leave hidden content behind.
    await page.goto(origin + '#/alumni');
    await openCard(page, ids[3], '.card-link', true);
    await page.waitForFunction(() => window.alumniMotionReport !== null);
    await page.goBack();
    await settled(page);
    assert.equal(new URL(page.url()).hash, '#/alumni');
    await openCard(page, ids[3], '.card-link', true);
    await page.waitForFunction(() => window.alumniMotionReport !== null);
    await page.setViewportSize({ width: width === 390 ? 844 : 1000, height: 760 });
    await settled(page);
    await armMotion(page);
    await page.goBack();
    await verifyMotion(page, 'return');
    await assertHealthy(page);
    await page.setViewportSize({ width, height: 900 });
    await openCard(page, ids[0], '.card-link', true);
    await page.waitForFunction(() => window.alumniMotionReport !== null);
    await page.locator('[data-nav="history"]').click();
    await settled(page);
    assert.equal(new URL(page.url()).hash, '#/history');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
    await page.goto(origin + '#/alumni');
    await openCard(page, ids[0], '.card-link', true);
    await page.waitForFunction(() => window.alumniMotionReport !== null);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settled(page);
    await page.goBack();
    await settled(page);
    await page.locator('main [data-alumni-id="wang-zongyu"] .card-link').focus();
    const savedScroll = await page.evaluate(() => window.scrollY);
    await armMotion(page);
    await page.keyboard.press('Enter');
    await page.locator('main [data-alumni-profile]').waitFor();
    await settled(page);
    assert.equal(await page.evaluate(() => window.alumniMotionReport), null);
    await page.goBack();
    await settled(page);
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - savedScroll) <= 1);
    await assertHealthy(page);
    await page.goto(origin + '#/');
    const homeBefore = await openCard(page, ids[0], '.card-link', true);
    await page.locator('main [data-alumni-profile]').waitFor();
    await settled(page);
    assert.equal(await page.evaluate(() => window.alumniMotionReport), null);
    await page.locator('main .back-link').click();
    await settled(page);
    assert.equal(new URL(page.url()).hash, '#/');
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - homeBefore.scrollY) <= 1);
    await assertHealthy(page);
    assert.deepEqual(errors, []);
    console.log('Alumni motion verified: ' + label + ', ' + width + 'px; home/list cards, four profiles, history, filters, focus, cancellation and reduced motion');
  } catch (error) {
    console.error('Failed alumni scenario:', label, width, new URL(page.url()).hash, errors, await page.evaluate(() => window.alumniPhotoClick));
    await page.screenshot({ path: path.join(output, label + '-' + width + '-failure.png') });
    throw error;
  } finally { await context.close(); }
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch(browserOptions());
  try {
    for (const [origin, label] of [[base, 'http'], [pathToFileURL(path.join(root, 'index.html')).href, 'file']]) {
      for (const width of [1440, 390]) await regression(browser, origin, width, label);
    }
    const context = await browser.newContext();
    await context.addInitScript(() => { Element.prototype.animate = undefined; });
    const page = await context.newPage();
    await page.goto(base + '#/alumni');
    await page.locator('main [data-alumni-id="wang-zongyu"] .card-link').click();
    await page.locator('main [data-alumni-profile]').waitFor();
    await settled(page);
    await page.goBack();
    await settled(page);
    assert.equal(await page.locator('.alumni-motion-layer').count(), 0);
    await context.close();
    console.log('Alumni motion fallback verified without Web Animations');
  } finally { await browser.close(); server.close(); }
}

run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
