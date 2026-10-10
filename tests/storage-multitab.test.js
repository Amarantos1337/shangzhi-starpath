'use strict';
// Deterministic shared-storage regression: node --test tests/storage-multitab.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const key = 'shangzhi-starpath:v1';
const scripts = ['data', 'learning', 'storage'].map(name => fs.readFileSync(path.resolve(__dirname, '../project/js/' + name + '.js'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

function sharedTabs() {
  const saved = new Map();
  let blocked = false;
  function open() {
    let writesBlocked = false;
    const listeners = new Map();
    const changes = [];
    const window = {
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatchEvent(event) { changes.push(event); }
    };
    const context = vm.createContext({ window, TextEncoder,
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      localStorage: {
        getItem(name) { if (blocked) throw new Error('Unavailable'); return saved.get(name) ?? null; },
        setItem(name, value) { if (blocked || writesBlocked) throw new Error('Unavailable'); saved.set(name, value); },
        removeItem(name) { if (blocked) throw new Error('Unavailable'); saved.delete(name); }
      }
    });
    scripts.forEach(script => vm.runInContext(script, context));
    return { store: window.StarPath.store, changes,
      blockWrites(value = true) { writesBlocked = value; },
      deliver(type = 'storage', event = { key }) { listeners.get(type)(event); } };
  }
  return { saved, open, block() { blocked = true; }, restore() { blocked = false; } };
}

test('stale tabs preserve new plans and both favorites without storage-event delivery', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  const first = b.store.createPlan(null, { title: 'B 新计划' });
  a.store.toggleFavorite('chen-liang');
  const second = a.store.createPlan('competition');
  b.store.toggleFavorite('wang-zongyu');
  const persisted = JSON.parse(shared.saved.get(key));
  assert.deepEqual(persisted.favorites.sort(), ['chen-liang', 'wang-zongyu']);
  assert.deepEqual(new Set(persisted.plans.map(plan => plan.id)), new Set([first.id, second.id]));
  assert.deepEqual(plain(shared.open().store.get()), persisted);
});

test('two tabs retain distinct plan/task edits and never resurrect deleted records', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const created = a.store.createPlan('competition');
  const b = shared.open();
  b.store.editPlan(created.id, plan => { plan.tasks[0].completed = true; });
  a.store.editPlan(created.id, plan => { plan.tasks[1].dueDate = '2026-10-20'; plan.title = 'A 的标题'; });
  b.store.editPlan(created.id, plan => { plan.goal = 'B 的目标'; plan.tasks.push({ id: 'extra-task', title: '新任务', stage: '新阶段', dueDate: '', completed: false }); });
  const plan = a.store.get().plans[0];
  assert.equal(plan.title, 'A 的标题');
  assert.equal(plan.goal, 'B 的目标');
  assert.equal(plan.tasks[0].completed, true);
  assert.equal(plan.tasks[1].dueDate, '2026-10-20');
  a.store.editPlan(created.id, entry => { entry.tasks = entry.tasks.filter(task => task.id !== 'extra-task'); });
  const before = shared.saved.get(key);
  assert.throws(() => b.store.editPlan(created.id, entry => {
    const task = entry.tasks.find(item => item.id === 'extra-task');
    if (!task) throw new Error('这项任务已不存在。');
    task.title = '旧输入';
  }), /已不存在/);
  assert.equal(shared.saved.get(key), before);
  a.store.deletePlan(created.id);
  assert.throws(() => b.store.editPlan(created.id, entry => { entry.title = '旧输入'; }), /已不存在/);
  assert.equal(b.store.get().plans.length, 0);
});

test('write-time version changes reapply only the current operation to newest data', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  let calls = 0;
  a.store.update(draft => {
    draft.favorites.push('chen-liang');
    if (calls++ === 0) b.store.createPlan(null, { title: '写入中新增' });
  });
  const persisted = JSON.parse(shared.saved.get(key));
  assert.equal(calls, 2);
  assert.equal(persisted.plans[0].title, '写入中新增');
  assert.deepEqual(persisted.favorites, ['chen-liang']);
});

test('queued storage events and focus read current data and publish external changes', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  b.store.createPlan(null, { title: '第一个版本' });
  const oldRaw = shared.saved.get(key);
  b.store.createPlan(null, { title: '最新版本' });
  a.deliver('storage', { key, newValue: oldRaw });
  assert.equal(a.changes.at(-1).detail.external, true);
  assert.equal(a.store.get().plans.length, 2);
  const count = a.changes.length;
  a.deliver('storage', { key: key + ':availability' });
  assert.equal(a.changes.length, count);
  b.store.toggleFavorite('chen-liang');
  a.deliver('focus');
  assert.equal(a.changes.length, count + 1);
  assert.deepEqual(plain(a.store.get().favorites), ['chen-liang']);
});

