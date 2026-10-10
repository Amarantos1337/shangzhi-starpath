'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../project');
function load(raw, blocked = false) {
  const saved = new Map(raw === undefined ? [] : [['shangzhi-starpath:v1', raw]]);
  const context = vm.createContext({
    TextEncoder,
    window: { dispatchEvent() {} },
    CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('Unavailable'); return saved.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Unavailable'); saved.set(key, value); },
      removeItem(key) { saved.delete(key); }
    }
  });
  for (const name of ['data', 'learning', 'storage']) vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), context);
  return { ...context.window.StarPath, saved };
}
const plain = value => JSON.parse(JSON.stringify(value));
function oldState() {
  return { version: 1, favorites: ['wang-zongyu'], plans: [{ id: 'old-plan', templateId: 'competition', title: '旧计划', goal: '保留旧任务', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', tasks: [{ id: 'old-task', title: '原来写下的任务', stage: '原阶段', dueDate: '2026-10-01', completed: true }] }] };
}
test('36 concrete tasks, complete guides, and all content references resolve', () => {
  const { data } = load();
  assert.equal(data.alumni.length, 4);
  assert.equal(data.routes.length, 3);
  assert.equal(data.practiceProjects.length, 3);
  assert.equal(data.methodCards.length, 6);
  const methods = new Set(data.methodCards.map(item => item.id));
  const resources = new Set(data.resources.map(item => item.id));
  const projects = new Set(data.practiceProjects.map(item => item.id));
  const routes = new Set(data.routes.map(item => item.id));
  let tasks = 0;
  for (const route of data.routes) {
    assert.equal(route.stages.length, 4);
    route.projectIds.forEach(id => assert.ok(projects.has(id)));
    for (const stage of route.stages) {
      assert.equal(stage.tasks.length, 3);
      tasks += stage.tasks.length;
      for (const field of ['why', 'preparation', 'example']) assert.ok(stage[field].trim().length > 15);
      for (const field of ['steps', 'checklist', 'pitfalls']) assert.ok(stage[field].length >= 2);
      stage.methodIds.forEach(id => assert.ok(methods.has(id)));
      stage.resourceIds.forEach(id => assert.ok(resources.has(id)));
    }
  }
  assert.equal(tasks, 36);
  for (const project of data.practiceProjects) {
    for (const field of ['download', 'preview']) assert.ok(fs.existsSync(path.join(root, project[field])));
    project.methodIds.forEach(id => assert.ok(methods.has(id)));
    project.routeIds.forEach(id => assert.ok(routes.has(id)));
    project.resourceIds.forEach(id => assert.ok(resources.has(id)));
    assert.ok(project.steps.every(step => step.expected && step.text));
  }
  for (const person of data.alumni) {
    assert.ok(projects.has(person.learning.projectId));
    assert.ok(person.timeline.every(event => person.sources.some(source => source.url === event.source.url)));
  }
});
test('existing v1 plans and backups retain their original tasks and progress', () => {
  const old = oldState();
  const { store, saved } = load(JSON.stringify(old));
  assert.deepEqual(plain(store.get()), old);
  assert.equal(store.progress(store.get().plans[0]).percent, 100);
  assert.deepEqual(plain(store.parseBackup(JSON.stringify({ app: 'shangzhi-starpath', ...old }))), old);
  const created = store.createPlan('competition');
  assert.equal(store.get().plans.find(plan => plan.id === created.id).tasks.length, 12);
  assert.deepEqual(plain(store.get().plans.find(plan => plan.id === 'old-plan')), old.plans[0]);
  assert.equal(JSON.parse(saved.get(store.key)).version, 1);
});
test('all new templates generate 12 editable tasks; empty plans remain empty', () => {
  const { data, store } = load();
  for (const route of data.routes) {
    const created = store.createPlan(route.id);
    const plan = store.get().plans.find(item => item.id === created.id);
    assert.equal(plan.tasks.length, 12);
    assert.equal(new Set(plan.tasks.map(task => task.stage)).size, 4);
    assert.equal(plan.tasks.filter(task => task.dueDate).length, 0);
    store.editPlan(plan.id, item => { item.tasks[0].title = '自定义'; item.tasks[0].completed = true; });
    assert.equal(store.get().plans.find(item => item.id === plan.id).tasks[0].title, '自定义');
  }
  const empty = store.createPlan(null);
  assert.equal(store.get().plans.find(plan => plan.id === empty.id).tasks.length, 0);
});
test('invalid backup and invalid edits leave state unchanged', () => {
  const { store } = load(JSON.stringify(oldState()));
  const before = plain(store.get());
  for (const text of ['{', '{}', JSON.stringify({ app: 'other', ...before }), JSON.stringify({ app: 'shangzhi-starpath', ...before, version: 2 })]) {
    assert.throws(() => store.parseBackup(text));
    assert.deepEqual(plain(store.get()), before);
  }
  assert.throws(() => store.editPlan('old-plan', plan => { plan.tasks[0].dueDate = '2026-02-30'; }));
  assert.deepEqual(plain(store.get()), before);
});

test('full Chinese backups including AI metadata export and restore within the shared byte limit', () => {
  const { store } = load();
  const sources = Array.from({ length: 30 }, (_, index) => ({ title: '资'.repeat(300), url: 'https://school.edu.cn/' + '中'.repeat(2000) + index }));
  const state = { version: 1, favorites: ['wang-zongyu'], plans: Array.from({ length: 20 }, (_, index) => ({
    id: 'plan-' + index, templateId: null, title: '计'.repeat(120), goal: '标'.repeat(1000),
    createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
    tasks: Array.from({ length: 100 }, (_, task) => ({ id: 'task-' + task, title: '学'.repeat(180), stage: '阶'.repeat(80), dueDate: '', completed: task % 2 === 0 })),
    generation: { model: 'deepseek-flash', generatedAt: '2026-10-10T00:00:00.000Z', summary: '摘'.repeat(3000), sources,
      recommendations: Array.from({ length: 5 }, (_, school) => ({ name: '校'.repeat(120), reason: '理'.repeat(500), sourceUrl: sources[school].url,
        location: { province: '省'.repeat(40), city: '市'.repeat(40), campus: '区'.repeat(120), sourceUrl: sources[school].url },
        criteriaEvidence: Array.from({ length: 5 }, () => ({ criterion: '条'.repeat(80), explanation: '据'.repeat(500), sourceUrl: sources[school].url }))
      })) }
  })) };
  store.replace(state);
  const backup = store.exportBackup();
  assert.equal(store.backupMaxBytes, 32 * 1024 * 1024);
  assert.ok(Buffer.byteLength(backup, 'utf8') > 1024 * 1024);
  assert.ok(Buffer.byteLength(backup, 'utf8') < store.backupMaxBytes);
  const restored = load().store;
  restored.replace(restored.parseBackup(backup));
  assert.deepEqual(plain(restored.get()), plain(store.get()));
  assert.equal(restored.progress(restored.get().plans[0]).percent, 50);
});

test('backup size is measured in UTF-8 bytes and oversized or invalid input leaves records unchanged', () => {
  const { store } = load(JSON.stringify(oldState()));
  const before = plain(store.get());
  const oversized = JSON.stringify({ app: 'shangzhi-starpath', version: 1, favorites: [], plans: [], padding: '中'.repeat(Math.ceil(store.backupMaxBytes / 3)) });
  assert.ok(oversized.length < store.backupMaxBytes);
  assert.throws(() => store.parseBackup(oversized), /32 MiB/);
  assert.throws(() => store.parseBackup(null), /32 MiB/);
  assert.deepEqual(plain(store.get()), before);
});
test('unavailable and damaged storage preserve the recovery behavior', () => {
  const session = load(undefined, true).store;
  assert.equal(session.status(), 'session');
  assert.equal(session.createPlan('career').persisted, false);
  assert.equal(session.get().plans[0].tasks.length, 12);
  assert.equal(JSON.parse(session.exportBackup()).plans.length, 1);
  const damaged = load('{broken').store;
  assert.equal(damaged.status(), 'damaged');
  assert.equal(damaged.damagedRaw(), '{broken');
  damaged.createPlan('education');
  assert.equal(damaged.damagedRaw(), '{broken');
  damaged.replace(oldState());
  assert.equal(damaged.status(), 'persistent');
  assert.equal(damaged.damagedRaw(), null);
});

test('tribute tasks are created atomically, isolated from presets and existing records', () => {
  const original = oldState();
  const { data, store, saved } = load(JSON.stringify(original));
  const initialTasks = plain(data.anniversary.tribute.tasks);
  const created = store.createPlan(null, { title: data.anniversary.tribute.title, goal: data.anniversary.tribute.goal, initialTasks });
  const plan = store.get().plans[0];
  assert.equal(plan.id, created.id);
  assert.equal(plan.templateId, null);
  assert.equal(created.persisted, true);
  assert.equal(plan.tasks.length, 3);
  assert.equal(new Set(plan.tasks.map(task => task.id)).size, 3);
  assert.ok(plan.tasks.every(task => task.dueDate === '' && task.completed === false));
  assert.deepEqual(Object.keys(plan.tasks[0]).sort(), ['completed', 'dueDate', 'id', 'stage', 'title']);
  initialTasks[0].title = '修改调用方输入';
  assert.notEqual(store.get().plans[0].tasks[0].title, initialTasks[0].title);
  assert.deepEqual(plain(store.get().plans[1]), original.plans[0]);
  assert.deepEqual(plain(store.get().favorites), original.favorites);
  assert.deepEqual(JSON.parse(saved.get(store.key)), plain(store.get()));
  const second = store.createPlan(null, { initialTasks: data.anniversary.tribute.tasks });
  assert.notEqual(second.id, created.id);
  assert.equal(new Set(store.get().plans.slice(0, 2).flatMap(item => item.tasks.map(task => task.id))).size, 6);
});

test('invalid initial tasks fail without replacing memory or persisted data', () => {
  const { store, saved } = load(JSON.stringify(oldState()));
  const before = plain(store.get());
  const raw = saved.get(store.key);
  const invalid = [null, {}, [null], Array(2), [{ title: ' ', stage: '阶段' }], [{ title: '任务', stage: '' }], [{ title: 'x'.repeat(181), stage: '阶段' }], Array(101).fill({ title: '任务', stage: '阶段' })];
  for (const initialTasks of invalid) {
    assert.throws(() => store.createPlan(null, { initialTasks }));
    assert.deepEqual(plain(store.get()), before);
    assert.equal(saved.get(store.key), raw);
  }
  assert.throws(() => store.createPlan('career', { initialTasks: [] }));
  assert.throws(() => store.createPlan(null, { title: '', initialTasks: [{ title: '任务', stage: '阶段' }] }));
  assert.deepEqual(plain(store.get()), before);
  assert.equal(saved.get(store.key), raw);
});

test('tribute backups retain progress after roundtrip and legacy fixtures remain compatible', () => {
  const { store, data } = load();
  const created = store.createPlan(null, { initialTasks: data.anniversary.tribute.tasks });
  store.editPlan(created.id, plan => { plan.tasks[0].completed = true; plan.tasks[1].dueDate = '2026-10-01'; });
  const backup = store.exportBackup();
  const restored = load(backup).store;
  assert.equal(restored.progress(restored.get().plans[0]).percent, 33);
  assert.deepEqual(plain(restored.parseBackup(backup)), plain(store.get()));
  const fixture = fs.readFileSync(path.resolve(__dirname, '../artifacts/anniversary/legacy-backup.json'), 'utf8');
  const legacy = JSON.parse(fixture);
  const { store: compatible } = load(fixture);
  assert.equal(compatible.status(), 'persistent');
  assert.deepEqual(plain(compatible.get().plans), legacy.plans);
  assert.deepEqual(plain(compatible.get().favorites), legacy.favorites);
});

test('tribute storage fallback, damaged recovery, and plan limit retain existing behavior', () => {
  const { store: session, data } = load(undefined, true);
  assert.equal(session.createPlan(null, { initialTasks: data.anniversary.tribute.tasks }).persisted, false);
  assert.equal(JSON.parse(session.exportBackup()).plans[0].tasks.length, 3);
  const { store: damaged, saved } = load('{broken');
  assert.equal(damaged.createPlan(null, { initialTasks: data.anniversary.tribute.tasks }).persisted, false);
  assert.equal(saved.get(damaged.key), '{broken');
  assert.equal(damaged.damagedRaw(), '{broken');
  const { store } = load();
  for (let i = 0; i < 20; i++) store.createPlan(null);
  const before = plain(store.get());
  assert.throws(() => store.createPlan(null, { initialTasks: data.anniversary.tribute.tasks }), /20/);
  assert.deepEqual(plain(store.get()), before);
});
