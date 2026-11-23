const test = require('node:test');
const assert = require('node:assert');
const C = require('../core.js');

const TODAY = '2026-11-23';
let n = 0; const mk = () => 'id' + (++n);

test('migrate keeps existing data and adds new structures', () => {
  const old = { tasksByDate: { [TODAY]: [{ id: 'a', done: true }] }, habitLog: { water: { [TODAY]: true } }, goals: [{ id: 'g', title: 'x', milestones: [] }], workoutLog: [{ id: 'w', kg: 40 }] };
  const s = C.migrate(JSON.parse(JSON.stringify(old)));
  assert.deepStrictEqual(s.tasksByDate, old.tasksByDate);
  assert.deepStrictEqual(s.habitLog, old.habitLog);
  assert.deepStrictEqual(s.workoutLog, old.workoutLog);
  assert.strictEqual(s.goals[0].title, 'x');
  assert.ok(Array.isArray(s.todo.tasks) && Array.isArray(s.notes) && Array.isArray(s.inbox));
  assert.strictEqual(s.schemaVersion, C.SCHEMA_VERSION);
});

test('migrate is idempotent and never wipes new data', () => {
  const s = C.migrate({});
  s.todo.tasks.push({ id: 't1' }); s.notes.push({ id: 'n1' }); s.prefs.accent = '#ff0000';
  const again = C.migrate(s);
  assert.strictEqual(again.todo.tasks.length, 1);
  assert.strictEqual(again.notes.length, 1);
  assert.strictEqual(again.prefs.accent, '#ff0000');
});

test('validateBackup accepts wrapped and raw backups, rejects junk', () => {
  const st = C.migrate({ tasksByDate: {}, goals: [] });
  assert.ok(C.validateBackup(C.makeBackup(st)).ok);
  assert.ok(C.validateBackup(st).ok);
  assert.ok(!C.validateBackup({ hello: 1 }).ok);
  assert.ok(!C.validateBackup(null).ok);
  assert.ok(!C.validateBackup({ tasksByDate: 5, goals: [] }).ok);
});

test('parseQuickAdd extracts date, time, priority and tags', () => {
  const r = C.parseQuickAdd('לקנות חלב מחר 18:30 !גבוה #בית', TODAY);
  assert.strictEqual(r.title, 'לקנות חלב');
  assert.strictEqual(r.due, '2026-11-24');
  assert.strictEqual(r.time, '18:30');
  assert.strictEqual(r.priority, 'high');
  assert.deepStrictEqual(r.tags, ['בית']);
  assert.strictEqual(C.parseQuickAdd('סתם משימה', TODAY).due, null);
});

test('completing, reopening and completing again keeps one XP event id and spawns recurrence once', () => {
  const tasks = [C.newTask({ title: 'ריצה', due: TODAY, recur: 'daily' }, 'r1', 1)];
  const a = C.completeTask(tasks, 'r1', 2, TODAY, mk);
  C.reopenTask(tasks, 'r1');
  const b = C.completeTask(tasks, 'r1', 3, TODAY, mk);
  assert.strictEqual(a.xpEventId, b.xpEventId);
  assert.ok(a.spawned && !b.spawned);
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[1].due, '2026-11-24');
});

test('nextDueDate handles weekly, monthly end-of-month and weekdays', () => {
  assert.strictEqual(C.nextDueDate('2026-11-23', 'weekly'), '2026-11-30');
  assert.strictEqual(C.nextDueDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.strictEqual(C.nextDueDate('2026-11-26', 'weekdays'), '2026-11-29'); // Thu -> Sun (skip Fri/Sat)
});

test('buckets, filters and sorting', () => {
  const ts = [
    C.newTask({ title: 'ישן', due: '2026-11-20', priority: 'low' }, 'a', 1),
    C.newTask({ title: 'היום', due: TODAY, priority: 'urgent', tags: ['x'] }, 'b', 2),
    C.newTask({ title: 'עתיד', due: '2026-12-01' }, 'c', 3),
    C.newTask({ title: 'בלי תאריך' }, 'd', 4),
  ];
  assert.strictEqual(C.taskBucket(ts[0], TODAY), 'overdue');
  assert.deepStrictEqual(C.filterTasks(ts, { view: 'today' }, TODAY).map(t => t.id).sort(), ['a', 'b']);
  ts[1].status = 'done';
  assert.ok(C.filterTasks(ts, { view: 'today' }, TODAY).some(t => t.id === 'b'), 'done-today stays visible in Today for undo');
  ts[1].status = 'todo';
  assert.deepStrictEqual(C.filterTasks(ts, { q: 'עתיד' }, TODAY).map(t => t.id), ['c']);
  assert.deepStrictEqual(C.filterTasks(ts, { tag: 'x' }, TODAY).map(t => t.id), ['b']);
  assert.strictEqual(C.sortTasks(ts, 'priority')[0].id, 'b');
  assert.strictEqual(C.sortTasks(ts, 'due')[0].id, 'a');
});

test('habitStats: numeric target, streak and rate', () => {
  const h = { id: 'h', freq: 'daily', target: 8 };
  const vals = { h: { [TODAY]: 8, '2026-11-22': 9, '2026-11-21': 3 } };
  const s = C.habitStats(h, {}, vals, TODAY, 7);
  assert.strictEqual(s.streak, 2);
  assert.strictEqual(s.done, 2);
  assert.strictEqual(s.rate, Math.round(2 / 7 * 100));
});

test('analytics day completion merges routine and tasks', () => {
  const st = C.migrate({ tasksByDate: { [TODAY]: [{ done: true }, { done: false }, { done: false, optional: true }] } });
  st.todo.tasks.push(C.newTask({ title: 'x', due: TODAY, status: 'done' }, 'z', 1));
  assert.deepStrictEqual(C.dayCompletion(st, TODAY), { total: 3, done: 2, rate: 67 });
});

test('weeklyPlan respects daily capacity', () => {
  const st = C.migrate({});
  for (let i = 0; i < 10; i++) st.todo.tasks.push(C.newTask({ title: 't' + i, estimate: 60 }, 'w' + i, i));
  const plan = C.weeklyPlan(st, TODAY, 180);
  assert.strictEqual(plan.length, 7);
  assert.ok(plan.slice(0, 6).every(d => d.mins <= 180));
  assert.strictEqual(plan.reduce((a, d) => a + d.tasks.length, 0), 10);
});
