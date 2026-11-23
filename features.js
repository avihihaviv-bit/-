/* Maslul feature modules.
   Loaded before the main app script. The main app calls MaslulFeatures.boot(api) once its
   state is ready; every module talks to the app only through that `api` bridge, so the
   original code keeps working untouched if a module fails. */
(function () {
  'use strict';
  var C = window.MaslulCore;
  var api = null;
  function S() { return api.state(); }
  function save() { api.save(); }
  function esc(s) { return api.escapeAttr(s == null ? '' : String(s)); }
  function ic(n) { return api.icon(n); }
  function todayKey() { return C.dkey(new Date()); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(root, sel, ev, fn) { $$(sel, root).forEach(function (el) { el.addEventListener(ev, function (e) { fn(el, e); }); }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  var HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var HE_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  var PRI = { urgent: { label: 'דחוף', color: 'var(--danger)' }, high: { label: 'גבוהה', color: 'var(--accent-2)' }, medium: { label: 'בינונית', color: 'var(--accent)' }, low: { label: 'נמוכה', color: 'var(--text-faint)' } };
  var STATUS_LABEL = { todo: 'לביצוע', doing: 'בתהליך', done: 'הושלם' };
  var RECUR_LABEL = { '': 'ללא', daily: 'כל יום', weekdays: 'ימי חול (א׳-ה׳)', weekly: 'כל שבוע', monthly: 'כל חודש' };
  function fmtDate(k) { if (!k) return ''; var d = C.parseKey(k); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); }
  function relDate(k) {
    var t = todayKey();
    if (k === t) return 'היום';
    if (k === C.addDays(t, 1)) return 'מחר';
    if (k === C.addDays(t, -1)) return 'אתמול';
    return fmtDate(k);
  }
  function minsLabel(m) { m = Math.round(m); if (m < 60) return m + ' דק׳'; var h = Math.floor(m / 60), r = m % 60; return h + ' ש׳' + (r ? ' ' + r + ' דק׳' : ''); }

  /* ---------------- generic modal ---------------- */
  function openModal(html, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop' + (opts.sheet ? ' sheet-backdrop' : '');
    wrap.addEventListener('click', function (e) { if (e.target === wrap) api.closeModal(); });
    wrap.innerHTML = '<div class="modal' + (opts.wide ? ' fx-modal-wide' : '') + (opts.sheet ? ' more-sheet' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    root.innerHTML = '';
    root.appendChild(wrap);
    var first = wrap.querySelector('[autofocus]') || wrap.querySelector('input,textarea,select');
    if (first && !opts.noFocus) setTimeout(function () { try { first.focus(); } catch (e) {} }, 30);
    return wrap.firstChild;
  }
  function emptyState(iconName, title, sub, ctaId, ctaLabel) {
    return '<div class="fx-empty"><div class="fx-empty-ic">' + ic(iconName) + '</div><div class="fx-empty-t">' + title + '</div>' +
      (sub ? '<div class="page-sub">' + sub + '</div>' : '') +
      (ctaId ? '<button class="btn btn-primary btn-sm" id="' + ctaId + '" style="margin-top:12px;">' + ic('plus') + ctaLabel + '</button>' : '') + '</div>';
  }
  function skeleton(lines) { var h = ''; for (var i = 0; i < (lines || 3); i++) h += '<div class="fx-skel" style="width:' + (60 + (i * 13) % 40) + '%"></div>'; return '<div class="fx-skel-wrap">' + h + '</div>'; }
  function progressBar(pct, color) { return '<div class="fx-bar"><div class="fx-bar-fill" style="width:' + Math.max(0, Math.min(100, pct)) + '%;' + (color ? 'background:' + color + ';' : '') + '"></div></div>'; }

  /* ================================================================
     TASKS
     ================================================================ */
  var taskUI = { view: 'today', q: '', priority: '', category: '', tag: '', sort: 'due' };
  function tasks() { return S().todo.tasks; }
  function findTask(id) { return tasks().filter(function (t) { return t.id === id; })[0]; }
  function allTags() { var m = {}; tasks().forEach(function (t) { t.tags.forEach(function (g) { m[g] = 1; }); }); return Object.keys(m).sort(); }

  function setTaskStatus(id, status, anchor) {
    var t = findTask(id);
    if (!t) return;
    if (status === 'done' && t.status !== 'done') {
      var res = C.completeTask(tasks(), id, Date.now(), todayKey(), api.uid);
      var g = res && api.grantXPOnce(res.xpEventId, C.taskXP(t), 'todo', { title: t.title });
      if (t.goalId) logGoalHistory(t.goalId, 'משימה הושלמה: ' + t.title);
      save();
      api.flushXP(anchor || null);
      api.toast(res && res.spawned ? 'הושלם ✓ · המופע הבא נוצר ל-' + relDate(res.spawned.due) : 'הושלם ✓', 'success');
      if (!g && res) { /* XP already granted once for this task instance - intentionally nothing */ }
    } else if (status !== 'done' && t.status === 'done') {
      C.reopenTask(tasks(), id);
      t.status = status;
      save();
    } else { t.status = status; save(); }
  }

  function taskRowHtml(t) {
    var b = C.taskBucket(t, todayKey());
    var subDone = t.subtasks.filter(function (s) { return s.done; }).length;
    var meta = [];
    if (t.due) meta.push('<span class="fx-chip' + (b === 'overdue' ? ' fx-chip-danger' : b === 'today' ? ' fx-chip-accent' : '') + '">' + ic('calendar') + relDate(t.due) + (t.time ? ' · <span dir="ltr">' + t.time + '</span>' : '') + '</span>');
    if (t.category) meta.push('<span class="fx-chip">' + esc(t.category) + '</span>');
    if (t.subtasks.length) meta.push('<span class="fx-chip">' + ic('list') + subDone + '/' + t.subtasks.length + '</span>');
    if (t.estimate) meta.push('<span class="fx-chip">' + ic('alarm') + minsLabel(t.estimate) + '</span>');
    if (t.recur) meta.push('<span class="fx-chip">↻ ' + RECUR_LABEL[t.recur] + '</span>');
    t.tags.forEach(function (g) { meta.push('<span class="fx-chip fx-chip-tag">#' + esc(g) + '</span>'); });
    return '<div class="fx-task' + (t.status === 'done' ? ' done' : '') + '" data-task-open="' + t.id + '">' +
      '<button class="fx-check' + (t.status === 'done' ? ' on' : '') + '" data-task-check="' + t.id + '" aria-label="' + (t.status === 'done' ? 'בטל השלמה' : 'סמן כהושלם') + '" style="--pc:' + PRI[t.priority].color + '">' + (t.status === 'done' ? ic('check') : '') + '</button>' +
      '<div class="fx-task-body"><div class="fx-task-title">' + esc(t.title) + (t.status === 'doing' ? ' <span class="fx-badge">בתהליך</span>' : '') + '</div>' +
        (meta.length ? '<div class="fx-task-meta">' + meta.join('') + '</div>' : '') + '</div>' +
      '<span class="fx-pri-dot" title="חשיבות ' + PRI[t.priority].label + '" style="background:' + PRI[t.priority].color + '"></span>' +
    '</div>';
  }

  function renderTasks(el) {
    var tk = todayKey();
    var all = tasks().filter(function (t) { return !t.archived; });
    var counts = {
      today: all.filter(function (t) { var b = C.taskBucket(t, tk); return (b === 'today' || b === 'overdue'); }).length,
      overdue: all.filter(function (t) { return C.taskBucket(t, tk) === 'overdue'; }).length,
      upcoming: all.filter(function (t) { return C.taskBucket(t, tk) === 'upcoming'; }).length,
      all: all.filter(function (t) { return t.status !== 'done'; }).length,
      archive: tasks().filter(function (t) { return t.archived; }).length
    };
    var views = [['today', 'היום'], ['all', 'הכל'], ['board', 'לוח Kanban'], ['overdue', 'באיחור'], ['upcoming', 'עתידיות'], ['archive', 'ארכיון']];
    var cats = S().todo.categories;
    el.innerHTML =
      '<div class="page-head"><div><h2 class="page-title">משימות</h2><p class="page-sub">כל מה שצריך לעשות, במקום אחד. <kbd>N</kbd> להוספה מהירה מכל מסך</p></div>' +
        '<button class="btn btn-primary" id="tk-add">' + ic('plus') + 'משימה</button></div>' +
      '<div class="fx-tabs" role="tablist">' + views.map(function (v) {
        var c = v[0] === 'board' ? '' : (counts[v[0]] ? '<span class="fx-tab-count' + (v[0] === 'overdue' ? ' danger' : '') + '">' + counts[v[0]] + '</span>' : '');
        return '<button role="tab" class="fx-tab' + (taskUI.view === v[0] ? ' active' : '') + '" data-tk-view="' + v[0] + '">' + v[1] + c + '</button>';
      }).join('') + '</div>' +
      '<div class="fx-quickbar"><input type="text" id="tk-quick" placeholder="הוספה מהירה: ״לקנות חלב מחר 18:00 !גבוה #בית״" maxlength="160"><button class="btn btn-primary btn-sm" id="tk-quick-btn">' + ic('plus') + '</button></div>' +
      '<div class="fx-toolbar">' +
        '<div class="fx-search">' + ic('search') + '<input type="search" id="tk-q" placeholder="חיפוש במשימות" value="' + esc(taskUI.q) + '"></div>' +
        '<select id="tk-f-pri" aria-label="סינון לפי חשיבות"><option value="">כל החשיבויות</option>' + Object.keys(PRI).map(function (p) { return '<option value="' + p + '"' + (taskUI.priority === p ? ' selected' : '') + '>' + PRI[p].label + '</option>'; }).join('') + '</select>' +
        '<select id="tk-f-cat" aria-label="סינון לפי קטגוריה"><option value="">כל הקטגוריות</option>' + cats.map(function (c) { return '<option' + (taskUI.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        (allTags().length ? '<select id="tk-f-tag" aria-label="סינון לפי תגית"><option value="">כל התגיות</option>' + allTags().map(function (g) { return '<option value="' + esc(g) + '"' + (taskUI.tag === g ? ' selected' : '') + '>#' + esc(g) + '</option>'; }).join('') + '</select>' : '') +
        '<select id="tk-sort" aria-label="מיון"><option value="due"' + (taskUI.sort === 'due' ? ' selected' : '') + '>מיון: תאריך</option><option value="priority"' + (taskUI.sort === 'priority' ? ' selected' : '') + '>מיון: חשיבות</option><option value="created"' + (taskUI.sort === 'created' ? ' selected' : '') + '>מיון: נוצרו לאחרונה</option></select>' +
      '</div>' +
      '<div id="tk-body"></div>';

    var body = $('#tk-body', el);
    var f = { q: taskUI.q, priority: taskUI.priority, category: taskUI.category, tag: taskUI.tag };
    if (taskUI.view === 'board') {
      var list = C.filterTasks(tasks(), f, tk);
      body.innerHTML = '<div class="fx-board">' + C.STATUSES.map(function (st) {
        var items = C.sortTasks(list.filter(function (t) { return t.status === st; }), taskUI.sort);
        return '<div class="fx-col" data-col="' + st + '"><div class="fx-col-head">' + STATUS_LABEL[st] + '<span class="fx-tab-count">' + items.length + '</span></div>' +
          '<div class="fx-col-body" data-drop="' + st + '">' + (items.length ? items.map(function (t) {
            return '<div class="fx-card" draggable="true" data-drag-task="' + t.id + '">' +
              '<div class="fx-card-top"><span class="fx-pri-dot" style="background:' + PRI[t.priority].color + '"></span><span class="fx-card-title" data-task-open="' + t.id + '">' + esc(t.title) + '</span></div>' +
              (t.due ? '<div class="fx-task-meta"><span class="fx-chip' + (C.taskBucket(t, tk) === 'overdue' ? ' fx-chip-danger' : '') + '">' + relDate(t.due) + '</span></div>' : '') +
              '<div class="fx-card-move">' + C.STATUSES.filter(function (s2) { return s2 !== st; }).map(function (s2) { return '<button class="fx-mini" data-move="' + t.id + '|' + s2 + '">→ ' + STATUS_LABEL[s2] + '</button>'; }).join('') + '</div>' +
            '</div>';
          }).join('') : '<div class="fx-col-empty">גרור לכאן</div>') + '</div></div>';
      }).join('') + '</div>';
      wireBoard(body, el);
    } else {
      var view = taskUI.view === 'all' ? null : taskUI.view;
      var items = C.sortTasks(C.filterTasks(tasks(), Object.assign({ view: view, includeArchived: taskUI.view === 'archive' }, f), tk), taskUI.sort);
      if (taskUI.view === 'all') items = items.filter(function (t) { return t.status !== 'done' || t.doneAt > Date.now() - 864e5; });
      if (!items.length) {
        var msg = { today: ['אין משימות להיום', 'יום נקי. אפשר להוסיף משימה או לתכנן את מחר.'], overdue: ['אין משימות באיחור', 'כל הכבוד, הכל בזמן.'], upcoming: ['אין משימות עתידיות', 'משימות עם תאריך עתידי יופיעו כאן.'], archive: ['הארכיון ריק', 'משימות שהושלמו ונשלחו לארכיון יופיעו כאן.'], all: ['אין משימות פתוחות', 'תוסיף את הראשונה, זה לוקח שנייה.'] }[taskUI.view];
        body.innerHTML = emptyState('check', msg[0], (taskUI.q || taskUI.priority || taskUI.category || taskUI.tag) ? 'אין תוצאות לסינון הנוכחי.' : msg[1], taskUI.view === 'archive' ? null : 'tk-empty-add', 'משימה חדשה');
      } else {
        var groups = [];
        if (taskUI.view === 'today') {
          var od = items.filter(function (t) { return C.taskBucket(t, tk) === 'overdue'; });
          var td = items.filter(function (t) { return C.taskBucket(t, tk) !== 'overdue'; });
          if (od.length) groups.push(['באיחור', od, true]);
          groups.push(['להיום', td]);
        } else groups.push(['', items]);
        body.innerHTML = groups.map(function (g) {
          return (g[0] ? '<div class="fx-group-title' + (g[2] ? ' danger' : '') + '">' + g[0] + ' · ' + g[1].length + '</div>' : '') +
            '<div class="fx-task-list">' + (g[1].length ? g[1].map(taskRowHtml).join('') : '<div class="page-sub" style="padding:10px 4px;">אין משימות פתוחות להיום</div>') + '</div>';
        }).join('') +
        (taskUI.view !== 'archive' && items.some(function (t) { return t.status === 'done'; }) ? '<button class="btn btn-ghost btn-sm" id="tk-archive-done" style="margin-top:12px;">' + ic('bookmark') + 'העבר שהושלמו לארכיון</button>' : '');
      }
    }

    on(el, '[data-tk-view]', 'click', function (b) { taskUI.view = b.dataset.tkView; renderTasks(el); });
    $('#tk-add', el).addEventListener('click', function () { openTaskEditor(null, { due: taskUI.view === 'today' ? tk : null }); });
    var ea = $('#tk-empty-add', el); if (ea) ea.addEventListener('click', function () { openTaskEditor(null, { due: taskUI.view === 'today' ? tk : null }); });
    var qi = $('#tk-q', el);
    qi.addEventListener('input', debounce(function () { taskUI.q = qi.value; renderTasks(el); var n = $('#tk-q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
    $('#tk-f-pri', el).addEventListener('change', function (e) { taskUI.priority = e.target.value; renderTasks(el); });
    $('#tk-f-cat', el).addEventListener('change', function (e) { taskUI.category = e.target.value; renderTasks(el); });
    var tg = $('#tk-f-tag', el); if (tg) tg.addEventListener('change', function (e) { taskUI.tag = e.target.value; renderTasks(el); });
    $('#tk-sort', el).addEventListener('change', function (e) { taskUI.sort = e.target.value; renderTasks(el); });
    var quick = $('#tk-quick', el);
    var doQuick = function () {
      var p = C.parseQuickAdd(quick.value, tk);
      if (!p.title) { quick.focus(); return; }
      addTask({ title: p.title, due: p.due || (taskUI.view === 'today' ? tk : null), time: p.time, priority: p.priority || 'medium', tags: p.tags });
      api.toast('נוספה: ' + p.title, 'success');
      renderTasks(el);
      $('#tk-quick', el).focus();
    };
    quick.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doQuick(); } });
    $('#tk-quick-btn', el).addEventListener('click', doQuick);
    wireTaskRows(el, function () { renderTasks(el); });
    var arch = $('#tk-archive-done', el);
    if (arch) arch.addEventListener('click', function () {
      var n = 0; tasks().forEach(function (t) { if (t.status === 'done' && !t.archived) { t.archived = true; n++; } });
      save(); api.toast(n + ' משימות הועברו לארכיון', 'success'); renderTasks(el);
    });
  }
  function wireTaskRows(root, rerender) {
    on(root, '[data-task-check]', 'click', function (b, e) {
      e.stopPropagation();
      var t = findTask(b.dataset.taskCheck);
      setTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done', b);
      rerender();
    });
    on(root, '[data-task-open]', 'click', function (b, e) { if (e.target.closest('[data-task-check]')) return; openTaskEditor(findTask(b.dataset.taskOpen), null, rerender); });
  }
  function wireBoard(body, el) {
    var dragId = null;
    on(body, '[data-drag-task]', 'dragstart', function (c, e) { dragId = c.dataset.dragTask; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
    on(body, '[data-drag-task]', 'dragend', function (c) { c.classList.remove('dragging'); });
    on(body, '[data-drop]', 'dragover', function (z, e) { e.preventDefault(); z.classList.add('over'); });
    on(body, '[data-drop]', 'dragleave', function (z) { z.classList.remove('over'); });
    on(body, '[data-drop]', 'drop', function (z, e) {
      e.preventDefault(); z.classList.remove('over');
      var id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (id) { setTaskStatus(id, z.dataset.drop, z); renderTasks(el); }
    });
    on(body, '[data-move]', 'click', function (b, e) { e.stopPropagation(); var p = b.dataset.move.split('|'); setTaskStatus(p[0], p[1], b); renderTasks(el); });
    on(body, '[data-task-open]', 'click', function (b) { openTaskEditor(findTask(b.dataset.taskOpen), null, function () { renderTasks(el); }); });
  }
  function addTask(fields) {
    var t = C.newTask(fields, api.uid(), Date.now());
    tasks().push(t);
    save();
    return t;
  }

  function openTaskEditor(existing, defaults, after) {
    var isEdit = !!existing;
    var t = existing ? JSON.parse(JSON.stringify(existing)) : C.newTask(Object.assign({}, defaults || {}), api.uid(), Date.now());
    var cats = S().todo.categories;
    var goals = S().goals || [];
    var m = openModal(
      '<h3>' + (isEdit ? 'עריכת משימה' : 'משימה חדשה') + '</h3>' +
      '<div class="field"><label>שם</label><input type="text" id="te-title" maxlength="120" value="' + esc(t.title) + '" placeholder="מה צריך לעשות?" autofocus></div>' +
      '<div class="field"><label>תיאור</label><textarea id="te-desc" rows="2" placeholder="אופציונלי">' + esc(t.description) + '</textarea></div>' +
      '<div class="field-row"><div class="field"><label>תאריך יעד</label><input type="date" id="te-due" value="' + (t.due || '') + '"></div>' +
        '<div class="field"><label>שעה</label><input type="time" id="te-time" value="' + (t.time || '') + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>חשיבות</label><select id="te-pri">' + Object.keys(PRI).map(function (p) { return '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + PRI[p].label + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>סטטוס</label><select id="te-status">' + C.STATUSES.map(function (s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field-row"><div class="field"><label>קטגוריה</label><input type="text" id="te-cat" list="te-cats" value="' + esc(t.category) + '" placeholder="למשל: לימודים"><datalist id="te-cats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>זמן משוער (דק׳)</label><input type="number" id="te-est" min="0" step="5" inputmode="numeric" value="' + (t.estimate || '') + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>חזרה</label><select id="te-recur">' + Object.keys(RECUR_LABEL).map(function (r) { return '<option value="' + r + '"' + ((t.recur || '') === r ? ' selected' : '') + '>' + RECUR_LABEL[r] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>שייכת למטרה</label><select id="te-goal"><option value="">ללא</option>' + goals.map(function (g) { return '<option value="' + g.id + '"' + (t.goalId === g.id ? ' selected' : '') + '>' + esc(g.title) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label>תגיות (מופרדות בפסיק)</label><input type="text" id="te-tags" value="' + esc(t.tags.join(', ')) + '" placeholder="בית, דחוף"></div>' +
      '<div class="field"><label>תת-משימות</label><div id="te-subs"></div><div class="ms-add-row"><input type="text" class="ms-input" id="te-sub-in" placeholder="הוסף תת-משימה"><button class="btn btn-ghost btn-sm" id="te-sub-add" type="button">' + ic('plus') + '</button></div></div>' +
      '<div class="field"><label>הערות</label><textarea id="te-notes" rows="2">' + esc(t.notes) + '</textarea></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-primary btn-block" id="te-save">' + ic('check') + (isEdit ? 'שמור' : 'הוסף') + '</button>' +
        (isEdit ? '<button class="btn btn-ghost" id="te-arch" title="' + (t.archived ? 'החזר מהארכיון' : 'לארכיון') + '">' + ic('bookmark') + '</button><button class="btn btn-danger" id="te-del" aria-label="מחק">' + ic('trash') + '</button>' : '') +
        '<button class="btn btn-ghost" id="te-cancel" aria-label="סגור">' + ic('x') + '</button>' +
      '</div>', { wide: true });
    function paintSubs() {
      $('#te-subs', m).innerHTML = t.subtasks.map(function (s) {
        return '<div class="ms-item' + (s.done ? ' done' : '') + '"><button class="ms-check' + (s.done ? ' done' : '') + '" data-sub-t="' + s.id + '" type="button">' + (s.done ? ic('check') : '') + '</button><span class="ms-title">' + esc(s.title) + '</span><button class="ms-del" data-sub-d="' + s.id + '" type="button" aria-label="מחק">' + ic('x') + '</button></div>';
      }).join('');
      on(m, '[data-sub-t]', 'click', function (b) { t.subtasks.forEach(function (s) { if (s.id === b.dataset.subT) s.done = !s.done; }); paintSubs(); });
      on(m, '[data-sub-d]', 'click', function (b) { t.subtasks = t.subtasks.filter(function (s) { return s.id !== b.dataset.subD; }); paintSubs(); });
    }
    paintSubs();
    var addSub = function () { var v = $('#te-sub-in', m).value.trim(); if (!v) return; t.subtasks.push({ id: api.uid(), title: v, done: false }); $('#te-sub-in', m).value = ''; paintSubs(); $('#te-sub-in', m).focus(); };
    $('#te-sub-add', m).addEventListener('click', addSub);
    $('#te-sub-in', m).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
    $('#te-cancel', m).addEventListener('click', api.closeModal);
    var done = function () { api.closeModal(); (after || rerenderActive)(); };
    if (isEdit) {
      $('#te-del', m).addEventListener('click', function () {
        api.openConfirmModal('למחוק את המשימה "' + existing.title + '"?', function () {
          S().todo.tasks = tasks().filter(function (x) { return x.id !== existing.id; }); save(); api.toast('נמחקה'); (after || rerenderActive)();
        });
      });
      $('#te-arch', m).addEventListener('click', function () { existing.archived = !existing.archived; save(); api.toast(existing.archived ? 'הועברה לארכיון' : 'הוחזרה מהארכיון', 'success'); done(); });
    }
    $('#te-save', m).addEventListener('click', function () {
      var title = $('#te-title', m).value.trim();
      if (!title) { $('#te-title', m).focus(); $('#te-title', m).classList.add('fx-invalid'); return; }
      var cat = $('#te-cat', m).value.trim();
      if (cat && cats.indexOf(cat) < 0) cats.push(cat);
      var fields = {
        title: title, description: $('#te-desc', m).value.trim(), due: $('#te-due', m).value || null, time: $('#te-time', m).value || null,
        priority: $('#te-pri', m).value, category: cat, estimate: +$('#te-est', m).value || null, recur: $('#te-recur', m).value || null,
        goalId: $('#te-goal', m).value || null, notes: $('#te-notes', m).value.trim(),
        tags: $('#te-tags', m).value.split(',').map(function (x) { return x.trim().replace(/^#/, ''); }).filter(Boolean),
        subtasks: t.subtasks
      };
      var newStatus = $('#te-status', m).value;
      if (isEdit) {
        Object.keys(fields).forEach(function (k) { existing[k] = fields[k]; });
        save();
        if (newStatus !== existing.status) setTaskStatus(existing.id, newStatus);
        api.toast('נשמר', 'success');
      } else {
        var nt = addTask(fields);
        if (newStatus !== 'todo') setTaskStatus(nt.id, newStatus);
        api.toast('המשימה נוספה', 'success');
      }
      done();
    });
  }

  /* ================================================================
     QUICK ADD + INBOX + NOTES
     ================================================================ */
  function openQuickAdd() {
    var tk = todayKey();
    var mode = 'task';
    var m = openModal(
      '<h3>הוספה מהירה</h3>' +
      '<div class="seg fx-seg" id="qa-mode"><button data-qa="task" class="active">משימה</button><button data-qa="inbox">Inbox</button><button data-qa="note">פתק</button></div>' +
      '<div class="field" style="margin-top:12px;"><input type="text" id="qa-in" maxlength="200" placeholder="מה בראש?" autofocus></div>' +
      '<div class="page-sub" id="qa-preview" style="min-height:20px;"></div>' +
      '<div class="page-sub" style="font-size:12px;margin-top:4px;">טיפ: ״מחר 18:00 !גבוה #בית״ מזוהים אוטומטית במשימות</div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="qa-save">' + ic('plus') + 'הוסף</button><button class="btn btn-ghost" id="qa-full" title="טופס מלא">' + ic('edit') + '</button></div>');
    var inp = $('#qa-in', m);
    var prev = function () {
      if (mode !== 'task' || !inp.value.trim()) { $('#qa-preview', m).textContent = ''; return; }
      var p = C.parseQuickAdd(inp.value, tk);
      var bits = [];
      if (p.due) bits.push('📅 ' + relDate(p.due)); if (p.time) bits.push('🕒 ' + p.time); if (p.priority) bits.push('⚑ ' + PRI[p.priority].label); p.tags.forEach(function (g) { bits.push('#' + g); });
      $('#qa-preview', m).textContent = bits.length ? '«' + p.title + '» · ' + bits.join(' · ') : '';
    };
    inp.addEventListener('input', prev);
    on(m, '[data-qa]', 'click', function (b) { mode = b.dataset.qa; $$('[data-qa]', m).forEach(function (x) { x.classList.toggle('active', x === b); }); prev(); inp.focus(); });
    var commit = function () {
      var v = inp.value.trim(); if (!v) { inp.focus(); return; }
      if (mode === 'task') { var p = C.parseQuickAdd(v, tk); addTask({ title: p.title || v, due: p.due, time: p.time, priority: p.priority || 'medium', tags: p.tags }); api.toast('משימה נוספה', 'success'); }
      else if (mode === 'inbox') { S().inbox.unshift({ id: api.uid(), text: v, at: Date.now() }); save(); api.toast('נשמר ב-Inbox', 'success'); }
      else { S().notes.unshift({ id: api.uid(), title: v.slice(0, 60), body: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() }); save(); api.toast('פתק נוצר', 'success'); }
      api.closeModal(); rerenderActive();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    $('#qa-save', m).addEventListener('click', commit);
    $('#qa-full', m).addEventListener('click', function () { var v = inp.value.trim(); var p = C.parseQuickAdd(v, tk); api.closeModal(); openTaskEditor(null, { title: p.title, due: p.due, time: p.time, priority: p.priority || 'medium', tags: p.tags }); });
  }

  var notesUI = { tab: 'inbox', openId: null, q: '' };
  function renderNotes(el) {
    var st = S();
    var html = '<div class="page-head"><div><h2 class="page-title">מחברת</h2><p class="page-sub">Inbox לרעיונות שעוד לא סווגו, ופתקים אישיים</p></div></div>' +
      '<div class="fx-tabs"><button class="fx-tab' + (notesUI.tab === 'inbox' ? ' active' : '') + '" data-nt-tab="inbox">Inbox' + (st.inbox.length ? '<span class="fx-tab-count">' + st.inbox.length + '</span>' : '') + '</button><button class="fx-tab' + (notesUI.tab === 'notes' ? ' active' : '') + '" data-nt-tab="notes">פתקים<span class="fx-tab-count">' + st.notes.length + '</span></button></div>';
    if (notesUI.tab === 'inbox') {
      html += '<div class="fx-quickbar"><input type="text" id="ib-in" placeholder="רעיון, משימה, משהו לזכור… Enter לשמירה" maxlength="300"><button class="btn btn-primary btn-sm" id="ib-add">' + ic('plus') + '</button></div>' +
        (st.inbox.length ? '<div class="fx-task-list">' + st.inbox.map(function (it) {
          return '<div class="fx-inbox-item"><div class="fx-task-body"><div class="fx-task-title">' + esc(it.text) + '</div><div class="page-sub" style="font-size:11.5px;">' + new Date(it.at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</div></div>' +
            '<div class="fx-inbox-actions"><button class="fx-mini" data-ib-task="' + it.id + '">' + ic('check') + 'למשימה</button><button class="fx-mini" data-ib-note="' + it.id + '">' + ic('note') + 'לפתק</button><button class="fx-mini" data-ib-del="' + it.id + '" aria-label="מחק">' + ic('trash') + '</button></div></div>';
        }).join('') + '</div>' : emptyState('note', 'ה-Inbox ריק', 'זרוק לכאן כל מחשבה, ותסווג אחר כך למשימה או לפתק.'));
    } else {
      var q = notesUI.q.trim().toLowerCase();
      var list = st.notes.filter(function (n) { return !q || (n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt); });
      var open = st.notes.filter(function (n) { return n.id === notesUI.openId; })[0];
      html += '<div class="fx-notes">' +
        '<div class="fx-notes-list' + (open ? ' has-open' : '') + '"><div class="fx-toolbar"><div class="fx-search">' + ic('search') + '<input type="search" id="nt-q" placeholder="חיפוש בפתקים" value="' + esc(notesUI.q) + '"></div><button class="btn btn-primary btn-sm" id="nt-new">' + ic('plus') + 'פתק</button></div>' +
          (list.length ? list.map(function (n) {
            return '<button class="fx-note-row' + (n.id === notesUI.openId ? ' active' : '') + '" data-nt-open="' + n.id + '"><div class="fx-task-title">' + (n.pinned ? '📌 ' : '') + esc(n.title || 'ללא כותרת') + '</div><div class="page-sub fx-clip">' + esc((n.body || '').slice(0, 90)) + '</div></button>';
          }).join('') : emptyState('note', st.notes.length ? 'אין תוצאות' : 'אין עדיין פתקים', st.notes.length ? '' : 'מחברת אישית לרעיונות, סיכומים ומחשבות.')) +
        '</div>' +
        (open ? '<div class="fx-note-editor card"><div class="fx-note-head"><button class="btn btn-ghost btn-sm fx-only-mobile" id="nt-back">→ חזרה</button><button class="btn btn-ghost btn-sm" id="nt-pin">' + (open.pinned ? 'בטל נעיצה' : '📌 נעץ') + '</button><button class="btn btn-ghost btn-sm" id="nt-totask">' + ic('check') + 'צור משימה</button><button class="btn btn-danger btn-sm" id="nt-del" aria-label="מחק פתק">' + ic('trash') + '</button></div>' +
          '<input type="text" id="nt-title" class="fx-note-title" value="' + esc(open.title) + '" placeholder="כותרת" maxlength="120">' +
          '<textarea id="nt-body" class="fx-note-body" placeholder="כתוב כאן…">' + esc(open.body) + '</textarea>' +
          '<div class="page-sub" id="nt-saved" style="font-size:11.5px;">נשמר אוטומטית · ' + new Date(open.updatedAt).toLocaleString('he-IL') + '</div></div>' : '<div class="fx-note-editor fx-note-placeholder fx-only-desktop">' + emptyState('edit', 'בחר פתק', 'או צור פתק חדש') + '</div>') +
      '</div>';
    }
    el.innerHTML = html;
    on(el, '[data-nt-tab]', 'click', function (b) { notesUI.tab = b.dataset.ntTab; renderNotes(el); });
    if (notesUI.tab === 'inbox') {
      var inp = $('#ib-in', el);
      var add = function () { var v = inp.value.trim(); if (!v) return; st.inbox.unshift({ id: api.uid(), text: v, at: Date.now() }); save(); renderNotes(el); $('#ib-in', el).focus(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      $('#ib-add', el).addEventListener('click', add);
      var take = function (id) { var it = st.inbox.filter(function (x) { return x.id === id; })[0]; st.inbox = st.inbox.filter(function (x) { return x.id !== id; }); return it; };
      on(el, '[data-ib-del]', 'click', function (b) { take(b.dataset.ibDel); save(); renderNotes(el); });
      on(el, '[data-ib-note]', 'click', function (b) { var it = take(b.dataset.ibNote); var n = { id: api.uid(), title: it.text.slice(0, 60), body: it.text.length > 60 ? it.text : '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() }; st.notes.unshift(n); save(); notesUI.tab = 'notes'; notesUI.openId = n.id; renderNotes(el); api.toast('הועבר לפתקים', 'success'); });
      on(el, '[data-ib-task]', 'click', function (b) { var it = take(b.dataset.ibTask); save(); var p = C.parseQuickAdd(it.text, todayKey()); openTaskEditor(null, { title: p.title || it.text, due: p.due, time: p.time, priority: p.priority || 'medium', tags: p.tags }, function () { renderNotes(el); }); renderNotes(el); });
    } else {
      var nq = $('#nt-q', el);
      nq.addEventListener('input', debounce(function () { notesUI.q = nq.value; renderNotes(el); var n = $('#nt-q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
      $('#nt-new', el).addEventListener('click', function () { var n = { id: api.uid(), title: '', body: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() }; st.notes.unshift(n); save(); notesUI.openId = n.id; renderNotes(el); $('#nt-title', el).focus(); });
      on(el, '[data-nt-open]', 'click', function (b) { notesUI.openId = b.dataset.ntOpen; renderNotes(el); });
      var open2 = st.notes.filter(function (n) { return n.id === notesUI.openId; })[0];
      if (open2) {
        var persist = debounce(function () { open2.title = $('#nt-title', el).value; open2.body = $('#nt-body', el).value; open2.updatedAt = Date.now(); save(); var s = $('#nt-saved', el); if (s) s.textContent = 'נשמר אוטומטית · ' + new Date().toLocaleTimeString('he-IL'); }, 400);
        $('#nt-title', el).addEventListener('input', persist);
        $('#nt-body', el).addEventListener('input', persist);
        $('#nt-pin', el).addEventListener('click', function () { open2.pinned = !open2.pinned; save(); renderNotes(el); });
        $('#nt-back', el).addEventListener('click', function () { notesUI.openId = null; renderNotes(el); });
        $('#nt-totask', el).addEventListener('click', function () { openTaskEditor(null, { title: open2.title || 'משימה מפתק', description: open2.body.slice(0, 500) }); });
        $('#nt-del', el).addEventListener('click', function () { api.openConfirmModal('למחוק את הפתק?', function () { st.notes = st.notes.filter(function (n) { return n.id !== open2.id; }); notesUI.openId = null; save(); renderNotes(el); }); });
      }
    }
  }

  /* ================================================================
     CALENDAR
     ================================================================ */
  var calUI = { view: 'month', cursor: null };
  function dayItems(k) {
    var st = S();
    var routine = (st.tasksByDate[k] || []);
    return {
      tasks: tasks().filter(function (t) { return t.due === k && !t.archived; }),
      events: st.events.filter(function (e) { return e.date === k; }).sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); }),
      routine: routine.slice().sort(function (a, b) { return a.time.localeCompare(b.time); })
    };
  }
  function loadLevel(k) {
    var it = dayItems(k);
    var mins = it.tasks.reduce(function (a, t) { return a + (+t.estimate || 30); }, 0) + it.events.length * 60;
    return mins >= 300 ? 3 : mins >= 150 ? 2 : mins > 0 ? 1 : 0;
  }
  function renderCalendar(el) {
    var tk = todayKey();
    if (!calUI.cursor) calUI.cursor = tk;
    var cur = C.parseKey(calUI.cursor);
    var title;
    var body = '';
    if (calUI.view === 'month') {
      title = cur.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
      var first = new Date(cur.getFullYear(), cur.getMonth(), 1);
      var start = C.addDays(C.dkey(first), -first.getDay());
      body = '<div class="fx-cal-grid">' + HE_DAYS_SHORT.map(function (d) { return '<div class="fx-cal-dow">' + d + '</div>'; }).join('');
      for (var i = 0; i < 42; i++) {
        var k = C.addDays(start, i), d = C.parseKey(k);
        var it = dayItems(k);
        var other = d.getMonth() !== cur.getMonth();
        var n = it.tasks.length + it.events.length;
        body += '<button class="fx-cal-cell' + (other ? ' other' : '') + (k === tk ? ' today' : '') + ' load-' + loadLevel(k) + '" data-cal-day="' + k + '" data-drop-day="' + k + '">' +
          '<span class="fx-cal-num">' + d.getDate() + '</span>' +
          '<span class="fx-cal-dots">' + it.events.slice(0, 2).map(function (e) { return '<i class="ev" draggable="true" data-drag-ev="' + e.id + '" title="' + esc(e.title) + '">' + esc(e.title) + '</i>'; }).join('') +
            it.tasks.slice(0, 2).map(function (t) { return '<i class="tk' + (t.status === 'done' ? ' done' : '') + '" draggable="true" data-drag-tk="' + t.id + '" title="' + esc(t.title) + '">' + esc(t.title) + '</i>'; }).join('') +
            (n > 4 ? '<i class="more">+' + (n - 4) + '</i>' : '') + '</span></button>';
      }
      body += '</div>';
    } else if (calUI.view === 'week') {
      var ws = C.addDays(calUI.cursor, -cur.getDay());
      title = fmtDate(ws) + ' – ' + fmtDate(C.addDays(ws, 6));
      body = '<div class="fx-week">';
      for (var j = 0; j < 7; j++) {
        var k2 = C.addDays(ws, j), it2 = dayItems(k2);
        body += '<div class="fx-week-col' + (k2 === tk ? ' today' : '') + '" data-drop-day="' + k2 + '"><button class="fx-week-head" data-cal-day="' + k2 + '">' + HE_DAYS[j] + ' <b>' + C.parseKey(k2).getDate() + '</b></button>' +
          it2.events.map(function (e) { return '<div class="fx-wk-item ev" draggable="true" data-drag-ev="' + e.id + '" data-ev-open="' + e.id + '">' + (e.time ? '<span dir="ltr">' + e.time + '</span> ' : '') + esc(e.title) + '</div>'; }).join('') +
          it2.tasks.map(function (t) { return '<div class="fx-wk-item tk' + (t.status === 'done' ? ' done' : '') + '" draggable="true" data-drag-tk="' + t.id + '" data-task-open="' + t.id + '">' + (t.time ? '<span dir="ltr">' + t.time + '</span> ' : '') + esc(t.title) + '</div>'; }).join('') +
          (it2.routine.length ? '<div class="fx-wk-routine">' + it2.routine.length + ' פעילויות שגרה</div>' : '') +
        '</div>';
      }
      body += '</div>';
    } else {
      title = cur.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
      var it3 = dayItems(calUI.cursor);
      var rows = [];
      it3.routine.forEach(function (r) { rows.push({ time: r.time, html: '<div class="fx-day-row routine' + (r.done ? ' done' : '') + '"><span class="fx-day-time" dir="ltr">' + r.time + '</span><span>' + esc(r.title) + '</span><span class="fx-chip">שגרה</span></div>' }); });
      it3.events.forEach(function (e) { rows.push({ time: e.time || '00:00', html: '<div class="fx-day-row ev" data-ev-open="' + e.id + '"><span class="fx-day-time" dir="ltr">' + (e.time || 'כל היום') + '</span><span>' + esc(e.title) + '</span><span class="fx-chip">אירוע</span></div>' }); });
      it3.tasks.forEach(function (t) { rows.push({ time: t.time || '99:99', html: '<div class="fx-day-row tk' + (t.status === 'done' ? ' done' : '') + '" data-task-open="' + t.id + '"><span class="fx-day-time" dir="ltr">' + (t.time || '—') + '</span><span>' + esc(t.title) + '</span><span class="fx-chip" style="color:' + PRI[t.priority].color + '">משימה</span></div>' }); });
      rows.sort(function (a, b) { return a.time.localeCompare(b.time); });
      body = (rows.length ? '<div class="card">' + rows.map(function (r) { return r.html; }).join('') + '</div>' : emptyState('calendar', 'אין כלום ביום הזה', 'אפשר להוסיף אירוע או משימה.'));
      if (!it3.routine.length && calUI.cursor > tk) body += '<p class="page-sub" style="margin-top:8px;">השגרה של יום זה תיווצר אוטומטית מהתבנית כשהיום יגיע.</p>';
    }
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">לוח שנה</h2><p class="page-sub">אירועים, משימות ושגרה. גרור משימה או אירוע ליום אחר כדי לשנות מועד</p></div>' +
        '<button class="btn btn-primary" id="cal-add-ev">' + ic('plus') + 'אירוע</button></div>' +
      '<div class="fx-cal-bar"><div class="seg">' + [['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש']].map(function (v) { return '<button data-cal-view="' + v[0] + '" class="' + (calUI.view === v[0] ? 'active' : '') + '">' + v[1] + '</button>'; }).join('') + '</div>' +
        '<div class="fx-cal-nav"><button class="btn-icon" id="cal-prev" aria-label="הקודם">›</button><b class="fx-cal-title">' + title + '</b><button class="btn-icon" id="cal-next" aria-label="הבא">‹</button><button class="btn btn-ghost btn-sm" id="cal-today">היום</button></div></div>' +
      (calUI.view === 'month' ? '<div class="fx-cal-legend"><span><i class="lg l1"></i>עומס קל</span><span><i class="lg l2"></i>בינוני</span><span><i class="lg l3"></i>עמוס</span></div>' : '') +
      body;
    on(el, '[data-cal-view]', 'click', function (b) { calUI.view = b.dataset.calView; renderCalendar(el); });
    var step = function (dir) {
      var c = C.parseKey(calUI.cursor);
      if (calUI.view === 'month') { c.setDate(1); c.setMonth(c.getMonth() + dir); calUI.cursor = C.dkey(c); }
      else calUI.cursor = C.addDays(calUI.cursor, dir * (calUI.view === 'week' ? 7 : 1));
      renderCalendar(el);
    };
    $('#cal-prev', el).addEventListener('click', function () { step(-1); });
    $('#cal-next', el).addEventListener('click', function () { step(1); });
    $('#cal-today', el).addEventListener('click', function () { calUI.cursor = tk; renderCalendar(el); });
    $('#cal-add-ev', el).addEventListener('click', function () { openEventEditor(null, calUI.view === 'month' ? tk : calUI.cursor, function () { renderCalendar(el); }); });
    on(el, '[data-cal-day]', 'click', function (b, e) { if (e.target.closest('[data-drag-tk],[data-drag-ev]') && calUI.view !== 'month') return; calUI.cursor = b.dataset.calDay; calUI.view = 'day'; renderCalendar(el); });
    on(el, '[data-ev-open]', 'click', function (b, e) { e.stopPropagation(); openEventEditor(S().events.filter(function (x) { return x.id === b.dataset.evOpen; })[0], null, function () { renderCalendar(el); }); });
    on(el, '[data-task-open]', 'click', function (b, e) { e.stopPropagation(); openTaskEditor(findTask(b.dataset.taskOpen), null, function () { renderCalendar(el); }); });
    // drag to reschedule
    var drag = null;
    on(el, '[data-drag-tk]', 'dragstart', function (x, e) { e.stopPropagation(); drag = { type: 'tk', id: x.dataset.dragTk }; try { e.dataTransfer.setData('text/plain', 'x'); } catch (z) {} });
    on(el, '[data-drag-ev]', 'dragstart', function (x, e) { e.stopPropagation(); drag = { type: 'ev', id: x.dataset.dragEv }; try { e.dataTransfer.setData('text/plain', 'x'); } catch (z) {} });
    on(el, '[data-drop-day]', 'dragover', function (z, e) { if (drag) { e.preventDefault(); z.classList.add('over'); } });
    on(el, '[data-drop-day]', 'dragleave', function (z) { z.classList.remove('over'); });
    on(el, '[data-drop-day]', 'drop', function (z, e) {
      e.preventDefault(); z.classList.remove('over'); if (!drag) return;
      var k = z.dataset.dropDay;
      if (drag.type === 'tk') { var t = findTask(drag.id); if (t) t.due = k; }
      else { var ev = S().events.filter(function (x) { return x.id === drag.id; })[0]; if (ev) ev.date = k; }
      drag = null; save(); api.toast('הועבר ל-' + relDate(k), 'success'); renderCalendar(el);
    });
  }
  function openEventEditor(ev, date, after) {
    var isEdit = !!ev;
    var e = ev || { title: '', date: date || todayKey(), time: '', end: '', notes: '' };
    var m = openModal('<h3>' + (isEdit ? 'עריכת אירוע' : 'אירוע חדש') + '</h3>' +
      '<div class="field"><label>שם</label><input type="text" id="ev-title" maxlength="100" value="' + esc(e.title) + '" autofocus></div>' +
      '<div class="field-row"><div class="field"><label>תאריך</label><input type="date" id="ev-date" value="' + e.date + '"></div><div class="field"><label>התחלה</label><input type="time" id="ev-time" value="' + (e.time || '') + '"></div><div class="field"><label>סיום</label><input type="time" id="ev-end" value="' + (e.end || '') + '"></div></div>' +
      '<div class="field"><label>הערות</label><textarea id="ev-notes" rows="2">' + esc(e.notes) + '</textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="ev-save">' + ic('check') + 'שמור</button>' + (isEdit ? '<button class="btn btn-danger" id="ev-del" aria-label="מחק">' + ic('trash') + '</button>' : '') + '<button class="btn btn-ghost" id="ev-x" aria-label="סגור">' + ic('x') + '</button></div>');
    $('#ev-x', m).addEventListener('click', api.closeModal);
    if (isEdit) $('#ev-del', m).addEventListener('click', function () { S().events = S().events.filter(function (x) { return x.id !== ev.id; }); save(); api.closeModal(); after(); });
    $('#ev-save', m).addEventListener('click', function () {
      var t = $('#ev-title', m).value.trim(); if (!t) { $('#ev-title', m).classList.add('fx-invalid'); $('#ev-title', m).focus(); return; }
      var f = { title: t, date: $('#ev-date', m).value || todayKey(), time: $('#ev-time', m).value || '', end: $('#ev-end', m).value || '', notes: $('#ev-notes', m).value.trim() };
      if (f.end && f.time && f.end < f.time) { api.toast('שעת הסיום לפני שעת ההתחלה', 'error'); return; }
      if (isEdit) Object.assign(ev, f); else S().events.push(Object.assign({ id: api.uid() }, f));
      save(); api.closeModal(); api.toast('האירוע נשמר', 'success'); after();
    });
  }

  /* ================================================================
     ANALYTICS
     ================================================================ */
  function barChart(values, labels, opts) {
    opts = opts || {};
    var w = 100 / values.length;
    var max = Math.max.apply(null, values.map(function (v) { return v || 0; }).concat([opts.max || 1]));
    return '<div class="fx-chart" role="img" aria-label="' + esc(opts.aria || 'גרף') + '">' + values.map(function (v, i) {
      var h = v == null ? 0 : Math.max(2, v / max * 100);
      return '<div class="fx-chart-col" style="width:' + w + '%" title="' + esc(labels[i]) + ': ' + (v == null ? 'אין נתונים' : v + (opts.unit || '')) + '">' +
        '<div class="fx-chart-bar' + (v == null ? ' nil' : '') + (opts.highlight === i ? ' hl' : '') + '" style="height:' + h + '%"></div>' +
        (opts.showLabels ? '<div class="fx-chart-lbl">' + labels[i] + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function kpi(label, value, sub) { return '<div class="fx-kpi"><div class="fx-kpi-v num">' + value + '</div><div class="fx-kpi-l">' + label + '</div>' + (sub ? '<div class="fx-kpi-s">' + sub + '</div>' : '') + '</div>'; }
  function renderAnalytics(el) {
    var st = S(), tk = todayKey();
    var dToday = C.dayCompletion(st, tk);
    var r7 = C.rangeRate(st, tk, 7), rPrev7 = C.rangeRate(st, C.addDays(tk, -7), 7), r30 = C.rangeRate(st, tk, 30);
    var focusWeek = 0, focusPrev = 0;
    for (var i = 0; i < 7; i++) { focusWeek += C.focusMinutes(st, C.addDays(tk, -i)); focusPrev += C.focusMinutes(st, C.addDays(tk, -7 - i)); }
    var weekAgo = Date.now() - 7 * 864e5;
    var tasksDoneWeek = tasks().filter(function (t) { return t.doneAt && t.doneAt > weekAgo; }).length;
    Object.keys(st.tasksByDate).forEach(function (k) { if (k > C.addDays(tk, -7)) (st.tasksByDate[k] || []).forEach(function (t) { if (t.done) tasksDoneWeek++; }); });
    var habits = api.habits();
    var hs = habits.map(function (h) { return { h: h, s: C.habitStats(api.habitDef(h), st.habitLog, st.habitValues, tk, 30) }; });
    var bestStreak = hs.reduce(function (a, x) { return Math.max(a, x.s.streak); }, 0);
    var goals = st.goals || [];
    var goalAvg = goals.length ? Math.round(goals.reduce(function (a, g) { return a + api.goalProgress(g); }, 0) / goals.length) : null;
    var days30 = [], lbl30 = [];
    for (var j = 29; j >= 0; j--) { var k = C.addDays(tk, -j); days30.push(C.dayCompletion(st, k).rate); lbl30.push(fmtDate(k)); }
    var prof = C.productivityProfile(st);
    var delta = (r7 != null && rPrev7 != null) ? (r7 - rPrev7) : null;
    var hoursShown = prof.hours.slice(5, 24);
    var hourLbls = []; for (var hh = 5; hh < 24; hh++) hourLbls.push(pad(hh));
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">נתונים</h2><p class="page-sub">איך אתה מתקדם לאורך זמן, לפי מה שסימנת באפליקציה</p></div></div>' +
      '<div class="fx-kpis">' +
        kpi('היום', dToday.rate == null ? '—' : dToday.rate + '%', dToday.done + '/' + dToday.total + ' הושלמו') +
        kpi('השבוע', r7 == null ? '—' : r7 + '%', delta == null ? '' : (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '% משבוע שעבר') +
        kpi('30 יום', r30 == null ? '—' : r30 + '%', '') +
        kpi('ריכוז השבוע', minsLabel(focusWeek), focusPrev ? 'לעומת ' + minsLabel(focusPrev) : '') +
        kpi('משימות שהושלמו', tasksDoneWeek, '7 ימים אחרונים') +
        kpi('רצף הרגל הכי ארוך', bestStreak + ' 🔥', 'רצף כללי: ' + (st.gam.streak.current || 0) + ' ימים') +
        kpi('התקדמות מטרות', goalAvg == null ? '—' : goalAvg + '%', goals.length + ' מטרות') +
      '</div>' +
      '<div class="card fx-card-gap"><h3>אחוז ביצוע יומי · 30 יום</h3>' + (days30.some(function (v) { return v != null; }) ? barChart(days30, lbl30, { unit: '%', max: 100, aria: 'אחוז ביצוע יומי ב-30 הימים האחרונים', highlight: 29 }) : emptyState('chart', 'עוד אין מספיק נתונים', 'תסמן משימות ושגרה כמה ימים והגרף יתמלא.')) + '</div>' +
      '<div class="grid-2 fx-card-gap">' +
        '<div class="card"><h3>שעות פרודוקטיביות</h3>' + (prof.bestHour != null ? '<p class="page-sub">השיא שלך סביב <b dir="ltr">' + pad(prof.bestHour) + ':00</b></p>' + barChart(hoursShown, hourLbls, { showLabels: true, unit: ' השלמות', highlight: prof.bestHour - 5, aria: 'השלמות לפי שעה' }) : '<p class="page-sub">יתמלא אחרי שתשלים משימות.</p>') + '</div>' +
        '<div class="card"><h3>ימים בשבוע</h3>' + (prof.bestWeekday != null ? '<p class="page-sub">היום הכי חזק: <b>' + HE_DAYS[prof.bestWeekday] + '</b></p>' + barChart(prof.weekdays, HE_DAYS_SHORT, { showLabels: true, unit: ' השלמות', highlight: prof.bestWeekday, aria: 'השלמות לפי יום' }) : '<p class="page-sub">יתמלא אחרי שתשלים משימות.</p>') + '</div>' +
      '</div>' +
      '<div class="card fx-card-gap"><h3>הרגלים · 30 יום</h3>' + hs.map(function (x) {
        return '<div class="fx-hrow"><span class="fx-hname">' + (x.h.emoji || '') + ' ' + esc(x.h.name) + '</span>' + progressBar(x.s.rate) + '<span class="num fx-hval">' + x.s.rate + '%</span></div>';
      }).join('') + '</div>' +
      '<div class="card fx-card-gap"><h3>השוואת שבועות</h3>' + compareWeeksHtml(st, tk) + '</div>' +
      (goals.length ? '<div class="card fx-card-gap"><h3>מטרות</h3>' + goals.map(function (g) { var p = api.goalProgress(g); return '<div class="fx-hrow"><span class="fx-hname">' + esc(g.title) + '</span>' + progressBar(p) + '<span class="num fx-hval">' + p + '%</span></div>'; }).join('') + '</div>' : '');
  }
  function compareWeeksHtml(st, tk) {
    var rows = [];
    for (var w = 0; w < 6; w++) { var end = C.addDays(tk, -7 * w); var r = C.rangeRate(st, end, 7); rows.unshift({ label: w === 0 ? 'השבוע' : 'לפני ' + w, r: r }); }
    return barChart(rows.map(function (x) { return x.r; }), rows.map(function (x) { return x.label; }), { showLabels: true, unit: '%', max: 100, highlight: 5, aria: 'השוואת אחוז ביצוע בין שבועות' });
  }

  /* ================================================================
     HABITS: custom habits, numeric targets, weekly frequency, history
     ================================================================ */
  function renderHabitsExtra(el) {
    var st = S(), tk = todayKey();
    var wrap = document.createElement('div');
    var defs = api.habits().map(function (h) { return api.habitDef(h); });
    var sel = st.prefs.habitView || (defs[0] && defs[0].id);
    var cur = defs.filter(function (d) { return d.id === sel; })[0] || defs[0];
    var custom = st.customHabits;
    wrap.innerHTML =
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>הרגלים שלי</h3><button class="btn btn-primary btn-sm" id="hb-new">' + ic('plus') + 'הרגל חדש</button></div>' +
        (custom.length ? '<div class="fx-task-list">' + custom.map(function (h) {
          var s = C.habitStats(h, st.habitLog, st.habitValues, tk, 30);
          var v = (st.habitValues[h.id] || {})[tk] || 0;
          return '<div class="fx-habit-row"><span class="fx-habit-emoji">' + esc(h.emoji || '✨') + '</span><div class="fx-task-body"><div class="fx-task-title">' + esc(h.name) + '</div><div class="page-sub" style="font-size:12px;">' +
            (h.freq === 'weekly' ? h.perWeek + ' פעמים בשבוע' : 'כל יום') + (h.target ? ' · יעד ' + h.target + ' ' + esc(h.unit || '') : '') + ' · ' + s.rate + '% · רצף ' + s.streak + '</div></div>' +
            (h.target ? '<div class="fx-counter"><button class="wl-step-btn" data-hv="' + h.id + '|-1" aria-label="פחות">−</button><span class="num">' + v + '/' + h.target + '</span><button class="wl-step-btn" data-hv="' + h.id + '|1" aria-label="יותר">+</button></div>'
              : '<button class="fx-check' + (C.habitDoneOn(h, st.habitLog, st.habitValues, tk) ? ' on' : '') + '" data-hb-toggle="' + h.id + '" aria-label="סמן">' + (C.habitDoneOn(h, st.habitLog, st.habitValues, tk) ? ic('check') : '') + '</button>') +
            '<button class="fx-mini" data-hb-edit="' + h.id + '" aria-label="ערוך">' + ic('edit') + '</button></div>';
        }).join('') + '</div>' : '<p class="page-sub">הוסף הרגלים משלך: יומיים או שבועיים, עם יעד מספרי (למשל 8 כוסות מים) ושעת תזכורת.</p>') +
      '</div>' +
      (cur ? '<div class="card fx-card-gap"><div class="fx-row-between"><h3>היסטוריה וסטטיסטיקה</h3><select id="hb-sel" aria-label="בחר הרגל">' + defs.map(function (d) { return '<option value="' + d.id + '"' + (d.id === cur.id ? ' selected' : '') + '>' + esc((d.emoji || '') + ' ' + d.name) + '</option>'; }).join('') + '</select></div>' + habitHistoryHtml(cur) + '</div>' : '');
    el.appendChild(wrap);
    $('#hb-new', wrap).addEventListener('click', function () { openHabitEditor(null); });
    on(wrap, '[data-hb-edit]', 'click', function (b) { openHabitEditor(custom.filter(function (h) { return h.id === b.dataset.hbEdit; })[0]); });
    on(wrap, '[data-hb-toggle]', 'click', function (b) { api.toggleHabit(b.dataset.hbToggle); api.rerender(); });
    on(wrap, '[data-hv]', 'click', function (b) {
      var p = b.dataset.hv.split('|'), h = custom.filter(function (x) { return x.id === p[0]; })[0];
      st.habitValues[h.id] = st.habitValues[h.id] || {};
      var before = C.habitDoneOn(h, st.habitLog, st.habitValues, tk);
      st.habitValues[h.id][tk] = Math.max(0, ((st.habitValues[h.id][tk]) || 0) + (+p[1]));
      var after = C.habitDoneOn(h, st.habitLog, st.habitValues, tk);
      if (after !== before) api.toggleHabit(h.id); // keep the classic log (used by XP, streaks and the dashboard) in sync
      else save();
      api.rerender();
    });
    var s2 = $('#hb-sel', wrap); if (s2) s2.addEventListener('change', function () { st.prefs.habitView = s2.value; save(); api.rerender(); });
  }
  function habitHistoryHtml(h) {
    var st = S(), tk = todayKey();
    var s30 = C.habitStats(h, st.habitLog, st.habitValues, tk, 30), s7 = C.habitStats(h, st.habitLog, st.habitValues, tk, 7), s90 = C.habitStats(h, st.habitLog, st.habitValues, tk, 91);
    // 13-week heatmap, columns = weeks (Sun..Sat rows)
    var end = tk, start = C.addDays(end, -C.parseKey(end).getDay() - 7 * 12);
    var cells = '';
    for (var i = 0; i < 91; i++) {
      var k = C.addDays(start, i);
      var ok = C.habitDoneOn(h, st.habitLog, st.habitValues, k);
      cells += '<i class="' + (k > tk ? 'fut' : ok ? 'on' : '') + '" title="' + fmtDate(k) + (ok ? ' ✓' : '') + '"></i>';
    }
    var weekly = [];
    for (var w = 11; w >= 0; w--) { var e = C.addDays(tk, -7 * w); weekly.push(C.habitStats(h, st.habitLog, st.habitValues, e, 7).rate); }
    return '<div class="fx-kpis fx-kpis-sm">' + kpi('השבוע', s7.rate + '%') + kpi('החודש', s30.rate + '%') + kpi('3 חודשים', s90.rate + '%') + kpi('רצף נוכחי', s30.streak + (h.freq === 'weekly' ? ' שב׳' : ' ימים')) + '</div>' +
      '<div class="fx-heat" aria-label="לוח הצלחות 13 שבועות">' + cells + '</div>' +
      '<div class="page-sub" style="margin:10px 0 4px;">מגמה שבועית (12 שבועות)</div>' + barChart(weekly, weekly.map(function (_, i) { return 'שבוע ' + (i + 1); }), { unit: '%', max: 100, highlight: 11, aria: 'אחוז התמדה שבועי' });
  }
  function openHabitEditor(h) {
    var isEdit = !!h;
    var x = h || { name: '', emoji: '✨', freq: 'daily', perWeek: 3, target: null, unit: '', remind: '' };
    var m = openModal('<h3>' + (isEdit ? 'עריכת הרגל' : 'הרגל חדש') + '</h3>' +
      '<div class="field-row"><div class="field" style="max-width:80px;"><label>אימוג׳י</label><input type="text" id="hb-emoji" maxlength="4" value="' + esc(x.emoji) + '"></div><div class="field"><label>שם</label><input type="text" id="hb-name" maxlength="40" value="' + esc(x.name) + '" placeholder="למשל: שתיית מים" autofocus></div></div>' +
      '<div class="field-row"><div class="field"><label>תדירות</label><select id="hb-freq"><option value="daily"' + (x.freq === 'daily' ? ' selected' : '') + '>יומי</option><option value="weekly"' + (x.freq === 'weekly' ? ' selected' : '') + '>שבועי</option></select></div><div class="field"><label>פעמים בשבוע</label><input type="number" id="hb-pw" min="1" max="7" value="' + (x.perWeek || 3) + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>יעד מספרי ליום (ריק = כן/לא)</label><input type="number" id="hb-target" min="1" value="' + (x.target || '') + '"></div><div class="field"><label>יחידה</label><input type="text" id="hb-unit" maxlength="12" value="' + esc(x.unit || '') + '" placeholder="כוסות, דקות…"></div></div>' +
      '<div class="field"><label>שעת תזכורת (אופציונלי)</label><input type="time" id="hb-remind" value="' + (x.remind || '') + '"></div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="hb-save">' + ic('check') + 'שמור</button>' + (isEdit ? '<button class="btn btn-danger" id="hb-del" aria-label="מחק">' + ic('trash') + '</button>' : '') + '<button class="btn btn-ghost" id="hb-x" aria-label="סגור">' + ic('x') + '</button></div>');
    $('#hb-x', m).addEventListener('click', api.closeModal);
    if (isEdit) $('#hb-del', m).addEventListener('click', function () {
      api.openConfirmModal('למחוק את ההרגל "' + h.name + '"? ההיסטוריה שלו תישמר בגיבויים.', function () {
        S().customHabits = S().customHabits.filter(function (y) { return y.id !== h.id; }); api.syncHabits(); save(); api.rerender();
      });
    });
    $('#hb-save', m).addEventListener('click', function () {
      var name = $('#hb-name', m).value.trim(); if (!name) { $('#hb-name', m).classList.add('fx-invalid'); $('#hb-name', m).focus(); return; }
      var f = { name: name, emoji: $('#hb-emoji', m).value.trim() || '✨', freq: $('#hb-freq', m).value, perWeek: Math.min(7, Math.max(1, +$('#hb-pw', m).value || 1)), target: +$('#hb-target', m).value || null, unit: $('#hb-unit', m).value.trim(), remind: $('#hb-remind', m).value || '' };
      if (isEdit) Object.assign(h, f); else S().customHabits.push(Object.assign({ id: 'ch_' + api.uid() }, f));
      api.syncHabits(); save(); api.closeModal(); api.toast('ההרגל נשמר', 'success'); api.rerender();
    });
  }

  /* ================================================================
     GOALS: description, category, numeric metric, history, linked tasks
     ================================================================ */
  var GOAL_CATS = ['לימודים', 'כושר', 'תכנות', 'עסקים', 'שינה', 'הרגלים', 'אישי'];
  function logGoalHistory(goalId, text, value) {
    var g = (S().goals || []).filter(function (x) { return x.id === goalId; })[0];
    if (!g) return;
    g.history = g.history || [];
    g.history.unshift({ at: Date.now(), text: text, value: value == null ? null : value });
    g.history = g.history.slice(0, 100);
  }
  function enhanceGoals(el) {
    (S().goals || []).forEach(function (g) {
      var del = el.querySelector('[data-goal-del="' + g.id + '"]');
      var card = del && del.closest('.goal-card');
      if (!card || card.querySelector('.fx-goal-extra')) return;
      var linked = tasks().filter(function (t) { return t.goalId === g.id && !t.archived; });
      var open = linked.filter(function (t) { return t.status !== 'done'; }).length;
      var x = document.createElement('div');
      x.className = 'fx-goal-extra';
      x.innerHTML = '<div class="fx-task-meta">' + (g.category ? '<span class="fx-chip">' + esc(g.category) + '</span>' : '') +
        (g.metric && g.metric.target ? '<span class="fx-chip">' + ic('chart') + (g.metric.current || 0) + ' / ' + g.metric.target + ' ' + esc(g.metric.unit || '') + '</span>' : '') +
        (linked.length ? '<span class="fx-chip">' + ic('check') + (linked.length - open) + '/' + linked.length + ' משימות</span>' : '') + '</div>' +
        (g.description ? '<p class="page-sub" style="margin:6px 0 0;">' + esc(g.description) + '</p>' : '') +
        '<button class="btn btn-ghost btn-sm" data-goal-more="' + g.id + '" style="margin-top:8px;">' + ic('edit') + 'פרטים, מדד והיסטוריה</button>';
      var head = card.querySelector('.goal-head');
      head.parentNode.insertBefore(x, head.nextSibling);
    });
    on(el, '[data-goal-more]', 'click', function (b) { openGoalDetails(b.dataset.goalMore); });
  }
  function openGoalDetails(id) {
    var g = (S().goals || []).filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    var linked = tasks().filter(function (t) { return t.goalId === g.id && !t.archived; });
    var mt = g.metric || { current: 0, target: '', unit: '' };
    var m = openModal('<h3>' + esc(g.title) + '</h3>' +
      '<div class="field"><label>תיאור</label><textarea id="gd-desc" rows="2">' + esc(g.description || '') + '</textarea></div>' +
      '<div class="field-row"><div class="field"><label>קטגוריה</label><select id="gd-cat">' + GOAL_CATS.map(function (c) { return '<option' + (g.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div><div class="field"><label>תאריך יעד</label><input type="date" id="gd-date" value="' + (g.targetDate || '') + '"></div></div>' +
      '<div class="field-row"><div class="field"><label>מדד: ערך נוכחי</label><input type="number" id="gd-cur" step="any" value="' + (mt.current || 0) + '"></div><div class="field"><label>יעד</label><input type="number" id="gd-target" step="any" value="' + (mt.target || '') + '" placeholder="ריק = לפי שלבים"></div><div class="field"><label>יחידה</label><input type="text" id="gd-unit" maxlength="12" value="' + esc(mt.unit || '') + '" placeholder="ק״ג, ספרים…"></div></div>' +
      '<div class="field"><label>משימות קשורות</label>' + (linked.length ? '<div class="fx-task-list">' + linked.map(taskRowHtml).join('') + '</div>' : '<p class="page-sub">אין עדיין. אפשר לקשר משימה למטרה מתוך עורך המשימה.</p>') +
        '<button class="btn btn-ghost btn-sm" id="gd-addtask" style="margin-top:6px;">' + ic('plus') + 'משימה למטרה הזו</button></div>' +
      '<div class="field"><label>היסטוריית התקדמות</label>' + ((g.history || []).length ? '<ul class="fx-hist">' + g.history.slice(0, 12).map(function (h) { return '<li><span class="page-sub">' + new Date(h.at).toLocaleDateString('he-IL') + '</span> ' + esc(h.text) + '</li>'; }).join('') + '</ul>' : '<p class="page-sub">יתעדכן כשתשנה מדד או תשלים משימות קשורות.</p>') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="gd-save">' + ic('check') + 'שמור</button><button class="btn btn-ghost" id="gd-x" aria-label="סגור">' + ic('x') + '</button></div>', { wide: true });
    $('#gd-x', m).addEventListener('click', api.closeModal);
    wireTaskRows(m, function () { api.closeModal(); openGoalDetails(id); });
    $('#gd-addtask', m).addEventListener('click', function () { openTaskEditor(null, { goalId: g.id }, function () { openGoalDetails(id); }); });
    $('#gd-save', m).addEventListener('click', function () {
      var target = +$('#gd-target', m).value || null, cur = +$('#gd-cur', m).value || 0, unit = $('#gd-unit', m).value.trim();
      var prevCur = g.metric ? g.metric.current : null;
      g.description = $('#gd-desc', m).value.trim();
      g.category = $('#gd-cat', m).value;
      g.targetDate = $('#gd-date', m).value || null;
      g.metric = target ? { current: cur, target: target, unit: unit } : null;
      if (target && prevCur !== cur) logGoalHistory(g.id, 'מדד עודכן ל-' + cur + ' ' + unit, cur);
      save(); api.closeModal(); api.toast('המטרה עודכנה', 'success'); api.rerender();
    });
  }

  /* ================================================================
     FOCUS (Pomodoro pro) - wall-clock based so background tabs don't drift
     ================================================================ */
  var fx = { phase: 'work', running: false, endsAt: 0, remaining: 0, total: 0, cycle: 0, taskId: '', timer: null, zen: false };
  function focusPrefs() { return S().prefs.focus; }
  function phaseMinutes(p) { var f = focusPrefs(); return p === 'work' ? f.work : p === 'short' ? f.short : f.long; }
  function resetPhase(p) { fx.phase = p; fx.total = phaseMinutes(p) * 60; fx.remaining = fx.total; fx.running = false; clearInterval(fx.timer); }
  function beep() {
    if (!focusPrefs().sound) return;
    try { var a = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.25, 0.5].forEach(function (t, i) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = [660, 880, 990][i]; g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.22); o.connect(g); g.connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.25); }); } catch (e) {}
  }
  function phaseDone() {
    clearInterval(fx.timer); fx.running = false;
    var st = S(), tk = todayKey();
    var mins = Math.round(fx.total / 60);
    st.focusSessions.push({ id: api.uid(), type: fx.phase === 'work' ? 'work' : 'break', minutes: mins, date: tk, endedAt: Date.now(), taskId: fx.taskId || null });
    if (st.focusSessions.length > 2000) st.focusSessions = st.focusSessions.slice(-2000);
    if (fx.phase === 'work') {
      st.focusLog[tk] = (st.focusLog[tk] || 0) + 1;
      api.grantXPOnce('focus:' + st.focusSessions[st.focusSessions.length - 1].id, Math.max(5, Math.round(mins / 5) * 2), 'focus', {});
      fx.cycle++;
      save(); api.flushXP(null);
      notify('focus', 'מקטע ריכוז הושלם', 'זמן להפסקה קצרה ☕');
      api.toast('מקטע ריכוז הושלם ✓', 'success');
      resetPhase(fx.cycle % focusPrefs().longEvery === 0 ? 'long' : 'short');
    } else {
      save();
      notify('focus', 'ההפסקה נגמרה', 'חוזרים לעבודה 💪');
      api.toast('ההפסקה נגמרה', 'success');
      resetPhase('work');
    }
    beep();
    paintFocus();
  }
  function tick() {
    fx.remaining = Math.max(0, Math.round((fx.endsAt - Date.now()) / 1000));
    if (fx.remaining <= 0) phaseDone(); else paintFocus();
  }
  function startFocus() { if (!fx.total) resetPhase(fx.phase); fx.running = true; fx.endsAt = Date.now() + fx.remaining * 1000; clearInterval(fx.timer); fx.timer = setInterval(tick, 500); paintFocus(); }
  function pauseFocus() { fx.running = false; clearInterval(fx.timer); fx.remaining = Math.max(0, Math.round((fx.endsAt - Date.now()) / 1000)); paintFocus(); }
  function paintFocus() {
    var t = document.getElementById('fx-time');
    if (!t) return;
    var m = Math.floor(fx.remaining / 60), s = fx.remaining % 60;
    t.textContent = pad(m) + ':' + pad(s);
    var ring = document.getElementById('fx-ring'), c = 2 * Math.PI * 100;
    if (ring) ring.setAttribute('stroke-dashoffset', c - (fx.total ? (1 - fx.remaining / fx.total) : 0) * c);
    var b = document.getElementById('fx-toggle');
    if (b) b.innerHTML = ic(fx.running ? 'pause' : 'play') + (fx.running ? 'השהה' : (fx.remaining < fx.total ? 'המשך' : 'התחל'));
    document.title = fx.running ? pad(m) + ':' + pad(s) + ' · ' + (fx.phase === 'work' ? 'ריכוז' : 'הפסקה') + ' · מסלול' : 'מסלול';
    $$('[data-fx-phase]').forEach(function (x) { x.classList.toggle('active', x.dataset.fxPhase === fx.phase); });
  }
  function renderFocusPro(el) {
    if (!fx.total) resetPhase('work');
    var st = S(), tk = todayKey(), f = focusPrefs();
    var todaySessions = st.focusSessions.filter(function (s) { return s.date === tk && s.type === 'work'; });
    var mins = C.focusMinutes(st, tk);
    var open = tasks().filter(function (t) { return t.status !== 'done' && !t.archived; });
    var week = []; var wl = [];
    for (var i = 6; i >= 0; i--) { var k = C.addDays(tk, -i); week.push(C.focusMinutes(st, k)); wl.push(HE_DAYS_SHORT[C.parseKey(k).getDay()]); }
    var c = 2 * Math.PI * 100;
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">פוקוס</h2><p class="page-sub">פומודורו עם הפסקות, בחירת משימה ומעקב זמן ריכוז</p></div><button class="btn btn-ghost" id="fx-zen">' + ic('target') + 'מצב ללא הסחות</button></div>' +
      '<div class="card"><div class="focus-wrap">' +
        '<div class="seg fx-seg"><button data-fx-phase="work">ריכוז ' + f.work + '</button><button data-fx-phase="short">הפסקה ' + f.short + '</button><button data-fx-phase="long">ארוכה ' + f.long + '</button></div>' +
        '<div class="focus-ring"><svg width="240" height="240" viewBox="0 0 240 240"><circle class="ring-track" cx="120" cy="120" r="100" stroke-width="10" fill="none"/><circle class="ring-fill" id="fx-ring" cx="120" cy="120" r="100" stroke-width="10" fill="none" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '"/></svg><div class="focus-time num" id="fx-time">--:--</div></div>' +
        '<div class="field" style="width:100%;max-width:360px;"><label>על מה עובדים?</label><select id="fx-task"><option value="">בלי משימה מסוימת</option>' + open.map(function (t) { return '<option value="' + t.id + '"' + (fx.taskId === t.id ? ' selected' : '') + '>' + esc(t.title) + '</option>'; }).join('') + '</select></div>' +
        '<div class="focus-controls"><button class="btn btn-primary" id="fx-toggle"></button><button class="btn btn-ghost" id="fx-reset" aria-label="איפוס">' + ic('reset') + '</button><button class="btn btn-ghost" id="fx-skip" aria-label="דלג לשלב הבא">' + ic('skip') + '</button>' + (fx.taskId ? '<button class="btn btn-ghost" id="fx-done-task">' + ic('check') + 'סיימתי את המשימה</button>' : '') + '</div>' +
        '<p class="focus-task">היום: <b class="num">' + todaySessions.length + '</b> מקטעים · <b class="num">' + minsLabel(mins) + '</b> ריכוז · מחזור ' + ((fx.cycle % f.longEvery) + 1) + '/' + f.longEvery + '</p>' +
      '</div></div>' +
      '<div class="grid-2 fx-card-gap"><div class="card"><h3>7 ימים אחרונים</h3>' + barChart(week, wl, { showLabels: true, unit: ' דק׳', highlight: 6, aria: 'דקות ריכוז ב-7 ימים' }) + '</div>' +
        '<div class="card"><h3>הגדרות טיימר</h3><div class="fx-focus-set">' +
          '<label>ריכוז (דק׳)<input type="number" min="1" max="180" data-fset="work" value="' + f.work + '"></label><label>הפסקה קצרה<input type="number" min="1" max="60" data-fset="short" value="' + f.short + '"></label><label>הפסקה ארוכה<input type="number" min="1" max="90" data-fset="long" value="' + f.long + '"></label><label>ארוכה כל<input type="number" min="2" max="10" data-fset="longEvery" value="' + f.longEvery + '"></label></div>' +
          '<div class="settings-row" style="border:none;padding-bottom:0;"><div><div class="lbl">צליל סיום</div></div><label class="switch"><input type="checkbox" id="fx-sound"' + (f.sound ? ' checked' : '') + '><span></span></label></div></div></div>' +
      '<div class="card fx-card-gap"><h3>היסטוריית סשנים</h3>' + (st.focusSessions.length ? '<div class="fx-task-list">' + st.focusSessions.slice(-8).reverse().map(function (s) { var t = s.taskId && findTask(s.taskId); return '<div class="fx-day-row"><span class="fx-day-time">' + new Date(s.endedAt).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span><span>' + (s.type === 'work' ? '🎯 ריכוז' : '☕ הפסקה') + ' · ' + s.minutes + ' דק׳' + (t ? ' · ' + esc(t.title) : '') + '</span></div>'; }).join('') + '</div>' : '<p class="page-sub">הסשן הראשון שלך יופיע כאן.</p>') + '</div>';
    paintFocus();
    $('#fx-toggle', el).addEventListener('click', function () { fx.running ? pauseFocus() : startFocus(); });
    $('#fx-reset', el).addEventListener('click', function () { resetPhase(fx.phase); paintFocus(); });
    $('#fx-skip', el).addEventListener('click', function () { resetPhase(fx.phase === 'work' ? 'short' : 'work'); paintFocus(); });
    on(el, '[data-fx-phase]', 'click', function (b) { if (fx.running && !confirm('לעצור את הטיימר הנוכחי?')) return; resetPhase(b.dataset.fxPhase); paintFocus(); });
    $('#fx-task', el).addEventListener('change', function (e) { fx.taskId = e.target.value; renderFocusPro(el); });
    var dt = $('#fx-done-task', el); if (dt) dt.addEventListener('click', function () { setTaskStatus(fx.taskId, 'done', dt); fx.taskId = ''; renderFocusPro(el); });
    on(el, '[data-fset]', 'change', function (inp) { var v = Math.max(1, Math.round(+inp.value || 1)); f[inp.dataset.fset] = v; save(); if (!fx.running) resetPhase(fx.phase); renderFocusPro(el); });
    $('#fx-sound', el).addEventListener('change', function (e) { f.sound = e.target.checked; save(); });
    $('#fx-zen', el).addEventListener('click', openZen);
  }
  function openZen() {
    var z = document.createElement('div');
    z.className = 'fx-zen'; z.id = 'fx-zen-layer';
    var t = fx.taskId && findTask(fx.taskId);
    z.innerHTML = '<div class="fx-zen-phase">' + (fx.phase === 'work' ? 'ריכוז' : 'הפסקה') + '</div>' + (t ? '<div class="fx-zen-task">' + esc(t.title) + '</div>' : '') +
      '<div class="fx-zen-time num" id="fx-time"></div><div class="focus-controls"><button class="btn btn-primary" id="fx-toggle"></button><button class="btn btn-ghost" id="fx-zen-exit">יציאה</button></div>';
    var old = document.getElementById('fx-time'); if (old) old.id = 'fx-time-bg';
    var oldBtn = document.getElementById('fx-toggle'); if (oldBtn) oldBtn.id = 'fx-toggle-bg';
    document.body.appendChild(z);
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
    paintFocus();
    $('#fx-toggle', z).addEventListener('click', function () { fx.running ? pauseFocus() : startFocus(); });
    var exit = function () { z.remove(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} document.removeEventListener('keydown', esc1); api.rerender(); };
    var esc1 = function (e) { if (e.key === 'Escape') exit(); };
    document.addEventListener('keydown', esc1);
    $('#fx-zen-exit', z).addEventListener('click', exit);
  }

  /* ================================================================
     ROUTINE: focus-on-current-activity mode, skip, time remaining
     ================================================================ */
  function enhanceSchedule(el) {
    var head = el.querySelector('.page-head');
    if (!head || el.querySelector('#rt-focus-btn')) return;
    var bar = document.createElement('div');
    bar.className = 'fx-routine-bar';
    var nnl = api.nowNextLater();
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var left = nnl.next ? (api.timeToMin(nnl.next.time) - nowMin) : null;
    bar.innerHTML = (nnl.now ? '<div class="fx-routine-now"><span class="page-sub">עכשיו</span> <b>' + esc(nnl.now.title) + '</b>' + (left != null ? ' · <span class="fx-chip fx-chip-accent">נותרו ' + minsLabel(left) + '</span>' : '') + '</div>' : '<div class="page-sub">אין פעילות נוכחית</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" id="rt-focus-btn">' + ic('target') + 'מצב פוקוס לשגרה</button>' + (nnl.now && !nnl.now.done ? '<button class="btn btn-ghost btn-sm" id="rt-skip">' + ic('skip') + 'דלג על הנוכחית</button>' : '') + '</div>';
    head.parentNode.insertBefore(bar, head.nextSibling);
    $('#rt-focus-btn', bar).addEventListener('click', openRoutineFocus);
    var sk = $('#rt-skip', bar);
    if (sk) sk.addEventListener('click', function () { skipRoutine(nnl.now.id); api.rerender(); });
  }
  function skipRoutine(id) {
    var list = S().tasksByDate[todayKey()] || [];
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    // skipping = marking the activity optional for today, so it doesn't count against the daily score (no XP is granted)
    t.optional = true; t.skipped = true; save();
    api.toast('דילגת על "' + t.title + '" להיום');
  }
  function openRoutineFocus() {
    var z = document.createElement('div');
    z.className = 'fx-zen'; z.id = 'rt-zen';
    document.body.appendChild(z);
    var paused = false, pausedAt = 0, pausedTotal = 0, timer = null;
    function paint() {
      var nnl = api.nowNextLater();
      var cur = nnl.now;
      var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 - (paused ? 0 : 0);
      if (!cur) { z.innerHTML = '<div class="fx-zen-phase">שגרה</div><div class="fx-zen-task">אין פעילות כרגע</div><div class="focus-controls"><button class="btn btn-ghost" id="rt-exit">יציאה</button></div>'; $('#rt-exit', z).addEventListener('click', exit); return; }
      var start = api.timeToMin(cur.time), end = nnl.next ? api.timeToMin(nnl.next.time) : Math.min(24 * 60, start + 60);
      var effNow = paused ? pausedAt : nowMin - pausedTotal;
      var pct = Math.max(0, Math.min(100, (effNow - start) / Math.max(1, end - start) * 100));
      var leftMin = Math.max(0, end - effNow);
      z.innerHTML = '<div class="fx-zen-phase">' + (paused ? 'מושהה' : 'עכשיו בשגרה') + '</div><div class="fx-zen-task" style="font-size:28px;">' + esc(cur.title) + '</div>' +
        '<div class="fx-zen-time num">' + pad(Math.floor(leftMin / 60)) + ':' + pad(Math.floor(leftMin % 60)) + '</div><div class="page-sub">נותר עד ' + (nnl.next ? '"' + esc(nnl.next.title) + '" ב-' + nnl.next.time : 'סוף הפעילות') + '</div>' +
        '<div style="width:min(420px,80vw);margin:16px auto;">' + progressBar(pct) + '</div>' +
        '<div class="focus-controls"><button class="btn btn-primary" id="rt-done">' + ic('check') + (cur.done ? 'הושלם ✓' : 'סיימתי') + '</button><button class="btn btn-ghost" id="rt-pause">' + ic(paused ? 'play' : 'pause') + (paused ? 'המשך' : 'השהה') + '</button><button class="btn btn-ghost" id="rt-skip2">' + ic('skip') + 'דלג</button><button class="btn btn-ghost" id="rt-exit">יציאה</button></div>';
      $('#rt-done', z).addEventListener('click', function () { if (!cur.done) { api.setRoutineDone(cur.id, true); api.flushXP(null); api.toast('בוצע ✓', 'success'); } paint(); });
      $('#rt-pause', z).addEventListener('click', function () { if (paused) { pausedTotal += (nowMin - pausedAt); paused = false; } else { paused = true; pausedAt = nowMin - pausedTotal; } paint(); });
      $('#rt-skip2', z).addEventListener('click', function () { skipRoutine(cur.id); paint(); });
      $('#rt-exit', z).addEventListener('click', exit);
    }
    function exit() { clearInterval(timer); z.remove(); api.rerender(); }
    paint();
    timer = setInterval(function () { if (document.getElementById('rt-zen')) paint(); else clearInterval(timer); }, 15000);
  }

  /* ================================================================
     AI COACH
     ================================================================ */
  var coachState = { status: 'unknown', busy: false };
  function coachContext() {
    var st = S(), tk = todayKey();
    var t = tasks().filter(function (x) { return !x.archived; });
    var hs = api.habits().map(function (h) { var d = api.habitDef(h); var s = C.habitStats(d, st.habitLog, st.habitValues, tk, 14); return { name: d.name, rate14: s.rate, streak: s.streak }; });
    return {
      today: tk, weekday: HE_DAYS[new Date().getDay()], now: pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()),
      routineToday: (st.tasksByDate[tk] || []).map(function (r) { return { time: r.time, title: r.title, done: !!r.done, optional: !!r.optional }; }),
      openTasks: C.sortTasks(t.filter(function (x) { return x.status !== 'done'; }), 'priority').slice(0, 40).map(function (x) { return { title: x.title, due: x.due, time: x.time, priority: x.priority, estimateMin: x.estimate, status: x.status, category: x.category }; }),
      doneLast7: t.filter(function (x) { return x.doneAt && x.doneAt > Date.now() - 7 * 864e5; }).length,
      habits14d: hs,
      goals: (st.goals || []).map(function (g) { return { title: g.title, progress: api.goalProgress(g), targetDate: g.targetDate }; }),
      completionRate: { today: C.dayCompletion(st, tk).rate, week: C.rangeRate(st, tk, 7), prevWeek: C.rangeRate(st, C.addDays(tk, -7), 7) },
      focusMinutesWeek: [0, 1, 2, 3, 4, 5, 6].reduce(function (a, i) { return a + C.focusMinutes(st, C.addDays(tk, -i)); }, 0),
      streakDays: st.gam.streak.current, level: api.level()
    };
  }
  function mdLite(text) {
    return esc(text).split('\n').map(function (line) {
      var l = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^#{1,3}\s/.test(line)) return '<h4>' + l.replace(/^#{1,3}\s/, '') + '</h4>';
      if (/^\s*[-•*]\s/.test(line)) return '<li>' + l.replace(/^\s*[-•*]\s/, '') + '</li>';
      if (/^\s*\d+\.\s/.test(line)) return '<li>' + l + '</li>';
      return l ? '<p>' + l + '</p>' : '';
    }).join('');
  }
  function checkCoach(cb) {
    if (location.protocol === 'file:') { coachState.status = 'offline'; cb(); return; }
    fetch('api/coach', { method: 'GET', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { configured: false, missing: r.status === 404 }; })
      .then(function (j) { coachState.status = j.configured ? 'ready' : (j.missing ? 'nobackend' : 'nokey'); cb(); })
      .catch(function () { coachState.status = navigator.onLine === false ? 'offline' : 'nobackend'; cb(); });
  }
  function renderCoach(el) {
    var st = S(), tk = todayKey();
    var statusHtml = {
      unknown: '<span class="fx-status">' + skeleton(1) + '</span>',
      ready: '<span class="fx-status ok">● מחובר למודל AI</span>',
      nokey: '<span class="fx-status warn">● לא מחובר: חסר מפתח API בשרת</span>',
      nobackend: '<span class="fx-status warn">● לא מחובר: השרת לא זמין</span>',
      offline: '<span class="fx-status warn">● לא מחובר (אופליין / קובץ מקומי)</span>'
    }[coachState.status];
    var insights = C.coachInsights(st, tk, api.habits().map(api.habitDef));
    var plan = C.weeklyPlan(st, tk, 180);
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">מאמן אישי</h2><p class="page-sub">ניתוח, תכנון יום ושבוע וסדרי עדיפויות לפי הנתונים האמיתיים שלך</p></div>' + statusHtml + '</div>' +
      (coachState.status === 'ready' ? '' : '<div class="card fx-card-gap fx-note-warn"><b>המאמן החכם (AI) עדיין לא מחובר.</b><p class="page-sub" style="margin:6px 0 0;">כדי להפעיל אותו צריך להוסיף ב-Vercel משתנה סביבה <code dir="ltr">ANTHROPIC_API_KEY</code> (Settings → Environment Variables) ולעשות Redeploy. המפתח נשמר רק בשרת ולא נחשף בדפדפן. בינתיים, למטה יש תובנות שמחושבות מקומית לפי כללים קבועים. זה לא AI.</p></div>') +
      '<div class="fx-coach-actions">' + [['analyze', 'נתח את ההתקדמות שלי', 'chart'], ['plan_day', 'עזור לי לתכנן את היום', 'calendar'], ['plan_week', 'צור תוכנית שבועית', 'grid'], ['summary', 'סכם את הביצועים שלי', 'trophy']].map(function (a) {
        return '<button class="fx-coach-btn" data-coach="' + a[0] + '"' + (coachState.status !== 'ready' ? ' disabled title="דורש חיבור AI"' : '') + '>' + ic(a[2]) + '<span>' + a[1] + '</span></button>';
      }).join('') + '</div>' +
      '<form class="advisor-form" id="coach-form"><textarea id="coach-q" placeholder="' + (coachState.status === 'ready' ? 'שאל את המאמן כל דבר על היום, השבוע או ההרגלים שלך' : 'השאלות החופשיות יעבדו אחרי חיבור AI') + '"' + (coachState.status !== 'ready' ? ' disabled' : '') + '></textarea><button type="submit" class="btn btn-primary" aria-label="שלח"' + (coachState.status !== 'ready' ? ' disabled' : '') + '>' + ic('send') + '</button></form>' +
      '<div id="coach-out"></div>' +
      (st.coach.log.length ? '<div class="card fx-card-gap"><h3>תשובות קודמות</h3>' + st.coach.log.slice(0, 5).map(function (e) { return '<details class="fx-coach-old"><summary>' + esc(e.label) + ' · ' + new Date(e.at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</summary><div class="fx-md">' + mdLite(e.text) + '</div></details>'; }).join('') + '</div>' : '') +
      '<div class="card fx-card-gap"><h3>תובנות מקומיות <span class="fx-chip">חישוב לפי כללים · לא AI</span></h3>' +
        (insights.length ? insights.map(function (x) { return '<div class="fx-insight fx-insight-' + x.kind + '"><b>' + esc(x.title) + '</b><div class="page-sub">' + esc(x.text) + '</div></div>'; }).join('') : '<p class="page-sub">צריך עוד קצת נתונים: משימות, הרגלים או שגרה מסומנת.</p>') + '</div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>הצעה לחלוקת משימות לשבוע</h3>' + (plan.some(function (d) { return d.tasks.length; }) ? '<button class="btn btn-ghost btn-sm" id="coach-apply-plan">' + ic('check') + 'החל תאריכים</button>' : '') + '</div>' +
        '<p class="page-sub">עד 3 שעות משימות ביום, לפי חשיבות ותאריכי יעד.</p>' +
        (plan.some(function (d) { return d.tasks.length; }) ? '<div class="fx-plan">' + plan.map(function (d) { return '<div class="fx-plan-day"><div class="fx-plan-h">' + HE_DAYS[C.parseKey(d.k).getDay()] + ' · ' + fmtDate(d.k) + '<span class="page-sub"> ' + minsLabel(d.mins) + '</span></div>' + (d.tasks.length ? d.tasks.map(function (t) { return '<div class="fx-plan-t" style="border-inline-start-color:' + PRI[t.priority].color + '">' + esc(t.title) + '</div>'; }).join('') : '<div class="page-sub">יום פנוי</div>') + '</div>'; }).join('') + '</div>' : emptyState('grid', 'אין משימות פתוחות לחלק', 'הוסף משימות במסך המשימות.')) + '</div>';
    if (coachState.status === 'unknown') checkCoach(function () { if (api.activePanel() === 'coach') renderCoach(el); });
    on(el, '[data-coach]', 'click', function (b) { askCoach(b.dataset.coach, '', b.textContent.trim()); });
    $('#coach-form', el).addEventListener('submit', function (e) { e.preventDefault(); var q = $('#coach-q', el).value.trim(); if (q) askCoach('chat', q, q.slice(0, 50)); });
    var ap = $('#coach-apply-plan', el);
    if (ap) ap.addEventListener('click', function () {
      api.openConfirmModal('לקבוע לכל משימה פתוחה תאריך לפי ההצעה? משימות עם תאריך יעד מוקדם יותר לא יידחו.', function () {
        var n = 0; plan.forEach(function (d) { d.tasks.forEach(function (t) { if (!t.due || t.due > d.k || t.due < tk) { t.due = d.k; n++; } }); });
        save(); api.toast(n + ' משימות קיבלו תאריך', 'success'); renderCoach(el);
      }, { danger: false, confirmLabel: 'החל', title: 'החלת תוכנית שבועית' });
    });
  }
  function askCoach(mode, question, label) {
    if (coachState.busy) return;
    var out = document.getElementById('coach-out');
    coachState.busy = true;
    if (out) out.innerHTML = '<div class="card fx-card-gap"><div class="advisor-thinking">' + ic('spark') + '<span>המאמן חושב</span><span class="advisor-dots"><span></span><span></span><span></span></span></div>' + skeleton(4) + '</div>';
    fetch('api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: mode, question: question, context: coachContext() }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        coachState.busy = false;
        var o = document.getElementById('coach-out');
        if (!res.ok || res.j.error) {
          var msg = { not_configured: 'המפתח לא מוגדר בשרת.', bad_key: 'מפתח ה-API בשרת לא תקין.', rate_limited: 'יותר מדי בקשות, נסה שוב בעוד דקה.', refused: 'המודל לא ענה על הבקשה הזו. נסה לנסח אחרת.', upstream: 'שירות ה-AI לא זמין כרגע.' }[res.j.error] || 'שגיאה בחיבור למאמן.';
          if (o) o.innerHTML = '<div class="card fx-card-gap fx-note-error">' + msg + '</div>';
          api.toast(msg, 'error');
          return;
        }
        var st = S();
        st.coach.log.unshift({ at: Date.now(), mode: mode, label: label, text: res.j.text });
        st.coach.log = st.coach.log.slice(0, 20);
        save();
        if (o) o.innerHTML = '<div class="card fx-card-gap fx-md">' + mdLite(res.j.text) + (res.j.truncated ? '<p class="page-sub">(התשובה נחתכה)</p>' : '') + '</div>';
      })
      .catch(function () {
        coachState.busy = false;
        var o = document.getElementById('coach-out');
        if (o) o.innerHTML = '<div class="card fx-card-gap fx-note-error">אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.</div>';
        api.toast('אין חיבור לשרת', 'error');
      });
  }

  /* ================================================================
     SPEECH: ס / ש practice page
     ================================================================ */
  var SPEECH = {
    s: {
      name: 'ס', ipa: '/s/',
      how: [
        'שיניים כמעט סגורות, בחיוך קל. השפתיים מתוחות לצדדים ולא מעוגלות.',
        'קצה הלשון מאחורי השיניים העליונות, על הרכס שמאחוריהן (או מאחורי התחתונות, שתי הדרכים תקינות). <b>הלשון לא נוגעת בשיניים ולא יוצאת ביניהן.</b>',
        'צדי הלשון נצמדים לשיניים הטוחנות העליונות, ובאמצע הלשון נוצר "ערוץ" צר.',
        'האוויר יוצא <b>במרכז</b>, בזרם דק וחזק שפוגע בשיניים הקדמיות. הצליל חד וגבוה, כמו צמיג שמאבד אוויר.'
      ],
      tip: 'טריק מעבר: תגיד "טטטט" מהר ואז תחזיק את האוויר אחרי ה-ט: "ט-ססס". המקום של ה-ט הוא בדיוק המקום של ה-ס.'
    },
    sh: {
      name: 'ש', ipa: '/ʃ/',
      how: [
        'השפתיים <b>מעוגלות ובולטות קדימה</b>, כמו "שקט!" או כמו נשיקה רכה.',
        'הלשון זזה קצת <b>אחורה</b> לעומת ס: הקצה מאחורי הרכס, והחלק הקדמי שלה רחב יותר.',
        'צדי הלשון נצמדים לשיניים העליונות, והאוויר יוצא באמצע בערוץ רחב יותר.',
        'הצליל עמוק ו"רך" יותר מ-ס. שים יד מול הפה: אמור להרגיש זרם רחב וחמים.'
      ],
      tip: 'טריק מעבר: תחזיק "ססססס" ותוך כדי תמשוך את הלשון לאט אחורה ותעגל שפתיים. הצליל יהפוך ל"שששש".'
    }
  };
  var SPEECH_ERRORS = [
    ['שיבוש בין-שיני (״ת׳״ באנגלית)', 'הלשון יוצאת בין השיניים ונשמע צליל כמו th. <b>תרגול:</b> מול מראה, שיניים סגורות לגמרי, ולהגיד ססס. אם רואים את הלשון, היא קדימה מדי.'],
    ['שיבוש צדי (״שורק/רטוב״)', 'האוויר בורח מהצדדים ונשמע "רטוב". <b>בדיקה:</b> קשית קטנה באמצע הפה, ואם בזמן ס האוויר יוצא דרכה אז זה תקין. <b>שיבוש צדי בדרך כלל דורש קלינאית תקשורת</b>, ואין מה להתבייש: זה נפוץ ומשתפר יפה בטיפול.'],
    ['ס ו-ש מתחלפים', 'הלשון באותו מקום לשני הצלילים. <b>תרגול:</b> זוגות מילים (למטה), עם הקפדה על שפתיים: ב-ס בחיוך, ב-ש מעוגלות.'],
    ['ס "שטוח" או חלש', 'הלשון רחבה מדי או השיניים פתוחות. לסגור שיניים, לחייך, ולכוון אוויר צר לשיניים הקדמיות.']
  ];
  var SPEECH_DRILLS = [
    { lvl: 1, t: 'צליל בודד', s: ['ססס (5 שניות)', 'ס–ס–ס קצרים', 'ס חזק → חלש'], sh: ['שששש (5 שניות)', 'ש–ש–ש קצרים', 'ס → ש בלי עצירה'] },
    { lvl: 2, t: 'הברות', s: ['סָה · סוֹ · סִי · סוּ · סֶה', 'אַס · אוֹס · אִיס · אוּס', 'אַסָה · אוֹסוֹ · אִיסִי'], sh: ['שָׁה · שׁוֹ · שִׁי · שׁוּ · שֶׁה', 'אַשׁ · אוֹשׁ · אִישׁ · אוּשׁ', 'אַשָׁה · אוֹשׁוֹ · אִישִׁי'] },
    { lvl: 3, t: 'מילים', s: ['בהתחלה: סוּס · סֵפֶר · סָבְתָא · סַל · סוּכָּר', 'באמצע: כִּסֵּא · מִסְפָּר · בֵּית סֵפֶר · פַּסְטָה', 'בסוף: כּוֹס · אוֹטוֹבּוּס · דָּס · נֵס'], sh: ['בהתחלה: שָׁלוֹם · שֶׁמֶשׁ · שׁוּק · שָׁעוֹן · שֻׁלְחָן', 'באמצע: מַשָּׁהוּ · מְשַׂחֵק · יוֹשֵׁב · חָשׁוּב', 'בסוף: שֶׁמֶשׁ · רֹאשׁ · חָדָשׁ · אִישׁ'] },
    { lvl: 4, t: 'זוגות מנוגדים (ס מול ש)', s: ['סָם – שָׁם', 'סֵם – שֵׁם', 'סָר – שָׁר', 'אמור כל זוג 5 פעמים: ס בחיוך, ש בשפתיים מעוגלות'], sh: ['שִׂים לב: שׂ (שׂ שמאלית) נשמעת בדיוק כמו ס!', 'שָׂרָה = סָרָה בהגייה', 'שֵׂכֶל = סֵכֶל בהגייה'] },
    { lvl: 5, t: 'משפטים', s: ['סָבְתָא סִפְּרָה סִפּוּר עַל סוּס', 'הַסּוּסִים בָּאִים לְבֵית הַסֵּפֶר', 'סַל עִם סֻכָּרִיּוֹת סְגֻלּוֹת'], sh: ['שָׁלוֹשׁ שְׁעוֹת שִׁעוּר שֶׁל שִׁירָה', 'הַשֶּׁמֶשׁ שׁוֹקַעַת בַּשָּׁעָה שֵׁשׁ', 'שִׁמְשׁוֹן שָׁתָה שֵׁשׁ כּוֹסוֹת'] },
    { lvl: 6, t: 'ערבוב (הכי קשה)', s: ['שֵׁשׁ סוּסוֹת שׁוֹתוֹת מַיִם', 'סָשָׁה שָׁם סַל שֶׁל שׁוֹקוֹלָד', 'שׁוּשַׁנָּה סִדְּרָה שֵׁשׁ סְפָרִים'], sh: ['קריאה בקול: עמוד אחד מספר, לאט, עם הקפדה על כל ס ו-ש', 'שיחה של 2 דקות: לבחור מילה אחת ולהקפיד עליה', 'הקלטה של 30 שניות והאזנה'] }
  ];
  var rec = { media: null, chunks: [], url: null, recording: false };
  function renderSpeech(el) {
    var st = S(), tk = todayKey(), sp = st.speech;
    var todayLog = sp.log[tk] || { minutes: 0, levels: {} };
    var streak = 0, k = tk; if (!(sp.log[k] && sp.log[k].minutes)) k = C.addDays(k, -1);
    while (sp.log[k] && sp.log[k].minutes) { streak++; k = C.addDays(k, -1); }
    var last7 = []; for (var i = 6; i >= 0; i--) { var kk = C.addDays(tk, -i); last7.push((sp.log[kk] || {}).minutes || 0); }
    var ratings = sp.selfRatings.slice(-10);
    var soundCard = function (key) {
      var x = SPEECH[key];
      return '<div class="card fx-speech-card"><div class="fx-speech-letter">' + x.name + '<span dir="ltr">' + x.ipa + '</span></div><h3>איך הוגים ' + x.name + '</h3><ol class="fx-steps">' + x.how.map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ol><div class="fx-tip">💡 ' + x.tip + '</div></div>';
    };
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">דיבור: ס ו-ש</h2><p class="page-sub">מדריך הגייה ותרגול יומי קצר. 10 דקות ביום, בהדרגה</p></div></div>' +
      '<div class="fx-kpis fx-kpis-sm">' + kpi('היום', todayLog.minutes + ' דק׳', 'יעד: 10 דק׳') + kpi('רצף תרגול', streak + ' ימים') + kpi('השבוע', last7.reduce(function (a, b) { return a + b; }, 0) + ' דק׳') + kpi('דירוג אחרון', ratings.length ? ratings[ratings.length - 1].s + '/5 · ' + ratings[ratings.length - 1].sh + '/5' : '—', 'ס · ש') + '</div>' +
      '<div class="grid-2 fx-card-gap">' + soundCard('s') + soundCard('sh') + '</div>' +
      '<div class="card fx-card-gap"><h3>בדיקה עצמית: מה בדיוק קורה אצלי?</h3>' +
        '<ul class="fx-steps"><li><b>מראה:</b> תגיד "סוס" מול מראה. רואים את הלשון בין השיניים? זה שיבוש בין-שיני.</li><li><b>יד מול הפה:</b> ב-ס אמור להרגיש זרם דק <b>באמצע</b>. אם האוויר מרגיש בצדדים, זה שיבוש צדי.</li><li><b>הקלטה:</b> תקליט את עצמך למטה ותקשיב. קל יותר לשמוע מבחוץ.</li></ul>' +
        '<div class="fx-errors">' + SPEECH_ERRORS.map(function (e) { return '<details><summary>' + e[0] + '</summary><p class="page-sub">' + e[1] + '</p></details>'; }).join('') + '</div></div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>הקלטה והאזנה</h3><span class="page-sub" style="font-size:12px;">ההקלטה נשארת רק בזיכרון הדפדפן ולא נשמרת</span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;"><button class="btn ' + (rec.recording ? 'btn-danger' : 'btn-primary') + '" id="sp-rec">' + ic('mic') + (rec.recording ? 'עצור הקלטה' : 'התחל הקלטה') + '</button>' + (rec.url ? '<audio controls src="' + rec.url + '" style="max-width:100%;"></audio>' : '') + '</div></div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>תרגילים לפי שלבים</h3><button class="btn btn-primary btn-sm" id="sp-timer">' + ic('alarm') + (spTimer.running ? 'עצור טיימר' : 'טיימר תרגול 10 דק׳') + '</button></div>' +
        '<p class="page-sub">עוברים לשלב הבא רק כשהשלב הנוכחי יוצא נכון ברוב הפעמים. 5-10 חזרות לכל שורה.</p><div class="num" id="sp-clock" style="font-size:22px;font-weight:700;' + (spTimer.running ? '' : 'display:none;') + '"></div>' +
        SPEECH_DRILLS.map(function (d) {
          var doneL = !!todayLog.levels[d.lvl];
          return '<details class="fx-drill"' + (d.lvl <= 2 ? ' open' : '') + '><summary><span class="fx-lvl">' + d.lvl + '</span>' + d.t + (doneL ? ' ✓' : '') + '</summary><div class="grid-2"><div><b>ס</b><ul>' + d.s.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div><div><b>ש</b><ul>' + d.sh.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div></div>' +
            '<button class="btn btn-ghost btn-sm" data-sp-lvl="' + d.lvl + '">' + (doneL ? 'תורגל היום ✓' : 'סמן שתרגלתי שלב זה') + '</button></details>';
        }).join('') + '</div>' +
      '<div class="card fx-card-gap"><h3>איך יצא היום? (דירוג עצמי)</h3><div class="fx-rate-row"><span>ס</span>' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="fx-rate" data-rate-s="' + n + '">' + n + '</button>'; }).join('') + '</div><div class="fx-rate-row"><span>ש</span>' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="fx-rate" data-rate-sh="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
        (ratings.length > 1 ? '<div class="page-sub" style="margin-top:8px;">מגמת ס (10 אחרונים)</div>' + barChart(ratings.map(function (r) { return r.s; }), ratings.map(function (r) { return fmtDate(r.k); }), { max: 5, unit: '/5', aria: 'מגמת דירוג ס' }) : '') + '</div>' +
      '<div class="card fx-card-gap"><h3>המחקר שלי</h3><p class="page-sub">מקום לרשום מה מצאת: טיפים, סרטונים, מה עובד לך.</p><textarea id="sp-notes" class="fx-note-body" style="min-height:120px;" placeholder="למשל: גיליתי שכשאני מחייך ה-ס יוצא יותר חד…">' + esc(sp.notes || '') + '</textarea></div>' +
      '<div class="card fx-card-gap fx-note-warn"><b>מתי כדאי לפנות לקלינאית תקשורת?</b><p class="page-sub" style="margin:6px 0 0;">אם האוויר יוצא מהצדדים (שיבוש צדי), אם אחרי כמה שבועות של תרגול אין שיפור, או אם זה מפריע לך ביום-יום. בישראל אפשר לקבל אבחון וטיפול דרך קופת החולים (בדרך כלל עם הפניה מרופא). תיקון הגייה אפשרי בכל גיל. המדריך כאן מבוסס על עקרונות מקובלים בתרגול הגייה, והוא לא תחליף לאבחון מקצועי.</p></div>';
    var clock = $('#sp-clock', el);
    if (spTimer.running && clock) paintSpTimer();
    $('#sp-timer', el).addEventListener('click', function () {
      if (spTimer.running) stopSpTimer(true); else { spTimer.running = true; spTimer.start = Date.now(); spTimer.iv = setInterval(paintSpTimer, 1000); }
      renderSpeech(el);
    });
    on(el, '[data-sp-lvl]', 'click', function (b) {
      var lg = sp.log[tk] = sp.log[tk] || { minutes: 0, levels: {} };
      lg.levels[b.dataset.spLvl] = true;
      if (!lg.minutes) lg.minutes = 2; // marking a level counts as a short practice
      creditSpeech(); save(); renderSpeech(el);
    });
    on(el, '[data-rate-s]', 'click', function (b) { rateSpeech('s', +b.dataset.rateS); api.toast('נשמר', 'success'); renderSpeech(el); });
    on(el, '[data-rate-sh]', 'click', function (b) { rateSpeech('sh', +b.dataset.rateSh); api.toast('נשמר', 'success'); renderSpeech(el); });
    $('#sp-notes', el).addEventListener('input', debounce(function (e) { sp.notes = e.target.value; save(); }, 500));
    $('#sp-rec', el).addEventListener('click', function () { toggleRecord(function () { renderSpeech(el); }); });
  }
  var spTimer = { running: false, start: 0, iv: null };
  function paintSpTimer() {
    var c = document.getElementById('sp-clock'); if (!c) return;
    var sec = Math.floor((Date.now() - spTimer.start) / 1000), left = Math.max(0, 600 - sec);
    c.textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
    if (left === 0) { stopSpTimer(true); beep(); api.toast('10 דקות תרגול! כל הכבוד 🎉', 'success'); api.rerender(); }
  }
  function stopSpTimer(credit) {
    clearInterval(spTimer.iv); spTimer.running = false;
    if (credit) {
      var mins = Math.round((Date.now() - spTimer.start) / 60000);
      if (mins >= 1) { var st = S(), tk = todayKey(); var lg = st.speech.log[tk] = st.speech.log[tk] || { minutes: 0, levels: {} }; lg.minutes += Math.min(mins, 60); creditSpeech(); save(); }
    }
  }
  function creditSpeech() { var tk = todayKey(); if (((S().speech.log[tk] || {}).minutes || 0) >= 2) { api.grantXPOnce('speech:' + tk, 15, 'speech', {}); api.flushXP(null); } }
  function rateSpeech(which, n) {
    var sp = S().speech, tk = todayKey();
    var last = sp.selfRatings[sp.selfRatings.length - 1];
    if (!last || last.k !== tk) { last = { k: tk, s: null, sh: null }; sp.selfRatings.push(last); }
    last[which] = n; save();
  }
  function toggleRecord(after) {
    if (rec.recording && rec.media) { rec.media.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { api.toast('הדפדפן לא תומך בהקלטה', 'error'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      rec.chunks = []; rec.media = new MediaRecorder(stream);
      rec.media.ondataavailable = function (e) { if (e.data.size) rec.chunks.push(e.data); };
      rec.media.onstop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); if (rec.url) URL.revokeObjectURL(rec.url); rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' })); rec.recording = false; after(); };
      rec.media.start(); rec.recording = true; after();
    }).catch(function () { api.toast('אין הרשאה למיקרופון', 'error'); });
  }

  /* ================================================================
     REVIEWS: end-of-day summary, plan tomorrow, weekly review
     ================================================================ */
  var reviewUI = { tab: 'day' };
  function renderReview(el) {
    var st = S(), tk = todayKey(), tom = C.addDays(tk, 1);
    var rv = st.reviews;
    var dc = C.dayCompletion(st, tk);
    var doneToday = tasks().filter(function (t) { return t.doneAt && C.dkey(new Date(t.doneAt)) === tk; });
    var routine = st.tasksByDate[tk] || [];
    var html = '<div class="page-head"><div><h2 class="page-title">סקירות</h2><p class="page-sub">סיכום סוף יום, תכנון מחר וסקירה שבועית</p></div></div>' +
      '<div class="fx-tabs">' + [['day', 'סיכום היום'], ['tomorrow', 'תכנון מחר'], ['week', 'סקירה שבועית']].map(function (t) { return '<button class="fx-tab' + (reviewUI.tab === t[0] ? ' active' : '') + '" data-rv-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (reviewUI.tab === 'day') {
      var r = rv['day:' + tk] || {};
      html += '<div class="fx-kpis fx-kpis-sm">' + kpi('ביצוע היום', dc.rate == null ? '—' : dc.rate + '%', dc.done + '/' + dc.total) + kpi('שגרה', routine.filter(function (t) { return t.done; }).length + '/' + routine.length) + kpi('משימות שהושלמו', doneToday.length) + kpi('ריכוז', minsLabel(C.focusMinutes(st, tk))) + '</div>' +
        '<div class="card fx-card-gap"><h3>מה הלך טוב היום?</h3><textarea class="fx-note-body" data-rv="good" placeholder="3 דברים קטנים שהצליחו">' + esc(r.good || '') + '</textarea>' +
        '<h3 style="margin-top:12px;">מה אפשר לשפר?</h3><textarea class="fx-note-body" data-rv="improve">' + esc(r.improve || '') + '</textarea>' +
        '<h3 style="margin-top:12px;">איך היה היום? (1-5)</h3><div class="fx-rate-row">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="fx-rate' + (r.mood === n ? ' on' : '') + '" data-rv-mood="' + n + '">' + n + '</button>'; }).join('') + '</div></div>';
    } else if (reviewUI.tab === 'tomorrow') {
      var open = C.sortTasks(tasks().filter(function (t) { return t.status !== 'done' && !t.archived && (!t.due || t.due <= tom); }), 'priority');
      var tmr = tasks().filter(function (t) { return t.due === tom && !t.archived; });
      var est = tmr.reduce(function (a, t) { return a + (+t.estimate || 30); }, 0);
      html += '<div class="card fx-card-gap"><h3>מחר · ' + HE_DAYS[C.parseKey(tom).getDay()] + '</h3><p class="page-sub">' + tmr.length + ' משימות · כ-' + minsLabel(est) + (est > 300 ? ' · <b style="color:var(--danger)">עמוס מדי, כדאי לדחות חלק</b>' : '') + '</p>' +
        '<div class="fx-task-list">' + (tmr.length ? tmr.map(taskRowHtml).join('') : '<p class="page-sub">עוד לא תכננת משימות למחר.</p>') + '</div></div>' +
        '<div class="card fx-card-gap"><h3>להעביר למחר</h3><p class="page-sub">משימות פתוחות בלי תאריך, להיום או באיחור. בחר מה עובר למחר:</p>' +
        (open.filter(function (t) { return t.due !== tom; }).length ? open.filter(function (t) { return t.due !== tom; }).slice(0, 20).map(function (t) { return '<label class="fx-pick"><input type="checkbox" data-pick="' + t.id + '"><span>' + esc(t.title) + '</span><span class="fx-chip">' + (t.due ? relDate(t.due) : 'ללא תאריך') + '</span></label>'; }).join('') + '<button class="btn btn-primary btn-sm" id="rv-move" style="margin-top:10px;">' + ic('calendar') + 'העבר למחר</button>' : '<p class="page-sub">אין משימות פתוחות להעברה.</p>') + '</div>' +
        '<div class="card fx-card-gap"><h3>3 הדברים הכי חשובים למחר</h3>' + [0, 1, 2].map(function (i) { return '<input type="text" class="ms-input fx-top3" data-top3="' + i + '" maxlength="80" value="' + esc(((rv['top3:' + tom] || [])[i]) || '') + '" placeholder="' + (i + 1) + '.">'; }).join('') + '</div>';
    } else {
      var wk = api.isoWeekKey();
      var w = rv['week:' + wk] || {};
      var r7 = C.rangeRate(st, tk, 7), rp = C.rangeRate(st, C.addDays(tk, -7), 7);
      var doneW = tasks().filter(function (t) { return t.doneAt && t.doneAt > Date.now() - 7 * 864e5; });
      var habs = api.habits().map(function (h) { var d = api.habitDef(h); return { d: d, s: C.habitStats(d, st.habitLog, st.habitValues, tk, 7) }; }).sort(function (a, b) { return b.s.rate - a.s.rate; });
      html += '<div class="fx-kpis fx-kpis-sm">' + kpi('ביצוע שבועי', r7 == null ? '—' : r7 + '%', rp == null ? '' : 'שבוע קודם ' + rp + '%') + kpi('משימות', doneW.length) + kpi('ריכוז', minsLabel([0, 1, 2, 3, 4, 5, 6].reduce(function (a, i) { return a + C.focusMinutes(st, C.addDays(tk, -i)); }, 0))) + kpi('רצף', st.gam.streak.current + ' 🔥') + '</div>' +
        (habs.length ? '<div class="card fx-card-gap"><h3>הרגלים השבוע</h3><p class="page-sub">הכי חזק: <b>' + esc(habs[0].d.name) + '</b> (' + habs[0].s.rate + '%) · צריך חיזוק: <b>' + esc(habs[habs.length - 1].d.name) + '</b> (' + habs[habs.length - 1].s.rate + '%)</p></div>' : '') +
        '<div class="card fx-card-gap"><h3>מה למדתי השבוע?</h3><textarea class="fx-note-body" data-rvw="learned">' + esc(w.learned || '') + '</textarea><h3 style="margin-top:12px;">המיקוד לשבוע הבא</h3><textarea class="fx-note-body" data-rvw="focus">' + esc(w.focus || '') + '</textarea></div>';
    }
    el.innerHTML = html;
    on(el, '[data-rv-tab]', 'click', function (b) { reviewUI.tab = b.dataset.rvTab; renderReview(el); });
    var dayRec = function () { return (rv['day:' + tk] = rv['day:' + tk] || {}); };
    on(el, '[data-rv]', 'input', debounce(function (t) { var r = dayRec(); r[t.dataset.rv] = t.value; save(); grantReview(); }, 500));
    on(el, '[data-rv-mood]', 'click', function (b) { dayRec().mood = +b.dataset.rvMood; save(); grantReview(); renderReview(el); });
    on(el, '[data-top3]', 'input', debounce(function (t) { var a = rv['top3:' + tom] = rv['top3:' + tom] || []; a[+t.dataset.top3] = t.value; save(); }, 400));
    on(el, '[data-rvw]', 'input', debounce(function (t) { var wk2 = api.isoWeekKey(); var w2 = rv['week:' + wk2] = rv['week:' + wk2] || {}; w2[t.dataset.rvw] = t.value; save(); if ((w2.learned || '').length + (w2.focus || '').length > 20) { api.grantXPOnce('weekreview:' + wk2, 40, 'review', {}); api.flushXP(null); } }, 500));
    var mv = $('#rv-move', el);
    if (mv) mv.addEventListener('click', function () { var n = 0; $$('[data-pick]:checked', el).forEach(function (c) { var t = findTask(c.dataset.pick); if (t) { t.due = tom; n++; } }); save(); api.toast(n ? n + ' משימות הועברו למחר' : 'לא נבחרו משימות', n ? 'success' : 'error'); renderReview(el); });
    wireTaskRows(el, function () { renderReview(el); });
    function grantReview() { var r = rv['day:' + tk] || {}; if (r.mood && ((r.good || '').length > 3)) { api.grantXPOnce('dayreview:' + tk, 20, 'review', {}); api.flushXP(null); } }
  }

  /* ================================================================
     GLOBAL SEARCH (Ctrl/⌘+K)
     ================================================================ */
  function openSearch() {
    var m = openModal('<div class="fx-search fx-search-lg">' + ic('search') + '<input type="search" id="gs-in" placeholder="חיפוש בכל האפליקציה: משימות, פתקים, מטרות, הרגלים, מסכים" autofocus></div><div id="gs-res" class="fx-search-res"></div><div class="page-sub" style="font-size:11.5px;margin-top:8px;">Enter לפתיחה · Esc לסגירה</div>', { wide: true });
    var inp = $('#gs-in', m), res = $('#gs-res', m), results = [];
    function run() {
      var q = inp.value.trim().toLowerCase(), st = S();
      results = [];
      var add = function (type, label, sub, act) { results.push({ type: type, label: label, sub: sub, act: act }); };
      api.navItems().forEach(function (n) { if (!q || n.label.toLowerCase().indexOf(q) >= 0) add('מסך', n.label, '', function () { api.showPanel(n.id); }); });
      if (q) {
        tasks().forEach(function (t) { if ((t.title + ' ' + t.description + ' ' + t.tags.join(' ')).toLowerCase().indexOf(q) >= 0) add('משימה', t.title, t.due ? relDate(t.due) : '', function () { openTaskEditor(t); }); });
        st.notes.forEach(function (n) { if ((n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0) add('פתק', n.title || 'ללא כותרת', (n.body || '').slice(0, 40), function () { notesUI.tab = 'notes'; notesUI.openId = n.id; api.showPanel('notes'); }); });
        st.inbox.forEach(function (n) { if (n.text.toLowerCase().indexOf(q) >= 0) add('Inbox', n.text, '', function () { notesUI.tab = 'inbox'; api.showPanel('notes'); }); });
        (st.goals || []).forEach(function (g) { if (g.title.toLowerCase().indexOf(q) >= 0) add('מטרה', g.title, api.goalProgress(g) + '%', function () { api.showPanel('goals'); }); });
        api.habits().forEach(function (h) { if (h.name.toLowerCase().indexOf(q) >= 0) add('הרגל', h.name, '', function () { api.showPanel('habits'); }); });
        st.events.forEach(function (e) { if (e.title.toLowerCase().indexOf(q) >= 0) add('אירוע', e.title, relDate(e.date), function () { calUI.cursor = e.date; calUI.view = 'day'; api.showPanel('calendar'); }); });
        (st.tasksByDate[todayKey()] || []).forEach(function (t) { if (t.title.toLowerCase().indexOf(q) >= 0) add('שגרה היום', t.title, t.time, function () { api.showPanel('schedule'); }); });
      }
      results = results.slice(0, 30);
      res.innerHTML = results.length ? results.map(function (r, i) { return '<button class="fx-search-item' + (i === 0 ? ' sel' : '') + '" data-gs="' + i + '"><span class="fx-chip">' + r.type + '</span><span class="fx-search-label">' + esc(r.label) + '</span><span class="page-sub">' + esc(r.sub || '') + '</span></button>'; }).join('') : '<div class="page-sub" style="padding:14px;">לא נמצאו תוצאות ל"' + esc(inp.value) + '"</div>';
      on(res, '[data-gs]', 'click', function (b) { var r = results[+b.dataset.gs]; api.closeModal(); r.act(); });
    }
    var sel = 0;
    inp.addEventListener('input', function () { sel = 0; run(); });
    inp.addEventListener('keydown', function (e) {
      var items = $$('[data-gs]', res);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach(function (x, i) { x.classList.toggle('sel', i === sel); }); if (items[sel]) items[sel].scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && results[sel]) { e.preventDefault(); var r = results[sel]; api.closeModal(); r.act(); }
    });
    run();
  }

  /* ================================================================
     NOTIFICATIONS (browser, permission-gated, per-type toggles)
     Honest limit: these fire while the app is open or in a background tab.
     Push to a fully closed app would need a push server.
     ================================================================ */
  var NOTIF_TYPES = [['tasks', 'תזכורות למשימות', 'לפני משימה עם שעה'], ['habits', 'תזכורות להרגלים', 'בשעת התזכורת של ההרגל, או בשעה הכללית'], ['routine', 'תזכורות לשגרה', 'בתחילת כל פעילות בשגרה'], ['deadlines', 'מועדי יעד', 'בבוקר, על משימות שמועדן מחר'], ['goals', 'מטרות', 'כשמטרה מתקרבת לתאריך היעד'], ['achievements', 'הישגים', 'כשנפתח הישג או עולים רמה'], ['focus', 'סוף סשן ריכוז', 'כשטיימר הפוקוס מסתיים']];
  function notifPerm() { return ('Notification' in window) ? Notification.permission : 'unsupported'; }
  function notify(type, title, body) {
    var p = S().prefs.notif;
    if (!p.enabled || (type in p && p[type] === false) || notifPerm() !== 'granted') return false;
    var opts = { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: type + ':' + title, lang: 'he', dir: 'rtl' };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) { if (reg && reg.showNotification) reg.showNotification(title, opts); else new Notification(title, opts); }).catch(function () { try { new Notification(title, opts); } catch (e) {} });
      } else new Notification(title, opts);
    } catch (e) { return false; }
    return true;
  }
  function once(key, fn) { var sent = S().notifSent; if (sent[key]) return; if (fn() !== false) { sent[key] = Date.now(); save(); } }
  function notifTick() {
    var st = S(); if (!st.prefs.notif.enabled || notifPerm() !== 'granted') return;
    var now = new Date(), tk = todayKey(), nowMin = now.getHours() * 60 + now.getMinutes(), lead = st.prefs.notif.leadMinutes || 10;
    tasks().forEach(function (t) {
      if (t.status === 'done' || t.archived || t.due !== tk || !t.time) return;
      var d = api.timeToMin(t.time) - nowMin;
      if (d <= lead && d >= -1) once('task:' + t.id + ':' + tk, function () { return notify('tasks', 'בקרוב: ' + t.title, 'ב-' + t.time); });
    });
    (st.tasksByDate[tk] || []).forEach(function (r) {
      if (r.done || r.optional) return;
      var d = api.timeToMin(r.time) - nowMin;
      if (d <= 0 && d >= -2) once('routine:' + r.id, function () { return notify('routine', 'עכשיו בשגרה: ' + r.title, r.time); });
    });
    api.habits().forEach(function (h) {
      var def = api.habitDef(h), time = def.remind || st.prefs.notif.habitTime;
      if (!time || C.habitDoneOn(def, st.habitLog, st.habitValues, tk)) return;
      if (nowMin >= api.timeToMin(time) && nowMin <= api.timeToMin(time) + 30) once('habit:' + h.id + ':' + tk, function () { return notify('habits', 'תזכורת: ' + def.name, 'עוד לא סימנת היום'); });
    });
    if (now.getHours() >= 9) {
      var tomorrow = tasks().filter(function (t) { return t.due === C.addDays(tk, 1) && t.status !== 'done' && !t.archived; });
      if (tomorrow.length) once('deadlines:' + tk, function () { return notify('deadlines', tomorrow.length + ' משימות למחר', tomorrow.slice(0, 3).map(function (t) { return t.title; }).join(' · ')); });
      (st.goals || []).forEach(function (g) {
        if (!g.targetDate) return;
        var days = Math.round((C.parseKey(g.targetDate) - C.parseKey(tk)) / 864e5);
        if (days >= 0 && days <= 3 && api.goalProgress(g) < 100) once('goal:' + g.id + ':' + tk, function () { return notify('goals', 'המטרה "' + g.title + '" מתקרבת', 'עוד ' + days + ' ימים · ' + api.goalProgress(g) + '%'); });
      });
    }
    var achCount = Object.keys(st.gam.achievements || {}).length + st.gam.levelUps.length;
    if (lastAch != null && achCount > lastAch) notify('achievements', 'הישג חדש! 🏆', 'פתחת הישג או עלית רמה במסלול');
    lastAch = achCount;
  }
  var lastAch = null;

  /* ================================================================
     BACKUPS (IndexedDB daily snapshots) + data tools
     ================================================================ */
  var DB_NAME = 'maslul-backups', STORE = 'snapshots', KEEP = 14;
  function idb(cb) {
    if (!window.indexedDB) { cb(null); return; }
    try {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { cb(r.result); };
      r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function snapshot(reason, cb) {
    idb(function (db) {
      if (!db) { if (cb) cb(false); return; }
      try {
        var id = reason === 'daily' ? 'daily:' + todayKey() : reason + ':' + Date.now();
        var tx = db.transaction(STORE, 'readwrite'), os = tx.objectStore(STORE);
        os.put({ id: id, at: Date.now(), reason: reason, data: JSON.stringify(S()) });
        var all = os.getAll();
        all.onsuccess = function () {
          var list = all.result.sort(function (a, b) { return b.at - a.at; });
          list.slice(KEEP).forEach(function (x) { os.delete(x.id); });
        };
        tx.oncomplete = function () { if (cb) cb(true); };
        tx.onerror = function () { if (cb) cb(false); };
      } catch (e) { if (cb) cb(false); }
    });
  }
  function listSnapshots(cb) {
    idb(function (db) {
      if (!db) { cb([]); return; }
      try { var g = db.transaction(STORE).objectStore(STORE).getAll(); g.onsuccess = function () { cb(g.result.sort(function (a, b) { return b.at - a.at; })); }; g.onerror = function () { cb([]); }; } catch (e) { cb([]); }
    });
  }
  function downloadJSON(obj, name) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function summarize(s) {
    var days = Object.keys(s.tasksByDate || {}).length;
    return days + ' ימי שגרה · ' + ((s.todo && s.todo.tasks) || []).length + ' משימות · ' + (s.goals || []).length + ' מטרות · ' + ((s.notes || []).length) + ' פתקים · ' + ((s.workoutLog || []).length) + ' סטים בכושר · ' + ((s.gam && s.gam.totalXP) || 0) + ' XP';
  }
  function restoreState(newState, label) {
    snapshot('before-restore', function () { api.replaceState(newState); api.toast('השחזור הושלם · ' + label, 'success'); });
  }

  /* ================================================================
     SETTINGS extension
     ================================================================ */
  var ACCENTS = ['#45d6c8', '#7c9cff', '#a78bfa', '#f472b6', '#f5a94e', '#55cf8f', '#ef6f6a'];
  function enhanceSettings(el) {
    var st = S(), p = st.prefs;
    // replace the old text-only export and the unguarded reset with the safer data card below
    ['export-text-btn', 'reset-data'].forEach(function (id) { var b = document.getElementById(id); var row = b && b.closest('.settings-row'); if (row) row.remove(); });
    var used = 0; try { used = (localStorage.getItem('maslul_state_v1') || '').length; } catch (e) {}
    var perm = notifPerm();
    var box = document.createElement('div');
    box.innerHTML =
      '<div class="card fx-card-gap"><h3>פרופיל ומראה</h3>' +
        '<div class="settings-row"><div class="fx-avatar-wrap"><div class="fx-avatar">' + (p.avatar ? '<img src="' + p.avatar + '" alt="תמונת פרופיל">' : esc((st.userName || '?').slice(0, 1))) + '</div><div><div class="lbl">תמונת פרופיל</div><div class="desc">מוצגת בתפריט הצד ובבית</div></div></div>' +
          '<div style="display:flex;gap:6px;"><label class="btn btn-ghost btn-sm" style="cursor:pointer;">' + ic('camera') + 'בחר<input type="file" accept="image/*" id="st-avatar" hidden></label>' + (p.avatar ? '<button class="btn btn-ghost btn-sm" id="st-avatar-rm">הסר</button>' : '') + '</div></div>' +
        '<div class="settings-row"><div><div class="lbl">צבע מערכת</div><div class="desc">צבע ההדגשה של כל האפליקציה</div></div><div class="fx-swatches">' + ACCENTS.map(function (c) { return '<button class="fx-swatch' + ((p.accent || ACCENTS[0]) === c ? ' on' : '') + '" data-accent="' + c + '" style="background:' + c + '" aria-label="צבע ' + c + '"></button>'; }).join('') + '<label class="fx-swatch fx-swatch-custom" title="צבע מותאם"><input type="color" id="st-accent" value="' + (p.accent || ACCENTS[0]) + '"></label></div></div>' +
        '<div class="settings-row" style="border:none;padding-bottom:0;"><div><div class="lbl">מסך הבית</div><div class="desc">בחר אילו רכיבים יופיעו ובאיזה סדר</div></div><button class="btn btn-ghost btn-sm" id="st-dash">' + ic('grid') + 'התאמה אישית</button></div>' +
      '</div>' +
      '<div class="card fx-card-gap"><h3>התראות</h3>' +
        '<div class="settings-row"><div><div class="lbl">התראות דפדפן</div><div class="desc">' + ({ granted: 'ההרשאה ניתנה', denied: 'ההרשאה נחסמה. אפשר לשנות בהגדרות האתר בדפדפן', default: 'נבקש הרשאה רק כשתפעיל', unsupported: 'הדפדפן לא תומך בהתראות' }[perm]) + '. ההתראות עובדות כשהאפליקציה פתוחה או ברקע.</div></div>' +
          '<label class="switch"><input type="checkbox" id="st-notif"' + (p.notif.enabled && perm === 'granted' ? ' checked' : '') + (perm === 'unsupported' || perm === 'denied' ? ' disabled' : '') + '><span></span></label></div>' +
        NOTIF_TYPES.map(function (t) { return '<div class="settings-row fx-sub-row"><div><div class="lbl">' + t[1] + '</div><div class="desc">' + t[2] + '</div></div><label class="switch"><input type="checkbox" data-notif="' + t[0] + '"' + (p.notif[t[0]] !== false ? ' checked' : '') + '><span></span></label></div>'; }).join('') +
        '<div class="settings-row fx-sub-row"><div><div class="lbl">שעת תזכורת כללית להרגלים</div></div><input type="time" id="st-habit-time" value="' + (p.notif.habitTime || '') + '"></div>' +
        '<div class="settings-row fx-sub-row" style="border:none;"><div><div class="lbl">כמה דקות לפני משימה</div></div><input type="number" id="st-lead" min="0" max="120" value="' + (p.notif.leadMinutes || 10) + '" style="width:80px;"></div>' +
        (perm === 'granted' ? '<button class="btn btn-ghost btn-sm" id="st-notif-test">' + ic('bell') + 'שלח התראת בדיקה</button>' : '') +
      '</div>' +
      '<div class="card fx-card-gap"><h3>נתונים, גיבוי ושחזור</h3>' +
        '<p class="page-sub">הנתונים נשמרים במכשיר הזה (localStorage), ונוצר גיבוי אוטומטי יומי ב-IndexedDB (עד ' + KEEP + ' אחרונים). כדי להעביר למכשיר אחר: ייצוא, ואז ייבוא במכשיר השני. סנכרון אוטומטי בין מכשירים דורש שרת וחשבון משתמש, ועדיין לא קיים.</p>' +
        '<div class="page-sub" style="font-size:12px;">גרסת מבנה נתונים: ' + st.schemaVersion + ' · נפח: ' + Math.round(used / 1024) + ' KB · ' + summarize(st) + '</div>' +
        '<div class="fx-btn-row"><button class="btn btn-primary btn-sm" id="st-export">' + ic('download') + 'ייצוא JSON</button><label class="btn btn-ghost btn-sm" style="cursor:pointer;">' + ic('upload') + 'ייבוא גיבוי<input type="file" accept="application/json,.json" id="st-import" hidden></label><button class="btn btn-ghost btn-sm" id="st-snap">' + ic('bookmark') + 'צור גיבוי עכשיו</button></div>' +
        '<div id="st-snaps" style="margin-top:10px;">' + skeleton(2) + '</div>' +
        '<div class="settings-row" style="border:none;margin-top:8px;"><div><div class="lbl" style="color:var(--danger)">איפוס מבוקר</div><div class="desc">לפני האיפוס נוצר גיבוי אוטומטי, וצריך להקליד "איפוס" לאישור</div></div><button class="btn btn-danger btn-sm" id="st-reset">' + ic('trash') + 'איפוס</button></div>' +
      '</div>';
    el.appendChild(box);

    $('#st-avatar', box).addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var img = new Image(), rd = new FileReader();
      rd.onload = function () { img.onload = function () { var c = document.createElement('canvas'); c.width = c.height = 128; var s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128); p.avatar = c.toDataURL('image/jpeg', 0.85); save(); api.applyPrefs(); api.rerender(); api.toast('התמונה עודכנה', 'success'); }; img.onerror = function () { api.toast('לא הצלחתי לקרוא את התמונה', 'error'); }; img.src = rd.result; };
      rd.readAsDataURL(f);
    });
    var rm = $('#st-avatar-rm', box); if (rm) rm.addEventListener('click', function () { p.avatar = null; save(); api.applyPrefs(); api.rerender(); });
    on(box, '[data-accent]', 'click', function (b) { p.accent = b.dataset.accent; save(); api.applyPrefs(); api.rerender(); });
    $('#st-accent', box).addEventListener('change', function (e) { p.accent = e.target.value; save(); api.applyPrefs(); api.rerender(); });
    $('#st-dash', box).addEventListener('click', openDashboardCustomizer);
    $('#st-notif', box).addEventListener('change', function (e) {
      if (!e.target.checked) { p.notif.enabled = false; save(); return; }
      Notification.requestPermission().then(function (r) { p.notif.enabled = r === 'granted'; save(); api.toast(r === 'granted' ? 'ההתראות הופעלו' : 'לא ניתנה הרשאה', r === 'granted' ? 'success' : 'error'); api.rerender(); });
    });
    on(box, '[data-notif]', 'change', function (c) { p.notif[c.dataset.notif] = c.checked; save(); });
    $('#st-habit-time', box).addEventListener('change', function (e) { p.notif.habitTime = e.target.value; save(); });
    $('#st-lead', box).addEventListener('change', function (e) { p.notif.leadMinutes = Math.max(0, +e.target.value || 0); save(); });
    var tb = $('#st-notif-test', box); if (tb) tb.addEventListener('click', function () { var was = p.notif.enabled; p.notif.enabled = true; notify('test', 'מסלול', 'ההתראות עובדות ✓'); p.notif.enabled = was; });
    $('#st-export', box).addEventListener('click', function () { downloadJSON(C.makeBackup(S()), 'maslul-backup-' + todayKey() + '.json'); api.toast('הקובץ ירד', 'success'); });
    $('#st-snap', box).addEventListener('click', function () { snapshot('manual', function (ok) { api.toast(ok ? 'הגיבוי נוצר' : 'הגיבוי נכשל', ok ? 'success' : 'error'); paintSnaps(); }); });
    $('#st-import', box).addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var data; try { data = JSON.parse(rd.result); } catch (x) { api.toast('הקובץ אינו JSON תקין', 'error'); return; }
        var v = C.validateBackup(data);
        if (!v.ok) { api.toast(v.error, 'error'); return; }
        api.openConfirmModal('לייבא את הגיבוי? (' + summarize(v.state) + ')\nהנתונים הנוכחיים יוחלפו, אבל קודם נשמר גיבוי שלהם.', function () { restoreState(v.state, f.name); }, { title: 'ייבוא גיבוי', confirmLabel: 'ייבא', danger: false });
      };
      rd.readAsText(f);
      e.target.value = '';
    });
    $('#st-reset', box).addEventListener('click', function () {
      var m = openModal('<h3 style="color:var(--danger)">איפוס כל הנתונים</h3><p class="page-sub">זה ימחק משימות, הרגלים, XP, מטרות וכל השאר. לפני כן נשמר גיבוי ב-IndexedDB שאפשר לשחזר ממנו כאן בהגדרות.</p><div class="field"><label>כדי לאשר, הקלד: איפוס</label><input type="text" id="rs-in" autofocus></div><div class="modal-actions"><button class="btn btn-danger btn-block" id="rs-go" disabled>' + ic('trash') + 'אפס הכל</button><button class="btn btn-ghost" id="rs-x" aria-label="ביטול">' + ic('x') + '</button></div>');
      $('#rs-in', m).addEventListener('input', function (e) { $('#rs-go', m).disabled = e.target.value.trim() !== 'איפוס'; });
      $('#rs-x', m).addEventListener('click', api.closeModal);
      $('#rs-go', m).addEventListener('click', function () { snapshot('before-reset', function () { api.replaceState(null); }); });
    });
    function paintSnaps() {
      listSnapshots(function (list) {
        var box2 = document.getElementById('st-snaps'); if (!box2) return;
        if (!list.length) { box2.innerHTML = '<p class="page-sub">' + (window.indexedDB ? 'עוד אין גיבויים. הראשון ייווצר היום.' : 'הדפדפן לא תומך ב-IndexedDB, אז יש להשתמש בייצוא ידני.') + '</p>'; return; }
        var label = { daily: 'יומי', manual: 'ידני', 'before-restore': 'לפני שחזור', 'before-reset': 'לפני איפוס', 'before-migration': 'לפני שדרוג' };
        box2.innerHTML = '<div class="fx-task-list">' + list.map(function (s) {
          return '<div class="fx-day-row"><span class="fx-day-time">' + new Date(s.at).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span><span class="fx-chip">' + (label[s.reason] || s.reason) + '</span><span style="flex:1"></span><button class="fx-mini" data-snap-dl="' + esc(s.id) + '">' + ic('download') + '</button><button class="fx-mini" data-snap-rs="' + esc(s.id) + '">שחזר</button></div>';
        }).join('') + '</div>';
        on(box2, '[data-snap-dl]', 'click', function (b) { var s = list.filter(function (x) { return x.id === b.dataset.snapDl; })[0]; downloadJSON(C.makeBackup(JSON.parse(s.data), s.at), 'maslul-' + s.id.replace(/[:]/g, '-') + '.json'); });
        on(box2, '[data-snap-rs]', 'click', function (b) {
          var s = list.filter(function (x) { return x.id === b.dataset.snapRs; })[0];
          var data = JSON.parse(s.data);
          api.openConfirmModal('לשחזר את הגיבוי מ-' + new Date(s.at).toLocaleString('he-IL') + '? (' + summarize(data) + ')', function () { restoreState(data, 'גיבוי ' + new Date(s.at).toLocaleDateString('he-IL')); }, { title: 'שחזור', confirmLabel: 'שחזר', danger: false });
        });
      });
    }
    paintSnaps();
  }

  /* ================================================================
     DASHBOARD widgets + customizer
     ================================================================ */
  var WIDGET_LABELS = { now: 'עכשיו ואחוז ההתקדמות', todo: 'משימות היום', gamer: 'רמה, XP ורצף', score: 'ציון יומי', habits: 'הרגלים', goals: 'מטרות פעילות', focus: 'זמן ריכוז', actions: 'פעולות מהירות', reminder: 'תזכורת שבועית', balance: 'איזון היום', summary: 'סיכום קצר של היום' };
  function widgetOrder() {
    var d = S().prefs.dashboard, all = C.DEFAULT_WIDGETS.concat(['summary']);
    var order = d.order.filter(function (id) { return all.indexOf(id) >= 0; });
    all.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    return order;
  }
  function dashboardWidgets() {
    var st = S(), tk = todayKey();
    var open = C.filterTasks(tasks(), { view: 'today' }, tk);
    var remaining = open.filter(function (t) { return t.status !== 'done'; });
    var doneT = tasks().filter(function (t) { return t.due === tk && t.status === 'done'; }).length;
    var next = C.sortTasks(remaining, 'due')[0];
    var goals = (st.goals || []).filter(function (g) { return api.goalProgress(g) < 100; }).slice(0, 3);
    var fm = C.focusMinutes(st, tk);
    var dc = C.dayCompletion(st, tk);
    return {
      todo: '<div class="card"><div class="fx-row-between"><h3>משימות היום</h3><button class="btn btn-ghost btn-sm" data-go="tasks">הכל</button></div>' +
        '<div class="fx-mini-stats"><span><b class="num">' + doneT + '</b> הושלמו</span><span><b class="num">' + remaining.length + '</b> נשארו</span>' + (remaining.filter(function (t) { return C.taskBucket(t, tk) === 'overdue'; }).length ? '<span style="color:var(--danger)"><b class="num">' + remaining.filter(function (t) { return C.taskBucket(t, tk) === 'overdue'; }).length + '</b> באיחור</span>' : '') + '</div>' +
        (next ? '<div class="page-sub" style="margin:6px 0;">הבאה בתור: <b>' + esc(next.title) + '</b>' + (next.time ? ' · <span dir="ltr">' + next.time + '</span>' : '') + '</div>' : '') +
        (remaining.length ? '<div class="fx-task-list">' + C.sortTasks(remaining, 'priority').slice(0, 4).map(taskRowHtml).join('') + '</div>' : emptyState('check', 'אין משימות פתוחות להיום', '', 'w-add-task', 'הוסף משימה')) + '</div>',
      goals: goals.length ? '<div class="card"><div class="fx-row-between"><h3>מטרות פעילות</h3><button class="btn btn-ghost btn-sm" data-go="goals">הכל</button></div>' + goals.map(function (g) { var p = api.goalProgress(g); return '<div class="fx-hrow"><span class="fx-hname">' + esc(g.title) + '</span>' + progressBar(p) + '<span class="num fx-hval">' + p + '%</span></div>'; }).join('') + '</div>'
        : '<div class="card"><h3>מטרות</h3>' + emptyState('flag', 'אין מטרות פעילות', 'מטרה אחת ברורה עדיפה על עשר מעורפלות.', 'w-add-goal', 'מטרה חדשה') + '</div>',
      focus: '<div class="card fx-row-between"><div><h3>זמן ריכוז היום</h3><div class="fx-kpi-v num" style="font-size:24px;">' + minsLabel(fm) + '</div><div class="page-sub">' + (st.focusLog[tk] || 0) + ' מקטעים</div></div><button class="btn btn-primary" data-go="focus">' + ic('play') + 'סשן ריכוז</button></div>',
      summary: '<div class="card"><h3>סיכום קצר</h3><p class="page-sub" style="margin:0;">' + daySummaryText(st, tk, dc, doneT, remaining.length, fm) + '</p><div class="fx-btn-row"><button class="btn btn-ghost btn-sm" data-go="review">' + ic('edit') + 'סיכום סוף יום</button><button class="btn btn-ghost btn-sm" data-go-rv="tomorrow">' + ic('calendar') + 'תכנון מחר</button></div></div>'
    };
  }
  function daySummaryText(st, tk, dc, doneT, rem, fm) {
    var h = new Date().getHours();
    var parts = [];
    if (dc.total) parts.push('השלמת ' + dc.done + ' מתוך ' + dc.total + ' (' + dc.rate + '%)');
    if (fm) parts.push(minsLabel(fm) + ' ריכוז');
    if (rem) parts.push((h >= 20 ? 'נשארו ' + rem + ' משימות. אולי להעביר חלק למחר' : 'נשארו ' + rem + ' משימות'));
    if (st.gam.streak.current) parts.push('רצף של ' + st.gam.streak.current + ' ימים 🔥');
    return parts.length ? parts.join(' · ') + '.' : 'היום רק מתחיל. תבחר דבר אחד חשוב ותתחיל ממנו.';
  }
  function applyDashboard(el) {
    var st = S(), hidden = st.prefs.dashboard.hidden, w = dashboardWidgets();
    var hero = el.querySelector('.hero');
    var host = document.createElement('div'); host.className = 'fx-dash';
    widgetOrder().forEach(function (id) {
      var node = el.querySelector('[data-w="' + id + '"]');
      if (!node && w[id]) { node = document.createElement('div'); node.setAttribute('data-w', id); node.innerHTML = w[id]; }
      if (!node) return;
      if (hidden[id]) { node.remove(); return; }
      node.classList.add('fx-widget');
      host.appendChild(node);
    });
    $$('[data-w]', el).forEach(function (n) { if (!host.contains(n)) n.remove(); });
    if (hero) hero.parentNode.insertBefore(host, hero.nextSibling); else el.appendChild(host);
    var cz = document.createElement('div');
    cz.className = 'fx-dash-foot';
    cz.innerHTML = '<button class="btn btn-ghost btn-sm" id="dash-custom">' + ic('grid') + 'התאמת מסך הבית</button>';
    el.appendChild(cz);
    $('#dash-custom', el).addEventListener('click', openDashboardCustomizer);
    on(el, '[data-go]', 'click', function (b) { api.showPanel(b.dataset.go); });
    on(el, '[data-go-rv]', 'click', function (b) { reviewUI.tab = b.dataset.goRv; api.showPanel('review'); });
    var wa = $('#w-add-task', el); if (wa) wa.addEventListener('click', function () { openTaskEditor(null, { due: todayKey() }); });
    var wg = $('#w-add-goal', el); if (wg) wg.addEventListener('click', function () { api.showPanel('goals'); });
    wireTaskRows(host.querySelector('[data-w="todo"]') || document.createElement('div'), function () { api.rerender(); });
    // avatar in hero
    if (st.prefs.avatar && hero && !hero.querySelector('.fx-avatar')) { var a = document.createElement('div'); a.className = 'fx-avatar fx-avatar-hero'; a.innerHTML = '<img src="' + st.prefs.avatar + '" alt="">'; hero.insertBefore(a, hero.firstChild); }
  }
  function openDashboardCustomizer() {
    var d = S().prefs.dashboard;
    var order = widgetOrder();
    var m = openModal('<h3>התאמת מסך הבית</h3><p class="page-sub">סמן מה יוצג וסדר עם החצים.</p><div id="dc-list"></div><div class="modal-actions"><button class="btn btn-primary btn-block" id="dc-save">' + ic('check') + 'שמור</button><button class="btn btn-ghost" id="dc-reset">ברירת מחדל</button></div>');
    var hid = Object.assign({}, d.hidden);
    function paint() {
      $('#dc-list', m).innerHTML = order.map(function (id, i) {
        return '<div class="fx-dc-row"><label><input type="checkbox" data-dc-show="' + id + '"' + (hid[id] ? '' : ' checked') + '> ' + (WIDGET_LABELS[id] || id) + '</label><span><button class="fx-mini" data-dc-up="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="למעלה">▲</button><button class="fx-mini" data-dc-down="' + i + '"' + (i === order.length - 1 ? ' disabled' : '') + ' aria-label="למטה">▼</button></span></div>';
      }).join('');
      on(m, '[data-dc-show]', 'change', function (c) { if (c.checked) delete hid[c.dataset.dcShow]; else hid[c.dataset.dcShow] = true; });
      on(m, '[data-dc-up]', 'click', function (b) { var i = +b.dataset.dcUp; var x = order[i]; order[i] = order[i - 1]; order[i - 1] = x; paint(); });
      on(m, '[data-dc-down]', 'click', function (b) { var i = +b.dataset.dcDown; var x = order[i]; order[i] = order[i + 1]; order[i + 1] = x; paint(); });
    }
    paint();
    $('#dc-save', m).addEventListener('click', function () { d.order = order; d.hidden = hid; save(); api.closeModal(); api.toast('מסך הבית עודכן', 'success'); if (api.activePanel() === 'dashboard') api.rerender(); });
    $('#dc-reset', m).addEventListener('click', function () { d.order = []; d.hidden = {}; save(); api.closeModal(); if (api.activePanel() === 'dashboard') api.rerender(); });
  }

  /* ================================================================
     utils, CSS, boot
     ================================================================ */
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function rerenderActive() { api.rerender(); }

  var MODULES = [
    { id: 'tasks', label: 'משימות', icon: 'checklist', group: 'main', render: renderTasks },
    { id: 'calendar', label: 'לוח שנה', icon: 'calendarMonth', group: 'plan', render: renderCalendar },
    { id: 'notes', label: 'מחברת', icon: 'note', group: 'plan', render: renderNotes },
    { id: 'review', label: 'סקירות', icon: 'review', group: 'plan', render: renderReview },
    { id: 'analytics', label: 'נתונים', icon: 'chart', group: 'growth', render: renderAnalytics },
    { id: 'coach', label: 'מאמן AI', icon: 'spark', group: 'growth', render: renderCoach },
    { id: 'speech', label: 'דיבור ס/ש', icon: 'mic', group: 'body', render: renderSpeech },
    { id: 'focus', label: 'פוקוס', icon: 'target', group: 'plan', render: renderFocusPro, override: true }
  ];
  var HOOKS = {
    dashboard: applyDashboard,
    habits: renderHabitsExtra,
    goals: enhanceGoals,
    schedule: enhanceSchedule,
    settings: enhanceSettings
  };
  var EXTRA_ICONS = {
    checklist: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    calendarMonth: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="8" cy="14" r=".8"/><circle cx="12" cy="14" r=".8"/><circle cx="16" cy="14" r=".8"/><circle cx="8" cy="17.5" r=".8"/>',
    review: '<path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5M8 13l2.5 2.5L16 10"/>',
    collapse: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16M10 10l-2 2 2 2"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>'
  };

  window.MaslulFeatures = {
    modules: MODULES,
    hooks: HOOKS,
    icons: EXTRA_ICONS,
    boot: function (bridge) {
      api = bridge;
      document.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName) || '';
        var typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'ך')) { e.preventDefault(); openSearch(); return; }
        if (e.key === 'Escape' && document.querySelector('#modal-root .modal')) { api.closeModal(); return; }
        if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'n' || e.key === 'N' || e.key === 'מ') { e.preventDefault(); openQuickAdd(); }
        if (e.key === '/') { e.preventDefault(); openSearch(); }
      });
      var fab = document.createElement('button');
      fab.className = 'fx-fab'; fab.id = 'fx-fab'; fab.setAttribute('aria-label', 'הוספה מהירה');
      fab.innerHTML = ic('plus');
      fab.addEventListener('click', openQuickAdd);
      document.body.appendChild(fab);
      // daily auto-backup (also right after a migration bumped the schema)
      setTimeout(function () { snapshot(api.migratedFrom() ? 'before-migration' : 'daily'); }, 1500);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      lastAch = Object.keys(S().gam.achievements || {}).length + S().gam.levelUps.length;
      setInterval(notifTick, 30000); setTimeout(notifTick, 3000);
      setInterval(function () { if (new Date().getHours() === 0) snapshot('daily'); }, 60 * 60 * 1000);
    },
    openQuickAdd: function () { openQuickAdd(); },
    openSearch: function () { openSearch(); }
  };
})();
