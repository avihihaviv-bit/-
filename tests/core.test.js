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

test('version.json matches the version baked into extras.js (update checker relies on it)', () => {
  const fs = require('fs'), path = require('path');
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).version;
  const src = fs.readFileSync(path.join(__dirname, '..', 'extras.js'), 'utf8');
  assert.ok(src.includes("var APP_VERSION = '" + v + "'"), 'bump APP_VERSION in extras.js together with version.json');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  ['core.js', 'features.js', 'extras.js', 'fitness.js', 'nutrition.js', 'music.js', 'features.css'].forEach(f => assert.ok(sw.includes("'./" + f + "'"), f + ' cached by service worker'));
});

test('fitness: e1rm, rep range parsing, progressive overload suggestion', () => {
  assert.strictEqual(C.e1rm(100, 1), 100);
  assert.strictEqual(C.e1rm(40, 10), 53.3);
  assert.deepStrictEqual(C.parseRepRange('8-12'), { min: 8, max: 12 });
  assert.deepStrictEqual(C.parseRepRange('עד כשל 6–8'), { min: 6, max: 8 });
  assert.strictEqual(C.suggestNext([{ kg: 40, reps: 12 }, { kg: 40, reps: 12 }], '8-12', 'weight').action, 'up');
  assert.strictEqual(C.suggestNext([{ kg: 40, reps: 12 }, { kg: 40, reps: 12 }], '8-12', 'weight').kg, 42.5);
  assert.strictEqual(C.suggestNext([{ kg: 40, reps: 12 }, { kg: 40, reps: 6 }], '8-12', 'weight').action, 'hold');
  assert.strictEqual(C.suggestNext([{ kg: 40, reps: 10 }, { kg: 40, reps: 9 }], '8-12', 'weight').action, 'rep');
  assert.strictEqual(C.suggestNext([{ kg: 0, reps: 8 }], '6-8', 'bodyweight').reps, 9);
  assert.strictEqual(C.suggestNext([], '8-12', 'weight'), null);
});

test('fitness: next split day rotates after the last finished session', () => {
  const days = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.strictEqual(C.nextSplitIndex([], days), 0);
  assert.strictEqual(C.nextSplitIndex([{ dayId: 'a', endedAt: 1 }, { dayId: 'b', endedAt: 5 }], days), 2);
  assert.strictEqual(C.nextSplitIndex([{ dayId: 'c', endedAt: 9 }], days), 0);
  assert.strictEqual(C.nextSplitIndex([{ dayId: 'b', endedAt: null }], days), 0);
});

test('migrate adds fitness structures and keeps workout log', () => {
  const s = C.migrate({ workoutLog: [{ id: 'w', kg: 50 }] });
  assert.strictEqual(s.workoutLog.length, 1);
  assert.ok(Array.isArray(s.fitness.sessions) && Array.isArray(s.fitness.bodyweight) && s.fitness.weeklyGoal === 4);
});

test('nutrition estimates parse quantities and pick the first of "X או Y"', () => {
  assert.strictEqual(C.estimateFood('2 ביצים').protein, 12);
  assert.strictEqual(C.estimateFood('3 פרוסות לחם חלבון').key, 'pbread');
  assert.strictEqual(C.estimateFood('2 כוסות אורז מבושל').kcal, 400);
  assert.strictEqual(C.estimateFood('3 תפוחי אדמה בינוניים').key, 'potato');
  assert.strictEqual(C.estimateFood('תפוח').key, 'apple');
  assert.strictEqual(C.estimateFood('½ כוס תירס').qty, 0.5);
  assert.strictEqual(C.estimateFood('חביתה מ-2 ביצים').qty, 2);
  assert.strictEqual(C.estimateFood('קופסת טונה או 2 ביצים').key, 'tuna');
  assert.strictEqual(C.estimateFood('משקה/מעדן חלבון אחד, בערך 20–25 גרם חלבון').key, 'shake');
  assert.strictEqual(C.estimateFood('קינמון'), null);
  const day = C.estimateMeals([{ items: ['2 ביצים', 'חזה עוף בגודל כף יד גדולה'] }]);
  assert.strictEqual(day.protein, 47);
  const list = C.shoppingList([{ meals: [{ items: ['2 ביצים', 'בננה'] }] }, { meals: [{ items: ['2 ביצים'] }] }]);
  assert.strictEqual(list.find(x => x.key === 'egg').qty, 4);
});

test('free local coach answers common questions from the data (no network)', () => {
  const ctx = { today: '2026-11-26', now: '10:00', openTasks: [{ title: 'דוח', due: '2026-11-25', priority: 'high', estimateMin: 45 }, { title: 'לקנות חלב', due: '2026-11-26', priority: 'low' }], habits14d: [{ name: 'קריאה', rate14: 20, streak: 0 }, { name: 'מים', rate14: 90, streak: 5 }], completionRate: { today: 50, week: 70, prevWeek: 60 }, fitness: { weeklyGoal: 4, trainingDaysLast7: 2, exercisesLast7: { 'לחיצת חזה': { sets: 3 } }, recentSessions: [] }, nutritionLast7: [{ date: '2026-11-26', proteinEst: 60, water: 3 }], nutritionTargets: { protein: 112, water: 10 }, routineToday: [], focusMinutesWeek: 50, doneLast7: 8, streakDays: 3 };
  const a = q => C.localCoachReply(q, ctx);
  assert.match(a('תכנן לי את היום'), /באיחור[^\n]*דוח/);
  assert.match(a('אני עייף היום'), /3 דברים/);
  assert.match(a('איך לעלות במשקל בלחיצת חזה?'), /2\.5/);
  assert.match(a('מה לאכול אחרי אימון?'), /חלבון/);
  assert.match(a('מה לשפר בתזונה'), /60/);
  assert.match(a('ניתוח האימונים שלי'), /2\/4/);
  assert.match(a('איך להתמיד בהרגל שאני לא מצליח בו?'), /קריאה/);
  assert.match(a('סכם את השבוע'), /70%/);
  assert.match(a('תוכנית שבועית'), /תוכנית לשבוע/);
  assert.match(a('יש לי שעה פנויה, מה הכי כדאי לעשות?'), /דוח/);
  assert.match(a('בלה בלה בלה'), /מאמן החינמי/);
  assert.ok(a('תכנן לי את היום').split('\n').some(l => l.startsWith('- ')), 'bullet lines so they can become tasks');
  assert.ok(C.localCoachReply('היי', {}).length > 20, 'works with empty data');
});
