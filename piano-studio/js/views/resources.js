/* Piano Studio — resource library: external links and local files (clearly distinguished). */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { folder: '__all', q: '', kind: '' };
  var usage = null;
  var KIND_ICON = { sheet: 'file', pdf: 'file', youtube: 'play', course: 'book', article: 'note', recording: 'headphones', teacher: 'user', image: 'image', other: 'link' };
  var KIND_TONE = { sheet: 'tone-gold', pdf: 'tone-rose', youtube: 'tone-rose', course: 'tone-violet', article: 'tone-blue', recording: 'tone-green', teacher: 'tone-gold', image: 'tone-blue', other: 'tone-muted' };

  function openForm(rec, preset) {
    ui.editForm({ coll: 'resources', record: rec || Object.assign({ folder: state.folder.indexOf('__') === 0 ? '' : state.folder }, preset || {}), icon: 'folder', size: 'md', onSaved: function () { usage = null; } });
  }
  function refreshUsage() { PS.db.filesUsage().then(function (u) { usage = u; var el = document.querySelector('[data-usage]'); if (el) el.textContent = u.count + ' קבצים · ' + U.fileSize(u.bytes); }); }

  Object.assign(PS.act, {
    'add-resource': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'res-edit': function (el) { openForm(PS.store.get('resources', el.dataset.id)); },
    'res-fav': function (el) { var r = PS.store.get('resources', el.dataset.id); PS.store.update('resources', r.id, { favorite: !r.favorite }, { force: true }); },
    'res-del': function (el) { ui.confirmDelete('resources', el.dataset.id, function () { usage = null; }); },
    'res-folder': function (el) { state.folder = el.dataset.f; PS.refresh(); },
    'res-q': U.debounce(function (el) { state.q = el.value; PS.refresh(); }, 150),
    'res-kind': function (el) { state.kind = el.value; PS.refresh(); },
    'res-open-file': function (el) {
      PS.db.getFile(el.dataset.file).then(function (f) {
        if (!f || !f.blob) { ui.toast('הקובץ לא נמצא בדפדפן הזה (ייתכן שהנתונים יובאו ממכשיר אחר)', 'error'); return; }
        var url = URL.createObjectURL(f.blob);
        var viewable = /^(image\/|application\/pdf|text\/|audio\/|video\/)/.test(f.type);
        if (viewable) { var w = window.open(url, '_blank'); if (w) w.opener = null; else U.download(f.name, f.blob); }
        else U.download(f.name, f.blob);
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      });
    }
  });

  function card(r) {
    var local = r.file && r.file.id;
    var song = r.songId && PS.store.get('songs', r.songId);
    var course = r.courseId && PS.store.get('courses', r.courseId);
    return '<article class="card res-card lift"><span class="res-icon ' + (KIND_TONE[r.kind] || 'tone-muted') + '">' + I(KIND_ICON[r.kind] || 'link') + '</span>' +
      '<div class="grow"><b>' + U.bidi(r.title) + '</b>' +
      '<div class="row" style="gap:6px"><span class="chip chip-muted">' + esc(L.resourceKind[r.kind] || '') + '</span>' +
        (local ? '<span class="storage-tag storage-local" title="נשמר בדפדפן הזה בלבד">' + I('lock') + 'מקומי · ' + U.fileSize(r.file.size) + '</span>' : '') +
        (r.url ? '<span class="storage-tag storage-url">' + I('external') + esc(U.hostOf(r.url) || 'קישור') + '</span>' : '') +
        (r.folder ? '<span class="small muted">' + I('folder') + ' ' + U.bidi(r.folder) + '</span>' : '') + '</div>' +
      (r.notes ? '<p class="small muted">' + U.bidi(r.notes) + '</p>' : '') +
      ((song || course) ? '<div class="meta">' + (song ? '<a href="#/songs/' + song.id + '">' + I('music') + U.bidi(song.title) + '</a>' : '') + (course ? '<a href="#/courses/' + course.id + '">' + I('book') + U.bidi(course.title) + '</a>' : '') + '</div>' : '') +
      ui.tags(r.tags) +
      '<div class="row" style="margin-top:4px">' + (r.url ? ui.linkBtn(r.url, 'פתיחה', 'external') : '') +
        (local ? '<button type="button" class="btn btn-ghost btn-sm" data-act="res-open-file" data-file="' + esc(r.file.id) + '">' + I('file') + 'פתיחת הקובץ</button>' : '') +
        '<span class="spacer"></span><button type="button" class="icon-btn sm' + (r.favorite ? ' on' : '') + '" data-act="res-fav" data-id="' + r.id + '" aria-pressed="' + !!r.favorite + '" aria-label="מועדף">' + I('star') + '</button>' +
        '<button type="button" class="icon-btn sm" data-act="res-edit" data-id="' + r.id + '" aria-label="עריכה">' + I('edit') + '</button>' +
        '<button type="button" class="icon-btn sm" data-act="res-del" data-id="' + r.id + '" aria-label="מחיקה">' + I('trash') + '</button></div></div></article>';
  }

  function render(el) {
    var all = PS.store.list('resources');
    var folders = PS.store.distinct('resources', 'folder');
    var F = {
      __all: function () { return true; },
      __fav: function (r) { return r.favorite; },
      __local: function (r) { return r.file && r.file.id; },
      __url: function (r) { return !!r.url; }
    };
    var test = F[state.folder] || function (r) { return r.folder === state.folder; };
    var list = all.filter(test).filter(function (r) { return (!state.kind || r.kind === state.kind) && PS.search.matches(r, state.q, ['title', 'folder', 'tags', 'notes', 'url']); })
      .sort(function (a, b) { return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    function fbtn(id, label, icon, n) { return '<button type="button" class="' + (state.folder === id ? 'on' : '') + '" data-act="res-folder" data-f="' + esc(id) + '">' + I(icon) + '<span>' + U.bidi(label) + '</span><span class="count">' + n + '</span></button>'; }
    var html = '<div class="page"><div class="page-head"><div><h1>משאבים</h1><p class="sub">תווים, קבצים, הקלטות, מאמרים וחומרים מהמורה — במקום אחד</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-resource">' + I('plus') + 'משאב חדש</button></div></div>';
    html += '<div class="side-layout"><div class="card pad"><div class="folder-list">' +
      fbtn('__all', 'הכל', 'grid', all.length) + fbtn('__fav', 'מועדפים', 'star', all.filter(F.__fav).length) + fbtn('__url', 'קישורים חיצוניים', 'external', all.filter(F.__url).length) + fbtn('__local', 'קבצים מקומיים', 'lock', all.filter(F.__local).length) +
      (folders.length ? '<hr style="margin:8px 0">' + folders.map(function (f) { return fbtn(f, f, 'folder', all.filter(function (r) { return r.folder === f; }).length); }).join('') : '') +
      '</div><hr style="margin:12px 0"><p class="small faint">' + I('lock') + ' קבצים מקומיים נשמרים רק בדפדפן הזה (IndexedDB). הם לא מועלים לשרת ואינם כלולים בגיבוי ה-JSON.</p>' +
      '<p class="small muted" style="margin-top:6px">נפח מקומי: <span data-usage>' + (usage ? usage.count + ' קבצים · ' + U.fileSize(usage.bytes) : '…') + '</span></p></div>';
    html += '<div><div class="toolbar"><div class="searchbox">' + I('search') + '<input class="input" type="search" placeholder="חיפוש משאב…" value="' + esc(state.q) + '" data-input="res-q" data-keep="res-q" aria-label="חיפוש משאבים"></div>' +
      '<select class="input" data-change="res-kind" aria-label="סוג"><option value="">כל הסוגים</option>' + Object.keys(L.resourceKind).map(function (k) { return '<option value="' + k + '"' + (state.kind === k ? ' selected' : '') + '>' + L.resourceKind[k] + '</option>'; }).join('') + '</select></div>';
    html += list.length ? '<div class="grid grid-2 stagger">' + list.map(card).join('') + '</div>' :
      '<div class="card">' + ui.empty(all.length ? { icon: 'folder', title: 'אין משאבים כאן', text: 'נסו תיקייה או חיפוש אחר.' } : { icon: 'folder', title: 'ספריית המשאבים ריקה', text: 'שמרו קישורים לתווים, ביצועים ביוטיוב, מאמרים — או קבצי PDF ותמונות מקומית בדפדפן.', action: { act: 'add-resource', label: 'משאב ראשון' } }) + '</div>';
    html += '</div></div></div>';
    el.innerHTML = html;
    if (!usage) refreshUsage();
  }

  PS.views.resources = { title: function () { return 'משאבים'; }, render: render };
})();
