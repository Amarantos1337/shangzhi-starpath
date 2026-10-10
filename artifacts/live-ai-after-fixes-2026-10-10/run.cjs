'use strict';
// Run the repository's paid browser check with a submission-specific profile.
// Only paths, profile values and additional browser assertions are changed in memory.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const target = path.resolve(__dirname, '../../tools/deepseek-smoke.js');
const output = __dirname;
let source = fs.readFileSync(target, 'utf8');
function replaceOnce(before, after) {
  if (!source.includes(before)) throw new Error('Smoke tool changed; review the wrapper before running.');
  source = source.replace(before, after);
}
replaceOnce("const output = path.join(__dirname, '../artifacts/ai-plan', freshman ? 'freshman' : '.');", 'const output = ' + JSON.stringify(output) + ';');
replaceOnce("major: '计算机科学与技术', baseline: '英语需要加强，数学刚开始复习', goal: freshman ? '' : '山东大学，计算机相关专业', startDate: '2026-10-01'", "major: '电子信息工程', baseline: '英语需要加强，数学刚开始复习；计算机基础需补齐', goal: '想在济南读研，只考虑公办院校，目标是计算机相关硕士；希望跨专业升学', startDate: '2026-10-10'");
replaceOnce('const efforts = [];', 'const efforts = [];\n      const requestChecks = [];\n      const responses = [];');
replaceOnce("const efforts = [];", `await page.addInitScript(() => {
        window.__liveTrace = [];
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
          const response = await originalFetch(...args);
          const body = JSON.parse(args[1].body);
          const entry = { stage: body.tools ? 'search' : 'generate', status: response.status, events: {}, stopReasons: [], contentTypes: [], usage: {} };
          window.__liveTrace.push(entry);
          const copy = response.clone();
          (async () => {
            const reader = copy.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            function record(value) {
              if (value.type) entry.events[value.type] = (entry.events[value.type] || 0) + 1;
              if (value.delta && value.delta.stop_reason) entry.stopReasons.push(value.delta.stop_reason);
              if (value.stop_reason) entry.stopReasons.push(value.stop_reason);
              if (value.content_block && value.content_block.type) entry.contentTypes.push(value.content_block.type);
              if (value.usage) Object.assign(entry.usage, value.usage);
              if (value.error) entry.errorType = value.error.type;
            }
            try {
              while (true) {
                const item = await reader.read();
                buffer += decoder.decode(item.value || new Uint8Array(), { stream: !item.done });
                let match;
                while ((match = /\\r?\\n\\r?\\n/.exec(buffer))) {
                  const frame = buffer.slice(0, match.index);
                  buffer = buffer.slice(match.index + match[0].length);
                  const data = frame.split(/\\r?\\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\\n');
                  if (data && data !== '[DONE]') { try { record(JSON.parse(data)); } catch (_) {} }
                }
                if (item.done) { if (buffer.trim().startsWith('{')) { try { record(JSON.parse(buffer)); } catch (_) {} } break; }
              }
            } catch (error) { entry.readError = error.name; }
            finally { reader.releaseLock(); }
          })();
          return response;
        };
      });
      const efforts = [];`);
replaceOnce("efforts.push({ stage: body.tools ? 'search' : 'generate', effort: body.output_config.effort });", `efforts.push({ stage: body.tools ? 'search' : 'generate', effort: body.output_config.effort });
          if (body.tools) {
            const payload = JSON.parse(body.messages[0].content);
            requestChecks.push({ task: payload.task.id, currentMajor: payload.profile.major,
              targetGoalPreserved: payload.profile.goal === '想在济南读研，只考虑公办院校，目标是计算机相关硕士；希望跨专业升学' });
          }
        `);
replaceOnce("page.on('pageerror', error => errors.push(error.name));", `page.on('pageerror', error => errors.push(error.name));
      page.on('response', response => {
        if (response.url() === config.endpoint && response.request().method() === 'POST') responses.push({ status: response.status() });
      });`);
replaceOnce("console.error(await page.locator('#modal-error').innerText());", `const failure = { checkedAt: new Date().toISOString(), error: await page.locator('#modal-error').innerText(), effort: efforts, requestChecks, responses, trace: await page.evaluate(() => window.__liveTrace), pageErrors: errors };
        fs.writeFileSync(path.join(output, 'live-browser-failure.json'), JSON.stringify(failure, null, 2));
        console.error(JSON.stringify(failure, null, 2));`);
replaceOnce('const report = { origin:', `const parsed = await page.evaluate(() => {
        const store = window.StarPath.store;
        return store.parseBackup(store.exportBackup());
      });
      if (!parsed || parsed.plans.length !== 1) throw new Error('Live plan backup round-trip failed.');
      if (!requestChecks.length || requestChecks.some(item => !item.targetGoalPreserved || item.currentMajor !== '电子信息工程')) throw new Error('Research target goal was not preserved.');
      const title = await page.locator('#plan-title').innerText();
      await page.reload();
      await page.locator('#plan-title').waitFor();
      if (await page.locator('#plan-title').innerText() !== title) throw new Error('Live plan refresh persistence failed.');
      const afterReload = JSON.parse(await page.evaluate(() => window.StarPath.store.exportBackup()));
      if (JSON.stringify(afterReload.plans) !== JSON.stringify(JSON.parse(backup).plans)) throw new Error('Live plan changed after reload.');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, 'live-browser-saved-390.png'), fullPage: true });
      const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (mobile.scrollWidth > mobile.width) throw new Error('Live plan mobile horizontal overflow.');
      const report = { checkedAt: new Date().toISOString(), input: { level: '本科', grade: '大一', major: '电子信息工程', goal: '想在济南读研，只考虑公办院校，目标是计算机相关硕士；希望跨专业升学', startDate: '2026-10-10' }, requestChecks, responses, refreshPersistence: true, backupRoundTrip: true, mobile, origin:`);
replaceOnce("if (errors.length || efforts.some(request => request.effort !== (request.stage === 'search' ? 'high' : 'low'))) process.exitCode = 1;", "if (errors.length || efforts.some(request => request.effort !== (request.stage === 'search' ? 'high' : 'low')) || responses.some(response => response.status !== 200)) process.exitCode = 1;");
process.argv.push('--browser', '--freshman');
const runner = new Module(target, module);
runner.filename = target;
runner.paths = Module._nodeModulePaths(path.dirname(target));
runner._compile(source, target);
