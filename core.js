/* Maslul core: pure, DOM-free logic shared by the app and the Node test suite.
   Nothing in here touches localStorage or the document, so every function is
   deterministic given its inputs (dates are passed in explicitly). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MaslulCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 2;

  function pad(n) { return String(n).padStart(2, '0'); }
  function dkey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function obj(x) { return isObj(x) ? x : {}; }

  /* ---------- migrations ----------
     Each migration only ADDS structure or fills defaults. None deletes user data.
     migrate() is idempotent: running it twice gives the same result. */
  var DEFAULT_NOTIF = { enabled: false, tasks: true, habits: true, routine: true, deadlines: true, goals: true, achievements: true, habitTime: '20:00', leadMinutes: 10 };
  var DEFAULT_WIDGETS = ['now', 'todo', 'gamer', 'score', 'habits', 'goals', 'focus', 'actions', 'reminder', 'balance'];

  var MIGRATIONS = {
    // v1 -> v2: task manager, inbox, notes, events, custom habits, focus sessions, prefs, coach, speech
    2: function (s) {
      s.todo = obj(s.todo);
      s.todo.tasks = arr(s.todo.tasks);
      s.todo.categories = arr(s.todo.categories).length ? s.todo.categories : ['לימודים', 'בית', 'אישי', 'עבודה', 'כושר'];
      s.inbox = arr(s.inbox);
      s.notes = arr(s.notes);
      s.events = arr(s.events);
      s.customHabits = arr(s.customHabits);
      s.habitValues = obj(s.habitValues);
      s.focusSessions = arr(s.focusSessions);
      s.prefs = obj(s.prefs);
      s.prefs.accent = s.prefs.accent || null;
      s.prefs.sidebarCollapsed = !!s.prefs.sidebarCollapsed;
      s.prefs.avatar = s.prefs.avatar || null;
      s.prefs.dashboard = obj(s.prefs.dashboard);
      s.prefs.dashboard.order = arr(s.prefs.dashboard.order);
      s.prefs.dashboard.hidden = obj(s.prefs.dashboard.hidden);
      s.prefs.notif = Object.assign({}, DEFAULT_NOTIF, obj(s.prefs.notif));
      s.prefs.focus = Object.assign({ work: 25, short: 5, long: 15, longEvery: 4, sound: true }, obj(s.prefs.focus));
      s.notifSent = obj(s.notifSent);
      s.coach = obj(s.coach);
      s.coach.log = arr(s.coach.log);
      s.speech = obj(s.speech);
      s.speech.log = obj(s.speech.log);
      s.speech.selfRatings = arr(s.speech.selfRatings);
      s.reviews = obj(s.reviews);
      arr(s.goals).forEach(function (g) {
        if (!isObj(g)) return;
        g.description = g.description || '';
        g.category = g.category || 'אישי';
        g.history = arr(g.history);
        g.milestones = arr(g.milestones);
        if (!isObj(g.metric)) g.metric = null;
      });
      return s;
    }
  };

  function migrate(s) {
    if (!isObj(s)) s = {};
    var from = typeof s.schemaVersion === 'number' ? s.schemaVersion : 1;
    for (var v = from + 1; v <= SCHEMA_VERSION; v++) { if (MIGRATIONS[v]) s = MIGRATIONS[v](s); }
    // always re-run the latest shape fill so a partially-written state still gets every field
    s = MIGRATIONS[SCHEMA_VERSION](s);
    s.schemaVersion = SCHEMA_VERSION;
    return s;
  }

  /* ---------- import validation ---------- */
  var KNOWN_KEYS = ['tasksByDate', 'habitLog', 'gam', 'goals', 'todo', 'notes', 'workoutLog', 'money', 'learning'];
  function validateBackup(data) {
    if (!isObj(data)) return { ok: false, error: 'הקובץ לא מכיל אובייקט נתונים' };
    var payload = isObj(data.state) && data.app === 'maslul' ? data.state : data;
    var hits = KNOWN_KEYS.filter(function (k) { return k in payload; });
    if (hits.length < 2) return { ok: false, error: 'זה לא נראה כמו גיבוי של מסלול' };
    if ('tasksByDate' in payload && !isObj(payload.tasksByDate)) return { ok: false, error: 'מבנה tasksByDate פגום' };
    if ('goals' in payload && !Array.isArray(payload.goals)) return { ok: false, error: 'מבנה goals פגום' };
    return { ok: true, state: payload };
  }
  function makeBackup(state, now) {
    return { app: 'maslul', schemaVersion: SCHEMA_VERSION, exportedAt: new Date(now || Date.now()).toISOString(), state: state };
  }

  /* ---------- tasks ---------- */
  var PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
  var STATUSES = ['todo', 'doing', 'done'];

  function newTask(fields, id, now) {
    var t = {
      id: id, title: '', description: '', due: null, time: null, priority: 'medium', category: '', tags: [],
      subtasks: [], estimate: null, status: 'todo', notes: '', recur: null, goalId: null,
      createdAt: now, doneAt: null, archived: false
    };
    Object.keys(fields || {}).forEach(function (k) { if (fields[k] !== undefined) t[k] = fields[k]; });
    t.tags = arr(t.tags); t.subtasks = arr(t.subtasks);
    if (STATUSES.indexOf(t.status) < 0) t.status = 'todo';
    if (!(t.priority in PRIORITY_RANK)) t.priority = 'medium';
    return t;
  }

  /* Natural-language quick add: "לקנות חלב מחר 18:00 !גבוה #בית" */
  function parseQuickAdd(text, todayKey) {
    var out = { title: text || '', due: null, time: null, priority: null, tags: [] };
    var s = ' ' + out.title + ' ';
    var m = s.match(/\s(\d{1,2}):(\d{2})\s/);
    if (m && +m[1] < 24 && +m[2] < 60) { out.time = pad(+m[1]) + ':' + m[2]; s = s.replace(m[0], ' '); }
    if (/\sהיום\s/.test(s)) { out.due = todayKey; s = s.replace(/\sהיום\s/, ' '); }
    else if (/\sמחרתיים\s/.test(s)) { out.due = addDays(todayKey, 2); s = s.replace(/\sמחרתיים\s/, ' '); }
    else if (/\sמחר\s/.test(s)) { out.due = addDays(todayKey, 1); s = s.replace(/\sמחר\s/, ' '); }
    var pm = s.match(/\s!(דחוף|גבוה|בינוני|נמוך)\s/);
    if (pm) { out.priority = { 'דחוף': 'urgent', 'גבוה': 'high', 'בינוני': 'medium', 'נמוך': 'low' }[pm[1]]; s = s.replace(pm[0], ' '); }
    s = s.replace(/\s#([^\s#]+)/g, function (_, tag) { out.tags.push(tag); return ' '; });
    out.title = s.replace(/\s+/g, ' ').trim();
    return out;
  }

  function taskBucket(t, todayKey) {
    if (t.status === 'done') return 'done';
    if (!t.due) return 'someday';
    if (t.due < todayKey) return 'overdue';
    if (t.due === todayKey) return 'today';
    return 'upcoming';
  }

  function filterTasks(tasks, f, todayKey) {
    f = f || {};
    var q = (f.q || '').trim().toLowerCase();
    return arr(tasks).filter(function (t) {
      if (!f.includeArchived && t.archived) return false;
      if (f.view === 'today') {
        var b = taskBucket(t, todayKey);
        var doneToday = b === 'done' && (t.due === todayKey || (t.doneAt && dkey(new Date(t.doneAt)) === todayKey));
        if (!(b === 'today' || b === 'overdue' || doneToday)) return false;
      }
      if (f.view === 'overdue' && taskBucket(t, todayKey) !== 'overdue') return false;
      if (f.view === 'upcoming' && taskBucket(t, todayKey) !== 'upcoming') return false;
      if (f.view === 'archive' && !t.archived) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.category && t.category !== f.category) return false;
      if (f.tag && t.tags.indexOf(f.tag) < 0) return false;
      if (q) {
        var hay = [t.title, t.description, t.notes, t.category].concat(t.tags).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortTasks(tasks, by) {
    var list = arr(tasks).slice();
    var dueVal = function (t) { return (t.due || '9999-99-99') + ' ' + (t.time || '99:99'); };
    list.sort(function (a, b) {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      if (by === 'priority') {
        var p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (p) return p;
        return dueVal(a) < dueVal(b) ? -1 : dueVal(a) > dueVal(b) ? 1 : 0;
      }
      if (by === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      var d = dueVal(a) < dueVal(b) ? -1 : dueVal(a) > dueVal(b) ? 1 : 0;
      return d || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
    return list;
  }

  function nextDueDate(due, recur) {
    if (!due || !recur) return null;
    var d = parseKey(due);
    if (recur === 'daily') d.setDate(d.getDate() + 1);
    else if (recur === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6); }
    else if (recur === 'weekly') d.setDate(d.getDate() + 7);
    else if (recur === 'monthly') { var day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    else return null;
    return dkey(d);
  }

  /* Marks a task done. Returns {task, spawned, xpEventId}.
     - The XP event id is tied to the task instance id, so un-done + re-done never pays twice.
     - A recurring task spawns the next instance only once (tracked by spawnedNextId). */
  function completeTask(tasks, id, now, todayKey, makeId) {
    var t = arr(tasks).filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    var res = { task: t, spawned: null, xpEventId: 'todo:' + t.id };
    t.status = 'done';
    t.doneAt = now;
    if (t.recur && !t.spawnedNextId) {
      var due = nextDueDate(t.due || todayKey, t.recur);
      var copy = newTask({
        title: t.title, description: t.description, due: due, time: t.time, priority: t.priority, category: t.category,
        tags: t.tags.slice(), estimate: t.estimate, recur: t.recur, goalId: t.goalId, notes: t.notes,
        subtasks: t.subtasks.map(function (s) { return { id: s.id, title: s.title, done: false }; })
      }, makeId(), now);
      t.spawnedNextId = copy.id;
      tasks.push(copy);
      res.spawned = copy;
    }
    return res;
  }
  function reopenTask(tasks, id) {
    var t = arr(tasks).filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    t.status = 'todo'; t.doneAt = null;
    return t;
  }

  function taskXP(t) {
    var base = { urgent: 25, high: 20, medium: 12, low: 8 }[t.priority] || 10;
    var est = +t.estimate || 0;
    return base + Math.min(20, Math.round(est / 15) * 2);
  }

  /* ---------- habits ---------- */
  // h: {id, freq:'daily'|'weekly', perWeek, target (numeric goal, null = yes/no)}
  function habitDoneOn(h, habitLog, habitValues, k) {
    if (h.target) return ((habitValues[h.id] || {})[k] || 0) >= h.target;
    return !!(habitLog[h.id] || {})[k];
  }
  function habitStats(h, habitLog, habitValues, todayKey, days) {
    days = days || 30;
    var done = 0, possible = 0, series = [];
    for (var i = days - 1; i >= 0; i--) {
      var k = addDays(todayKey, -i);
      var ok = habitDoneOn(h, habitLog, habitValues, k);
      if (ok) done++;
      series.push({ k: k, ok: ok });
    }
    if (h.freq === 'weekly') {
      var weeks = Math.ceil(days / 7);
      possible = weeks * Math.max(1, h.perWeek || 1);
    } else possible = days;
    // streak: consecutive successful days ending today (or yesterday if today not done yet)
    var streak = 0, k2 = todayKey;
    if (!habitDoneOn(h, habitLog, habitValues, k2)) k2 = addDays(k2, -1);
    var guard = 0;
    if (h.freq === 'weekly') {
      // weekly streak = consecutive weeks meeting perWeek
      var wk = todayKey, ws = 0;
      while (guard++ < 104) {
        var cnt = 0;
        for (var j = 0; j < 7; j++) if (habitDoneOn(h, habitLog, habitValues, addDays(wk, -j))) cnt++;
        if (cnt >= (h.perWeek || 1)) { ws++; wk = addDays(wk, -7); } else break;
      }
      streak = ws;
    } else {
      while (guard++ < 3650 && habitDoneOn(h, habitLog, habitValues, k2)) { streak++; k2 = addDays(k2, -1); }
    }
    return { done: done, possible: possible, rate: possible ? Math.min(100, Math.round(done / possible * 100)) : 0, streak: streak, series: series };
  }

  /* ---------- analytics ---------- */
  function dayCompletion(state, k) {
    var sched = arr((state.tasksByDate || {})[k]).filter(function (t) { return !t.optional; });
    var todos = arr(state.todo && state.todo.tasks).filter(function (t) { return t.due === k && !t.archived; });
    var total = sched.length + todos.length;
    var done = sched.filter(function (t) { return t.done; }).length + todos.filter(function (t) { return t.status === 'done'; }).length;
    return { total: total, done: done, rate: total ? Math.round(done / total * 100) : null };
  }
  function rangeRate(state, endKey, days) {
    var tot = 0, dn = 0;
    for (var i = 0; i < days; i++) { var c = dayCompletion(state, addDays(endKey, -i)); tot += c.total; dn += c.done; }
    return tot ? Math.round(dn / tot * 100) : null;
  }
  function completionTimestamps(state) {
    var ts = [];
    Object.keys(state.tasksByDate || {}).forEach(function (k) {
      arr(state.tasksByDate[k]).forEach(function (t) { if (t.done && t.completedAt) ts.push(t.completedAt); });
    });
    arr(state.todo && state.todo.tasks).forEach(function (t) { if (t.doneAt) ts.push(t.doneAt); });
    arr(state.focusSessions).forEach(function (s) { if (s.type === 'work' && s.endedAt) ts.push(s.endedAt); });
    return ts;
  }
  function productivityProfile(state) {
    var hours = new Array(24).fill(0), weekdays = new Array(7).fill(0);
    completionTimestamps(state).forEach(function (t) { var d = new Date(t); hours[d.getHours()]++; weekdays[d.getDay()]++; });
    var best = function (a) { var m = -1, i = -1; a.forEach(function (v, j) { if (v > m) { m = v; i = j; } }); return m > 0 ? i : null; };
    return { hours: hours, weekdays: weekdays, bestHour: best(hours), bestWeekday: best(weekdays) };
  }
  function focusMinutes(state, k) {
    var mins = arr(state.focusSessions).filter(function (s) { return s.type === 'work' && s.date === k; })
      .reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
    return mins;
  }

  /* ---------- coach (local, rule-based; clearly not an LLM) ---------- */
  function coachInsights(state, todayKey, habits) {
    var out = [];
    var tasks = arr(state.todo && state.todo.tasks).filter(function (t) { return !t.archived; });
    var overdue = tasks.filter(function (t) { return taskBucket(t, todayKey) === 'overdue'; });
    var today = tasks.filter(function (t) { return taskBucket(t, todayKey) === 'today'; });
    var estToday = today.concat(overdue).reduce(function (a, t) { return a + (+t.estimate || 30); }, 0);
    var sched = arr((state.tasksByDate || {})[todayKey]);
    if (overdue.length) out.push({ kind: 'warn', title: overdue.length + ' משימות באיחור', text: 'תתחיל מהן לפני משימות חדשות, או תזיז להן תאריך יעד ריאלי. משימה שנגררת יותר משבוע - כנראה צריך לפרק אותה.' });
    if (estToday > 300 || sched.length + today.length > 22) out.push({ kind: 'warn', title: 'עומס יתר היום', text: 'יש כ-' + Math.round(estToday / 60) + ' שעות משימות מעבר לשגרה. תבחר 3 חשובות ותעביר את השאר למחר.' });
    var weak = arr(habits).map(function (h) { return { h: h, s: habitStats(h, state.habitLog || {}, state.habitValues || {}, todayKey, 14) }; })
      .filter(function (x) { return x.s.rate < 50; }).sort(function (a, b) { return a.s.rate - b.s.rate; }).slice(0, 2);
    weak.forEach(function (x) { out.push({ kind: 'habit', title: 'ההרגל "' + x.h.name + '" ב-' + x.s.rate + '% בשבועיים האחרונים', text: 'תקטין אותו לגרסה של 2 דקות ותצמיד אותו לפעולה קבועה (למשל אחרי ארוחת ערב). קל להתמיד במשהו קטן.' }); });
    var prof = productivityProfile(state);
    if (prof.bestHour !== null) out.push({ kind: 'time', title: 'השעה הכי פרודוקטיבית שלך: ' + pad(prof.bestHour) + ':00', text: 'תשבץ את המשימה הקשה של היום סביב השעה הזו.' });
    var prioritized = sortTasks(today.concat(overdue).filter(function (t) { return t.status !== 'done'; }), 'priority').slice(0, 3);
    if (prioritized.length) out.push({ kind: 'focus', title: 'סדר עדיפויות מומלץ', text: prioritized.map(function (t, i) { return (i + 1) + '. ' + t.title; }).join('  ·  ') });
    var r7 = rangeRate(state, todayKey, 7);
    if (r7 !== null) out.push({ kind: 'summary', title: 'אחוז ביצוע שבועי: ' + r7 + '%', text: r7 >= 80 ? 'שבוע חזק. שמור על הקצב.' : r7 >= 50 ? 'בסדר, יש מקום לשיפור - פחות משימות ויותר סגירה.' : 'השבוע קשה. תוריד הילוך ותתחיל מהבסיס: שינה, הרגל אחד ומשימה אחת ביום.' });
    return out;
  }

  /* Weekly plan: spread open tasks across the next 7 days by priority, capping daily minutes */
  function weeklyPlan(state, todayKey, capMinutes) {
    capMinutes = capMinutes || 180;
    var open = sortTasks(arr(state.todo && state.todo.tasks).filter(function (t) { return t.status !== 'done' && !t.archived; }), 'priority');
    var days = [];
    for (var i = 0; i < 7; i++) days.push({ k: addDays(todayKey, i), mins: 0, tasks: [] });
    open.forEach(function (t) {
      var est = +t.estimate || 30;
      var startIdx = t.due && t.due > todayKey ? Math.max(0, Math.min(6, Math.round((parseKey(t.due) - parseKey(todayKey)) / 864e5))) : 0;
      // place on the latest day that still meets the due date, earliest first if overdue/undated
      var placed = false;
      for (var j = 0; j <= 6 && !placed; j++) {
        var idx = t.due ? Math.min(j, startIdx) : j;
        if (days[idx].mins + est <= capMinutes || j === 6) { days[idx].mins += est; days[idx].tasks.push(t); placed = true; }
      }
    });
    return days;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, DEFAULT_WIDGETS: DEFAULT_WIDGETS, PRIORITY_RANK: PRIORITY_RANK, STATUSES: STATUSES,
    dkey: dkey, parseKey: parseKey, addDays: addDays,
    migrate: migrate, validateBackup: validateBackup, makeBackup: makeBackup,
    newTask: newTask, parseQuickAdd: parseQuickAdd, taskBucket: taskBucket, filterTasks: filterTasks, sortTasks: sortTasks,
    nextDueDate: nextDueDate, completeTask: completeTask, reopenTask: reopenTask, taskXP: taskXP,
    habitDoneOn: habitDoneOn, habitStats: habitStats,
    dayCompletion: dayCompletion, rangeRate: rangeRate, productivityProfile: productivityProfile, focusMinutes: focusMinutes,
    coachInsights: coachInsights, weeklyPlan: weeklyPlan
  };
});
