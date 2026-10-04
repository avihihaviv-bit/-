/* Piano Studio — lesson manager: list / week / month views, filters, detail page, templates. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { view: 'list', q: '', status: '', teacher: '', period: 'upcoming', cursor: new Date() };

  function start(l) { return U.combine(l.date, l.time) || U.toDate(l.date); }
  function end(l) { var s = start(l); return s ? new Date(s.getTime() + (+l.duration || 0) * 60000) : null; }

  /* Overlap check against lessons and calendar events on the same day. */
  function conflicts(vals, selfId) {
    if (!vals.date || !vals.time) return [];
    var s = U.combine(vals.date, vals.time), e = new Date(s.getTime() + (+vals.duration || 45) * 60000);
    var out = [];
    PS.store.list('lessons').forEach(function (l) {
      if (l.id === selfId || l.date !== vals.date || !l.time || l.status === 'cancelled') return;
      if (start(l) < e && end(l) > s) out.push(l.title + ' (' + l.time + ')');
    });
    PS.store.list('events').forEach(function (ev) {
      if (ev.id === selfId || ev.date !== vals.date || !ev.time) return;
      var es = U.combine(ev.date, ev.time), ee = new Date(es.getTime() + (+ev.duration || 60) * 60000);
      if (es < e && ee > s) out.push(ev.title + ' (' + ev.time + ')');
    });
    return out;
  }
  function confirmConflicts(vals, selfId) {
    var c = conflicts(vals, selfId);
    if (!c.length) return true;
    return ui.confirm({ title: 'התנגשות בלוח הזמנים', html: 'בזמן הזה כבר מתוכנן:<br><b>' + c.map(U.bidi).join('<br>') + '</b><br><br>לשמור בכל זאת?', confirmLabel: 'שמירה בכל זאת' });
  }
  PS.confirmConflicts = confirmConflicts;

  function openForm(record) {
    var isNew = !(record && record.id && PS.store.get('lessons', record.id));
    var tpl = PS.prefs.get('lessonTemplate');
    var base = isNew ? Object.assign({ date: U.todayKey(), duration: PS.prefs.get('defaultLessonDuration') }, tpl || {}, record || {}) : record;
    ui.editForm({
      coll: 'lessons', record: base, icon: 'clock',
      intro: isNew && tpl ? '<div class="banner banner-gold">' + I('copy') + '<span>הטופס מולא מתבנית השיעור השמורה שלך</span></div>' : '',
      beforeSubmit: function (vals) { return confirmConflicts(vals, base.id); },
      onSaved: function (rec, created) { if (created) PS.navigate('#/lessons/' + rec.id); }
    });
  }

  PS.act['add-lesson'] = function (el) { openForm(el && el.dataset && el.dataset.date ? { date: el.dataset.date } : null); };
  PS.act['lesson-edit'] = function (el) { openForm(PS.store.get('lessons', el.dataset.id)); };
  PS.act['lesson-complete'] = function (el) {
    var l = PS.store.get('lessons', el.dataset.id);
    if (!l) return;
    PS.store.update('lessons', l.id, { status: 'completed' });
    ui.toast('השיעור סומן כהושלם', 'success');
  };
  PS.act['lesson-menu'] = function (el) {
    var l = PS.store.get('lessons', el.dataset.id);
    if (!l) return;
    var items = [];
    Object.keys(L.lessonStatus).forEach(function (s) {
      if (s !== l.status) items.push({ label: 'סימון כ' + L.lessonStatus[s], icon: s === 'completed' ? 'check' : s === 'cancelled' ? 'x' : 'clock', fn: function () { PS.store.update('lessons', l.id, { status: s }); ui.toast('הסטטוס עודכן ל' + L.lessonStatus[s], 'success'); } });
    });
    items.push({ sep: true });
    items.push({ label: 'עריכה', icon: 'edit', fn: function () { openForm(l); } });
    items.push({ label: 'שכפול', icon: 'copy', fn: function () { duplicate(l); } });
    items.push({ label: 'שמירה כתבנית לשיעורים חדשים', icon: 'layers', fn: function () { saveTemplate(l); } });
    items.push({ label: 'פתק חדש לשיעור', icon: 'note', fn: function () { PS.act['add-note'](null, { lessonId: l.id, songIds: l.songIds || [] }); } });
    items.push({ label: 'משימה לשיעור', icon: 'list', fn: function () { PS.act['add-task'](null, { lessonId: l.id }); } });
    items.push({ sep: true });
    items.push({ label: 'מחיקה', icon: 'trash', danger: true, fn: function () { ui.confirmDelete('lessons', l.id, function () { if (location.hash.indexOf(l.id) >= 0) PS.navigate('#/lessons'); }); } });
    ui.menu(el, items);
  };
  function duplicate(l) {
    var copy = Object.assign({}, l);
    ['id', 'createdAt', 'updatedAt', 'completedAt'].forEach(function (k) { delete copy[k]; });
    copy.status = 'upcoming';
    copy.date = U.dkey(U.addDays(l.date, 7));
    copy.title = l.title;
    openForm(copy);
  }
  function saveTemplate(l) {
    var tpl = { title: l.title, time: l.time, duration: l.duration, teacher: l.teacher, location: l.location, cost: l.cost, reminder: l.reminder };
    PS.prefs.set('lessonTemplate', tpl);
    ui.toast('התבנית נשמרה — שיעורים חדשים ימולאו ממנה', 'success');
  }
  PS.act['lesson-template-clear'] = function () { PS.prefs.set('lessonTemplate', null); ui.toast('התבנית נמחקה', 'info'); };
  PS.act['lessons-view'] = function (el) { state.view = el.dataset.v; PS.refresh(); };
  PS.act['lessons-period'] = function (el) { state.period = el.dataset.v; PS.refresh(); };
  PS.act['lessons-q'] = U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150);
  PS.act['lessons-filter'] = function (el) { state[el.dataset.k] = el.value; PS.refresh(); };
  PS.act['lessons-nav'] = function (el) {
    var d = +el.dataset.d;
    state.cursor = d === 0 ? new Date() : state.view === 'month' ? U.addMonths(state.cursor, d) : U.addDays(state.cursor, 7 * d);
    PS.refresh();
  };

  function filtered() {
    var now = new Date();
    return PS.store.list('lessons').filter(function (l) {
      if (state.status && l.status !== state.status) return false;
      if (state.teacher && l.teacher !== state.teacher) return false;
      if (!PS.search.matches(l, state.q, ['title', 'teacher', 'location', 'topics', 'homework', 'instructions', 'personalNotes'])) return false;
      if (state.view === 'list' && state.period !== 'all') {
        var e = end(l) || start(l);
        var isUpcoming = (l.status === 'upcoming' || l.status === 'rescheduled') && e >= U.startOfDay(now);
        if (state.period === 'upcoming' && !isUpcoming) return false;
        if (state.period === 'past' && isUpcoming) return false;
      }
      return true;
    });
  }

  function row(l) {
    var d = U.toDate(l.date);
    var up = l.status === 'upcoming' || l.status === 'rescheduled';
    var s = start(l);
    return '<div class="list-row" data-href="#/lessons/' + l.id + '" tabindex="0" role="link">' +
      '<div class="date-badge' + (U.sameDay(d, new Date()) ? ' gold' : '') + '"><b>' + d.getDate() + '</b><small>' + esc(U.fmtMonthShort(d)) + '</small></div>' +
      '<div class="grow"><span class="title">' + U.bidi(l.title) + '</span><span class="sub">' + esc(U.fmtWeekday(d)) + (l.time ? ' · ' + esc(l.time) : '') + (l.duration ? ' · ' + esc(U.fmtMinutes(l.duration)) : '') + (l.teacher ? ' · ' + U.bidi(l.teacher) : '') + (l.location ? ' · ' + U.bidi(l.location) : '') + '</span></div>' +
      '<div class="trail">' + (up && s > new Date() ? '<span class="small gold hide-xs num">בעוד ' + esc(U.countdown(s)) + '</span>' : '') + ui.status('lessons', l.status) +
        (up ? '<button type="button" class="icon-btn sm" data-act="lesson-complete" data-id="' + l.id + '" aria-label="סימון השיעור כהושלם" title="סימון כהושלם">' + I('check') + '</button>' : '') +
        '<button type="button" class="icon-btn sm" data-act="lesson-menu" data-id="' + l.id + '" aria-label="פעולות נוספות" aria-haspopup="menu">' + I('more') + '</button></div></div>';
  }

  function renderList(lessons) {
    if (!lessons.length) {
      var any = PS.store.list('lessons').length;
      return '<div class="card">' + ui.empty(any ? { icon: 'search', title: 'אין שיעורים שתואמים לסינון', text: 'נסו לשנות את החיפוש או את הסינון.' } : { icon: 'clock', title: 'עוד לא נרשמו שיעורים', text: 'הוסיפו את שיעור הפסנתר הבא שלכם — תאריך, מורה, נושאים ושיעורי בית.', action: { act: 'add-lesson', label: 'הוספת שיעור' } }) + '</div>';
    }
    var asc = state.period === 'upcoming';
    lessons.sort(U.byKey(function (l) { return U.dkey(l.date) + (l.time || '00:00'); }, asc ? 'asc' : 'desc'));
    // group by month
    var groups = {};
    var order = [];
    lessons.forEach(function (l) { var k = U.monthKey(l.date); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(l); });
    return order.map(function (k) {
      return '<div class="section"><div class="section-head"><h2>' + esc(U.fmtMonthYear(groups[k][0].date)) + '</h2><span class="small muted">' + groups[k].length + ' שיעורים</span></div><div class="card list">' + groups[k].map(row).join('') + '</div></div>';
    }).join('');
  }

  function render(el, route) {
    if (route.params[0]) return renderDetail(el, route.params[0]);
    var lessons = filtered();
    var teachers = PS.store.distinct('lessons', 'teacher');
    var nl = PS.store.list('lessons').filter(function (l) { return (l.status === 'upcoming' || l.status === 'rescheduled') && start(l) > new Date(); }).sort(U.byKey(function (l) { return start(l).getTime(); }))[0];
    var done = PS.store.list('lessons').filter(function (l) { return l.status === 'completed'; });
    var tpl = PS.prefs.get('lessonTemplate');
    var html = '<div class="page"><div class="page-head"><div><h1>שיעורים</h1><p class="sub">ניהול שיעורי הפסנתר שלך — תכנון, תיעוד והיסטוריה</p></div>' +
      '<div class="page-actions"><a class="btn btn-ghost" href="#/notes">' + I('note') + 'מחברת שיעורים</a><button type="button" class="btn btn-primary" data-act="add-lesson">' + I('plus') + 'שיעור חדש</button></div></div>';
    html += '<div class="grid grid-3 stagger" style="margin-bottom:20px">' +
      '<div class="card stat"><div class="stat-label">' + I('clock') + 'השיעור הבא</div><div class="stat-value" style="font-size:20px">' + (nl ? '<a href="#/lessons/' + nl.id + '" style="color:inherit">' + U.bidi(nl.title) + '</a>' : '—') + '</div><div class="stat-sub">' + (nl ? esc(U.relDay(nl.date)) + (nl.time ? ' · ' + esc(nl.time) : '') + ' · <span class="gold">בעוד ' + esc(U.countdown(start(nl))) + '</span>' : 'אין שיעור מתוכנן') + '</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('check') + 'שיעורים שהתקיימו</div><div class="stat-value">' + done.length + '</div><div class="stat-sub">' + U.fmtMinutes(done.reduce(function (s, l) { return s + (+l.duration || 0); }, 0)) + ' זמן שיעורים</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('layers') + 'תבנית שיעור</div><div class="stat-value" style="font-size:16px;font-weight:500">' + (tpl ? U.bidi(tpl.title || 'תבנית') + (tpl.teacher ? ' · ' + U.bidi(tpl.teacher) : '') : '<span class="muted">לא הוגדרה</span>') + '</div><div class="stat-sub">' + (tpl ? '<button type="button" class="btn btn-ghost btn-sm" data-act="lesson-template-clear">מחיקת התבנית</button>' : 'שמרו שיעור כתבנית דרך תפריט ⋯') + '</div></div>' +
    '</div>';
    html += '<div class="toolbar">' +
      '<div class="seg" role="tablist" aria-label="תצוגה">' +
        [['list', 'רשימה', 'rows'], ['week', 'שבועי', 'calendar'], ['month', 'חודשי', 'grid']].map(function (v) { return '<button type="button" role="tab" aria-selected="' + (state.view === v[0]) + '" class="' + (state.view === v[0] ? 'on' : '') + '" data-act="lessons-view" data-v="' + v[0] + '">' + I(v[2]) + v[1] + '</button>'; }).join('') + '</div>' +
      (state.view === 'list' ? '<div class="seg">' + [['upcoming', 'קרובים'], ['past', 'היסטוריה'], ['all', 'הכל']].map(function (v) { return '<button type="button" class="' + (state.period === v[0] ? 'on' : '') + '" data-act="lessons-period" data-v="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>' : '') +
      '<div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש בשיעורים…" value="' + esc(state.q) + '" data-input="lessons-q" data-keep="lessons-q" aria-label="חיפוש בשיעורים"></div>' +
      '<select class="input" data-change="lessons-filter" data-k="status" aria-label="סינון לפי סטטוס"><option value="">כל הסטטוסים</option>' + Object.keys(L.lessonStatus).map(function (k) { return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' + L.lessonStatus[k] + '</option>'; }).join('') + '</select>' +
      (teachers.length > 1 ? '<select class="input" data-change="lessons-filter" data-k="teacher" aria-label="סינון לפי מורה"><option value="">כל המורים</option>' + teachers.map(function (t) { return '<option' + (state.teacher === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
    '</div>';
    if (state.view === 'list') html += renderList(lessons);
    else {
      var items = lessons.map(PS.cal.lessonItem);
      html += '<div class="cal-head"><button type="button" class="icon-btn" data-act="lessons-nav" data-d="-1" aria-label="הקודם">' + I('chevronRight') + '</button>' +
        '<h2>' + esc(state.view === 'month' ? U.fmtMonthYear(state.cursor) : U.fmtDayMonth(U.startOfWeek(state.cursor)) + ' – ' + U.fmtDayMonth(U.addDays(U.startOfWeek(state.cursor), 6))) + '</h2>' +
        '<button type="button" class="icon-btn" data-act="lessons-nav" data-d="1" aria-label="הבא">' + I('chevronLeft') + '</button><button type="button" class="btn btn-ghost btn-sm" data-act="lessons-nav" data-d="0">היום</button></div>';
      html += state.view === 'month' ? PS.cal.month(items, state.cursor, { dayAct: 'add-lesson' }) : PS.cal.weekAgenda(items, state.cursor);
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function section(title, icon, body) {
    return '<div class="card pad"><div class="card-head"><h3>' + I(icon) + esc(title) + '</h3></div>' + body + '</div>';
  }
  function textOr(v, empty) { return v ? '<div class="textblock">' + U.bidi(v) + '</div>' : '<p class="faint small">' + esc(empty) + '</p>'; }

  function renderDetail(el, id) {
    var l = PS.store.get('lessons', id);
    if (!l) return PS.views.notfound.render(el);
    var s = start(l);
    var up = l.status === 'upcoming' || l.status === 'rescheduled';
    var notes = PS.store.list('notes').filter(function (n) { return n.lessonId === l.id; });
    var tasks = PS.store.list('tasks').filter(function (t) { return t.lessonId === l.id; });
    var songs = (l.songIds || []).map(function (sid) { return PS.store.get('songs', sid); }).filter(Boolean);
    var html = '<div class="page"><a class="back-link" href="#/lessons">' + I('chevronRight') + 'כל השיעורים</a>' +
      '<div class="page-head"><div><div class="row" style="margin-bottom:8px">' + ui.status('lessons', l.status) + (up && s > new Date() ? '<span class="chip chip-gold">' + I('clock') + 'בעוד ' + esc(U.countdown(s)) + '</span>' : '') + '</div>' +
      '<h1>' + U.bidi(l.title) + '</h1><div class="meta" style="margin-top:8px"><span>' + I('calendar') + esc(U.fmtFull(l.date)) + '</span>' + (l.time ? '<span>' + I('clock') + esc(l.time) + (l.duration ? ' · ' + esc(U.fmtMinutes(l.duration)) : '') + '</span>' : '') +
      (l.teacher ? '<span>' + I('user') + U.bidi(l.teacher) + '</span>' : '') + (l.location ? '<span>' + I('mapPin') + U.bidi(l.location) + '</span>' : '') + (l.cost ? '<span>₪' + esc(l.cost) + '</span>' : '') + '</div></div>' +
      '<div class="page-actions">' + (up ? '<button type="button" class="btn btn-primary" data-act="lesson-complete" data-id="' + l.id + '">' + I('check') + 'סימון כהושלם</button>' : '') +
      '<button type="button" class="btn btn-ghost" data-act="lesson-edit" data-id="' + l.id + '">' + I('edit') + 'עריכה</button>' +
      '<button type="button" class="icon-btn" data-act="lesson-menu" data-id="' + l.id + '" aria-label="פעולות נוספות" aria-haspopup="menu">' + I('more') + '</button></div></div>';
    html += '<div class="detail-grid"><div class="stack">' +
      section('נושאים שנלמדו', 'layers', l.topics && l.topics.length ? ui.tags(l.topics) : '<p class="faint small">לא נרשמו נושאים</p>') +
      section('הנחיות המורה', 'user', textOr(l.instructions, 'אין הנחיות רשומות')) +
      section('שיעורי בית', 'list', textOr(l.homework, 'לא נרשמו שיעורי בית')) +
      section('הכנה לשיעור הבא', 'flag', textOr(l.nextPrep, 'אין הערות הכנה')) +
      section('הערות אישיות', 'pen', textOr(l.personalNotes, 'אין הערות אישיות')) +
    '</div><div class="stack">' +
      section('פרטים', 'info', '<dl class="kv"><dt>סטטוס</dt><dd>' + esc(L.lessonStatus[l.status]) + '</dd><dt>תזכורת</dt><dd>' + esc(L.reminder[l.reminder || 0] || '—') + '</dd>' +
        (l.completedAt ? '<dt>סומן כהושלם</dt><dd>' + esc(U.fmtDateTime(l.completedAt)) + '</dd>' : '') + '<dt>נוצר</dt><dd>' + esc(U.fmtDate(l.createdAt)) + '</dd></dl>') +
      section('שירים בשיעור', 'music', songs.length ? '<div class="list">' + songs.map(function (sg) { return '<a class="list-row" href="#/songs/' + sg.id + '" style="padding:8px 0">' + ui.cover(sg, 'cover-sm') + '<span class="grow"><span class="title">' + U.bidi(sg.title) + '</span><span class="sub">' + U.bidi(sg.artist || '') + '</span></span></a>'; }).join('') + '</div>' : '<p class="faint small">לא קושרו שירים</p>') +
      section('קישורים וחומרים', 'link', l.links && l.links.length ? '<div class="links">' + l.links.map(function (k) { return ui.linkBtn(k.url, k.label); }).join('') + '</div>' : '<p class="faint small">אין קישורים</p>') +
      section('פתקים מהשיעור', 'note', (notes.length ? '<div class="list">' + notes.map(function (n) { return '<a class="list-row" href="#/notes/' + n.id + '" style="padding:8px 0"><span class="grow"><span class="title">' + U.bidi(n.title) + '</span><span class="sub">' + esc(L.noteType[n.type] || '') + '</span></span></a>'; }).join('') + '</div>' : '<p class="faint small">אין פתקים מקושרים</p>') +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="lesson-add-note" data-id="' + l.id + '">' + I('plus') + 'פתק חדש</button>') +
      section('משימות קשורות', 'list', (tasks.length ? '<div class="list">' + tasks.map(function (t) { return '<a class="list-row" href="#/tasks?open=' + t.id + '" style="padding:8px 0"><span class="grow"><span class="title" style="' + (t.done ? 'text-decoration:line-through;color:var(--text-faint)' : '') + '">' + U.bidi(t.title) + '</span></span></a>'; }).join('') + '</div>' : '<p class="faint small">אין משימות</p>') +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="lesson-add-task" data-id="' + l.id + '">' + I('plus') + 'משימה חדשה</button>') +
    '</div></div></div>';
    el.innerHTML = html;
  }
  PS.act['lesson-add-note'] = function (el) { var l = PS.store.get('lessons', el.dataset.id); PS.act['add-note'](null, { lessonId: l.id, songIds: l.songIds || [] }); };
  PS.act['lesson-add-task'] = function (el) { PS.act['add-task'](null, { lessonId: el.dataset.id }); };

  PS.views.lessons = {
    title: function (r) { var l = r.params[0] && PS.store.get('lessons', r.params[0]); return l ? l.title : 'שיעורים'; },
    render: render
  };
})();
