'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Amarantos/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve('project');
const output = path.resolve('artifacts/about-readme');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) return response.writeHead(404).end();
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
  response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(response);
});
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = [];
  const errors = [];
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const origins = { file: pathToFileURL(path.join(root, 'index.html')).href, http: 'http://127.0.0.1:' + server.address().port + '/index.html' };
    for (const [name, origin] of Object.entries(origins)) {
      for (const width of [1440, 1042, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + '#/about');
        await page.locator('.about-readme').waitFor();
        const result = await page.evaluate(() => {
          const article = document.querySelector('.about-readme');
          const template = document.querySelector('#about-readme').content.querySelector('article');
          const restored = article.cloneNode(true);
          restored.querySelectorAll('.copyable-code').forEach(wrapper => wrapper.replaceWith(wrapper.querySelector('pre')));
          const last = document.querySelector('.about-sections').lastElementChild;
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            exactHtml: restored.innerHTML === template.innerHTML,
            copyButtons: article.querySelectorAll('.code-copy-button').length,
            displayOnlyBlocks: article.querySelectorAll('.code-display-only').length,
            firstBlockHeight: article.querySelector('.copyable-code').getBoundingClientRect().height,
            codeAlignment: [...article.querySelectorAll('.copyable-code')].map(wrapper => {
              const frame = wrapper.getBoundingClientRect();
              const code = wrapper.querySelector('code').getBoundingClientRect();
              const button = wrapper.querySelector('button')?.getBoundingClientRect();
              const singleLine = !wrapper.querySelector('code').textContent.includes('\n');
              return {
                singleLine,
                topGap: code.top - frame.top,
                bottomGap: frame.bottom - code.bottom,
                buttonCenterOffset: singleLine ? (button.top + button.height / 2) - (code.top + code.height / 2) : null
              };
            }),
            lastTitle: last.querySelector('h2').textContent,
            lastParagraphs: [...last.querySelectorAll('p')].map(node => node.textContent),
            tables: article.querySelectorAll('table').length,
            headings: article.querySelectorAll('h2, h3, h4').length,
            codeBlocks: article.querySelectorAll('pre').length,
            brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).length,
            localLinks: [...article.querySelectorAll('a')].filter(a => a.getAttribute('href').startsWith('index.html#')).length
          };
        });
        assert.equal(result.overflow, false);
        assert.equal(result.exactHtml, true);
        assert.equal(result.lastTitle, '你的数据，由你保管');
        const preserved = fs.readFileSync(path.join(output, 'preserved-section.txt'), 'utf8');
        assert.deepEqual(result.lastParagraphs, [...preserved.matchAll(/<p>(.*?)<\/p>/g)].map(match => match[1]));
        assert.equal(result.tables, 7);
        assert.equal(result.codeBlocks, 7);
        assert.equal(result.copyButtons, 5);
        assert.equal(result.displayOnlyBlocks, 2);
        assert.equal(await page.locator('.code-display-only button').count(), 0);
        assert.ok(result.firstBlockHeight <= 56, '单行命令框应保持紧凑');
        for (const block of result.codeAlignment) {
          assert.ok(Math.abs(block.topGap - block.bottomGap) < 1, '代码框上下留白应对称');
          if (block.singleLine) assert.ok(Math.abs(block.buttonCenterOffset) < 1, '单行文字与复制按钮应上下居中');
        }
        assert.equal(result.brokenImages, 0);
        assert.equal(result.localLinks, 8);
        const expectedCode = [...fs.readFileSync(path.join(root, 'README.md'), 'utf8').matchAll(/```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g)].map(match => match[1].replace(/\r\n/g, '\n').trimEnd());
        assert.deepEqual(await page.locator('.about-readme pre').allTextContents(), expectedCode);
        const copyableCode = [0, 1, 4, 5, 6].map(index => expectedCode[index]);
        for (let index = 0; index < 5; index += 1) {
          const button = page.locator('.about-readme .code-copy-button').nth(index);
          await button.focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(index => document.querySelectorAll('.about-readme .code-copy-button')[index].textContent === '已复制', index);
          assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), copyableCode[index]);
        }
        if (name === 'file') {
          await page.screenshot({ path: path.join(output, 'about-' + width + '-top.png') });
          await page.locator('.about-readme-table').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, 'about-' + width + '-table.png') });
          await page.locator('.about-sections>section').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, 'about-' + width + '-bottom.png') });
          await page.locator('.about-readme .copyable-code').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, 'about-' + width + '-copy.png') });
          await page.locator('.code-display-only').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, 'about-' + width + '-structure.png') });
          await page.locator('.code-display-only').nth(1).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, 'about-' + width + '-flow.png') });
        }
        await page.locator('.about-readme a[href="index.html#/history"]').click();
        await page.locator('.history-page').waitFor();
        await page.goBack();
        await page.locator('.about-readme').waitFor();
        await page.locator('.about-sections>section a[href="#/growth"]').click();
        await page.waitForURL('**#/growth');
        await page.goBack();
        await page.locator('.about-readme').waitFor();
        await page.reload();
        await page.locator('.about-readme').waitFor();
        report.push({ origin: name, width, ...result, navigation: 'passed', refresh: 'passed' });
      }
    }
    await page.goto(origins.file + '#/about');
    await page.locator('.about-readme').waitFor();
    await page.evaluate(() => {
      window.savedClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await page.locator('.code-copy-button').first().click();
    await page.waitForFunction(() => document.querySelector('.code-copy-button').textContent === '已复制');
    assert.equal(await page.evaluate(() => window.savedClipboard.readText()), 'python -m http.server 8765 --bind 127.0.0.1');
    assert.equal(await page.locator('textarea[aria-hidden="true"]').count(), 0);
    assert.equal(await page.locator('.code-copy-button').first().evaluate(button => button === document.activeElement), true);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
    });
    await page.locator('.code-copy-button').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.code-copy-button')[1].textContent === '已复制');
    assert.equal(await page.evaluate(() => window.savedClipboard.readText()), 'python -m http.server 8765 --bind 127.0.0.1 --directory project');
    await page.evaluate(() => { document.execCommand = () => false; });
    await page.locator('.code-copy-button').nth(2).click();
    assert.equal(await page.locator('#toast').innerText(), '未能复制，请选中文本后手动复制。');
    for (const route of ['#/practice/campus-guide', '#/practice/study-stats', '#/practice/local-server', '#/paths/competition']) {
      await page.goto(origins.file + route);
      await page.locator('main h1').waitFor();
      assert.equal(await page.locator('main pre').count(), await page.locator('main .code-copy-button').count());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ report, errors, copyChecks: '真实剪贴板、键盘复制、API 不可用、权限拒绝回退、复制失败提示及其他示例框通过' }, null, 2));
    console.log(JSON.stringify({ checks: report.length, tables: report[0].tables, codeBlocks: report[0].codeBlocks, errors: errors.length }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
