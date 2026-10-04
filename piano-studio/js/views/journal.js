/* Piano Studio — private musical journal with calendar browsing. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;

  var state = { month: new Date(), day: '', q: '', tag: '', fav: false };

  function openForm(rec, preset) {
    ui.editForm({ coll: 'journal', record: rec || Object.assign({ date: state.day || U.todayKey() }, preset || {}), icon: 'pen', draft: true, onSaved: function (r, created) { if (created) PS.navigate('#/journal/' + r.id); } });
  }

  Object.assign(PS.act, {
    'add-journal': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'journal-edit': function (el) { openForm(PS.store.get('journal', el.dataset.id)); },
    'journal-fav': function (el) { var j = PS.store.get('journal', el.dataset.id); PS.store.update('journal', j.id, { favorite: !j.favorite }); },
    'journal-del': function (el) { ui.confirmDelete('journal', el.dataset.id, function () { PS.navigate('#/journal'); }); },
    'journal-month': function (el) { state.month = U.addMonths(state.month, +el.dataset.d); PS.refresh(); },
    'journal-day': function (el) { state.day = state.day === el.dataset.date ? '' : el.dataset.date; if (location.hash !== '#/journal') PS.navigate('#/journal'); else PS.refresh(); },
    'journal-q': U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150),
    'journal-tag': function (el) { state.tag = el.value; PS.refresh(); },
    'journal-favs': function () { state.fav = !state.fav; PS.refresh(); },
    'journal-clear': function () { state.day = ''; PS.refresh(); }
  });

  function miniMonth(entries) {
    var has = {};
    entries.forEach(function (e) { has[e.date] = true; });
    var first = U.startOfMonth(state.month), gs = U.startOfWeek(first), today = U.todayKey();
    var html = '<div class="row" style="justify-content:space-between;margin-bottom:8px"><button type="button" class="icon-btn sm" data-act="journal-month" data-d="-1" aria-label="חודש קודם">' + I('chevronRight') + '</button><b>' + esc(U.fmtMonthYear(first)) + '</b><button type="button" class="icon-btn sm" data-act="journal-month" data-d="1" aria-label="חודש הבא">' + I('chevronLeft') + '</button></div><div class="mini-month">';
    for (var i = 0; i < 7; i++) html += '<span class="dow">' + esc(U.fmtWeekdayShort(U.addDays(gs, i))) + '</span>';
    for (i = 0; i < 42; i++) {
      var d = U.addDays(gs, i), k = U.dkey(d);
      if (i >= 35 && d.getMonth() !== first.getMonth()) break;
      html += '<button type="button" class="' + [d.getMonth() !== first.getMonth() ? 'other' : '', k === today ? 'today' : '', k === state.day ? 'sel' : '', has[k] ? 'has' : ''].join(' ') + '" data-act="journal-day" data-date="' + k + '" aria-label="' + esc(U.fmtFull(d)) + (has[k] ? ' — יש רשומה' : '') + '" aria-pressed="' + (k === state.day) + '">' + d.getDate() + '</button>';
    }
    return html + '</div>';
  }

  function render(el, route) {
    if (route.params[0]) return renderDetail(el, route.params[0]);
    var all = PS.store.list('journal');
    var tags = PS.store.distinct('journal', 'tags');
    var list = all.filter(function (j) {
      if (state.day && j.date !== state.day) return false;
      if (state.tag && (j.tags || []).indexOf(state.tag) < 0) return false;
      if (state.fav && !j.favorite) return false;
      return PS.search.matches(j, state.q, ['title', 'body', 'tags']);
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)); });
    var html = '<div class="page"><div class="page-head"><div><h1>יומן אישי</h1><p class="sub">מה למדתי, מה לזכור, שאלות למורה ורגעים מוזיקליים — פרטי ונשמר רק בדפדפן שלך</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-journal">' + I('plus') + 'רשומה ' + (state.day && state.day !== U.todayKey() ? 'ל-' + esc(U.fmtDayMonth(state.day)) : 'להיום') + '</button></div></div>';
    html += '<div class="journal-layout"><div class="stack"><div class="card pad">' + miniMonth(all) + '</div>' +
      '<div class="card pad"><div class="stack" style="gap:10px"><div class="searchbox" style="max-width:none">' + I('search') + '<input class="input" type="search" placeholder="חיפוש ביומן…" value="' + esc(state.q) + '" data-input="journal-q" data-keep="journal-q" aria-label="חיפוש ביומן"></div>' +
      (tags.length ? '<select class="input" data-change="journal-tag" aria-label="תגית"><option value="">כל התגיות</option>' + tags.map(function (t) { return '<option' + (state.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="journal-favs" aria-pressed="' + state.fav + '">' + I('star') + (state.fav ? 'כל הרשומות' : 'רק מועדפים') + '</button>' +
      '<p class="small faint">' + all.length + ' רשומות ביומן</p></div></div></div><div>';
    if (state.day) html += '<div class="banner banner-gold">' + I('calendar') + '<span>רשומות מ-' + esc(U.fmtFull(state.day)) + '</span><button type="button" class="btn btn-ghost btn-sm" data-act="journal-clear">הצגת הכל</button></div>';
    if (!list.length) {
      html += '<div class="card">' + ui.empty(all.length ? { icon: 'pen', title: state.day ? 'אין רשומה ביום הזה' : 'לא נמצאו רשומות', text: state.day ? 'רוצים לכתוב משהו על היום הזה?' : 'נסו חיפוש אחר.', action: state.day ? { act: 'add-journal', label: 'כתיבת רשומה' } : null } : { icon: 'pen', title: 'היומן מחכה למילים הראשונות', text: 'כתבו מה למדתם היום, תגלית קטנה, או שאלה שתרצו לשאול את המורה.', action: { act: 'add-journal', label: 'רשומה ראשונה' } }) + '</div>';
    } else {
      html += '<div class="stack stagger">' + list.map(function (j) {
        return '<article class="card journal-entry lift" data-href="#/journal/' + j.id + '" tabindex="0" role="link"><div class="row" style="justify-content:space-between"><div class="entry-date">' + esc(U.fmtFull(j.date)) + '</div>' +
          '<button type="button" class="icon-btn sm' + (j.favorite ? ' on' : '') + '" data-act="journal-fav" data-id="' + j.id + '" aria-pressed="' + !!j.favorite + '" aria-label="מועדף">' + I('star') + '</button></div>' +
          (j.title ? '<h3>' + U.bidi(j.title) + '</h3>' : '') + '<p class="excerpt">' + U.bidi(ui.mdPlain(j.body).slice(0, 320) || '—') + '</p>' + ui.tags(j.tags) + '</article>';
      }).join('') + '</div>';
    }
    el.innerHTML = html + '</div></div></div>';
  }

  function renderDetail(el, id) {
    var j = PS.store.get('journal', id);
    if (!j) return PS.views.notfound.render(el);
    el.innerHTML = '<div class="page"><a class="back-link" href="#/journal">' + I('chevronRight') + 'היומן</a>' +
      '<div class="page-head"><div><div class="entry-date">' + esc(U.fmtFull(j.date)) + '</div><h1>' + U.bidi(j.title || 'רשומת יומן') + '</h1></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="journal-edit" data-id="' + j.id + '">' + I('edit') + 'עריכה</button>' +
      '<button type="button" class="icon-btn' + (j.favorite ? ' on' : '') + '" data-act="journal-fav" data-id="' + j.id + '" aria-pressed="' + !!j.favorite + '" aria-label="מועדף">' + I('star') + '</button>' +
      '<button type="button" class="icon-btn" data-act="journal-del" data-id="' + j.id + '" aria-label="מחיקה">' + I('trash') + '</button></div></div>' +
      '<div class="card pad-l" style="max-width:820px"><div class="prose" data-md-host="journal" data-id="' + j.id + '">' + (j.body ? ui.md(j.body, { interactive: true }) : '<p class="faint">הרשומה ריקה.</p>') + '</div>' +
      (j.tags && j.tags.length ? '<hr>' + ui.tags(j.tags) : '') + '<p class="small faint" style="margin-top:14px">עודכן ' + esc(U.timeAgo(j.updatedAt)) + '</p></div></div>';
  }

  PS.views.journal = { title: function () { return 'יומן אישי'; }, render: render };
})();
