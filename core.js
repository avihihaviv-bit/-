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
      s.workoutLog = arr(s.workoutLog);
      s.fitness = obj(s.fitness);
      s.fitness.sessions = arr(s.fitness.sessions);
      s.fitness.bodyweight = arr(s.fitness.bodyweight);
      s.fitness.weeklyGoal = s.fitness.weeklyGoal || 4;
      s.activityNotes = obj(s.activityNotes);
      s.nutrition = obj(s.nutrition);
      s.nutrition.log = obj(s.nutrition.log);
      s.nutrition.water = obj(s.nutrition.water);
      s.nutrition.shopping = obj(s.nutrition.shopping);
      if (s.nutrition.plan !== null && s.nutrition.plan !== undefined && !Array.isArray(s.nutrition.plan)) s.nutrition.plan = null;
      s.coach.thread = arr(s.coach.thread);
      if (s.fitness.plan !== null && !isObj(s.fitness.plan)) s.fitness.plan = null;
      if (s.fitness.active && !isObj(s.fitness.active)) s.fitness.active = null;
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

  /* ---------- fitness ---------- */
  // Epley estimate of a one-rep max; reps<=1 means the weight itself
  function e1rm(kg, reps) { kg = +kg || 0; reps = +reps || 0; if (!kg) return 0; return reps <= 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10; }
  function parseRepRange(r) {
    var m = String(r || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) return { min: +m[1], max: +m[2] };
    var n = String(r || '').match(/\d+/);
    return n ? { min: +n[0], max: +n[0] } : { min: 8, max: 12 };
  }
  /* Progressive overload: look at the most recent session's sets of one exercise.
     every set reached the top of the range -> add weight; any set under the bottom -> stay;
     otherwise stay and aim for one more rep. Bodyweight work progresses by reps. */
  function suggestNext(lastSets, repRange, type, step) {
    lastSets = arr(lastSets).filter(function (x) { return x && (+x.reps > 0); });
    if (!lastSets.length) return null;
    var rr = parseRepRange(repRange), topKg = Math.max.apply(null, lastSets.map(function (x) { return +x.kg || 0; }));
    var atTop = lastSets.filter(function (x) { return (+x.kg || 0) === topKg; });
    var minReps = Math.min.apply(null, atTop.map(function (x) { return +x.reps; }));
    var maxReps = Math.max.apply(null, atTop.map(function (x) { return +x.reps; }));
    if (type === 'bodyweight' || !topKg) return { kg: topKg, reps: maxReps + 1, action: 'reps', text: 'נסה ' + (maxReps + 1) + ' חזרות' };
    step = step || (topKg < 20 ? 1 : 2.5);
    if (minReps >= rr.max) return { kg: Math.round((topKg + step) * 10) / 10, reps: rr.min, action: 'up', text: 'הגעת לטווח העליון. נסה ' + (Math.round((topKg + step) * 10) / 10) + ' ק״ג × ' + rr.min };
    if (minReps < rr.min) return { kg: topKg, reps: rr.min, action: 'hold', text: 'הישאר על ' + topKg + ' ק״ג ונסה להגיע ל-' + rr.min + ' חזרות בכל סט' };
    return { kg: topKg, reps: Math.min(rr.max, maxReps + 1), action: 'rep', text: 'אותו משקל (' + topKg + ' ק״ג), נסה חזרה אחת יותר' };
  }
  // which split day comes next: the one after the most recently finished session's day
  function nextSplitIndex(sessions, days) {
    days = arr(days); if (!days.length) return 0;
    var done = arr(sessions).filter(function (x) { return x.endedAt; }).sort(function (a, b) { return b.endedAt - a.endedAt; });
    if (!done.length) return 0;
    var i = days.map(function (d) { return d.id; }).indexOf(done[0].dayId);
    return i < 0 ? 0 : (i + 1) % days.length;
  }
  /* ---------- nutrition: rough per-item estimate (protein g, kcal) ----------
     Matching is by keyword; the leading number (2, ½, ¼) multiplies. "X או Y" uses X.
     These are rough averages for the plan's foods, shown in the app as an estimate. */
  var FOODS = [
    { k: 'shake', re: /משקה חלבון|מעדן חלבון|משקה\/מעדן חלבון/, p: 22, kcal: 150, label: 'משקה/מעדן חלבון', unit: 'יח׳' },
    { k: 'pbread', re: /לחם חלבון/, p: 5, kcal: 70, label: 'לחם חלבון', unit: 'פרוסות' },
    { k: 'egg', re: /ביצ/, p: 6, kcal: 75, label: 'ביצים', unit: 'יח׳' },
    { k: 'chicken', re: /עוף|הודו/, p: 35, kcal: 170, label: 'חזה עוף', unit: 'מנות (כף יד)' },
    { k: 'tuna', re: /טונה/, p: 26, kcal: 120, label: 'טונה', unit: 'קופסאות' },
    { k: 'milk', re: /חלב(?! חלבון)/, p: 8, kcal: 120, label: 'חלב', unit: 'כוסות' },
    { k: 'yogurt', re: /יוגורט/, p: 6, kcal: 120, label: 'יוגורט', unit: 'גביעים' },
    { k: 'cheese', re: /גבינה/, p: 6, kcal: 80, label: 'גבינה צהובה', unit: 'פרוסות' },
    { k: 'rice', re: /אורז/, p: 4, kcal: 200, label: 'אורז', unit: 'כוסות מבושל' },
    { k: 'potato', re: /תפוחי אדמה|תפוח אדמה/, p: 4, kcal: 160, label: 'תפוחי אדמה', unit: 'יח׳' },
    { k: 'bread', re: /לחם|פרוס/, p: 3, kcal: 80, label: 'לחם', unit: 'פרוסות' },
    { k: 'cereal', re: /קורנפלקס/, p: 2, kcal: 100, label: 'קורנפלקס', unit: 'כוסות' },
    { k: 'corn', re: /תירס/, p: 5, kcal: 140, label: 'תירס', unit: 'כוסות' },
    { k: 'banana', re: /בננה/, p: 1, kcal: 105, label: 'בננות', unit: 'יח׳' },
    { k: 'apple', re: /תפוח(?! אדמה)(?!י אדמה)/, p: 0.5, kcal: 95, label: 'תפוחים', unit: 'יח׳' },
    { k: 'fruit', re: /פרי/, p: 1, kcal: 80, label: 'פירות', unit: 'יח׳' },
    { k: 'oil', re: /שמן/, p: 0, kcal: 40, label: 'שמן זית', unit: 'כפיות' },
    { k: 'veg', re: /ירקות|סלט|עגבני|מלפפון|בצל|פלפל/, p: 1, kcal: 25, label: 'ירקות', unit: 'מנות' }
  ];
  function leadingQty(t) {
    var m = String(t).trim().match(/^(\d+(?:\.\d+)?|½|¼|¾)/);
    if (!m) { var m2 = String(t).match(/מ-?(\d+)\s*ביצ/); return m2 ? +m2[1] : 1; }
    return { '½': 0.5, '¼': 0.25, '¾': 0.75 }[m[1]] || +m[1];
  }
  function estimateFood(text) {
    var t = String(text || '').split(/\sאו\s/)[0];
    for (var i = 0; i < FOODS.length; i++) {
      if (FOODS[i].re.test(t)) {
        var q = leadingQty(t);
        if (FOODS[i].k === 'corn' && !/^\s*[\d½¼¾]/.test(t)) q = 0.5;
        return { key: FOODS[i].k, label: FOODS[i].label, unit: FOODS[i].unit, qty: q, protein: Math.round(FOODS[i].p * q * 10) / 10, kcal: Math.round(FOODS[i].kcal * q) };
      }
    }
    return null;
  }
  function estimateMeals(meals) {
    var p = 0, k = 0;
    arr(meals).forEach(function (m) { arr(m.items).forEach(function (it) { var e = estimateFood(it); if (e) { p += e.protein; k += e.kcal; } }); });
    return { protein: Math.round(p), kcal: Math.round(k / 10) * 10 };
  }
  function shoppingList(days) {
    var agg = {};
    arr(days).forEach(function (d) { arr(d.meals).forEach(function (m) { arr(m.items).forEach(function (it) {
      var e = estimateFood(it); if (!e || e.key === 'oil') return;
      if (!agg[e.key]) agg[e.key] = { key: e.key, label: e.label, unit: e.unit, qty: 0 };
      agg[e.key].qty += e.qty;
    }); }); });
    return Object.keys(agg).map(function (k) { var a = agg[k]; a.qty = Math.round(a.qty * 2) / 2; return a; }).sort(function (a, b) { return b.qty - a.qty; });
  }
  function weekStartKey(k) { return addDays(k, -parseKey(k).getDay()); }


  /* ---------- routine activity details ----------
     A description belongs to the activity NAME, so it shows on every day that has that activity.
     A note written on a single day's instance (task.notes) overrides it for that day only. */
  function activityKey(title) { return String(title || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function activityInfo(notesMap, task) {
    var inst = String((task && task.notes) || '').trim();
    if (inst) return { text: inst, scope: 'day' };
    var g = obj(notesMap)[activityKey(task && task.title)];
    var t = g && g.text ? String(g.text).trim() : '';
    return t ? { text: t, scope: 'all' } : null;
  }

  /* ---------- free local coach: intent rules over the user's real data (NOT an AI model) ---------- */
  function localCoachReply(question, c) {
    var q = String(question || '').trim(); c = c || {};
    var has = function (re) { return re.test(q); };
    var li = function (a) { return a.map(function (x) { return '- ' + x; }).join('\n'); };
    var open = arr(c.openTasks), today = c.today || '';
    var PR = { urgent: 0, high: 1, medium: 2, low: 3 };
    var byDue = open.slice().sort(function (a, b) { return ((a.due || '9999') > (b.due || '9999') ? 1 : (a.due || '9999') < (b.due || '9999') ? -1 : 0) || (PR[a.priority] - PR[b.priority]); });
    var overdue = open.filter(function (t) { return t.due && t.due < today; });
    var dueToday = open.filter(function (t) { return t.due === today; });
    var habits = arr(c.habits14d).slice().sort(function (a, b) { return a.rate14 - b.rate14; });
    var cr = c.completionRate || {}, fit = c.fitness || {}, tg = c.nutritionTargets || {};
    var nutDays = arr(c.nutritionLast7), tn = nutDays[0] && nutDays[0].date === today ? nutDays[0] : null;
    var h = parseInt(String(c.now || '12:00').split(':')[0], 10);
    var t0 = function (t) { return t.title + (t.estimateMin ? ' (' + t.estimateMin + ' דק׳)' : ''); };
    var top3 = byDue.slice().sort(function (a, b) { return (PR[a.priority] - PR[b.priority]) || ((a.due || '9999') > (b.due || '9999') ? 1 : -1); }).slice(0, 3);

    if (has(/עייף|מותש|אין כוח|שחוק|עצוב|לחוץ|מוצף/)) {
      return '## יום עם פחות אנרגיה\nזה בסדר, וגם יום כזה אפשר לנצל בחכמות.\n' + li(['תבחר **רק 3 דברים** חשובים להיום' + (top3.length ? ': ' + top3.map(function (t) { return t.title; }).join(', ') : ''), 'כל השאר עובר למחר, בלי אשמה', 'עשה כל דבר 10 דקות ואז תחליט אם להמשיך', 'כוס מים, משהו לאכול, ו-5 דקות באוויר צח', 'ללכת לישון מוקדם יותר היום']) + (overdue.length ? '\n\nיש ' + overdue.length + ' משימות באיחור: לא לנסות לסגור הכל היום, רק אחת.' : '');
    }
    if (has(/לעלות.{0,12}משקל|להעלות|עומס מתקדם|תקוע|לא מתקדם/)) {
      return '## איך עולים במשקל בצורה בטוחה\n' + li(['בוחרים טווח חזרות (למשל 8-12) ועובדים עם משקל שמאפשר את כל החזרות בטכניקה טובה', 'כשכל הסטים מגיעים לקצה העליון של הטווח, **מעלים 2.5 ק״ג** (או את המדרגה הקטנה במכונה)', 'אחרי העלאה חוזרים לתחתית הטווח, ושוב מטפסים', 'אם תקוע שבועיים: לבדוק שינה, חלבון ומנוחה בין הסטים (2-3 דקות) לפני שמוסיפים משקל', 'טכניקה לפני משקל: אם היא נשברת, המשקל כבד מדי']) + '\n\nבמסך הכושר, לשונית "לפי תוכנית", האפליקציה מציעה לך את המשקל הבא אוטומטית.';
    }
    if (has(/לאכול|אוכל|תזונה|חלבון|ארוחה|ארוחת|קלוריות|רעב/)) {
      var lines = [];
      if (has(/אחרי אימון|אחרי ה/)) return '## מה לאכול אחרי אימון\n' + li(['חלבון: משקה או מעדן חלבון, יוגורט, ביצים או טונה', 'פחמימה: בננה, לחם או אורז, כדי למלא אנרגיה', 'תוך שעה-שעתיים מהאימון, לא חייבים מיד', 'כוס מים או שתיים']);
      if (tn) lines.push('היום עד עכשיו: כ-**' + tn.proteinEst + ' ג׳ חלבון** (יעד ~' + (tg.protein || '?') + ') ו-' + tn.water + ' כוסות מים (יעד ' + (tg.water || '?') + ').');
      if (nutDays.length) { var avg = Math.round(nutDays.reduce(function (a, d) { return a + (d.proteinEst || 0); }, 0) / nutDays.length); lines.push('ממוצע החלבון בימים שרשמת: כ-' + avg + ' ג׳' + (tg.protein && avg < tg.protein * 0.75 ? ', קצת מתחת ליעד' : '') + '.'); }
      lines.push('הדרך הכי קלה להוסיף חלבון: מעדן חלבון, יוגורט או 2 ביצים נוספים ביום.');
      lines.push('אם אתה רעב אחרי הארוחות, לאכול עוד זה בסדר, במיוחד עם אימונים.');
      return '## תזונה\n' + li(lines) + '\n\n(ההערכות גסות. סימון ארוחות ומים במסך התזונה משפר אותן.)';
    }
    if (has(/מים|שתייה|לשתות|צמא/)) {
      var wl = tn ? 'שתית היום ' + tn.water + ' מתוך ' + (tg.water || '?') + ' כוסות.' : 'עוד לא רשמת מים היום.';
      return '## מים\n' + li([wl, 'כוס אחת עכשיו, ועוד אחת עם כל ארוחה', 'בקבוק על השולחן או בתיק, ביום אימון קצת יותר', 'אפשר לסמן כוסות במסך התזונה או בווידג׳ט במסך הבית']);
    }
    if (has(/אימון|אימונים|כושר|חזרות|סטים|לחיצ|חדר כושר|מתח/)) {
      var ex = Object.keys(fit.exercisesLast7 || {}), goal = fit.weeklyGoal || 4, n = fit.trainingDaysLast7 || 0, out = [];
      out.push('אימונים ב-7 הימים האחרונים: **' + n + '/' + goal + '**' + (n >= goal ? ', עמדת ביעד.' : ', חסרים ' + (goal - n) + '.'));
      if (ex.length) out.push('תרגילים שעשית: ' + ex.slice(0, 6).join(', '));
      var recent = arr(fit.recentSessions).slice(-1)[0]; if (recent) out.push('אימון אחרון: ' + (recent.day || 'חופשי') + ', ' + recent.minutes + ' דק׳, ' + recent.sets + ' סטים' + (recent.prs && recent.prs.length ? ', שיא ב' + recent.prs.join(', ') : ''));
      out.push(n >= goal ? 'שמור על מנוחה ושינה, ושקול להעלות משקל בתרגיל שהגעת בו לראש הטווח.' : 'גם אימון קצר של 30-40 דקות נחשב. אפשר לרשום סט בודד בלשונית "רישום".');
      if (!ex.length && !fit.recentSessions.length) out = ['עוד לא רשמת אימונים השבוע. תתחיל מסט אחד בלשונית "רישום" או מאימון לפי התוכנית.'];
      return '## האימונים שלך\n' + li(out);
    }
    if (has(/הרגל|להתמיד|התמדה|רצף/)) {
      var weak = habits.filter(function (x) { return x.rate14 < 60; }).slice(0, 3);
      return '## הרגלים והתמדה\n' + (weak.length ? 'ההרגלים שהכי צריכים חיזוק (שבועיים אחרונים):\n' + li(weak.map(function (x) { return '**' + x.name + '**: ' + x.rate14 + '%'; })) + '\n\n' : (habits.length ? 'ההרגלים שלך במצב טוב. ' : '')) + 'איך מתמידים:\n' + li(['להקטין את ההרגל ל-**2 דקות** (עושים רק את הגרסה הקטנה)', 'להצמיד אותו לפעולה קבועה, למשל "אחרי ארוחת ערב"', 'לא לפספס פעמיים ברצף', 'לסמן מיד אחרי שעושים: ההנאה מהסימון עוזרת']);
    }
    if (has(/שינה|לישון|ללכת לישון|נרדם|ישן/)) {
      return '## שינה\n' + li(['8-9 שעות בגיל שלך, עם שעת שינה קבועה', 'מסכים כבויים חצי שעה לפני', 'חדר קריר וחשוך', 'לא לאכול ארוחה כבדה ממש לפני', 'שינה טובה היא הבסיס של שריר, ריכוז ואנרגיה']);
    }
    if (has(/מוטיבציה|משעמם|דחיינות|לא בא לי|לא מצליח להתחיל|מתקשה להתחיל/)) {
      return '## להתחיל כשלא בא לך\n' + li(['**כלל 5 הדקות**: אתה מתחייב רק על 5 דקות. לרוב ממשיכים', 'להתחיל מהחלק הכי קטן והכי קל של המשימה' + (top3[0] ? ' (למשל: ' + top3[0].title + ')' : ''), 'טיימר פוקוס של 25 דקות במסך "פוקוס", אפשר עם מוזיקת הרקע', 'לשים את הטלפון בחדר אחר', 'אחרי שמסיימים, לסמן ✓ וליהנות מה-XP']);
    }
    if (has(/סכם|סיכום|נתח|התקדמות|ביצועים|איך הולך|איך אני/)) {
      var o = ['ביצוע היום: **' + (cr.today == null ? 'אין נתונים' : cr.today + '%') + '**, השבוע: **' + (cr.week == null ? 'אין נתונים' : cr.week + '%') + '**' + (cr.prevWeek != null && cr.week != null ? ' (שבוע קודם ' + cr.prevWeek + '%, ' + (cr.week >= cr.prevWeek ? 'שיפור' : 'ירידה') + ')' : '')];
      o.push('משימות שהושלמו ב-7 ימים: ' + (c.doneLast7 || 0) + ' · ריכוז: ' + (c.focusMinutesWeek || 0) + ' דק׳ · רצף ' + (c.streakDays || 0) + ' ימים');
      if (fit.weeklyGoal) o.push('אימונים: ' + (fit.trainingDaysLast7 || 0) + '/' + fit.weeklyGoal);
      if (habits.length && habits[0].rate14 < 60) o.push('הרגל שצריך חיזוק: ' + habits[0].name + ' (' + habits[0].rate14 + '%)');
      if (overdue.length) o.push('באיחור: ' + overdue.length + ' משימות');
      var best = habits.length ? habits[habits.length - 1] : null; if (best && best.rate14 >= 70) o.push('הכי חזק: ' + best.name + ' (' + best.rate14 + '%)');
      return '## סיכום\n' + li(o) + '\n\n**צעד הבא:** ' + (overdue.length ? 'לסגור משימה אחת באיחור.' : top3[0] ? 'להתחיל מ"' + top3[0].title + '".' : 'להוסיף משימה אחת לשבוע הקרוב.');
    }
    if (has(/שבוע|שבועית/)) {
      var days = {}, order = [];
      for (var i = 0; i < 7; i++) { var k = addDays(today, i); days[k] = { mins: 0, items: [] }; order.push(k); }
      byDue.forEach(function (t) { var k = t.due && days[t.due] ? t.due : null; if (!k) { k = order.slice().sort(function (a, b) { return days[a].mins - days[b].mins; })[0]; } days[k].mins += +t.estimateMin || 30; days[k].items.push(t.title); });
      var HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      var any = order.some(function (k) { return days[k].items.length; });
      return '## תוכנית לשבוע\n' + (any ? li(order.filter(function (k) { return days[k].items.length; }).map(function (k) { return '**' + HE[parseKey(k).getDay()] + '**: ' + days[k].items.slice(0, 3).join(', ') + (days[k].items.length > 3 ? ' ועוד ' + (days[k].items.length - 3) : ''); })) + '\n\nחילקתי לפי תאריך יעד ועומס, בערך עד 3 שעות ביום. אפשר ללחוץ "החל תאריכים" בהצעה למטה כדי לקבוע אותם.' : 'אין משימות פתוחות לחלק. תוסיף משימות במסך המשימות ואחלק לך אותן.');
    }
    if (has(/תכנן|תכנון|סדר יום|היום שלי|תוכנית ליום|מה לעשות היום/)) {
      var plan = [];
      if (overdue.length) plan.push('קודם כל **משימה אחת באיחור**: ' + overdue[0].title);
      top3.filter(function (t) { return overdue.indexOf(t) < 0; }).slice(0, 3 - Math.min(overdue.length, 1)).forEach(function (t) { plan.push(t0(t)); });
      var rt = arr(c.routineToday).filter(function (r) { return !r.done && !r.optional; }).slice(0, 2); if (rt.length) plan.push('בשגרה היום עוד: ' + rt.map(function (r) { return r.title + ' (' + r.time + ')'; }).join(', '));
      var hb = habits.filter(function (x) { return x.rate14 < 60; })[0]; if (hb) plan.push('הרגל להיום: ' + hb.name);
      if (!plan.length) plan.push('אין משימות פתוחות. תבחר דבר אחד חשוב ותתחיל ממנו');
      var tot = byDue.filter(function (t) { return t.due === today; }).reduce(function (a, t) { return a + (+t.estimateMin || 30); }, 0);
      return '## תכנון להיום\n' + li(plan) + (tot > 300 ? '\n\nיש כ-' + Math.round(tot / 60) + ' שעות משימות להיום, זה עמוס. כדאי להעביר חלק למחר.' : '') + '\n\nטיפ: את המשימה הקשה ביותר לעשות בשעה שבה אתה הכי חד' + (c.bestHour != null ? ' (' + c.bestHour + ':00)' : '') + '.';
    }
    if (has(/שעה|פנוי|עכשיו|רגע|זמן/)) {
      var avail = has(/שעה/) ? 60 : has(/חצי שעה/) ? 30 : 45;
      var fit1 = byDue.filter(function (t) { return !t.estimateMin || t.estimateMin <= avail; })[0] || byDue[0];
      var s = [];
      if (fit1) s.push('המשימה הכי מתאימה: **' + t0(fit1) + '**');
      if (h >= 16 && h < 22) s.push('אימון קצר או הליכה, אם עוד לא התאמנת היום');
      s.push('סשן פוקוס של 25 דקות על משהו חשוב');
      var hb2 = habits.filter(function (x) { return x.rate14 < 60; })[0]; if (hb2) s.push('להספיק את ההרגל: ' + hb2.name);
      return '## יש לך זמן? הנה מה שכדאי\n' + li(s);
    }
    if (has(/דיבור|הגייה|קלינאית|ס וש|ס\/ש/)) {
      return '## דיבור ס/ש\nתרגלת השבוע כ-' + (c.speechPracticeMinutesWeek || 0) + ' דקות.\n' + li(['5-10 דקות ביום עדיפות על שעה פעם בשבוע', 'שורה אחת מהתרגילים של השלב הנוכחי, ואז משפט', 'הקלט את עצמך והאזן', 'במסך "דיבור ס/ש" יש בדיקה עצמית אם כדאי לחזור לקלינאית']);
    }
    if (has(/פוקוס|ריכוז|להתרכז|ללמוד/)) {
      return '## ריכוז\n' + li(['25 דקות עבודה, 5 דקות הפסקה, במסך "פוקוס"', 'משימה אחת בכל סשן, כזו שבחרת מראש', 'טלפון בחדר אחר, ואפשר מוזיקת רקע ריכוז', 'ריכוז השבוע: ' + (c.focusMinutesWeek || 0) + ' דקות']);
    }
    var snap = [];
    if (open.length) snap.push('יש ' + open.length + ' משימות פתוחות' + (overdue.length ? ', ' + overdue.length + ' מהן באיחור' : ''));
    if (cr.week != null) snap.push('ביצוע שבועי: ' + cr.week + '%');
    return '## אני המאמן החינמי\nאני עובד לפי כללים על הנתונים שלך ולא מודל AI, אז אני טוב בשאלות מהסוגים האלה:\n' + li(['"תכנן לי את היום" או "יש לי שעה פנויה"', '"תוכנית שבועית" או "סכם את השבוע"', '"ניתוח האימונים שלי" או "איך לעלות במשקל"', '"מה לאכול אחרי אימון" או "מה לשפר בתזונה"', '"איך להתמיד בהרגל", "אני עייף", "אין לי מוטיבציה"']) + (snap.length ? '\n\nכרגע: ' + snap.join(', ') + '.' : '');
  }

  return {
    activityKey: activityKey, activityInfo: activityInfo,
    localCoachReply: localCoachReply,
    estimateFood: estimateFood, estimateMeals: estimateMeals, shoppingList: shoppingList,
    e1rm: e1rm, parseRepRange: parseRepRange, suggestNext: suggestNext, nextSplitIndex: nextSplitIndex, weekStartKey: weekStartKey,
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
