/* Piano Studio — tasks & assignments for piano learning. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { view: 'today', q: '', category: '', priority: '', sort: 'due' };
  var opened = null;
  var justDone = null;

  var VIEWS = [
    { id: 'today', label: 'היום', icon: 'sparkle', test: function (t, d) { return !t.done && t.dueDate && t.dueDate <= d.today; } },
    { id: 'upcoming', label: 'קרובות', icon: 'calendar', test: function (t, d) { return !t.done && t.dueDate && t.dueDate > d.today; } },
    { id: 'overdue', label: 'באיחור', icon: 'alert', test: function (t, d) { return !t.done && t.dueDate && t.dueDate < d.today; } },
    { id: 'week', label: 'השבוע', icon: 'list', test: function (t, d) { return !t.done && t.dueDate && t.dueDate >= d.ws && t.dueDate <= d.we; } },
    { id: 'nodate', label: 'ללא תאריך', icon: 'flag', test: function (t) { return !t.done && !t.dueDate; } },
    { id: 'completed', label: 'הושלמו', icon: 'checkCircle', test: function (t) { return t.done; } },
    { id: 'all', label: 'הכל', icon: 'rows', test: function () { return true; } }
  ];
  function ctx() { var ws = U.startOfWeek(new Date()); return { today: U.todayKey(), ws: U.dkey(ws), we: U.dkey(U.addDays(ws, 6)) }; }

  function openForm(rec, preset) {
    var m = ui.editForm({ coll: 'tasks', record: rec || preset || { dueDate: state.view === 'today' ? U.todayKey() : '' }, icon: 'list' });
    if (rec && rec.id) {
      var foot = m.el.querySelector('.modal-foot');
      foot.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-danger" data-del style="margin-inline-end:auto">' + I('trash') + 'מחיקה</button>');
      foot.querySelector('[data-del]').onclick = function () { m.close(); ui.confirmDelete('tasks', rec.id); };
    }
    return m;
  }

  function toggle(id) {
    var t = PS.store.get('tasks', id);
    if (!t) return;
    var done = !t.done;
    if (done && (t.subtasks || []).some(function (s) { return !s.done; })) {
      ui.confirm({ title: 'יש תתי-משימות פתוחות', text: 'לסמן את כל המשימה כהושלמה (כולל תתי-המשימות)?', confirmLabel: 'סימון הכל' }).then(function (ok) {
        if (ok) finish(t, (t.subtasks || []).map(function (s) { return Object.assign({}, s, { done: true }); }));
      });
      return;
    }
    if (done) finish(t, t.subtasks);
    else { PS.store.update('tasks', id, { done: false }); ui.toast('המשימה סומנה כפתוחה. XP שכבר הוענק לא יוענק שוב.', 'info'); }
  }
  function finish(t, subs) {
    justDone = t.id;
    PS.store.update('tasks', t.id, { done: true, subtasks: subs });
    var had = PS.game.hasKey('task:' + t.id);
    ui.toast('המשימה הושלמה', 'success', { action: { label: 'ביטול', fn: function () { PS.store.update('tasks', t.id, { done: false }); } } });
    return had;
  }

  Object.assign(PS.act, {
    'add-task': function (el, preset) { openForm(null, preset && !preset.target ? Object.assign({}, preset) : null); },
    'task-edit': function (el) { var t = PS.store.get('tasks', el.dataset.id); if (t) openForm(t); },
    'task-toggle': function (el) { toggle(el.dataset.id); },
    'task-sub': function (el) {
      var t = PS.store.get('tasks', el.dataset.id);
      PS.store.update('tasks', t.id, { subtasks: t.subtasks.map(function (s) { return s.id === el.dataset.s ? Object.assign({}, s, { done: !s.done }) : s; }) });
    },
    'task-menu': function (el) {
      var t = PS.store.get('tasks', el.dataset.id);
      ui.menu(el, [
        { label: 'עריכה', icon: 'edit', fn: function () { openForm(t); } },
        { label: t.done ? 'סימון כפתוחה' : 'סימון כהושלמה', icon: 'check', fn: function () { toggle(t.id); } },
        { label: 'דחייה למחר', icon: 'calendar', fn: function () { PS.store.update('tasks', t.id, { dueDate: U.dkey(U.addDays(new Date(), 1)) }); ui.toast('נדחה למחר', 'info'); } },
        { label: 'שכפול', icon: 'copy', fn: function () {
          var c = Object.assign({}, t);
          ['id', 'createdAt', 'updatedAt', 'completedAt', 'spawnedNextId', 'seriesId'].forEach(function (k) { delete c[k]; });
          c.done = false;
          c.subtasks = (t.subtasks || []).map(function (s) { return { title: s.title, done: false }; });
          openForm(null, c);
        } },
        { sep: true },
        { label: 'מחיקה', icon: 'trash', danger: true, fn: function () { ui.confirmDelete('tasks', t.id); } }
      ]);
    },
    'tasks-view': function (el) { state.view = el.dataset.v; PS.refresh(); },
    'tasks-q': U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150),
    'tasks-filter': function (el) { state[el.dataset.k] = el.value; PS.refresh(); },
    'tasks-clear-done': function () {
      var done = PS.store.list('tasks').filter(function (t) { return t.done; });
      ui.confirm({ title: 'מחיקת משימות שהושלמו', text: 'למחוק ' + done.length + ' משימות שהושלמו? ה-XP שהוענק נשמר בהיסטוריה.', confirmLabel: 'מחיקה', danger: true }).then(function (ok) {
        if (ok) PS.store.batch(function () { done.forEach(function (t) { PS.store.remove('tasks', t.id); }); });
      });
    }
  });

  function quickSubmit(form) {
    var input = form.querySelector('input');
    var title = input.value.trim();
    if (!title) { input.focus(); return; }
    var due = state.view === 'today' || state.view === 'overdue' ? U.todayKey() : state.view === 'week' ? U.todayKey() : state.view === 'upcoming' ? U.dkey(U.addDays(new Date(), 1)) : '';
    PS.store.create('tasks', { title: title, dueDate: due });
    input.value = '';
    ui.toast('המשימה נוספה' + (due ? ' · ' + U.relDay(due) : ''), 'success');
  }
  document.addEventListener('submit', function (e) {
    if (e.target.matches('[data-quick-task]')) { e.preventDefault(); quickSubmit(e.target); }
  });

  function row(t, d) {
    var song = t.songId && PS.store.get('songs', t.songId);
    var lesson = t.lessonId && PS.store.get('lessons', t.lessonId);
    var course = t.courseId && PS.store.get('courses', t.courseId);
    var due = '';
    if (t.dueDate) {
      var cls = !t.done && t.dueDate < d.today ? 'overdue' : t.dueDate === d.today ? 'today' : '';
      due = '<span class="' + cls + '">' + I('calendar') + esc(U.relDay(t.dueDate)) + (cls === 'overdue' ? ' · באיחור' : '') + '</span>';
    }
    var subs = t.subtasks || [];
    return '<div class="task' + (t.done ? ' done' : '') + (justDone === t.id ? ' just-done' : '') + '" data-task="' + t.id + '">' +
      '<input type="checkbox" class="check round" data-act="task-toggle" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' aria-label="' + (t.done ? 'סימון כפתוחה' : 'השלמת המשימה') + ': ' + esc(t.title) + '">' +
      '<div class="grow"><div class="t-title" data-act="task-edit" data-id="' + t.id + '" style="cursor:pointer">' + U.bidi(t.title) + '</div>' +
      '<div class="meta">' + due + (t.priority && t.priority !== 'medium' ? ui.priority(t.priority) : '') + (t.category && t.category !== 'other' ? '<span>' + esc(L.taskCategory[t.category]) + '</span>' : '') +
        (t.estimate ? '<span>' + I('clock') + esc(U.fmtMinutes(t.estimate)) + '</span>' : '') +
        (t.recurrence && t.recurrence !== 'none' ? '<span title="משימה חוזרת">' + I('refresh') + esc(L.recurrence[t.recurrence]) + '</span>' : '') +
        (song ? '<a href="#/songs/' + song.id + '">' + I('music') + U.bidi(song.title) + '</a>' : '') +
        (lesson ? '<a href="#/lessons/' + lesson.id + '">' + I('clock') + U.bidi(lesson.title) + '</a>' : '') +
        (course ? '<a href="#/courses/' + course.id + '">' + I('book') + U.bidi(course.title) + '</a>' : '') +
        (subs.length ? '<span>' + I('checklist') + subs.filter(function (s) { return s.done; }).length + '/' + subs.length + '</span>' : '') +
        (t.done && t.completedAt ? '<span>' + I('check') + 'הושלמה ' + esc(U.timeAgo(t.completedAt)) + '</span>' : '') + '</div>' +
      (subs.length && !t.done ? '<div class="subtasks">' + subs.map(function (s) { return '<label class="' + (s.done ? 'done' : '') + '"><input type="checkbox" class="check" data-act="task-sub" data-id="' + t.id + '" data-s="' + s.id + '"' + (s.done ? ' checked' : '') + '><span>' + U.bidi(s.title) + '</span></label>'; }).join('') + '</div>' : '') +
      '</div><button type="button" class="icon-btn sm" data-act="task-menu" data-id="' + t.id + '" aria-label="פעולות" aria-haspopup="menu">' + I('more') + '</button></div>';
  }

  function render(el, route) {
    if (route.query.view) { state.view = route.query.view; }
    if (route.query.open && opened !== route.query.open) {
      opened = route.query.open;
      var target = PS.store.get('tasks', route.query.open);
      if (target) { state.view = target.done ? 'completed' : 'all'; setTimeout(function () { openForm(target); }, 50); }
    }
    if (route.query.view || route.query.open) { history.replaceState(null, '', '#/tasks'); delete route.query.view; delete route.query.open; }
    var d = ctx();
    var all = PS.store.list('tasks');
    var v = VIEWS.filter(function (x) { return x.id === state.view; })[0] || VIEWS[0];
    var PR = { high: 0, medium: 1, low: 2 };
    var list = all.filter(function (t) { return v.test(t, d); }).filter(function (t) {
      if (state.category && t.category !== state.category) return false;
      if (state.priority && t.priority !== state.priority) return false;
      return PS.search.matches(t, state.q, ['title', 'description', 'notes']);
    }).sort(function (a, b) {
      if (state.view === 'completed') return String(b.completedAt).localeCompare(String(a.completedAt));
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (state.sort === 'priority') return (PR[a.priority] - PR[b.priority]) || String(a.dueDate || '9').localeCompare(String(b.dueDate || '9'));
      if (state.sort === 'created') return String(b.createdAt).localeCompare(String(a.createdAt));
      return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || (PR[a.priority] - PR[b.priority]);
    });
    var html = '<div class="page"><div class="page-head"><div><h1>משימות</h1><p class="sub">מה צריך לעשות כדי להמשיך להתקדם — מסודר ובר-ביצוע</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-task">' + I('plus') + 'משימה מפורטת</button></div></div>';
    html += '<div class="tabs" role="tablist">' + VIEWS.map(function (x) {
      var n = all.filter(function (t) { return x.test(t, d); }).length;
      return '<button type="button" role="tab" aria-selected="' + (x.id === state.view) + '" class="' + (x.id === state.view ? 'on' : '') + '" data-act="tasks-view" data-v="' + x.id + '">' + I(x.icon) + esc(x.label) + (n ? ' <span class="count">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    if (state.view !== 'completed') html += '<form class="quick-task" data-quick-task><input class="input" type="text" maxlength="160" placeholder="הוספה מהירה: למשל ״לחפש תווים לשיר הבא״ ולחצו Enter" aria-label="הוספת משימה מהירה" data-keep="quick-task"><button type="submit" class="btn btn-primary">' + I('plus') + '<span class="hide-mobile">הוספה</span></button></form>';
    html += '<div class="toolbar"><div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש משימה…" value="' + esc(state.q) + '" data-input="tasks-q" data-keep="tasks-q" aria-label="חיפוש משימות"></div>' +
      '<select class="input" data-change="tasks-filter" data-k="category" aria-label="קטגוריה"><option value="">כל הקטגוריות</option>' + Object.keys(L.taskCategory).map(function (k) { return '<option value="' + k + '"' + (state.category === k ? ' selected' : '') + '>' + L.taskCategory[k] + '</option>'; }).join('') + '</select>' +
      '<select class="input" data-change="tasks-filter" data-k="priority" aria-label="עדיפות"><option value="">כל העדיפויות</option>' + Object.keys(L.priority).map(function (k) { return '<option value="' + k + '"' + (state.priority === k ? ' selected' : '') + '>עדיפות ' + L.priority[k] + '</option>'; }).join('') + '</select>' +
      '<select class="input" data-change="tasks-filter" data-k="sort" aria-label="מיון"><option value="due"' + (state.sort === 'due' ? ' selected' : '') + '>מיון: תאריך יעד</option><option value="priority"' + (state.sort === 'priority' ? ' selected' : '') + '>מיון: עדיפות</option><option value="created"' + (state.sort === 'created' ? ' selected' : '') + '>מיון: נוצרו לאחרונה</option></select>' +
      (state.view === 'completed' && list.length ? '<button type="button" class="btn btn-ghost btn-sm" data-act="tasks-clear-done">' + I('trash') + 'מחיקת שהושלמו</button>' : '') + '</div>';
    if (!list.length) {
      var emp = {
        today: { icon: 'sparkle', title: 'אין משימות להיום', text: 'נקי ומסודר. הוסיפו משימה למעלה או תכננו את השבוע.' },
        overdue: { icon: 'checkCircle', title: 'אין משימות באיחור', text: 'הכל בזמן — כל הכבוד.' },
        completed: { icon: 'checkCircle', title: 'עוד לא הושלמו משימות', text: 'כל משימה שתשלימו תעניק ' + PS.game.XP.task + ' XP (פעם אחת לכל משימה).' }
      }[state.view] || { icon: 'list', title: all.length ? 'אין משימות כאן' : 'אין עדיין משימות', text: all.length ? 'נסו תצוגה או סינון אחר.' : 'למשל: לחזור על ההערות מהשיעור, למצוא תווים, להכין שאלות למורה.' };
      html += '<div class="card">' + ui.empty(emp) + '</div>';
    } else {
      html += '<div class="card">' + list.map(function (t) { return row(t, d); }).join('') + '</div>';
    }
    el.innerHTML = html + '</div>';
    justDone = null;
  }

  PS.views.tasks = { title: function () { return 'משימות'; }, render: render };
})();
