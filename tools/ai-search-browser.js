'use strict';
// Real transport probes plus saved-result UI replay; not extra complete AI samples.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, browserOptions } = require('./browser-runtime');
async function main() {
  const dir = path.resolve(process.argv[2]);
  const root = path.resolve(__dirname, '../project');
  if (!dir.startsWith(path.resolve(__dirname, '../artifacts') + path.sep)) throw new Error('无效输出目录。');
  const key = require('./deepseek-config')().apiKey;
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'direct.json'), 'utf8'));
  const sample = report.runs.find(run => run.success);
  const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(browserOptions());
  const results = [];
  try {
    for (const [origin, url] of [['file', pathToFileURL(path.join(root, 'index.html')).href], ['http', 'http://127.0.0.1:' + server.address().port + '/']]) {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const result = { origin, width, errors, startedAt: new Date().toISOString() }; results.push(result);
        try {
          await page.goto(url + '#/paths/education');
          if (width === 1440) result.transport = await page.evaluate(async ({ credential, fetchUrl }) => {
            const results = [];
            for (const [name, body] of [['search', { query: 'site:yz.chsi.com.cn 全国硕士研究生招生工作管理规定', count: 1, need_content: true }], ['fetch', { url: fetchUrl }]]) {
              const start = performance.now();
              try {
                const response = await fetch('https://api.deepseek.com/v1/tools/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
                const value = await response.json();
                results.push({ name, status: response.status, durationMs: performance.now() - start, resultCount: value.results?.length, hasContent: !!value.content });
              } catch (error) { results.push({ name, error: error.name, durationMs: performance.now() - start }); }
            }
            return results;
          }, { credential: key, fetchUrl: sample?.plan.generation.sources[0]?.url || 'https://yz.chsi.com.cn/' });
          if (sample) {
            await page.getByRole('button', { name: '使用这条路线', exact: true }).click();
            await page.locator('#ai-api-key').fill('ui-replay-no-real-key');
            await page.locator('[name="level"]').selectOption('本科');
            await page.locator('[name="grade"]').selectOption('大四');
            for (const [name, value] of Object.entries({ major: '计算机科学与技术', baseline: '英语需要加强，数学刚开始复习', goal: '山东大学，计算机相关专业', startDate: '2026-10-01' })) await page.locator('[name="' + name + '"]').fill(value);
            await page.evaluate(plan => {
              window.StarPath.ai.generate = async (_, options) => {
                options.onStage('search');
                options.onProgress({ tasks: [{ id: 'policy', title: '国家政策与考试日期', status: 'searching' }], searches: 1, sources: plan.generation.sources, summaries: ['浏览器回放已完成的真实测试结果。'], searchComplete: false, learning: null });
                await new Promise(resolve => setTimeout(resolve, 800));
                options.onStage('generate');
                return plan;
              };
            }, sample.plan);
            await page.getByRole('button', { name: '检索并生成计划', exact: true }).click();
            await page.locator('[data-form="ai-save"]').waitFor();
            await page.screenshot({ path: path.join(dir, origin + '-' + width + '-preview.png'), fullPage: true });
            await page.getByRole('button', { name: '保存到我的成长', exact: true }).click();
            await page.locator('#plan-title').waitFor();
            await page.reload(); await page.locator('#plan-title').waitFor(); result.savedAndReloaded = true;
            await page.screenshot({ path: path.join(dir, origin + '-' + width + '-saved.png'), fullPage: true });
          }
          result.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          result.brokenImages = await page.locator('img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth === 0).map(image => image.getAttribute('src')));
        } catch (error) { result.error = error.message.replaceAll(key, '[redacted]'); }
        result.endedAt = new Date().toISOString();
        fs.writeFileSync(path.join(dir, 'browser.json'), JSON.stringify(results, null, 2).replaceAll(key, '[redacted]'));
        await context.close();
      }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  console.log(JSON.stringify(results));
}
main().catch(error => { console.error(String(error.message).replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')); process.exitCode = 1; });
