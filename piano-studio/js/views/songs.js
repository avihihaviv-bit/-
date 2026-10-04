/* Piano Studio — song library: smart & custom collections, grid/list, filters, sorting,
 * drag-and-drop priority, detail page with history and milestones. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { c: 'all', layout: 'grid', q: '', status: '', genre: '', diff: '', sort: 'priority' };

  var SMART = [
    { id: 'all', label: 'כל השירים', icon: 'music', test: function (s) { return s.status !== 'archived'; } },
    { id: 'learning', label: 'בלמידה עכשיו', icon: 'sparkle', test: function (s) { return s.status === 'learning' || s.status === 'reviewing'; } },
    { id: 'wish', label: 'רוצה ללמוד', icon: 'heart', test: function (s) { return s.status === 'wishlist' || s.status === 'planned'; } },
    { id: 'learned', label: 'שירים שנלמדו', icon: 'checkCircle', test: function (s) { return s.status === 'learned'; } },
    { id: 'classical', label: 'קלאסי', icon: 'disc', test: function (s) { return /קלאסי|classical/i.test(s.genre || ''); } },
    { id: 'soundtrack', label: 'פסקולים', icon: 'play', test: function (s) { return /פסקול|סרט|משחק|soundtrack|film|game/i.test(s.genre || ''); } },
    { id: 'pop', label: 'פופ', icon: 'headphones', test: function (s) { return /פופ|pop/i.test(s.genre || ''); } },
    { id: 'fav', label: 'מועדפים', icon: 'star', test: function (s) { return s.favorite; } },
    { id: 'archived', label: 'ארכיון', icon: 'folder', test: function (s) { return s.status === 'archived'; } }
  ];

  function openForm(rec, preset) {
    ui.editForm({ coll: 'songs', record: rec || preset || null, icon: 'music', onSaved: function (r, created) { if (created) PS.navigate('#/songs/' + r.id); } });
  }
  function collOf(id) { return PS.store.get('collections', id); }

  Object.assign(PS.act, {
    'add-song': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'song-edit': function (el) { openForm(PS.store.get('songs', el.dataset.id)); },
    'song-fav': function (el) { var s = PS.store.get('songs', el.dataset.id); PS.store.update('songs', s.id, { favorite: !s.favorite }); },
    'song-status': function (el) { PS.store.update('songs', el.dataset.id, { status: el.value }); ui.toast('הסטטוס עודכן ל' + L.songStatus[el.value], 'success'); },
    'song-progress': function (el) {
      var out = el.parentNode.querySelector('output');
      if (out) out.textContent = el.value + '%';
    },
    'song-progress-save': function (el) { PS.store.update('songs', el.dataset.id, { progress: +el.value }); },
    'song-learned': function (el) {
      var s = PS.store.get('songs', el.dataset.id);
      ui.confirm({ title: 'לסמן את השיר כנלמד?', html: 'סמנו רק אם באמת למדתם את <b>' + U.bidi(s.title) + '</b> — האפליקציה לא מודדת נגינה, היא סומכת עליכם.', confirmLabel: 'כן, למדתי אותו!' }).then(function (ok) { if (ok) PS.store.update('songs', s.id, { status: 'learned' }); });
    },
    'song-menu': function (el) {
      var s = PS.store.get('songs', el.dataset.id);
      var items = [
        { label: 'עריכה', icon: 'edit', fn: function () { openForm(s); } },
        { label: s.favorite ? 'הסרה ממועדפים' : 'הוספה למועדפים', icon: 'star', fn: function () { PS.store.update('songs', s.id, { favorite: !s.favorite }); } },
        { label: 'הוספה לאוסף…', icon: 'layers', fn: function () { pickCollection(s.id); } },
        { label: 'משימה לשיר', icon: 'list', fn: function () { PS.act['add-task'](null, { songId: s.id }); } },
        { label: 'פתק לשיר', icon: 'note', fn: function () { PS.act['add-note'](null, { songIds: [s.id] }); } },
        { sep: true }
      ];
      Object.keys(L.songStatus).forEach(function (k) {
        if (k === s.status || k === 'learned') return;
        items.push({ label: 'העברה ל' + L.songStatus[k], icon: 'arrowDown', fn: function () { PS.store.update('songs', s.id, { status: k }); } });
      });
      if (s.status !== 'learned') items.push({ label: 'סימון כנלמד', icon: 'checkCircle', fn: function () { PS.act['song-learned']({ dataset: { id: s.id } }); } });
      if (state.c.indexOf('col:') === 0) items.push({ label: 'הסרה מהאוסף הזה', icon: 'x', fn: function () { var c = collOf(state.c.slice(4)); PS.store.update('collections', c.id, { songIds: c.songIds.filter(function (x) { return x !== s.id; }) }); } });
      items.push({ sep: true }, { label: 'מחיקה', icon: 'trash', danger: true, fn: function () { ui.confirmDelete('songs', s.id, function () { if (location.hash.indexOf(s.id) >= 0) PS.navigate('#/songs'); }); } });
      ui.menu(el, items);
    },
    'songs-c': function (el) { state.c = el.dataset.c; PS.refresh(); },
    'songs-layout': function (el) { state.layout = el.dataset.v; PS.refresh(); },
    'songs-q': U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150),
    'songs-filter': function (el) { state[el.dataset.k] = el.value; PS.refresh(); },
    'collection-add': function () { ui.editForm({ coll: 'collections', icon: 'layers', size: 'md', onSaved: function (c) { state.c = 'col:' + c.id; PS.refresh(); } }); },
    'collection-edit': function (el) { ui.editForm({ coll: 'collections', record: collOf(el.dataset.id), icon: 'layers', size: 'md' }); },
    'collection-del': function (el) { ui.confirmDelete('collections', el.dataset.id, function () { state.c = 'all'; PS.refresh(); }); },
    'song-move': function (el) { move(el.dataset.id, +el.dataset.dir); },
    'song-coll-toggle': function (el) {
      var c = collOf(el.dataset.c);
      var ids = c.songIds.slice();
      var i = ids.indexOf(el.dataset.id);
      if (i >= 0) ids.splice(i, 1); else ids.push(el.dataset.id);
      PS.store.update('collections', c.id, { songIds: ids });
    }
  });

  function pickCollection(songId) {
    var cols = PS.store.list('collections');
    if (!cols.length) {
      ui.prompt({ title: 'אוסף חדש', label: 'שם האוסף', icon: 'layers' }).then(function (name) {
        if (name) { PS.store.create('collections', { name: name, songIds: [songId] }); ui.toast('נוסף לאוסף "' + name + '"', 'success'); }
      });
      return;
    }
    var m = ui.modal({
      title: 'הוספה לאוסף', icon: 'layers', size: 'sm',
      body: '<div class="list">' + cols.map(function (c) {
        var on = c.songIds.indexOf(songId) >= 0;
        return '<label class="list-row" style="cursor:pointer"><input type="checkbox" class="check" data-c="' + c.id + '"' + (on ? ' checked' : '') + '><span class="grow"><span class="title">' + U.bidi(c.name) + '</span><span class="sub">' + c.songIds.length + ' שירים</span></span></label>';
      }).join('') + '</div>',
      footer: '<button type="button" class="btn btn-ghost" data-new>' + I('plus') + 'אוסף חדש</button><button type="button" class="btn btn-primary" data-close>סיום</button>'
    });
    m.el.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-c]');
      if (!cb) return;
      var c = collOf(cb.dataset.c);
      var ids = c.songIds.filter(function (x) { return x !== songId; });
      if (cb.checked) ids.push(songId);
      PS.store.update('collections', c.id, { songIds: ids });
    });
    m.el.querySelector('[data-new]').onclick = function () {
      ui.prompt({ title: 'אוסף חדש', label: 'שם האוסף' }).then(function (name) {
        if (name) { PS.store.create('collections', { name: name, songIds: [songId] }); m.close(); ui.toast('נוסף לאוסף "' + name + '"', 'success'); }
      });
    };
  }

  /* Manual priority ordering (lower = higher priority). Works within the current visible list. */
  function currentList() {
    var all = PS.store.list('songs');
    var test;
    if (state.c.indexOf('col:') === 0) {
      var c = collOf(state.c.slice(4));
      var ids = c ? c.songIds : [];
      return ids.map(function (id) { return PS.store.get('songs', id); }).filter(Boolean).filter(filterFn);
    }
    test = (SMART.filter(function (s) { return s.id === state.c; })[0] || SMART[0]).test;
    var list = all.filter(test).filter(filterFn);
    var sorts = {
      priority: U.byKey('priority'),
      title: U.byKey('title'),
      added: U.byKey('createdAt', 'desc'),
      progress: U.byKey('progress', 'desc'),
      target: U.byKey('targetDate'),
      difficulty: U.byKey(function (s) { return +s.difficulty || 0; })
    };
    return list.sort(sorts[state.sort] || sorts.priority);
  }
  function filterFn(s) {
    if (state.status && s.status !== state.status) return false;
    if (state.genre && s.genre !== state.genre) return false;
    if (state.diff && String(s.difficulty) !== state.diff) return false;
    return PS.search.matches(s, state.q, ['title', 'artist', 'genre', 'tags', 'personalNotes', 'teacherNotes']);
  }
  function reorder(ids) {
    if (state.c.indexOf('col:') === 0) {
      var c = collOf(state.c.slice(4));
      var rest = c.songIds.filter(function (x) { return ids.indexOf(x) < 0; });
      PS.store.update('collections', c.id, { songIds: ids.concat(rest) });
      return;
    }
    PS.store.batch(function () {
      ids.forEach(function (id, i) { var s = PS.store.get('songs', id); if (s.priority !== i) PS.db.put('songs', Object.assign({}, s, { priority: i })); });
      PS.store.emit('songs');
    });
  }
  function move(id, dir) {
    var ids = currentList().map(function (s) { return s.id; });
    var i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    reorder(ids);
  }

  function diff(n) { n = +n || 0; var h = '<span class="diff" title="קושי: ' + esc(L.difficulty[n] || '') + '" aria-label="קושי ' + n + ' מתוך 5">'; for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return h + '</span>'; }

  function gridCard(s) {
    return '<article class="card song-card lift" data-href="#/songs/' + s.id + '" tabindex="0" role="link" aria-label="' + esc(s.title) + '">' + ui.cover(s) +
      '<button type="button" class="fav-btn fav' + (s.favorite ? ' on' : '') + '" data-act="song-fav" data-id="' + s.id + '" aria-pressed="' + !!s.favorite + '" aria-label="' + (s.favorite ? 'הסרה ממועדפים' : 'הוספה למועדפים') + '">' + I('star') + '</button>' +
      '<div><h3>' + U.bidi(s.title) + '</h3><div class="artist">' + U.bidi(s.artist || '—') + '</div></div>' +
      '<div class="row">' + ui.status('songs', s.status) + diff(s.difficulty) + '</div>' +
      (s.status === 'learning' || s.status === 'reviewing' ? '<div class="row" style="gap:8px">' + '<span style="flex:1">' + ui.bar((s.progress || 0) / 100, 'pbar-xs') + '</span><span class="small num muted">' + (s.progress || 0) + '%</span></div>' : '') +
      '</article>';
  }
  function listRow(s, i, n, draggable) {
    return '<div class="list-row" data-href="#/songs/' + s.id + '" tabindex="0" role="link" data-song="' + s.id + '"' + (draggable ? ' draggable="true"' : '') + '>' +
      (draggable ? '<span class="drag-handle" aria-hidden="true" title="גררו כדי לשנות עדיפות">' + I('drag') + '</span>' : '') +
      ui.cover(s, 'cover-sm') +
      '<div class="grow"><span class="title">' + U.bidi(s.title) + '</span><span class="sub">' + U.bidi([s.artist, s.genre].filter(Boolean).join(' · ') || '—') + '</span></div>' +
      '<div class="trail"><span class="hide-xs">' + diff(s.difficulty) + '</span>' + (s.status === 'learning' || s.status === 'reviewing' ? '<span class="num small muted hide-xs">' + (s.progress || 0) + '%</span>' : '') + ui.status('songs', s.status) +
      '<button type="button" class="fav-btn' + (s.favorite ? ' on' : '') + '" data-act="song-fav" data-id="' + s.id + '" aria-pressed="' + !!s.favorite + '" aria-label="מועדף">' + I('star') + '</button>' +
      (draggable ? '<button type="button" class="icon-btn sm hide-xs" data-act="song-move" data-id="' + s.id + '" data-dir="-1" aria-label="העלאת עדיפות"' + (i === 0 ? ' disabled' : '') + '>' + I('arrowUp') + '</button><button type="button" class="icon-btn sm hide-xs" data-act="song-move" data-id="' + s.id + '" data-dir="1" aria-label="הורדת עדיפות"' + (i === n - 1 ? ' disabled' : '') + '>' + I('arrowDown') + '</button>' : '') +
      '<button type="button" class="icon-btn sm" data-act="song-menu" data-id="' + s.id + '" aria-label="פעולות" aria-haspopup="menu">' + I('more') + '</button></div></div>';
  }

  function render(el, route) {
    if (route.params[0]) return renderDetail(el, route.params[0]);
    if (route.query.c) { state.c = route.query.c; history.replaceState(null, '', '#/songs'); delete route.query.c; }
    var all = PS.store.list('songs');
    var cols = PS.store.list('collections').sort(U.byKey('name'));
    if (state.c.indexOf('col:') === 0 && !collOf(state.c.slice(4))) state.c = 'all';
    var list = currentList();
    var draggable = state.layout === 'list' && (state.sort === 'priority' || state.c.indexOf('col:') === 0);
    var genres = PS.store.distinct('songs', 'genre');
    var activeCol = state.c.indexOf('col:') === 0 ? collOf(state.c.slice(4)) : null;

    var html = '<div class="page"><div class="page-head"><div><h1>ספריית השירים</h1><p class="sub">' + all.length + ' שירים · ' + all.filter(function (s) { return s.status === 'learned'; }).length + ' נלמדו</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-ghost" data-act="collection-add">' + I('layers') + 'אוסף חדש</button><button type="button" class="btn btn-primary" data-act="add-song">' + I('plus') + 'שיר חדש</button></div></div>';
    html += '<div class="coll-chips" role="tablist" aria-label="אוספים">' + SMART.map(function (s) {
      var n = all.filter(s.test).length;
      return '<button type="button" role="tab" aria-selected="' + (state.c === s.id) + '" class="coll-chip' + (state.c === s.id ? ' on' : '') + '" data-act="songs-c" data-c="' + s.id + '">' + I(s.icon) + esc(s.label) + ' <span class="count">' + n + '</span></button>';
    }).join('') + cols.map(function (c) {
      return '<button type="button" role="tab" aria-selected="' + (state.c === 'col:' + c.id) + '" class="coll-chip' + (state.c === 'col:' + c.id ? ' on' : '') + '" data-act="songs-c" data-c="col:' + c.id + '">' + I('layers') + U.bidi(c.name) + ' <span class="count">' + c.songIds.length + '</span></button>';
    }).join('') + '</div>';
    if (activeCol) {
      html += '<div class="banner banner-gold">' + I('layers') + '<span><b>' + U.bidi(activeCol.name) + '</b>' + (activeCol.description ? ' · ' + U.bidi(activeCol.description) : '') + '</span><button type="button" class="btn btn-ghost btn-sm" data-act="collection-edit" data-id="' + activeCol.id + '">' + I('edit') + 'עריכה</button><button type="button" class="btn btn-ghost btn-sm" data-act="collection-del" data-id="' + activeCol.id + '">' + I('trash') + 'מחיקת האוסף</button></div>';
    }
    html += '<div class="toolbar"><div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש שיר, אמן, תגית…" value="' + esc(state.q) + '" data-input="songs-q" data-keep="songs-q" aria-label="חיפוש שירים"></div>' +
      '<select class="input" data-change="songs-filter" data-k="status" aria-label="סטטוס"><option value="">כל הסטטוסים</option>' + Object.keys(L.songStatus).map(function (k) { return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' + L.songStatus[k] + '</option>'; }).join('') + '</select>' +
      (genres.length ? '<select class="input" data-change="songs-filter" data-k="genre" aria-label="ז׳אנר"><option value="">כל הז׳אנרים</option>' + genres.map(function (g) { return '<option' + (state.genre === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>' : '') +
      '<select class="input" data-change="songs-filter" data-k="diff" aria-label="קושי"><option value="">כל רמות הקושי</option>' + Object.keys(L.difficulty).map(function (k) { return '<option value="' + k + '"' + (state.diff === k ? ' selected' : '') + '>' + L.difficulty[k] + '</option>'; }).join('') + '</select>' +
      '<select class="input" data-change="songs-filter" data-k="sort" aria-label="מיון"><option value="priority"' + (state.sort === 'priority' ? ' selected' : '') + '>מיון: עדיפות</option><option value="title"' + (state.sort === 'title' ? ' selected' : '') + '>מיון: שם</option><option value="added"' + (state.sort === 'added' ? ' selected' : '') + '>מיון: נוספו לאחרונה</option><option value="progress"' + (state.sort === 'progress' ? ' selected' : '') + '>מיון: התקדמות</option><option value="target"' + (state.sort === 'target' ? ' selected' : '') + '>מיון: יעד סיום</option><option value="difficulty"' + (state.sort === 'difficulty' ? ' selected' : '') + '>מיון: קושי</option></select>' +
      '<span class="spacer"></span><div class="seg" aria-label="פריסה"><button type="button" class="' + (state.layout === 'grid' ? 'on' : '') + '" data-act="songs-layout" data-v="grid" aria-label="רשת" aria-pressed="' + (state.layout === 'grid') + '">' + I('grid') + '</button><button type="button" class="' + (state.layout === 'list' ? 'on' : '') + '" data-act="songs-layout" data-v="list" aria-label="רשימה" aria-pressed="' + (state.layout === 'list') + '">' + I('rows') + '</button></div></div>';
    if (!list.length) {
      html += '<div class="card">' + (all.length ? ui.empty({ icon: 'search', title: 'אין שירים כאן', text: activeCol ? 'הוסיפו שירים לאוסף דרך תפריט ⋯ של שיר או בעריכת האוסף.' : 'נסו אוסף, חיפוש או סינון אחר.' }) : ui.empty({ icon: 'music', title: 'הספרייה מחכה לשיר הראשון', text: 'הוסיפו שירים שאתם רוצים ללמוד, לומדים עכשיו או כבר שולטים בהם.', action: { act: 'add-song', label: 'הוספת שיר' } })) + '</div>';
    } else if (state.layout === 'grid') {
      html += '<div class="grid grid-auto-s stagger">' + list.map(gridCard).join('') + '</div>';
    } else {
      if (draggable) html += '<p class="small faint" style="margin-bottom:8px">' + I('drag') + ' גררו שורות או השתמשו בחצים כדי לקבוע סדר עדיפויות</p>';
      html += '<div class="card list" data-dnd="songs">' + list.map(function (s, i) { return listRow(s, i, list.length, draggable); }).join('') + '</div>';
    }
    el.innerHTML = html + '</div>';
    if (draggable) wireDnd(el.querySelector('[data-dnd]'));
  }

  function wireDnd(box) {
    if (!box) return;
    var dragId = null;
    box.addEventListener('dragstart', function (e) { var r = e.target.closest('[data-song]'); if (!r) return; dragId = r.dataset.song; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
    box.addEventListener('dragend', function () { box.querySelectorAll('.dragging, .drag-over').forEach(function (x) { x.classList.remove('dragging', 'drag-over'); }); });
    box.addEventListener('dragover', function (e) { var r = e.target.closest('[data-song]'); if (!r || !dragId) return; e.preventDefault(); box.querySelectorAll('.drag-over').forEach(function (x) { x.classList.remove('drag-over'); }); r.classList.add('drag-over'); });
    box.addEventListener('drop', function (e) {
      var r = e.target.closest('[data-song]');
      if (!r || !dragId) return;
      e.preventDefault();
      var ids = Array.prototype.map.call(box.querySelectorAll('[data-song]'), function (x) { return x.dataset.song; });
      var from = ids.indexOf(dragId), to = ids.indexOf(r.dataset.song);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      dragId = null;
      reorder(ids);
    });
  }

  /* ---------- detail ---------- */
  var HIST = { added: 'נוסף לספרייה', status: 'שינוי סטטוס', progress: 'אבן דרך בהתקדמות' };
  function renderDetail(el, id) {
    var s = PS.store.get('songs', id);
    if (!s) return PS.views.notfound.render(el);
    var lessons = PS.store.list('lessons').filter(function (l) { return (l.songIds || []).indexOf(s.id) >= 0; }).sort(U.byKey('date', 'desc'));
    var notes = PS.store.list('notes').filter(function (n) { return (n.songIds || []).indexOf(s.id) >= 0; });
    var tasks = PS.store.list('tasks').filter(function (t) { return t.songId === s.id; });
    var res = PS.store.list('resources').filter(function (r) { return r.songId === s.id; });
    var cols = PS.store.list('collections');
    var links = [[s.sheetUrl, 'תווים', 'file'], [s.youtubeUrl, 'ביצוע ביוטיוב', 'play'], [s.tutorialUrl, 'מדריך', 'book'], [s.listenUrl, 'האזנה', 'headphones']].filter(function (x) { return x[0]; });
    function sec(t, icon, body) { return '<div class="card pad"><div class="card-head"><h3>' + I(icon) + esc(t) + '</h3></div>' + body + '</div>'; }
    var html = '<div class="page"><a class="back-link" href="#/songs">' + I('chevronRight') + 'ספריית השירים</a>' +
      '<div class="detail-hero">' + ui.cover(s, 'cover-xl') + '<div class="info"><div class="row">' + ui.status('songs', s.status) + (s.genre ? '<span class="chip chip-muted">' + U.bidi(s.genre) + '</span>' : '') + diff(s.difficulty) + '</div>' +
      '<h1>' + U.bidi(s.title) + '</h1><p class="muted" style="font-size:17px">' + U.bidi(s.artist || '') + '</p>' +
      '<div class="row">' + (s.status !== 'learned' ? '<button type="button" class="btn btn-primary" data-act="song-learned" data-id="' + s.id + '">' + I('checkCircle') + 'סימון כנלמד</button>' : '<span class="chip chip-green">' + I('checkCircle') + 'נלמד ב-' + esc(U.fmtDate(s.learnedAt)) + '</span>') +
      '<button type="button" class="btn btn-ghost" data-act="song-edit" data-id="' + s.id + '">' + I('edit') + 'עריכה</button>' +
      '<button type="button" class="icon-btn' + (s.favorite ? ' on' : '') + '" data-act="song-fav" data-id="' + s.id + '" aria-pressed="' + !!s.favorite + '" aria-label="מועדף">' + I('star') + '</button>' +
      '<button type="button" class="icon-btn" data-act="song-menu" data-id="' + s.id + '" aria-label="פעולות נוספות" aria-haspopup="menu">' + I('more') + '</button></div></div></div>';
    html += '<div class="detail-grid"><div class="stack">' +
      sec('התקדמות', 'chart', '<div class="row" style="gap:16px;align-items:center">' + ui.ring((s.progress || 0) / 100, 76) +
        '<div style="flex:1;min-width:200px"><label class="field-label" for="sp-' + s.id + '">התקדמות אישית (הערכה שלכם)</label><div class="range-row"><input id="sp-' + s.id + '" class="range" type="range" min="0" max="100" step="5" value="' + (s.progress || 0) + '" data-input="song-progress" data-change="song-progress-save" data-id="' + s.id + '"><output class="range-out num">' + (s.progress || 0) + '%</output></div>' +
        '<div class="row" style="margin-top:10px"><label class="field-label" for="ss-' + s.id + '">סטטוס</label><select id="ss-' + s.id + '" class="input input-sm" style="width:auto" data-change="song-status" data-id="' + s.id + '">' + Object.keys(L.songStatus).map(function (k) { return '<option value="' + k + '"' + (s.status === k ? ' selected' : '') + '>' + L.songStatus[k] + '</option>'; }).join('') + '</select></div></div></div>' +
        '<div class="milestone-dots" style="margin-top:18px" aria-label="אבני דרך">' + [25, 50, 75, 100].map(function (m) { return '<span class="' + ((s.milestones || {})[m] ? 'on' : '') + '" title="' + ((s.milestones || {})[m] ? 'הושג ' + U.fmtDate(s.milestones[m]) : 'טרם הושג') + '">' + m + '%</span>'; }).join('') + '</div>') +
      (links.length ? sec('קישורים', 'link', '<div class="links">' + links.map(function (x) { return ui.linkBtn(x[0], x[1], x[2]); }).join('') + '</div><p class="small faint" style="margin-top:10px">פתיחת קישור אינה משנה את סטטוס השיר.</p>') : '') +
      sec('הערות המורה', 'user', s.teacherNotes ? '<div class="textblock">' + U.bidi(s.teacherNotes) + '</div>' : '<p class="faint small">אין הערות מהמורה</p>') +
      sec('הערות אישיות', 'pen', s.personalNotes ? '<div class="textblock">' + U.bidi(s.personalNotes) + '</div>' : '<p class="faint small">אין הערות אישיות</p>') +
      (s.background ? sec('על היצירה והמלחין', 'book', '<div class="textblock muted">' + U.bidi(s.background) + '</div>') : '') +
    '</div><div class="stack">' +
      sec('פרטים', 'info', '<dl class="kv"><dt>נוסף</dt><dd>' + esc(U.fmtDate(s.createdAt)) + '</dd>' + (s.startedAt ? '<dt>התחלת למידה</dt><dd>' + esc(U.fmtDate(s.startedAt)) + '</dd>' : '') + (s.targetDate ? '<dt>יעד לסיום</dt><dd>' + esc(U.fmtDate(s.targetDate)) + '</dd>' : '') + (s.learnedAt ? '<dt>נלמד</dt><dd>' + esc(U.fmtDate(s.learnedAt)) + '</dd>' : '') + '<dt>תגיות</dt><dd>' + (s.tags && s.tags.length ? ui.tags(s.tags) : '—') + '</dd></dl>') +
      sec('אוספים', 'layers', (cols.length ? '<div class="stack" style="gap:6px">' + cols.map(function (c) { var on = c.songIds.indexOf(s.id) >= 0; return '<label class="field-check" style="padding:2px 0"><input type="checkbox" class="check" data-act="song-coll-toggle" data-c="' + c.id + '" data-id="' + s.id + '"' + (on ? ' checked' : '') + '><span>' + U.bidi(c.name) + '</span></label>'; }).join('') + '</div>' : '<p class="faint small">עוד אין אוספים אישיים</p>') + '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" data-act="collection-add">' + I('plus') + 'אוסף חדש</button>') +
      sec('היסטוריה ואבני דרך', 'history', (s.history || []).length ? '<ul class="history">' + s.history.slice().reverse().map(function (h) {
        var t = h.type === 'status' ? (L.songStatus[h.from] || '') + ' ← ' + (L.songStatus[h.to] || '') : h.type === 'progress' ? h.to + '%' : L.songStatus[h.to] || '';
        return '<li><b>' + esc(HIST[h.type] || '') + '</b> · ' + esc(t) + '<small>' + esc(U.fmtDateTime(h.at)) + '</small></li>';
      }).join('') + '</ul>' : '<p class="faint small">אין עדיין היסטוריה</p>') +
      sec('קשור לשיר', 'link', '<dl class="kv"><dt>שיעורים</dt><dd>' + (lessons.length ? lessons.slice(0, 5).map(function (l) { return '<a href="#/lessons/' + l.id + '">' + U.bidi(l.title) + ' · ' + esc(U.fmtDayMonthShort(l.date)) + '</a>'; }).join('<br>') : '—') + '</dd>' +
        '<dt>פתקים</dt><dd>' + (notes.length ? notes.map(function (n) { return '<a href="#/notes/' + n.id + '">' + U.bidi(n.title) + '</a>'; }).join('<br>') : '—') + '</dd>' +
        '<dt>משימות</dt><dd>' + (tasks.length ? tasks.map(function (t) { return '<a href="#/tasks?open=' + t.id + '" style="' + (t.done ? 'text-decoration:line-through' : '') + '">' + U.bidi(t.title) + '</a>'; }).join('<br>') : '—') + '</dd>' +
        '<dt>משאבים</dt><dd>' + (res.length ? res.map(function (r) { return '<a href="#/resources">' + U.bidi(r.title) + '</a>'; }).join('<br>') : '—') + '</dd></dl>') +
    '</div></div></div>';
    el.innerHTML = html;
  }

  PS.views.songs = { title: function (r) { var s = r.params[0] && PS.store.get('songs', r.params[0]); return s ? s.title : 'שירים'; }, render: render };
})();
