/* Piano Studio — course manager: any platform, modules, time log, milestones, wishlist & archive. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { tab: 'active', q: '' };
  var TABS = [
    { id: 'active', label: 'פעילים', test: function (c) { return c.status === 'in_progress' || c.status === 'planned' || c.status === 'paused'; } },
    { id: 'wishlist', label: 'רשימת משאלות', test: function (c) { return c.status === 'wishlist'; } },
    { id: 'completed', label: 'ארכיון הושלמו', test: function (c) { return c.status === 'completed'; } },
    { id: 'all', label: 'הכל', test: function () { return true; } }
  ];

  function openForm(rec, preset) {
    ui.editForm({ coll: 'courses', record: rec || preset || null, icon: 'book', onSaved: function (r, created) { if (created) PS.navigate('#/courses/' + r.id); } });
  }
  function getC(id) { return PS.store.get('courses', id); }
  function setModules(c, mods) { PS.store.update('courses', c.id, { modules: mods }); }

  Object.assign(PS.act, {
    'add-course': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'course-edit': function (el) { openForm(getC(el.dataset.id)); },
    'course-del': function (el) { ui.confirmDelete('courses', el.dataset.id, function () { PS.navigate('#/courses'); }); },
    'courses-tab': function (el) { state.tab = el.dataset.v; PS.refresh(); },
    'courses-q': U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150),
    'course-status': function (el) { PS.store.update('courses', el.dataset.id, { status: el.value }); ui.toast('סטטוס הקורס עודכן', 'success'); },
    'module-toggle': function (el) {
      var c = getC(el.dataset.id);
      setModules(c, c.modules.map(function (m) { return m.id === el.dataset.m ? Object.assign({}, m, { done: !m.done }) : m; }));
    },
    'module-add': function (el) {
      var c = getC(el.dataset.id);
      ui.prompt({ title: 'מודול חדש', label: 'שם המודול', value: 'מודול ' + (c.modules.length + 1), icon: 'layers' }).then(function (t) {
        if (t) setModules(c, c.modules.concat([{ id: U.uid('mod'), title: t.slice(0, 160), done: false, notes: '', url: '' }]));
      });
    },
    'module-edit': function (el) {
      var c = getC(el.dataset.id);
      var m = c.modules.filter(function (x) { return x.id === el.dataset.m; })[0];
      var md = ui.modal({
        title: 'עריכת מודול', icon: 'layers', size: 'md',
        body: '<form class="form"><div class="field"><label for="me-t"><span class="field-label">שם המודול</span></label><input id="me-t" class="input" maxlength="160" value="' + esc(m.title) + '" required></div>' +
          '<div class="field"><label for="me-u"><span class="field-label">קישור לשיעור החיצוני</span></label><input id="me-u" class="input" type="url" dir="ltr" value="' + esc(m.url || '') + '" placeholder="https://"><small class="field-error"></small></div>' +
          '<div class="field half"><label for="me-min"><span class="field-label">משך (דקות, אופציונלי)</span></label><input id="me-min" class="input" type="number" min="0" max="1440" value="' + esc(m.minutes || '') + '"></div>' +
          '<div class="field"><label for="me-n"><span class="field-label">הערות למודול</span></label><textarea id="me-n" class="input" rows="4" maxlength="4000">' + esc(m.notes || '') + '</textarea></div></form>',
        footer: '<button type="button" class="btn btn-danger" data-del style="margin-inline-end:auto">' + I('trash') + 'מחיקה</button><button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-primary" data-ok>' + I('check') + 'שמירה</button>'
      });
      md.el.querySelector('[data-ok]').onclick = function () {
        var t = md.el.querySelector('#me-t').value.trim();
        var u = md.el.querySelector('#me-u').value.trim();
        if (!t) { md.el.querySelector('#me-t').focus(); return; }
        if (u && !U.safeUrl(u)) { md.el.querySelector('.field-error').textContent = 'כתובת לא תקינה'; return; }
        setModules(c, c.modules.map(function (x) { return x.id === m.id ? Object.assign({}, x, { title: t, url: U.safeUrl(u), notes: md.el.querySelector('#me-n').value, minutes: +md.el.querySelector('#me-min').value || null }) : x; }));
        md.close();
        ui.toast('המודול עודכן', 'success');
      };
      md.el.querySelector('[data-del]').onclick = function () {
        ui.confirm({ title: 'מחיקת מודול', text: 'למחוק את "' + m.title + '"? XP שכבר הוענק יישמר בהיסטוריה.', confirmLabel: 'מחיקה', danger: true }).then(function (ok) {
          if (ok) { setModules(c, c.modules.filter(function (x) { return x.id !== m.id; })); md.close(); }
        });
      };
    },
    'module-move': function (el) {
      var c = getC(el.dataset.id);
      var mods = c.modules.slice();
      var i = mods.map(function (m) { return m.id; }).indexOf(el.dataset.m), j = i + (+el.dataset.dir);
      if (j < 0 || j >= mods.length) return;
      mods.splice(j, 0, mods.splice(i, 1)[0]);
      setModules(c, mods);
    },
    'course-time': function (el) {
      var c = getC(el.dataset.id);
      var md = ui.modal({
        title: 'רישום זמן', icon: 'clock', size: 'sm',
        body: '<form class="form"><div class="field half"><label for="ct-m"><span class="field-label">דקות</span></label><input id="ct-m" class="input" type="number" min="1" max="1440" value="30" required></div>' +
          '<div class="field half"><label for="ct-d"><span class="field-label">תאריך</span></label><input id="ct-d" class="input" type="date" value="' + U.todayKey() + '"></div>' +
          '<div class="field"><label for="ct-n"><span class="field-label">הערה</span></label><input id="ct-n" class="input" maxlength="200"></div></form><p class="small faint">זמן שאתם רושמים ידנית — האפליקציה לא מודדת זמן בעצמה.</p>',
        footer: '<button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-primary" data-ok>' + I('check') + 'רישום</button>'
      });
      md.el.querySelector('[data-ok]').onclick = function () {
        var mins = parseInt(md.el.querySelector('#ct-m').value, 10);
        if (!(mins > 0 && mins <= 1440)) { md.el.querySelector('#ct-m').focus(); return; }
        PS.store.update('courses', c.id, { timeLog: (c.timeLog || []).concat([{ id: U.uid('tl'), minutes: mins, date: md.el.querySelector('#ct-d').value || U.todayKey(), note: md.el.querySelector('#ct-n').value.slice(0, 200) }]) });
        md.close();
        ui.toast('נרשמו ' + U.fmtMinutes(mins), 'success');
      };
    },
    'course-time-del': function (el) {
      var c = getC(el.dataset.id);
      PS.store.update('courses', c.id, { timeLog: (c.timeLog || []).filter(function (t) { return t.id !== el.dataset.t; }) });
    }
  });

  function minutesOf(c) { return (c.timeLog || []).reduce(function (s, t) { return s + (+t.minutes || 0); }, 0); }

  function card(c) {
    var p = PS.domain.courseProgress(c);
    var done = (c.modules || []).filter(function (m) { return m.done; }).length;
    return '<article class="card course-card lift" data-href="#/courses/' + c.id + '" tabindex="0" role="link" aria-label="' + esc(c.title) + '">' + ui.cover(c) +
      '<div class="body"><div class="row" style="justify-content:space-between">' + ui.status('courses', c.status) + (c.targetDate && c.status !== 'completed' ? '<span class="small muted">' + I('flag') + ' ' + esc(U.fmtDate(c.targetDate)) + '</span>' : '') + '</div>' +
      '<h3>' + U.bidi(c.title) + '</h3><span class="small muted">' + U.bidi(c.instructor || 'ללא פלטפורמה') + '</span>' +
      '<div style="margin-top:auto"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="small muted">' + done + '/' + (c.modules || []).length + ' מודולים</span><span class="small num gold">' + Math.round(p * 100) + '%</span></div>' + ui.bar(p, 'pbar-xs') + '</div></div></article>';
  }

  function render(el, route) {
    if (route.params[0]) return renderDetail(el, route.params[0]);
    var all = PS.store.list('courses');
    var tab = TABS.filter(function (t) { return t.id === state.tab; })[0] || TABS[0];
    var list = all.filter(tab.test).filter(function (c) { return PS.search.matches(c, state.q, ['title', 'instructor', 'description', 'takeaways']); })
      .sort(function (a, b) { var o = { in_progress: 0, planned: 1, paused: 2, wishlist: 3, completed: 4 }; return o[a.status] - o[b.status] || String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    var html = '<div class="page"><div class="page-head"><div><h1>קורסים</h1><p class="sub">קורסים מכל פלטפורמה — מודולים, התקדמות, תובנות ותעודות</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-course">' + I('plus') + 'קורס חדש</button></div></div>';
    html += '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (t.id === state.tab) + '" class="' + (t.id === state.tab ? 'on' : '') + '" data-act="courses-tab" data-v="' + t.id + '">' + esc(t.label) + ' <span class="count">' + all.filter(t.test).length + '</span></button>'; }).join('') + '</div>';
    html += '<div class="toolbar"><div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש קורס…" value="' + esc(state.q) + '" data-input="courses-q" data-keep="courses-q" aria-label="חיפוש קורסים"></div></div>';
    if (!list.length) {
      html += '<div class="card">' + (all.length ? ui.empty({ icon: 'book', title: state.tab === 'completed' ? 'עוד לא הושלם קורס' : 'אין קורסים בלשונית הזו', text: state.tab === 'wishlist' ? 'קורסים שתרצו לעשות בעתיד — הוסיפו עם סטטוס "רשימת משאלות".' : 'נסו לשונית או חיפוש אחר.' }) : ui.empty({ icon: 'book', title: 'אין עדיין קורסים', text: 'הוסיפו קורס מכל פלטפורמה — אין צורך בחיבור מיוחד.', action: { act: 'add-course', label: 'הוספת קורס' } })) + '</div>';
    } else html += '<div class="grid grid-auto stagger">' + list.map(card).join('') + '</div>';
    el.innerHTML = html + '</div>';
  }

  function renderDetail(el, id) {
    var c = getC(id);
    if (!c) return PS.views.notfound.render(el);
    var p = PS.domain.courseProgress(c);
    var mods = c.modules || [];
    var done = mods.filter(function (m) { return m.done; }).length;
    var mins = minutesOf(c) + mods.reduce(function (s, m) { return s + (m.done ? +m.minutes || 0 : 0); }, 0);
    var songs = (c.songIds || []).map(function (s) { return PS.store.get('songs', s); }).filter(Boolean);
    var lessons = (c.lessonIds || []).map(function (s) { return PS.store.get('lessons', s); }).filter(Boolean);
    var tasks = PS.store.list('tasks').filter(function (t) { return t.courseId === c.id; });
    function sec(t, icon, body, extra) { return '<div class="card pad"><div class="card-head"><h3>' + I(icon) + esc(t) + '</h3>' + (extra || '') + '</div>' + body + '</div>'; }
    var html = '<div class="page"><a class="back-link" href="#/courses">' + I('chevronRight') + 'כל הקורסים</a>' +
      '<div class="detail-hero">' + ui.cover(c, 'cover-xl') + '<div class="info"><div class="row">' + ui.status('courses', c.status) + '</div><h1>' + U.bidi(c.title) + '</h1><p class="muted">' + U.bidi(c.instructor || '') + '</p>' +
      '<div class="row">' + (c.url ? ui.linkBtn(c.url, 'פתיחת הקורס', 'external') : '') + '<button type="button" class="btn btn-ghost" data-act="course-edit" data-id="' + c.id + '">' + I('edit') + 'עריכה</button>' +
      '<label class="sr-only" for="cs-' + c.id + '">סטטוס</label><select id="cs-' + c.id + '" class="input input-sm" style="width:auto" data-change="course-status" data-id="' + c.id + '">' + Object.keys(L.courseStatus).map(function (k) { return '<option value="' + k + '"' + (c.status === k ? ' selected' : '') + '>' + L.courseStatus[k] + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="icon-btn" data-act="course-del" data-id="' + c.id + '" aria-label="מחיקת הקורס">' + I('trash') + '</button></div></div></div>';
    html += '<div class="grid grid-4 stagger" style="margin-bottom:18px">' +
      '<div class="card stat"><div class="stat-label">' + I('chart') + 'השלמה</div><div class="stat-value">' + Math.round(p * 100) + '%</div>' + ui.bar(p, 'pbar-xs') + '</div>' +
      '<div class="card stat"><div class="stat-label">' + I('layers') + 'מודולים</div><div class="stat-value">' + done + '<span class="muted" style="font-size:16px"> / ' + mods.length + '</span></div><div class="stat-sub">' + (mods.length - done) + ' נותרו</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('clock') + 'זמן שהושקע</div><div class="stat-value" style="font-size:22px">' + (mins ? U.fmtMinutes(mins) : '—') + '</div><div class="stat-sub">' + (c.estimatedHours ? 'מתוך כ-' + c.estimatedHours + ' שעות משוערות' : 'נרשם ידנית') + '</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('flag') + 'יעד לסיום</div><div class="stat-value" style="font-size:20px">' + (c.targetDate ? esc(U.fmtDate(c.targetDate)) : '—') + '</div><div class="stat-sub">' + (c.startDate ? 'התחלה: ' + esc(U.fmtDate(c.startDate)) : '') + '</div></div></div>';
    html += '<div class="detail-grid"><div class="stack">' +
      sec('מודולים', 'layers', (mods.length ? '<div>' + mods.map(function (m, i) {
        return '<div class="module' + (m.done ? ' done' : '') + '"><span class="m-num num">' + (i + 1) + '</span><input type="checkbox" class="check round" data-act="module-toggle" data-id="' + c.id + '" data-m="' + m.id + '"' + (m.done ? ' checked' : '') + ' aria-label="השלמת ' + esc(m.title) + '">' +
          '<div class="grow"><div class="m-title">' + U.bidi(m.title) + '</div>' + (m.notes ? '<div class="m-notes">' + U.bidi(m.notes) + '</div>' : '') + '<div class="meta" style="margin-top:4px">' + (m.done && m.doneAt ? '<span>' + I('check') + 'הושלם ' + esc(U.fmtDate(m.doneAt)) + '</span>' : '') + (m.minutes ? '<span>' + I('clock') + esc(U.fmtMinutes(m.minutes)) + '</span>' : '') + (m.url ? ui.linkBtn(m.url, 'לשיעור', 'external') : '') + '</div></div>' +
          '<button type="button" class="icon-btn sm" data-act="module-move" data-id="' + c.id + '" data-m="' + m.id + '" data-dir="-1" aria-label="הזזה למעלה"' + (i === 0 ? ' disabled' : '') + '>' + I('arrowUp') + '</button>' +
          '<button type="button" class="icon-btn sm" data-act="module-edit" data-id="' + c.id + '" data-m="' + m.id + '" aria-label="עריכת מודול">' + I('edit') + '</button></div>';
      }).join('') + '</div>' : '<p class="faint small">אין מודולים עדיין.</p>'),
        '<button type="button" class="btn btn-ghost btn-sm" data-act="module-add" data-id="' + c.id + '">' + I('plus') + 'מודול</button>') +
      sec('תיאור', 'info', c.description ? '<div class="textblock">' + U.bidi(c.description) + '</div>' : '<p class="faint small">אין תיאור</p>') +
      sec('תובנות מרכזיות', 'sparkle', c.takeaways ? '<div class="textblock">' + U.bidi(c.takeaways) + '</div>' : '<p class="faint small">רשמו כאן את מה שהכי חשוב לזכור מהקורס</p>') +
      sec('הערות אישיות', 'pen', c.personalNotes ? '<div class="textblock">' + U.bidi(c.personalNotes) + '</div>' : '<p class="faint small">אין הערות</p>') +
    '</div><div class="stack">' +
      sec('אבני דרך', 'flag', '<div class="milestone-dots">' + [25, 50, 75, 100].map(function (m) { return '<span class="' + ((c.milestones || {})[m] ? 'on' : '') + '" title="' + ((c.milestones || {})[m] ? 'הושג ' + U.fmtDate(c.milestones[m]) : 'טרם הושג') + '">' + m + '%</span>'; }).join('') + '</div>' +
        '<ul class="history" style="margin-top:16px">' + [25, 50, 75, 100].filter(function (m) { return (c.milestones || {})[m]; }).map(function (m) { return '<li><b>' + m + '% מהקורס</b><small>' + esc(U.fmtDate(c.milestones[m])) + '</small></li>'; }).join('') + (c.completedAt ? '<li><b>הקורס הושלם</b><small>' + esc(U.fmtDate(c.completedAt)) + '</small></li>' : '') + '</ul>') +
      sec('תעודת סיום', 'graduation', c.certificateUrl ? ui.linkBtn(c.certificateUrl, 'צפייה בתעודה', 'graduation') : '<p class="faint small">אפשר להוסיף קישור לתעודה בעריכת הקורס' + (c.status === 'completed' ? '' : ' לאחר הסיום') + '.</p>') +
      sec('זמן שהושקע', 'clock', ((c.timeLog || []).length ? '<ul class="history">' + c.timeLog.slice().reverse().slice(0, 8).map(function (t) { return '<li><b>' + esc(U.fmtMinutes(t.minutes)) + '</b>' + (t.note ? ' · ' + U.bidi(t.note) : '') + '<small>' + esc(U.fmtDate(t.date)) + ' <button type="button" class="btn btn-ghost btn-sm" data-act="course-time-del" data-id="' + c.id + '" data-t="' + t.id + '" aria-label="מחיקת רישום">' + I('x') + '</button></small></li>'; }).join('') + '</ul>' : '<p class="faint small">לא נרשם זמן</p>'),
        '<button type="button" class="btn btn-ghost btn-sm" data-act="course-time" data-id="' + c.id + '">' + I('plus') + 'רישום</button>') +
      sec('קשור לקורס', 'link', '<dl class="kv"><dt>שירים</dt><dd>' + (songs.length ? songs.map(function (s) { return '<a href="#/songs/' + s.id + '">' + U.bidi(s.title) + '</a>'; }).join('<br>') : '—') + '</dd>' +
        '<dt>שיעורים</dt><dd>' + (lessons.length ? lessons.map(function (l) { return '<a href="#/lessons/' + l.id + '">' + U.bidi(l.title) + ' · ' + esc(U.fmtDayMonthShort(l.date)) + '</a>'; }).join('<br>') : '—') + '</dd>' +
        '<dt>משימות</dt><dd>' + (tasks.length ? tasks.map(function (t) { return '<a href="#/tasks?open=' + t.id + '">' + U.bidi(t.title) + '</a>'; }).join('<br>') : '—') + '</dd></dl>' +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="course-add-task" data-id="' + c.id + '">' + I('plus') + 'משימה לקורס</button>') +
    '</div></div></div>';
    el.innerHTML = html;
  }
  PS.act['course-add-task'] = function (el) { PS.act['add-task'](null, { courseId: el.dataset.id, category: 'course' }); };

  PS.views.courses = { title: function (r) { var c = r.params[0] && getC(r.params[0]); return c ? c.title : 'קורסים'; }, render: render };
})();
