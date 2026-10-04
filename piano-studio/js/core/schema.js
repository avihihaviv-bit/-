/* Piano Studio — entity schemas. One definition drives forms, validation and import checks. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var LABELS = {
    lessonStatus: { upcoming: 'מתוכנן', completed: 'הושלם', cancelled: 'בוטל', rescheduled: 'נדחה' },
    songStatus: { wishlist: 'רשימת משאלות', planned: 'מתוכנן', learning: 'בלמידה', reviewing: 'בחזרה', learned: 'נלמד', archived: 'בארכיון' },
    courseStatus: { wishlist: 'רשימת משאלות', planned: 'מתוכנן', in_progress: 'בתהליך', paused: 'מושהה', completed: 'הושלם' },
    goalStatus: { active: 'פעיל', completed: 'הושג', paused: 'מושהה', abandoned: 'נזנח' },
    goalPeriod: { weekly: 'שבועי', monthly: 'חודשי', long: 'ארוך טווח' },
    goalCategory: { songs: 'שירים', courses: 'קורסים', lessons: 'שיעורים', organization: 'ארגון', milestone: 'אבן דרך אישית', collection: 'אוסף', other: 'אחר' },
    goalMetric: {
      manual: 'מעקב ידני',
      songs_learned: 'שירים שנלמדו',
      lessons_completed: 'שיעורים שהושלמו',
      courses_completed: 'קורסים שהושלמו',
      modules_completed: 'מודולים שהושלמו',
      tasks_completed: 'משימות שהושלמו',
      notes_written: 'פתקים שנכתבו',
      favorite_songs: 'שירים מועדפים'
    },
    priority: { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' },
    difficulty: { 1: 'קל מאוד', 2: 'קל', 3: 'בינוני', 4: 'מאתגר', 5: 'מתקדם' },
    taskCategory: { review: 'חזרה על חומר', sheet: 'תווים', course: 'קורס', teacher: 'שאלה למורה', organize: 'ארגון', listen: 'האזנה', prep: 'הכנה לשיעור', other: 'אחר' },
    recurrence: { none: 'ללא', daily: 'יומית', weekly: 'שבועית', monthly: 'חודשית' },
    noteType: { teacher: 'הערות המורה', concept: 'מושג מוזיקלי', mistake: 'טעות לזכור', homework: 'הוראות שיעורי בית', question: 'שאלה לשיעור הבא', observation: 'תובנה אישית', recommendation: 'המלצת אימון מהמורה' },
    resourceKind: { sheet: 'תווים', pdf: 'PDF', youtube: 'יוטיוב', course: 'חומר קורס', article: 'מאמר', recording: 'הקלטת ייחוס', teacher: 'חומר מהמורה', image: 'תמונה', other: 'אחר' },
    eventKind: { reminder: 'תזכורת', recital: 'קונצרט / רסיטל', event: 'אירוע', deadline: 'מועד', other: 'אחר' },
    reminder: { 0: 'ללא תזכורת', 15: '15 דקות לפני', 60: 'שעה לפני', 180: '3 שעות לפני', 1440: 'יום לפני' }
  };

  var DEFAULT_GENRES = ['קלאסי', 'פסקולי סרטים ומשחקים', 'פופ', 'ג׳אז', 'רוק', 'ישראלי', 'ניו אייג׳', 'אחר'];

  function opts(map) { return Object.keys(map).map(function (k) { return { value: k, label: map[k] }; }); }

  /*
   * Field types: text, textarea, markdown, number, range, date, time, select, tags, url,
   * checkbox, links, ref (single id), refs (id list), color.
   */
  var S = {
    lessons: {
      label: 'שיעור', plural: 'שיעורים',
      fields: [
        { k: 'title', label: 'כותרת השיעור', type: 'text', req: true, max: 120, ph: 'למשל: שיעור שבועי עם רונית' },
        { k: 'date', label: 'תאריך', type: 'date', req: true, half: true },
        { k: 'time', label: 'שעה', type: 'time', half: true, def: '17:00' },
        { k: 'duration', label: 'משך (דקות)', type: 'number', min: 5, max: 600, half: true, def: function () { return PS.prefs.get('defaultLessonDuration'); } },
        { k: 'status', label: 'סטטוס', type: 'select', options: opts(LABELS.lessonStatus), def: 'upcoming', half: true },
        { k: 'teacher', label: 'שם המורה', type: 'text', max: 80, half: true },
        { k: 'location', label: 'מיקום', type: 'text', max: 120, half: true, ph: 'סטודיו / זום / בית' },
        { k: 'topics', label: 'נושאים שנלמדו', type: 'tags' },
        { k: 'instructions', label: 'הנחיות המורה', type: 'textarea', max: 4000 },
        { k: 'homework', label: 'שיעורי בית', type: 'textarea', max: 4000 },
        { k: 'personalNotes', label: 'הערות אישיות', type: 'textarea', max: 4000 },
        { k: 'nextPrep', label: 'הכנה לשיעור הבא', type: 'textarea', max: 4000 },
        { k: 'songIds', label: 'שירים קשורים', type: 'refs', ref: 'songs' },
        { k: 'links', label: 'קישורים וחומרים', type: 'links' },
        { k: 'cost', label: 'עלות (₪, אופציונלי)', type: 'number', min: 0, max: 100000, half: true },
        { k: 'reminder', label: 'תזכורת', type: 'select', options: opts(LABELS.reminder), def: '60', half: true }
      ]
    },
    notes: {
      label: 'פתק', plural: 'פתקים',
      fields: [
        { k: 'title', label: 'כותרת', type: 'text', req: true, max: 140 },
        { k: 'type', label: 'סוג הפתק', type: 'select', options: opts(LABELS.noteType), def: 'teacher', half: true },
        { k: 'lessonId', label: 'שיעור מקושר', type: 'ref', ref: 'lessons', half: true },
        { k: 'body', label: 'תוכן', type: 'markdown', max: 50000 },
        { k: 'songIds', label: 'שירים מקושרים', type: 'refs', ref: 'songs' },
        { k: 'tags', label: 'תגיות', type: 'tags' },
        { k: 'pinned', label: 'נעוץ', type: 'checkbox', half: true },
        { k: 'favorite', label: 'מועדף', type: 'checkbox', half: true }
      ]
    },
    songs: {
      label: 'שיר', plural: 'שירים',
      fields: [
        { k: 'title', label: 'שם השיר', type: 'text', req: true, max: 140 },
        { k: 'artist', label: 'אמן / מלחין', type: 'text', max: 120, half: true },
        { k: 'genre', label: 'ז׳אנר', type: 'select', options: function () { return genreOptions(); }, allowNew: true, half: true },
        { k: 'status', label: 'סטטוס', type: 'select', options: opts(LABELS.songStatus), def: 'wishlist', half: true },
        { k: 'difficulty', label: 'רמת קושי', type: 'select', options: opts(LABELS.difficulty), def: '3', half: true },
        { k: 'progress', label: 'התקדמות אישית', type: 'range', min: 0, max: 100, def: 0 },
        { k: 'targetDate', label: 'יעד לסיום', type: 'date', half: true },
        { k: 'coverUrl', label: 'תמונת עטיפה (קישור)', type: 'url', half: true },
        { k: 'sheetUrl', label: 'קישור לתווים', type: 'url', half: true },
        { k: 'youtubeUrl', label: 'ביצוע ביוטיוב', type: 'url', half: true },
        { k: 'tutorialUrl', label: 'קישור למדריך', type: 'url', half: true },
        { k: 'listenUrl', label: 'Spotify / האזנה', type: 'url', half: true },
        { k: 'teacherNotes', label: 'הערות המורה', type: 'textarea', max: 4000 },
        { k: 'personalNotes', label: 'הערות אישיות', type: 'textarea', max: 4000 },
        { k: 'background', label: 'רקע על היצירה / המלחין', type: 'textarea', max: 6000 },
        { k: 'tags', label: 'תגיות', type: 'tags' },
        { k: 'favorite', label: 'מועדף', type: 'checkbox' }
      ]
    },
    collections: {
      label: 'אוסף', plural: 'אוספים',
      fields: [
        { k: 'name', label: 'שם האוסף', type: 'text', req: true, max: 80 },
        { k: 'description', label: 'תיאור', type: 'textarea', max: 500 },
        { k: 'songIds', label: 'שירים', type: 'refs', ref: 'songs' }
      ]
    },
    courses: {
      label: 'קורס', plural: 'קורסים',
      fields: [
        { k: 'title', label: 'שם הקורס', type: 'text', req: true, max: 140 },
        { k: 'instructor', label: 'מדריך / פלטפורמה', type: 'text', max: 120, half: true },
        { k: 'status', label: 'סטטוס', type: 'select', options: opts(LABELS.courseStatus), def: 'planned', half: true },
        { k: 'description', label: 'תיאור', type: 'textarea', max: 4000 },
        { k: 'url', label: 'קישור לקורס', type: 'url', half: true },
        { k: 'coverUrl', label: 'תמונת כריכה (קישור)', type: 'url', half: true },
        { k: 'moduleCount', label: 'מספר מודולים ליצירה', type: 'number', min: 0, max: 300, half: true, createOnly: true, help: 'יוצר רשימת מודולים שאפשר לשנות את שמם אחר כך' },
        { k: 'estimatedHours', label: 'משך משוער (שעות)', type: 'number', min: 0, max: 2000, half: true },
        { k: 'startDate', label: 'תאריך התחלה', type: 'date', half: true },
        { k: 'targetDate', label: 'יעד לסיום', type: 'date', half: true },
        { k: 'personalNotes', label: 'הערות אישיות', type: 'textarea', max: 6000 },
        { k: 'takeaways', label: 'תובנות מרכזיות', type: 'textarea', max: 6000 },
        { k: 'certificateUrl', label: 'קישור לתעודת סיום', type: 'url' },
        { k: 'songIds', label: 'שירים קשורים', type: 'refs', ref: 'songs' },
        { k: 'lessonIds', label: 'שיעורים קשורים', type: 'refs', ref: 'lessons' }
      ]
    },
    tasks: {
      label: 'משימה', plural: 'משימות',
      fields: [
        { k: 'title', label: 'כותרת', type: 'text', req: true, max: 160 },
        { k: 'description', label: 'תיאור', type: 'textarea', max: 4000 },
        { k: 'dueDate', label: 'תאריך יעד', type: 'date', half: true },
        { k: 'priority', label: 'עדיפות', type: 'select', options: opts(LABELS.priority), def: 'medium', half: true },
        { k: 'category', label: 'קטגוריה', type: 'select', options: opts(LABELS.taskCategory), def: 'other', half: true },
        { k: 'estimate', label: 'משך משוער (דקות)', type: 'number', min: 0, max: 1440, half: true },
        { k: 'recurrence', label: 'חזרתיות', type: 'select', options: opts(LABELS.recurrence), def: 'none', half: true },
        { k: 'songId', label: 'שיר מקושר', type: 'ref', ref: 'songs', half: true },
        { k: 'lessonId', label: 'שיעור מקושר', type: 'ref', ref: 'lessons', half: true },
        { k: 'courseId', label: 'קורס מקושר', type: 'ref', ref: 'courses', half: true },
        { k: 'subtasks', label: 'תתי-משימות', type: 'subtasks' },
        { k: 'notes', label: 'הערות', type: 'textarea', max: 4000 }
      ]
    },
    goals: {
      label: 'יעד', plural: 'יעדים',
      fields: [
        { k: 'title', label: 'כותרת היעד', type: 'text', req: true, max: 140 },
        { k: 'description', label: 'תיאור', type: 'textarea', max: 2000 },
        { k: 'period', label: 'טווח', type: 'select', options: opts(LABELS.goalPeriod), def: 'monthly', half: true },
        { k: 'category', label: 'קטגוריה', type: 'select', options: opts(LABELS.goalCategory), def: 'songs', half: true },
        { k: 'metric', label: 'אופן המדידה', type: 'select', options: opts(LABELS.goalMetric), def: 'manual', half: true, help: 'מדידה אוטומטית סופרת רשומות אמיתיות מתאריך ההתחלה' },
        { k: 'target', label: 'ערך יעד', type: 'number', min: 1, max: 100000, def: 5, req: true, half: true },
        { k: 'current', label: 'ערך נוכחי (במעקב ידני)', type: 'number', min: 0, max: 100000, def: 0, half: true },
        { k: 'startDate', label: 'תאריך התחלה', type: 'date', half: true, def: function () { return U.todayKey(); } },
        { k: 'deadline', label: 'מועד יעד', type: 'date', half: true },
        { k: 'priority', label: 'עדיפות', type: 'select', options: opts(LABELS.priority), def: 'medium', half: true },
        { k: 'status', label: 'סטטוס', type: 'select', options: opts(LABELS.goalStatus), def: 'active', half: true },
        { k: 'reward', label: 'תגמול XP בהשלמה', type: 'number', min: 0, max: 500, def: 40, half: true },
        { k: 'songIds', label: 'שירים קשורים', type: 'refs', ref: 'songs' },
        { k: 'courseIds', label: 'קורסים קשורים', type: 'refs', ref: 'courses' },
        { k: 'lessonIds', label: 'שיעורים קשורים', type: 'refs', ref: 'lessons' }
      ]
    },
    events: {
      label: 'אירוע', plural: 'אירועים',
      fields: [
        { k: 'title', label: 'כותרת', type: 'text', req: true, max: 120 },
        { k: 'kind', label: 'סוג', type: 'select', options: opts(LABELS.eventKind), def: 'reminder', half: true },
        { k: 'date', label: 'תאריך', type: 'date', req: true, half: true },
        { k: 'time', label: 'שעת התחלה', type: 'time', half: true },
        { k: 'duration', label: 'משך (דקות)', type: 'number', min: 0, max: 1440, def: 60, half: true },
        { k: 'location', label: 'מיקום', type: 'text', max: 120 },
        { k: 'description', label: 'פרטים', type: 'textarea', max: 2000 },
        { k: 'reminder', label: 'תזכורת', type: 'select', options: opts(LABELS.reminder), def: '60', half: true }
      ]
    },
    journal: {
      label: 'רשומת יומן', plural: 'רשומות יומן',
      fields: [
        { k: 'date', label: 'תאריך', type: 'date', req: true, half: true, def: function () { return U.todayKey(); } },
        { k: 'title', label: 'כותרת', type: 'text', max: 140, half: true, ph: 'מה היה היום?' },
        { k: 'body', label: 'מה למדתי, מה לזכור, שאלות ותובנות', type: 'markdown', max: 50000 },
        { k: 'tags', label: 'תגיות', type: 'tags' },
        { k: 'favorite', label: 'מועדף', type: 'checkbox' }
      ]
    },
    resources: {
      label: 'משאב', plural: 'משאבים',
      fields: [
        { k: 'title', label: 'שם המשאב', type: 'text', req: true, max: 140 },
        { k: 'kind', label: 'סוג', type: 'select', options: opts(LABELS.resourceKind), def: 'sheet', half: true },
        { k: 'folder', label: 'תיקייה', type: 'text', max: 60, half: true, ph: 'למשל: שופן' , datalist: function () { return PS.store.distinct('resources', 'folder'); } },
        { k: 'url', label: 'קישור חיצוני', type: 'url' },
        { k: 'file', label: 'קובץ מקומי (נשמר רק בדפדפן הזה)', type: 'file' },
        { k: 'notes', label: 'הערות', type: 'textarea', max: 2000 },
        { k: 'songId', label: 'שיר מקושר', type: 'ref', ref: 'songs', half: true },
        { k: 'courseId', label: 'קורס מקושר', type: 'ref', ref: 'courses', half: true },
        { k: 'tags', label: 'תגיות', type: 'tags' },
        { k: 'favorite', label: 'מועדף', type: 'checkbox' }
      ]
    }
  };

  function genreOptions() {
    var g = (PS.prefs.get('genres') || DEFAULT_GENRES).slice();
    PS.store.list('songs').forEach(function (s) { if (s.genre && g.indexOf(s.genre) < 0) g.push(s.genre); });
    return g.map(function (x) { return { value: x, label: x }; });
  }

  function resolve(v) { return typeof v === 'function' ? v() : v; }

  /* Default values for a new record */
  function defaults(coll) {
    var out = {};
    (S[coll] ? S[coll].fields : []).forEach(function (f) {
      if (f.def !== undefined) out[f.k] = resolve(f.def);
      else if (f.type === 'tags' || f.type === 'refs' || f.type === 'links' || f.type === 'subtasks') out[f.k] = [];
      else if (f.type === 'checkbox') out[f.k] = false;
    });
    return out;
  }

  /*
   * Coerce + validate a record against its schema.
   * Returns { value, errors } — errors is a map key -> Hebrew message.
   * Unknown keys are preserved (domain fields such as completedAt, modules, history).
   */
  function validate(coll, rec, opt) {
    opt = opt || {};
    var def = S[coll];
    var out = Object.assign({}, rec);
    var errors = {};
    if (!def) return { value: out, errors: errors };
    def.fields.forEach(function (f) {
      var v = out[f.k];
      switch (f.type) {
        case 'text': case 'textarea': case 'markdown':
          v = v === undefined || v === null ? '' : String(v);
          v = f.type === 'text' ? v.trim() : v.replace(/\s+$/, '');
          if (f.max && v.length > f.max) { errors[f.k] = 'עד ' + f.max + ' תווים'; v = v.slice(0, f.max); }
          if (f.req && !v) errors[f.k] = 'שדה חובה';
          break;
        case 'url':
          v = v ? String(v).trim() : '';
          if (v && !U.safeUrl(v)) errors[f.k] = 'כתובת לא תקינה (נדרש http/https)';
          else if (v) v = U.safeUrl(v);
          break;
        case 'number': case 'range':
          if (v === '' || v === undefined || v === null) { v = f.req ? NaN : null; }
          else v = Number(v);
          if (v !== null && isNaN(v)) { if (f.req) errors[f.k] = 'נדרש מספר'; v = null; }
          if (v !== null) {
            if (f.min !== undefined && v < f.min) errors[f.k] = 'מינימום ' + f.min;
            if (f.max !== undefined && v > f.max) errors[f.k] = 'מקסימום ' + f.max;
          }
          break;
        case 'date':
          v = v ? String(v).slice(0, 10) : '';
          if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.k] = 'תאריך לא תקין';
          if (f.req && !v) errors[f.k] = 'שדה חובה';
          break;
        case 'time':
          v = v ? String(v).slice(0, 5) : '';
          if (v && !/^\d{1,2}:\d{2}$/.test(v)) errors[f.k] = 'שעה לא תקינה';
          break;
        case 'select':
          v = v === undefined || v === null ? '' : String(v);
          if (!f.allowNew && v) {
            var allowed = resolve(f.options).map(function (o) { return String(o.value); });
            if (allowed.indexOf(v) < 0) { if (opt.lenient) v = f.def !== undefined ? String(resolve(f.def)) : ''; else errors[f.k] = 'ערך לא חוקי'; }
          }
          if (v.length > 80) v = v.slice(0, 80);
          break;
        case 'checkbox':
          v = !!v;
          break;
        case 'tags':
          if (typeof v === 'string') v = v.split(',');
          v = Array.isArray(v) ? v.map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 30) : [];
          v = v.filter(function (t, i) { return v.indexOf(t) === i; });
          break;
        case 'refs':
          v = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
          break;
        case 'ref':
          v = typeof v === 'string' && v ? v : '';
          break;
        case 'links':
          v = Array.isArray(v) ? v.map(function (l) {
            return { label: String((l && l.label) || '').slice(0, 120), url: U.safeUrl(l && l.url) };
          }).filter(function (l) { return l.url; }) : [];
          break;
        case 'subtasks':
          v = Array.isArray(v) ? v.map(function (s) {
            return { id: (s && s.id) || U.uid('st'), title: String((s && s.title) || '').slice(0, 160), done: !!(s && s.done) };
          }).filter(function (s) { return s.title; }) : [];
          break;
        case 'file':
          v = v && typeof v === 'object' ? { id: String(v.id || ''), name: String(v.name || ''), size: +v.size || 0, type: String(v.type || '') } : null;
          if (v && !v.id) v = null;
          break;
      }
      out[f.k] = v;
    });
    // cross-field checks
    if (coll === 'goals' && out.metric === 'manual' && out.current > out.target * 10) errors.current = 'ערך לא סביר';
    if (coll === 'resources' && !out.url && !out.file && !opt.lenient) errors.url = 'נדרש קישור או קובץ מקומי';
    return { value: out, errors: errors };
  }

  PS.schema = { defs: S, labels: LABELS, opts: opts, defaults: defaults, validate: validate, resolve: resolve, DEFAULT_GENRES: DEFAULT_GENRES };
})();
