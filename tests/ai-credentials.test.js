'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../project/js/ai-config.js'), 'utf8');
function load(saved = new Map(), blocked = false) {
  const context = vm.createContext({ window: { StarPath: {} }, localStorage: {
    getItem(key) { if (blocked) throw new Error('Unavailable'); return saved.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('Unavailable'); saved.set(key, value); },
    removeItem(key) { if (blocked) throw new Error('Unavailable'); saved.delete(key); }
  } });
  vm.runInContext(source, context);
  return context.window.StarPath;
}
test('credentials persist across reloads, replace and clear separately from growth data', () => {
  const saved = new Map([['growth-data', '{"plans":[]}']]);
  const first = load(saved);
  assert.equal(first.aiConfig.apiKey, undefined);
  assert.equal(first.aiCredentials.status().configured, false);
  first.aiCredentials.save('  test-first-key  ');
  const second = load(saved).aiCredentials;
  assert.equal(second.get(), 'test-first-key');
  second.save('test-replacement');
  assert.equal(first.aiCredentials.get(), 'test-replacement');
  for (const invalid of ['', '   ', 'has space', 'line\nbreak', 'x'.repeat(513), null]) {
    assert.throws(() => second.save(invalid), /有效的 API Key/);
    assert.equal(second.get(), 'test-replacement');
  }
  second.clear();
  assert.equal(first.aiCredentials.get(), '');
  assert.equal(saved.size, 1);
  assert.equal(saved.get('growth-data'), '{"plans":[]}');
});
test('blocked browser storage retains a key only in memory and reports clearing failures', () => {
  const credentials = load(new Map(), true).aiCredentials;
  assert.equal(credentials.get(), '');
  credentials.save('test-in-memory');
  assert.equal(credentials.get(), 'test-in-memory');
  assert.equal(credentials.status().memoryOnly, true);
  assert.equal(load(new Map(), true).aiCredentials.get(), '');
  assert.throws(() => credentials.clear(), /浏览器暂时无法清除/);
  assert.equal(credentials.get(), '');
});
test('generation requires an explicit key and never falls back to a configured credential', async () => {
  let requests = 0;
  const context = vm.createContext({ window: { StarPath: { aiConfig: { apiKey: 'legacy-ignored' } } }, URL, AbortController, DOMException, setTimeout, clearTimeout,
    fetch: () => { requests++; throw new Error('Unexpected network request'); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../project/js/ai.js'), 'utf8'), context);
  for (const apiKey of [undefined, '', 'has space', 'x'.repeat(513)]) {
    await assert.rejects(context.window.StarPath.ai.generate({}, { apiKey }), /有效的 DeepSeek API Key/);
  }
  assert.equal(requests, 0);
});
