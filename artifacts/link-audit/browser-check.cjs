'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Amarantos/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project = path.resolve('project');
const output = path.resolve('artifacts/link-audit');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = path.resolve(project, '.' + pathname);
  if (file === project || (file.startsWith(project + path.sep) && fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
  if (!file.startsWith(project + path.sep) || !fs.existsSync(file)) return response.writeHead(404).end();
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/plain', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const localFiles = new Set();
  const failures = [];
  let anchors = 0;
  let visits = 0;
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    await page.goto(base);
    const routes = await page.evaluate(() => {
      const { data } = window.StarPath;
      return ['#/', '#/history', '#/alumni', '#/paths', '#/growth', '#/about',
        ...data.alumni.map(item => '#/alumni/' + item.id),
        ...data.routes.map(item => '#/paths/' + item.id),
        ...data.practiceProjects.map(item => '#/practice/' + item.id)];
    });
    for (const origin of [base, pathToFileURL(path.join(project, 'index.html')).href]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const hash of routes) {
          await page.goto(origin + hash);
          await page.locator('main h1').waitFor();
          assert.equal(await page.locator('main .not-found').count(), 0, hash);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, hash);
          const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({ raw: node.getAttribute('href'), url: node.href })));
          for (const link of links) {
            anchors += 1;
            assert.ok(link.raw.trim() && link.raw !== '#', 'Empty link at ' + hash);
            const target = new URL(link.url);
            if (target.origin !== new URL(origin).origin || /^https?:/.test(target.protocol) && target.origin !== new URL(base).origin) continue;
            if (target.protocol === 'file:' && !target.pathname.startsWith(new URL(origin).pathname.replace(/[^/]+$/, ''))) throw new Error('Local link escapes project: ' + link.raw);
            if (target.hash.startsWith('#/')) assert.ok(routes.includes(target.hash), 'Unknown route ' + target.hash);
            else if (target.hash) assert.ok(await page.locator('[id="' + decodeURIComponent(target.hash.slice(1)) + '"]').count(), 'Missing anchor ' + link.raw);
            if (target.protocol === 'http:' && target.origin === new URL(base).origin) localFiles.add(target.pathname);
          }
          visits += 1;
        }
      }
    }
    for (const pathname of localFiles) {
      const response = await page.request.get(new URL(pathname, base).href);
      assert.equal(response.status(), 200, 'Local HTTP target ' + pathname);
    }
    for (const file of ['materials/local-server/starter/site/index.html', 'materials/local-server/reference/site/index.html']) {
      await page.goto(new URL(file, base).href);
      await page.getByRole('link', { name: '查看说明' }).click();
      assert.equal(await page.locator('h1').innerText(), '说明页已找到');
    }
    assert.deepEqual(failures, []);
    const report = { routes: routes.length, pageVisits: visits, anchorsChecked: anchors, localHttpFiles: [...localFiles].sort(), errors: failures, externalScope: '外部网址未执行可用性探测；本次检查本地文件、路由、资源及文档链接' };
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ routes: routes.length, visits, anchors, httpFiles: localFiles.size, errors: failures.length }));
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
