'use strict';
// Inspect the previously generated plan locally; no API calls are allowed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('../../tools/browser-runtime');
(async () => {
  const backup = fs.readFileSync(path.join(__dirname, 'live-browser-backup.json'), 'utf8');
  const browser = await chromium.launch(browserOptions());
  const errors = [];
  const network = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route(/^https?:\/\//, route => { network.push(new URL(route.request().url()).hostname); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../project/index.html')).href);
    await page.evaluate(text => { window.StarPath.store.replace(window.StarPath.store.parseBackup(text)); location.hash = '/growth'; }, backup);
    await page.locator('#plan-title').waitFor();
    await page.locator('#plan-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, 'saved-plan-mobile-viewport.png') });
    const note = page.getByText('硕士培养地点待核实', { exact: false }).first();
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, 'saved-campus-mobile-viewport.png') });
    const campusCount = await page.getByText('硕士培养地点待核实', { exact: false }).count();
    assert.ok(campusCount >= 3);
    assert.equal(await page.locator('.ai-school-recommendations article').count(), 3);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    const report = { checkedAt: new Date().toISOString(), liveBackupRestored: true, campusWarnings: campusCount, mobileViewport: 390, pageErrors: errors, externalRequests: network };
    fs.writeFileSync(path.join(__dirname, 'saved-plan-check.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
