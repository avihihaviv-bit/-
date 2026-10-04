/* Piano Studio — global search across all record types. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var SOURCES = [
    { coll: 'songs', label: 'שיר', icon: 'music', fields: ['title', 'artist', 'genre', 'tags', 'personalNotes', 'teacherNotes'], href: function (r) { return '#/songs/' + r.id; }, sub: function (r) { return [r.artist, PS.schema.labels.songStatus[r.status]].filter(Boolean).join(' · '); } },
    { coll: 'lessons', label: 'שיעור', icon: 'calendar', fields: ['title', 'teacher', 'location', 'topics', 'homework', 'instructions', 'personalNotes'], href: function (r) { return '#/lessons/' + r.id; }, sub: function (r) { return U.fmtDate(r.date) + (r.teacher ? ' · ' + r.teacher : ''); } },
    { coll: 'courses', label: 'קורס', icon: 'book', fields: ['title', 'instructor', 'description', 'takeaways'], href: function (r) { return '#/courses/' + r.id; }, sub: function (r) { return r.instructor || ''; } },
    { coll: 'tasks', label: 'משימה', icon: 'check', fields: ['title', 'description', 'notes'], href: function (r) { return '#/tasks?open=' + r.id; }, sub: function (r) { return r.done ? 'הושלמה' : r.dueDate ? 'יעד: ' + U.fmtDate(r.dueDate) : ''; } },
    { coll: 'notes', label: 'פתק', icon: 'note', fields: ['title', 'body', 'tags'], href: function (r) { return '#/notes/' + r.id; }, sub: function (r) { return PS.schema.labels.noteType[r.type] || ''; } },
    { coll: 'goals', label: 'יעד', icon: 'target', fields: ['title', 'description'], href: function () { return '#/goals'; }, sub: function (r) { return PS.schema.labels.goalStatus[r.status] || ''; } },
    { coll: 'journal', label: 'יומן', icon: 'pen', fields: ['title', 'body', 'tags'], href: function (r) { return '#/journal/' + r.id; }, sub: function (r) { return U.fmtDate(r.date); } },
    { coll: 'resources', label: 'משאב', icon: 'folder', fields: ['title', 'folder', 'tags', 'notes', 'url'], href: function () { return '#/resources'; }, sub: function (r) { return PS.schema.labels.resourceKind[r.kind] || ''; } }
  ];

  function text(rec, fields) {
    return U.normalize(fields.map(function (f) { var v = rec[f]; return Array.isArray(v) ? v.join(' ') : v || ''; }).join(' '));
  }

  /* Score: title prefix > title contains > other fields. All query terms must match. */
  function query(q, limit) {
    q = U.normalize(q).trim();
    if (!q) return [];
    var terms = q.split(/\s+/);
    var out = [];
    SOURCES.forEach(function (src) {
      PS.store.list(src.coll).forEach(function (r) {
        var title = U.normalize(PS.store.titleOf(src.coll, r));
        var hay = title + ' ' + text(r, src.fields);
        if (!terms.every(function (t) { return hay.indexOf(t) >= 0; })) return;
        var score = 1;
        if (title.indexOf(q) === 0) score = 4;
        else if (title.indexOf(q) >= 0) score = 3;
        else if (terms.every(function (t) { return title.indexOf(t) >= 0; })) score = 2;
        out.push({ coll: src.coll, rec: r, label: src.label, icon: src.icon, title: PS.store.titleOf(src.coll, r), sub: src.sub(r), href: src.href(r), score: score });
      });
    });
    out.sort(function (a, b) { return b.score - a.score || String(b.rec.updatedAt).localeCompare(String(a.rec.updatedAt)); });
    return out.slice(0, limit || 40);
  }

  /* Local filter helper used by section pages */
  function matches(rec, q, fields) {
    q = U.normalize(q).trim();
    if (!q) return true;
    var hay = text(rec, fields);
    return q.split(/\s+/).every(function (t) { return hay.indexOf(t) >= 0; });
  }

  PS.search = { query: query, matches: matches, SOURCES: SOURCES };
})();
