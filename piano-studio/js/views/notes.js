/* Piano Studio — lesson notebook: structured notes, tags, links to lessons & songs, pins, history. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { q: '', type: '', tag: '', fav: false };

  function openForm(rec, preset) {
    ui.editForm({
      coll: 'notes', record: rec || Object.assign({}, preset || {}), icon: 'note', draft: true,
      onSaved: function (r, created) { if (created) PS.navigate('#/notes/' + r.id); }
    });
  }
  PS.act['add-note'] = function (el, preset) { openForm(null, preset && !preset.target ? preset : null); };
  PS.act['note-edit'] = function (el) { openForm(PS.store.get('notes', el.dataset.id)); };
  PS.act['note-pin'] = function (el) { var n = PS.store.get('notes', el.dataset.id); PS.store.update('notes', n.id, { pinned: !n.pinned }); };
  PS.act['note-fav'] = function (el) { var n = PS.store.get('notes', el.dataset.id); PS.store.update('notes', n.id, { favorite: !n.favorite }); };
  PS.act['note-del'] = function (el) { ui.confirmDelete('notes', el.dataset.id, function () { PS.navigate('#/notes'); }); };
  PS.act['notes-q'] = U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150);
  PS.act['notes-type'] = function (el) { state.type = el.dataset.v; PS.refresh(); };
  PS.act['notes-tag'] = function (el) { state.tag = el.value; PS.refresh(); };
  PS.act['notes-fav'] = function () { state.fav = !state.fav; PS.refresh(); };
  PS.act['note-restore'] = function (el) {
    var n = PS.store.get('notes', el.dataset.id);
    var v = (n.history || [])[+el.dataset.i];
    if (!v) return;
    ui.confirm({ title: 'שחזור גרסה', text: 'לשחזר את הגרסה מ-' + U.fmtDateTime(v.at) + '? הגרסה הנוכחית תישמר בהיסטוריה.', confirmLabel: 'שחזור' }).then(function (ok) {
      if (ok) { PS.store.update('notes', n.id, { title: v.title, body: v.body }); ui.toast('הגרסה שוחזרה', 'success'); }
    });
  };
  // toggle checklist items directly in the rendered note
  document.addEventListener('change', function (e) {
    var cb = e.target.closest('[data-md-line]');
    if (!cb) return;
    var host = cb.closest('[data-md-host]');
    if (!host) return;
    var coll = host.dataset.mdHost, id = host.dataset.id;
    var rec = PS.store.get(coll, id);
    if (!rec) return;
    PS.store.update(coll, id, { body: ui.mdToggle(rec.body, +cb.dataset.mdLine) });
  });

  function card(n) {
    var lesson = n.lessonId && PS.store.get('lessons', n.lessonId);
    return '<article class="card note-card lift note-type-' + esc(n.type) + '" data-href="#/notes/' + n.id + '" tabindex="0" role="link" aria-label="' + esc(n.title) + '">' +
      '<div class="row" style="justify-content:space-between"><span class="chip chip-muted">' + esc(L.noteType[n.type] || '') + '</span><span class="row" style="gap:2px">' +
        '<button type="button" class="icon-btn sm' + (n.pinned ? ' on' : '') + '" data-act="note-pin" data-id="' + n.id + '" aria-pressed="' + !!n.pinned + '" aria-label="' + (n.pinned ? 'ביטול נעיצה' : 'נעיצה') + '">' + I('pin') + '</button>' +
        '<button type="button" class="icon-btn sm' + (n.favorite ? ' on' : '') + '" data-act="note-fav" data-id="' + n.id + '" aria-pressed="' + !!n.favorite + '" aria-label="' + (n.favorite ? 'הסרה ממועדפים' : 'הוספה למועדפים') + '">' + I('star') + '</button></span></div>' +
      '<h3>' + U.bidi(n.title) + '</h3>' +
      '<p class="excerpt">' + U.bidi(ui.mdPlain(n.body).slice(0, 220)) + '</p>' +
      ui.tags(n.tags) +
      '<div class="foot"><span>' + (lesson ? I('clock') + ' ' + U.bidi(lesson.title) + ' · ' + esc(U.fmtDayMonthShort(lesson.date)) : '') + '</span><span>' + esc(U.timeAgo(n.updatedAt)) + '</span></div></article>';
  }

  function render(el, route) {
    if (route.params[0]) return renderDetail(el, route.params[0]);
    var all = PS.store.list('notes');
    var tags = PS.store.distinct('notes', 'tags');
    var list = all.filter(function (n) {
      if (state.type && n.type !== state.type) return false;
      if (state.tag && (n.tags || []).indexOf(state.tag) < 0) return false;
      if (state.fav && !n.favorite) return false;
      return PS.search.matches(n, state.q, ['title', 'body', 'tags']);
    }).sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    var counts = {};
    all.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
    var html = '<div class="page"><div class="page-head"><div><h1>מחברת שיעורים</h1><p class="sub">הערות מהמורה, מושגים, טעויות לזכור, שאלות לשיעור הבא ותובנות</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-note">' + I('plus') + 'פתק חדש</button></div></div>';
    html += '<div class="tabs" role="tablist"><button type="button" role="tab" class="' + (!state.type ? 'on' : '') + '" data-act="notes-type" data-v="">הכל <span class="count">' + all.length + '</span></button>' +
      Object.keys(L.noteType).map(function (k) { return '<button type="button" role="tab" class="' + (state.type === k ? 'on' : '') + '" data-act="notes-type" data-v="' + k + '">' + esc(L.noteType[k]) + (counts[k] ? ' <span class="count">' + counts[k] + '</span>' : '') + '</button>'; }).join('') + '</div>';
    html += '<div class="toolbar"><div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש בכל הפתקים…" value="' + esc(state.q) + '" data-input="notes-q" data-keep="notes-q" aria-label="חיפוש בפתקים"></div>' +
      (tags.length ? '<select class="input" data-change="notes-tag" aria-label="סינון לפי תגית"><option value="">כל התגיות</option>' + tags.map(function (t) { return '<option' + (state.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" class="btn btn-ghost' + (state.fav ? ' on' : '') + '" data-act="notes-fav" aria-pressed="' + state.fav + '">' + I('star') + 'מועדפים</button></div>';
    if (!list.length) {
      html += '<div class="card">' + (all.length ? ui.empty({ icon: 'search', title: 'לא נמצאו פתקים', text: 'נסו חיפוש או סינון אחר.' }) : ui.empty({ icon: 'note', title: 'המחברת עדיין ריקה', text: 'רשמו כאן את מה שהמורה הסבירה, טעויות שכדאי לזכור ושאלות לשיעור הבא.', action: { act: 'add-note', label: 'פתק ראשון' } })) + '</div>';
    } else {
      html += '<div class="grid grid-auto stagger">' + list.map(card).join('') + '</div>';
    }
    el.innerHTML = html + '</div>';
  }

  function renderDetail(el, id) {
    var n = PS.store.get('notes', id);
    if (!n) return PS.views.notfound.render(el);
    var lesson = n.lessonId && PS.store.get('lessons', n.lessonId);
    var songs = (n.songIds || []).map(function (s) { return PS.store.get('songs', s); }).filter(Boolean);
    var html = '<div class="page"><a class="back-link" href="#/notes">' + I('chevronRight') + 'מחברת השיעורים</a>' +
      '<div class="page-head"><div><div class="row" style="margin-bottom:8px"><span class="chip chip-gold">' + esc(L.noteType[n.type]) + '</span>' + (n.pinned ? '<span class="chip chip-muted">' + I('pin') + 'נעוץ</span>' : '') + '</div><h1>' + U.bidi(n.title) + '</h1>' +
      '<div class="meta" style="margin-top:8px"><span>' + I('clock') + 'עודכן ' + esc(U.timeAgo(n.updatedAt)) + '</span><span>נוצר ' + esc(U.fmtDate(n.createdAt)) + '</span></div></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="note-edit" data-id="' + n.id + '">' + I('edit') + 'עריכה</button>' +
      '<button type="button" class="icon-btn' + (n.pinned ? ' on' : '') + '" data-act="note-pin" data-id="' + n.id + '" aria-pressed="' + !!n.pinned + '" aria-label="נעיצה">' + I('pin') + '</button>' +
      '<button type="button" class="icon-btn' + (n.favorite ? ' on' : '') + '" data-act="note-fav" data-id="' + n.id + '" aria-pressed="' + !!n.favorite + '" aria-label="מועדף">' + I('star') + '</button>' +
      '<button type="button" class="icon-btn" data-act="note-del" data-id="' + n.id + '" aria-label="מחיקה">' + I('trash') + '</button></div></div>';
    html += '<div class="detail-grid"><div class="card pad-l"><div class="prose" data-md-host="notes" data-id="' + n.id + '">' + (n.body ? ui.md(n.body, { interactive: true }) : '<p class="faint">הפתק ריק. לחצו על עריכה כדי לכתוב.</p>') + '</div></div><div class="stack">' +
      '<div class="card pad"><div class="card-head"><h3>' + I('link') + 'קישורים</h3></div><dl class="kv"><dt>שיעור</dt><dd>' + (lesson ? '<a href="#/lessons/' + lesson.id + '">' + U.bidi(lesson.title) + ' · ' + esc(U.fmtDate(lesson.date)) + '</a>' : '<span class="faint">—</span>') + '</dd>' +
      '<dt>שירים</dt><dd>' + (songs.length ? songs.map(function (s) { return '<a href="#/songs/' + s.id + '">' + U.bidi(s.title) + '</a>'; }).join('<br>') : '<span class="faint">—</span>') + '</dd>' +
      '<dt>תגיות</dt><dd>' + (n.tags && n.tags.length ? ui.tags(n.tags) : '<span class="faint">—</span>') + '</dd></dl></div>' +
      '<div class="card pad"><div class="card-head"><h3>' + I('history') + 'היסטוריית גרסאות</h3></div>' +
      ((n.history || []).length ? '<ul class="history">' + n.history.slice().reverse().map(function (v, ri) {
        var i = n.history.length - 1 - ri;
        return '<li><b>' + U.bidi(v.title) + '</b><small>' + esc(U.fmtDateTime(v.at)) + '</small><button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px" data-act="note-restore" data-id="' + n.id + '" data-i="' + i + '">' + I('refresh') + 'שחזור</button></li>';
      }).join('') + '</ul>' : '<p class="faint small">גרסאות קודמות יישמרו כאן אוטומטית בכל עריכה (עד 15).</p>') + '</div>' +
    '</div></div></div>';
    el.innerHTML = html;
  }

  PS.views.notes = { title: function (r) { var n = r.params[0] && PS.store.get('notes', r.params[0]); return n ? n.title : 'מחברת שיעורים'; }, render: render };
})();