test('external corrupt or removed storage preserves session records and raw recovery', () => {
  for (const raw of ['{broken', null]) {
    const shared = sharedTabs();
    const a = shared.open();
    a.store.createPlan(null, { title: '需要保留' });
    if (raw === null) shared.saved.delete(key); else shared.saved.set(key, raw);
    a.deliver('storage', { key: raw === null ? null : key });
    assert.equal(a.store.status(), raw === null ? 'session' : 'damaged');
    assert.equal(a.store.get().plans[0].title, '需要保留');
    assert.equal(a.store.toggleFavorite('chen-liang'), false);
    assert.equal(shared.saved.get(key) ?? null, raw);
    assert.equal(JSON.parse(a.store.exportBackup()).plans.length, 1);
    assert.equal(a.store.damagedRaw(), raw);
    const backup = a.store.parseBackup(a.store.exportBackup());
    assert.equal(a.store.replace(backup), true);
    assert.equal(a.store.status(), 'persistent');
  }
});

test('backup replacement remains explicit and atomic; invalid backup and storage failure retain records', () => {
  const shared = sharedTabs();
  const a = shared.open();
  a.store.createPlan(null);
  const backup = a.store.parseBackup(a.store.exportBackup());
  const b = shared.open();
  b.store.createPlan('career');
  const before = shared.saved.get(key);
  assert.throws(() => a.store.parseBackup('{broken'));
  assert.throws(() => a.store.replace({ version: 1, favorites: [], plans: [null] }));
  assert.equal(shared.saved.get(key), before);
  a.store.replace(backup);
  b.deliver();
  assert.equal(b.store.get().plans.length, 1);
  shared.block();
  assert.equal(b.store.createPlan(null).persisted, false);
  assert.equal(b.store.status(), 'session');
  assert.equal(JSON.parse(b.store.exportBackup()).plans.length, 2);
});

test('plan capacity is checked against newest persisted plans', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  for (let i = 0; i < 20; i++) b.store.createPlan(null);
  const before = shared.saved.get(key);
  assert.throws(() => a.store.createPlan(null), /20/);
  assert.equal(shared.saved.get(key), before);
});

test('a read discovered before storage-event delivery also announces the UI update', async () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  b.store.createPlan(null);
  assert.equal(a.store.get().plans.length, 1);
  await Promise.resolve();
  assert.equal(a.changes.at(-1).detail.external, true);
  const count = a.changes.length;
  a.deliver();
  assert.equal(a.changes.length, count);
});

test('continued write-time conflicts ask for retry without saving the rejected draft', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const b = shared.open();
  assert.throws(() => a.store.update(draft => {
    draft.favorites.push('chen-liang');
    b.store.createPlan(null);
  }), /请重试/);
  const persisted = JSON.parse(shared.saved.get(key));
  assert.equal(persisted.plans.length, 3);
  assert.deepEqual(persisted.favorites, []);
});

test('recovered writes keep other tabs data and session edits until an explicit replacement', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const original = a.store.createPlan(null, { title: '原计划' });
  const b = shared.open();
  a.blockWrites();
  assert.equal(a.store.editPlan(original.id, plan => { plan.title = 'A 未持久化的编辑'; }), false);
  const added = b.store.createPlan(null, { title: 'B 已保存的新计划' });
  const disk = shared.saved.get(key);
  a.blockWrites(false);
  assert.equal(a.store.toggleFavorite('chen-liang'), false);
  assert.equal(a.store.status(), 'session');
  assert.equal(shared.saved.get(key), disk);
  assert.ok(b.store.get().plans.some(plan => plan.id === added.id));
  const backup = a.store.parseBackup(a.store.exportBackup());
  assert.equal(backup.plans[0].title, 'A 未持久化的编辑');
  assert.deepEqual(plain(backup.favorites), ['chen-liang']);
  assert.equal(a.store.replace(backup), true);
  assert.equal(a.store.status(), 'persistent');
  assert.deepEqual(JSON.parse(shared.saved.get(key)), plain(backup));
});

test('writes recover automatically when the persisted version did not change', () => {
  const shared = sharedTabs();
  const a = shared.open();
  const original = a.store.createPlan(null, { title: '原计划' });
  a.blockWrites();
  assert.equal(a.store.editPlan(original.id, plan => { plan.title = '待保存编辑'; }), false);
  a.blockWrites(false);
  assert.equal(a.store.toggleFavorite('chen-liang'), true);
  assert.equal(a.store.status(), 'persistent');
  const persisted = JSON.parse(shared.saved.get(key));
  assert.equal(persisted.plans[0].title, '待保存编辑');
  assert.deepEqual(persisted.favorites, ['chen-liang']);
});

test('unreadable storage on startup cannot later overwrite existing records', () => {
  const shared = sharedTabs();
  const b = shared.open();
  b.store.createPlan(null, { title: '已有数据' });
  shared.block();
  const a = shared.open();
  const disk = shared.saved.get(key);
  assert.equal(a.store.createPlan(null, { title: '会话计划' }).persisted, false);
  // The existing record remains protected even if write access comes back.
  shared.restore();
  assert.equal(a.store.toggleFavorite('chen-liang'), false);
  assert.equal(shared.saved.get(key), disk);
  assert.equal(a.store.get().plans[0].title, '会话计划');
});
