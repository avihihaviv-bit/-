/* Piano Studio — calendar: day / week / month / agenda views over lessons, task deadlines,
 * course milestones, goal deadlines and custom events. Shared renderers live on PS.cal. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;

  var KINDS = {
    lesson: { label: 'שיעורים', icon: 'clock' },
    task: { label: 'משימות', icon: 'list' },
    course: { label: 'קורסים', icon: 'book' },
    goal: { label: 'יעדים', icon: 'target' },
    event: { label: 'אירועים ותזכורות', icon: 'bell' }
  };
  var HOUR_H = 48;
  var state = { view: null, cursor: new Date(), hide: {} };

  /* ---------- item builders ---------- */
  function lessonItem(l) {
    return { kind: 'lesson', id: l.id, title: l.title, date: l.date, time: l.time, duration: +l.duration || 45, done: l.status === 'completed', cancelled: l.status === 'cancelled', sub: [l.teacher, l.location].filter(Boolean).join(' · ') };
  }
  function collect() {
    var items = [];
    PS.store.list('lessons').forEach(function (l) { if (l.date) items.push(lessonItem(l)); });
    PS.store.list('tasks').forEach(function (t) { if (t.dueDate) items.push({ kind: 'task', id: t.id, title: t.title, date: t.dueDate, done: t.done, sub: 'מועד יעד למשימה' }); });
    PS.store.list('courses').forEach(function (c) {
      if (c.targetDate) items.push({ kind: 'course', id: c.id, title: 'יעד סיום: ' + c.title, date: c.targetDate, done: c.status === 'completed', sub: Math.round(PS.domain.courseProgress(c) * 100) + '% הושלם' });
      if (c.startDate && c.status !== 'wishlist') items.push({ kind: 'course', id: c.id, title: 'התחלת קורס: ' + c.title, date: c.startDate, done: true, sub: c.instructor || '' });
      (c.modules || []).forEach(function (m) { if (m.done && m.doneAt) items.push({ kind: 'course', id: c.id, title: m.title + ' · ' + c.title, date: U.dkey(m.doneAt), done: true, sub: 'מודול הושלם' }); });
    });
    PS.store.list('goals').forEach(function (g) { if (g.deadline) items.push({ kind: 'goal', id: g.id, title: g.title, date: g.deadline, done: g.status === 'completed', sub: 'מועד יעד' }); });
    PS.store.list('events').forEach(function (e) { items.push({ kind: 'event', id: e.id, title: e.title, date: e.date, time: e.time, duration: e.time ? (+e.duration || 60) : 0, sub: [PS.schema.labels.eventKind[e.kind], e.location].filter(Boolean).join(' · ') }); });
    return items.filter(function (it) { return !state.hide[it.kind]; });
  }
  function byDate(items) {
    var m = {};
    items.forEach(function (it) { (m[it.date] = m[it.date] || []).push(it); });
    Object.keys(m).forEach(function (k) { m[k].sort(U.byKey(function (x) { return x.time || '00:00'; })); });
    return m;
  }
  function evBtn(it) {
    return '<button type="button" class="ev ev-' + it.kind + (it.done || it.cancelled ? ' done' : '') + '" data-act="cal-open" data-kind="' + it.kind + '" data-id="' + esc(it.id) + '" title="' + esc((it.time ? it.time + ' · ' : '') + it.title) + '">' + I(KINDS[it.kind].icon) + '<span>' + (it.time ? esc(it.time) + ' ' : '') + U.bidi(it.title) + '</span></button>';
  }

  /* ---------- month ---------- */
  function month(items, cursor, opts) {
    opts = opts || {};
    var m = byDate(items);
    var first = U.startOfMonth(cursor);
    var gridStart = U.startOfWeek(first);
    var today = U.todayKey();
    var html = '<div class="month" role="grid" aria-label="' + esc(U.fmtMonthYear(cursor)) + '">';
    for (var d = 0; d < 7; d++) html += '<div class="dow" role="columnheader">' + esc(U.fmtWeekdayShort(U.addDays(gridStart, d))) + '</div>';
    for (var i = 0; i < 42; i++) {
      var day = U.addDays(gridStart, i);
      if (i >= 35 && day.getMonth() !== first.getMonth()) break;
      var k = U.dkey(day);
      var evs = m[k] || [];
      html += '<div class="day' + (day.getMonth() !== first.getMonth() ? ' other' : '') + (k === today ? ' today' : '') + '" role="gridcell" data-act="' + (opts.dayAct || 'cal-day') + '" data-date="' + k + '" tabindex="0" aria-label="' + esc(U.fmtFull(day)) + (evs.length ? ', ' + evs.length + ' פריטים' : '') + '">' +
        '<span class="dnum">' + day.getDate() + '</span>' + evs.slice(0, 3).map(evBtn).join('') + (evs.length > 3 ? '<span class="ev-more">+' + (evs.length - 3) + ' נוספים</span>' : '') + '</div>';
    }
    return html + '</div>';
  }

  /* ---------- weekly agenda (list per day) ---------- */
  function weekAgenda(items, cursor) {
    var ws = U.startOfWeek(cursor);
    return agendaDays(items, ws, 7, true);
  }
  function agendaDays(items, from, days, showEmpty) {
    var m = byDate(items);
    var today = U.todayKey();
    var html = '';
    var any = false;
    for (var i = 0; i < days; i++) {
      var d = U.addDays(from, i), k = U.dkey(d);
      var evs = m[k] || [];
      if (!evs.length && !showEmpty) continue;
      any = any || evs.length > 0;
      html += '<div class="agenda-day"><h3 class="' + (k === today ? 'today' : '') + '">' + esc(U.fmtWeekday(d)) + ' · ' + esc(U.fmtDayMonth(d)) + (k === today ? ' · היום' : '') + '</h3>' +
        (evs.length ? evs.map(agendaItem).join('') : '<p class="faint small" style="padding:4px 2px 6px">אין פריטים</p>') + '</div>';
    }
    if (!any && !showEmpty) return '<div class="card">' + ui.empty({ icon: 'calendar', title: 'אין פריטים בתקופה הזו', text: 'שיעורים, מועדי משימות, יעדים ואירועים יופיעו כאן.' }) + '</div>';
    return html;
  }
  var TONE = { lesson: 'tone-gold', task: 'tone-blue', course: 'tone-violet', goal: 'tone-green', event: 'tone-rose' };
  function agendaItem(it) {
    return '<div class="agenda-item" data-act="cal-open" data-kind="' + it.kind + '" data-id="' + esc(it.id) + '" tabindex="0" role="button">' +
      '<span class="time">' + (it.time ? esc(it.time) : 'כל היום') + '</span><span class="ai-icon ' + TONE[it.kind] + '">' + I(KINDS[it.kind].icon) + '</span>' +
      '<span class="grow"><b style="' + (it.done || it.cancelled ? 'text-decoration:line-through;color:var(--text-faint)' : '') + '">' + U.bidi(it.title) + '</b><small>' + U.bidi(it.sub || KINDS[it.kind].label) + (it.duration && it.time ? ' · ' + esc(U.fmtMinutes(it.duration)) : '') + '</small></span></div>';
  }

  /* ---------- week / day time grid ---------- */
  function timeGrid(items, days) {
    var m = byDate(items);
    var today = U.todayKey();
    var cols = days.length;
    var html = '<div class="week-scroll"><div class="week" style="grid-template-columns:56px repeat(' + cols + ', minmax(0,1fr))"><div class="wh"></div>';
    days.forEach(function (d) { var k = U.dkey(d); html += '<div class="wh' + (k === today ? ' today' : '') + '">' + esc(U.fmtWeekdayShort(d)) + '<b class="num">' + d.getDate() + '</b></div>'; });
    html += '<div class="allday faint small" style="border-inline-start:0;justify-content:center;text-align:center">כל היום</div>';
    days.forEach(function (d) {
      var evs = (m[U.dkey(d)] || []).filter(function (x) { return !x.time; });
      html += '<div class="allday">' + evs.map(evBtn).join('') + '</div>';
    });
    html += '<div class="hours">';
    for (var h = 0; h < 24; h++) html += '<div class="num">' + String(h).padStart(2, '0') + ':00</div>';
    html += '</div>';
    var now = new Date();
    days.forEach(function (d) {
      var k = U.dkey(d);
      var timed = (m[k] || []).filter(function (x) { return x.time; });
      html += '<div class="col' + (k === today ? ' today' : '') + '" style="height:' + 24 * HOUR_H + 'px" data-act="cal-slot" data-date="' + k + '" aria-label="' + esc(U.fmtFull(d)) + '">';
      timed.forEach(function (it) {
        var p = it.time.split(':');
        var top = (+p[0] + +p[1] / 60) * HOUR_H;
        var hgt = Math.max(22, (it.duration || 30) / 60 * HOUR_H - 2);
        var s = +p[0] * 60 + +p[1], e = s + (it.duration || 30);
        var conflict = timed.some(function (o) {
          if (o === it || o.cancelled || it.cancelled) return false;
          var q = o.time.split(':'), os = +q[0] * 60 + +q[1], oe = os + (o.duration || 30);
          return os < e && oe > s;
        });
        html += '<div class="blk ev-' + it.kind + (it.done ? ' done' : '') + (conflict ? ' conflict' : '') + '" style="top:' + top + 'px;height:' + hgt + 'px" data-act="cal-open" data-kind="' + it.kind + '" data-id="' + esc(it.id) + '" tabindex="0" role="button" title="' + esc(it.time + ' · ' + it.title + (conflict ? ' · חפיפה עם פריט אחר' : '')) + '"><b>' + U.bidi(it.title) + '</b><small>' + esc(it.time) + (conflict ? ' · ⚠ חפיפה' : '') + '</small></div>';
      });
      if (k === today) html += '<div class="now-line" style="top:' + ((now.getHours() + now.getMinutes() / 60) * HOUR_H) + 'px" aria-hidden="true"></div>';
      html += '</div>';
    });
    return html + '</div></div>';
  }

  /* ---------- page ---------- */
  function title() {
    var c = state.cursor;
    if (state.view === 'month') return U.fmtMonthYear(c);
    if (state.view === 'day') return U.fmtFull(c);
    if (state.view === 'week') { var ws = U.startOfWeek(c); return U.fmtDayMonth(ws) + ' – ' + U.fmtDayMonth(U.addDays(ws, 6)); }
    return 'מ' + U.fmtDayMonth(c) + ' והלאה';
  }

  function render(el) {
    if (!state.view) state.view = PS.prefs.get('calendarView') || 'month';
    var items = collect();
    var html = '<div class="page"><div class="page-head"><div><h1>לוח שנה</h1><p class="sub">שיעורים, מועדים, יעדים ותזכורות — במבט אחד</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-ghost" data-act="add-lesson">' + I('clock') + 'שיעור</button><button type="button" class="btn btn-primary" data-act="add-event">' + I('plus') + 'אירוע חדש</button></div></div>';
    html += '<div class="cal-head"><div class="seg" role="tablist" aria-label="תצוגת לוח">' +
      [['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש'], ['agenda', 'סדר יום']].map(function (v) { return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" class="' + (state.view === v[0] ? 'on' : '') + '" data-act="cal-view" data-v="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="icon-btn" data-act="cal-nav" data-d="-1" aria-label="התקופה הקודמת">' + I('chevronRight') + '</button>' +
      '<h2 aria-live="polite">' + esc(title()) + '</h2>' +
      '<button type="button" class="icon-btn" data-act="cal-nav" data-d="1" aria-label="התקופה הבאה">' + I('chevronLeft') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="cal-nav" data-d="0">היום</button></div>';
    html += '<div class="cal-legend">' + Object.keys(KINDS).map(function (k) {
      return '<button type="button" class="chip ' + (state.hide[k] ? 'chip-muted' : TONE[k].replace('tone', 'chip')) + '" data-act="cal-toggle" data-k="' + k + '" aria-pressed="' + !state.hide[k] + '">' + I(state.hide[k] ? 'eyeOff' : KINDS[k].icon) + esc(KINDS[k].label) + '</button>';
    }).join('') + '</div>';
    if (state.view === 'month') html += month(items, state.cursor);
    else if (state.view === 'week') { var ws = U.startOfWeek(state.cursor); html += timeGrid(items, [0, 1, 2, 3, 4, 5, 6].map(function (i) { return U.addDays(ws, i); })); }
    else if (state.view === 'day') html += timeGrid(items, [U.startOfDay(state.cursor)]);
    else html += agendaDays(items, U.startOfDay(state.cursor), 30, false);
    html += '</div>';
    el.innerHTML = html;
    if (state.view === 'week' || state.view === 'day') {
      var sc = el.querySelector('.week-scroll');
      if (sc) sc.scrollTop = 7.5 * HOUR_H;
    }
  }

  function openItem(kind, id) {
    if (kind === 'lesson') PS.navigate('#/lessons/' + id);
    else if (kind === 'task') PS.act['task-edit']({ dataset: { id: id } });
    else if (kind === 'course') PS.navigate('#/courses/' + id);
    else if (kind === 'goal') PS.navigate('#/goals');
    else if (kind === 'event') openEvent(PS.store.get('events', id));
  }

  function openEvent(rec) {
    var isNew = !(rec && rec.id);
    var m = ui.editForm({
      coll: 'events', record: rec || { date: U.dkey(state.cursor) }, icon: 'calendar', size: 'md',
      beforeSubmit: function (vals) { return PS.confirmConflicts(vals, rec && rec.id); }
    });
    if (!isNew) {
      var foot = m.el.querySelector('.modal-foot');
      foot.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-danger" data-del style="margin-inline-end:auto">' + I('trash') + 'מחיקה</button>');
      foot.querySelector('[data-del]').onclick = function () { m.close(); ui.confirmDelete('events', rec.id); };
    }
  }

  Object.assign(PS.act, {
    'add-event': function (el, preset) { openEvent(Object.assign({ date: (el && el.dataset && el.dataset.date) || U.todayKey() }, preset || {})); },
    'cal-view': function (el) { state.view = el.dataset.v; PS.refresh(); },
    'cal-toggle': function (el) { state.hide[el.dataset.k] = !state.hide[el.dataset.k]; PS.refresh(); },
    'cal-nav': function (el) {
      var d = +el.dataset.d;
      if (d === 0) state.cursor = new Date();
      else if (state.view === 'month') state.cursor = U.addMonths(state.cursor, d);
      else if (state.view === 'week') state.cursor = U.addDays(state.cursor, 7 * d);
      else if (state.view === 'agenda') state.cursor = U.addDays(state.cursor, 30 * d);
      else state.cursor = U.addDays(state.cursor, d);
      PS.refresh();
    },
    'cal-day': function (el) { state.cursor = U.toDate(el.dataset.date); state.view = 'day'; if (location.hash.indexOf('#/calendar') !== 0) PS.navigate('#/calendar'); else PS.refresh(); },
    'cal-slot': function (el, e) {
      if (e.target !== el) return;
      var r = el.getBoundingClientRect();
      var hour = Math.max(0, Math.min(23, Math.floor((e.clientY - r.top) / HOUR_H)));
      ui.menu(el, [
        { label: 'אירוע ב-' + String(hour).padStart(2, '0') + ':00', icon: 'calendar', fn: function () { openEvent({ date: el.dataset.date, time: String(hour).padStart(2, '0') + ':00' }); } },
        { label: 'שיעור ב-' + String(hour).padStart(2, '0') + ':00', icon: 'clock', fn: function () { PS.act['add-lesson']({ dataset: { date: el.dataset.date } }); } }
      ]);
    },
    'cal-open': function (el, e) { if (e) e.stopPropagation(); openItem(el.dataset.kind, el.dataset.id); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.month .day, .agenda-item, .week .blk')) { e.preventDefault(); e.target.click(); }
  });

  PS.cal = { month: month, weekAgenda: weekAgenda, agendaDays: agendaDays, timeGrid: timeGrid, lessonItem: lessonItem, collect: collect, KINDS: KINDS };
  PS.views.calendar = { title: function () { return 'לוח שנה'; }, render: render };
})();
