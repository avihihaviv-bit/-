/* Piano Studio — export / import / CSV / demo data. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var APP_ID = 'piano-studio';

  /* Preferences that are device-specific and not worth exporting. */
  var PREF_SKIP = ['sidebarCollapsed', 'browserNotifications'];

  function exportObject() {
    var prefs = PS.prefs.all();
    PREF_SKIP.forEach(function (k) { delete prefs[k]; });
    return {
      app: APP_ID,
      format: 1,
      schemaVersion: PS.db.SCHEMA_VERSION,
      exportedAt: U.nowISO(),
      note: 'קבצים מקומיים (Blobs) אינם כלולים בגיבוי — רק פרטי הקובץ.',
      prefs: prefs,
      data: PS.db.snapshot()
    };
  }
  function exportJSON() {
    var name = 'piano-studio-backup-' + U.todayKey() + '.json';
    U.download(name, JSON.stringify(exportObject(), null, 2), 'application/json');
    PS.store.log('backup', 'יוצא גיבוי נתונים (' + name + ')');
    return name;
  }

  /* Validate an import payload. Returns { ok, errors[], warnings[], counts{}, clean } */
  function validateImport(text) {
    var res = { ok: false, errors: [], warnings: [], counts: {}, clean: null, prefs: null };
    var obj;
    try { obj = JSON.parse(text); } catch (e) { res.errors.push('הקובץ אינו JSON תקין: ' + e.message); return res; }
    if (!obj || typeof obj !== 'object') { res.errors.push('מבנה הקובץ אינו תקין'); return res; }
    if (obj.app !== APP_ID) { res.errors.push('הקובץ אינו גיבוי של Piano Studio (חסר מזהה app)'); return res; }
    if (!obj.data || typeof obj.data !== 'object') { res.errors.push('חסר אובייקט data בגיבוי'); return res; }
    if ((obj.schemaVersion || 0) > PS.db.SCHEMA_VERSION) res.warnings.push('הגיבוי נוצר בגרסה חדשה יותר של האפליקציה; חלק מהשדות עשויים להיות מושמטים.');
    var clean = {};
    PS.db.COLLECTIONS.forEach(function (c) {
      var rows = obj.data[c];
      if (rows === undefined) { clean[c] = []; return; }
      if (!Array.isArray(rows)) { res.errors.push('האוסף "' + c + '" אינו מערך'); return; }
      var ids = new Set();
      var bad = 0;
      clean[c] = [];
      rows.forEach(function (r, i) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) { bad++; return; }
        if (ids.has(r.id)) { res.warnings.push(c + ': מזהה כפול "' + r.id + '" — הרשומה הכפולה דולגה'); return; }
        ids.add(r.id);
        var v = PS.schema.validate(c, r, { lenient: true });
        var errs = Object.keys(v.errors);
        var required = (PS.schema.defs[c] ? PS.schema.defs[c].fields : []).filter(function (f) { return f.req; }).map(function (f) { return f.k; });
        if (errs.some(function (k) { return required.indexOf(k) >= 0; })) { bad++; if (bad <= 3) res.warnings.push(c + ' #' + (i + 1) + ': חסרים שדות חובה (' + errs.join(', ') + ')'); return; }
        var rec = v.value;
        rec.createdAt = U.toDate(rec.createdAt) ? rec.createdAt : U.nowISO();
        rec.updatedAt = U.toDate(rec.updatedAt) ? rec.updatedAt : rec.createdAt;
        clean[c].push(rec);
      });
      if (bad) res.warnings.push(c + ': ' + bad + ' רשומות לא תקינות יושמטו');
      res.counts[c] = clean[c].length;
    });
    // de-duplicate XP keys defensively
    var seen = new Set();
    clean.xp = (clean.xp || []).filter(function (e) {
      if (typeof e.amount !== 'number' || !isFinite(e.amount)) return false;
      if (!e.key) return true;
      if (seen.has(e.key)) return false;
      seen.add(e.key); return true;
    });
    res.counts.xp = clean.xp.length;
    if (res.errors.length) return res;
    res.ok = true;
    res.clean = clean;
    res.prefs = obj.prefs && typeof obj.prefs === 'object' ? obj.prefs : null;
    res.exportedAt = obj.exportedAt;
    return res;
  }

  function applyImport(v) {
    return PS.db.replaceAll(v.clean).then(function () {
      if (v.prefs) {
        var keep = {};
        PREF_SKIP.forEach(function (k) { keep[k] = PS.prefs.get(k); });
        PS.prefs.replace(Object.assign({}, v.prefs, keep, { onboarded: true }));
      }
      PS.store.log('backup', 'יובאו נתונים מגיבוי');
      PS.db.COLLECTIONS.forEach(function (c) { PS.store.emit(c); });
    });
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) v = v.join('; ');
    v = String(v);
    if (/^[=+\-@]/.test(v)) v = "'" + v; // avoid spreadsheet formula injection
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var CSV = {
    songs: [['title', 'שם'], ['artist', 'אמן/מלחין'], ['genre', 'ז׳אנר'], ['status', 'סטטוס', 'songStatus'], ['difficulty', 'קושי'], ['progress', 'התקדמות %'], ['targetDate', 'יעד'], ['learnedAt', 'נלמד בתאריך'], ['favorite', 'מועדף'], ['tags', 'תגיות'], ['sheetUrl', 'תווים'], ['youtubeUrl', 'יוטיוב']],
    lessons: [['title', 'כותרת'], ['date', 'תאריך'], ['time', 'שעה'], ['duration', 'משך'], ['status', 'סטטוס', 'lessonStatus'], ['teacher', 'מורה'], ['location', 'מיקום'], ['topics', 'נושאים'], ['homework', 'שיעורי בית'], ['cost', 'עלות']],
    tasks: [['title', 'כותרת'], ['dueDate', 'תאריך יעד'], ['priority', 'עדיפות', 'priority'], ['category', 'קטגוריה', 'taskCategory'], ['done', 'הושלמה'], ['completedAt', 'הושלמה בתאריך'], ['estimate', 'משך משוער'], ['description', 'תיאור']]
  };
  function exportCSV(coll) {
    var cols = CSV[coll];
    var L = PS.schema.labels;
    var rows = [cols.map(function (c) { return c[1]; }).join(',')];
    PS.store.list(coll).forEach(function (r) {
      rows.push(cols.map(function (c) {
        var v = r[c[0]];
        if (c[2] && L[c[2]]) v = L[c[2]][v] || v;
        if (typeof v === 'boolean') v = v ? 'כן' : 'לא';
        return csvCell(v);
      }).join(','));
    });
    U.download('piano-studio-' + coll + '-' + U.todayKey() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* ---------- demo data ----------
   * Optional sample records so a new user can explore. All are flagged demo:true,
   * contain no completed items, award no XP and never count toward achievements. */
  function loadDemo() {
    var t = U.todayKey();
    var d = function (n) { return U.dkey(U.addDays(new Date(), n)); };
    PS.store.batch(function () {
      var s1 = PS.store.create('songs', { demo: true, title: 'Clair de Lune', artist: 'Claude Debussy', genre: 'קלאסי', status: 'learning', difficulty: '4', progress: 35, tags: ['אימפרסיוניזם'], background: 'הפרק השלישי מתוך "סוויטה ברגמסק" (1905).', favorite: true });
      var s2 = PS.store.create('songs', { demo: true, title: 'Comptine d\'un autre été', artist: 'Yann Tiersen', genre: 'פסקולי סרטים ומשחקים', status: 'planned', difficulty: '3', progress: 0 });
      PS.store.create('songs', { demo: true, title: 'River Flows in You', artist: 'Yiruma', genre: 'ניו אייג׳', status: 'wishlist', difficulty: '3' });
      PS.store.create('songs', { demo: true, title: 'ירושלים של זהב', artist: 'נעמי שמר', genre: 'ישראלי', status: 'wishlist', difficulty: '2' });
      var l1 = PS.store.create('lessons', { demo: true, title: 'שיעור שבועי', date: d(2), time: '17:30', duration: 45, teacher: 'המורה שלי', location: 'סטודיו', status: 'upcoming', topics: ['פדאל', 'דינמיקה'], songIds: [s1.id], nextPrep: 'להביא שאלות על הפדאל בתיבות 15–20' });
      PS.store.create('lessons', { demo: true, title: 'שיעור שבועי', date: d(9), time: '17:30', duration: 45, teacher: 'המורה שלי', location: 'סטודיו', status: 'upcoming' });
      var c1 = PS.store.create('courses', { demo: true, title: 'Piano Fundamentals', instructor: 'פלטפורמה מקוונת', status: 'planned', moduleCount: 8, estimatedHours: 12, targetDate: d(60), description: 'קורס יסודות: קריאת תווים, אקורדים ומקצב.' });
      PS.store.create('tasks', { demo: true, title: 'לחפש תווים ל-Comptine', dueDate: t, priority: 'medium', category: 'sheet', songId: s2.id });
      PS.store.create('tasks', { demo: true, title: 'להכין שאלות לשיעור הבא', dueDate: d(1), priority: 'high', category: 'prep', lessonId: l1.id, subtasks: [{ title: 'שאלה על פדאל' }, { title: 'שאלה על אצבוע' }] });
      PS.store.create('tasks', { demo: true, title: 'לסדר את תיקיית התווים', dueDate: d(4), priority: 'low', category: 'organize', recurrence: 'monthly' });
      PS.store.create('tasks', { demo: true, title: 'להאזין לביצוע ייחוס של Clair de Lune', dueDate: d(3), category: 'listen', songId: s1.id, courseId: c1.id });
      PS.store.create('notes', { demo: true, title: 'פדאל — עקרונות', type: 'teacher', lessonId: '', body: '## מה המורה הסבירה\n- להחליף פדאל **אחרי** הצליל החדש\n- להקשיב לטשטוש\n\n## לזכור\n- [ ] לנסות בתיבות 1–8\n- [ ] לשאול על חצי-פדאל', tags: ['פדאל'], songIds: [s1.id], pinned: true });
      PS.store.create('goals', { demo: true, title: 'ללמוד 3 שירים עד סוף השנה', period: 'long', category: 'songs', metric: 'songs_learned', target: 3, startDate: t, deadline: U.dkey(new Date(new Date().getFullYear(), 11, 31)), reward: 60 });
    });
    PS.prefs.set('hasDemo', true);
  }
  function removeDemo() {
    PS.store.batch(function () {
      PS.db.COLLECTIONS.forEach(function (c) {
        PS.store.list(c).forEach(function (r) { if (r.demo) PS.store.remove(c, r.id); });
      });
    });
    PS.prefs.set('hasDemo', false);
  }
  function hasDemo() { return PS.db.COLLECTIONS.some(function (c) { return PS.store.list(c).some(function (r) { return r.demo; }); }); }

  function clearAll() {
    var empty = {};
    PS.db.COLLECTIONS.forEach(function (c) { empty[c] = []; });
    return PS.db.replaceAll(empty).then(function () { return PS.db.clearFiles(); }).then(function () {
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('ps.') === 0) localStorage.removeItem(k); }); } catch (e) {}
      PS.prefs.reset();
    });
  }

  PS.backup = { exportJSON: exportJSON, exportObject: exportObject, validateImport: validateImport, applyImport: applyImport, exportCSV: exportCSV, loadDemo: loadDemo, removeDemo: removeDemo, hasDemo: hasDemo, clearAll: clearAll };
})();
