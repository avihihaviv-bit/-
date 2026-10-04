/* Piano Studio — XP, levels and achievements.
 * Every XP grant is an individual, auditable event keyed by a stable "award key"
 * (e.g. "task:<id>"). A key can be granted at most once — un-completing and
 * re-completing a record never pays twice. Corrections are explicit: an event can
 * be revoked/restored, and manual adjustments are logged as their own events.
 */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var XP = {
    task: 10,
    lesson: 30,
    module: 20,
    course: 100,
    song: 75,
    weekly: 50
  };

  var TITLES = [
    'מתחיל מוזיקלי',     // 1 Musical Beginner
    'חוקר תווים',        // 2 Note Explorer
    'שומר קצב',          // 3 Rhythm Keeper
    'בונה מנגינות',      // 4 Melody Builder
    'חובב פסנתר',        // 5 Piano Enthusiast
    'שוליית מוזיקה',     // 6 Musical Apprentice
    'פסנתרן מסור',       // 7 Dedicated Pianist
    'מחפש הרמוניה',      // 8 Harmony Seeker
    'וירטואוז בדרך',     // 9 Virtuoso in Progress
    'מאסטר פסנתר',       // 10 Piano Master
    'אמן הקלידים',       // 11
    'משורר הצלילים',     // 12
    'אדריכל הרמוניות',   // 13
    'מאסטרו',            // 14
    'אגדת הפסנתר'        // 15
  ];

  /* XP required to advance from `level` to `level + 1` (nonlinear). */
  function xpToNext(level) { return Math.round(100 + 35 * Math.pow(Math.max(0, level - 1), 1.45)); }

  function titleFor(level) {
    if (level <= TITLES.length) return TITLES[level - 1];
    return TITLES[TITLES.length - 1] + ' · דרגה ' + (level - TITLES.length + 1);
  }

  /* Pure: derive level progress from lifetime XP. */
  function levelFromXP(total) {
    total = Math.max(0, Math.floor(total || 0));
    var level = 1, rest = total;
    while (rest >= xpToNext(level) && level < 999) { rest -= xpToNext(level); level++; }
    var need = xpToNext(level);
    return { level: level, lifetime: total, into: rest, need: need, remaining: need - rest, pct: need ? rest / need : 0, title: titleFor(level), nextTitle: titleFor(level + 1) };
  }

  function events() { return PS.store.list('xp').sort(U.byKey('at', 'desc')); }
  function lifetimeXP() {
    return PS.store.list('xp').reduce(function (s, e) { return e.revoked ? s : s + (e.amount || 0); }, 0);
  }
  function info() { return levelFromXP(lifetimeXP()); }
  function hasKey(key) { return PS.store.list('xp').some(function (e) { return e.key === key; }); }

  /* Grant XP once per key. Returns the event, or null if the key was already used. */
  function award(key, amount, reason, ref) {
    if (!key || !amount || hasKey(key)) return null;
    var before = info();
    var ev = PS.store.putRaw('xp', { id: U.uid('xp'), key: key, amount: amount, reason: reason, refColl: ref && ref.coll, refId: ref && ref.id, at: U.nowISO(), kind: 'auto' });
    afterChange(before, amount, reason);
    return ev;
  }

  function adjust(amount, reason) {
    amount = Math.round(+amount || 0);
    if (!amount) return null;
    var before = info();
    var ev = PS.store.putRaw('xp', { id: U.uid('xp'), key: 'manual:' + U.uid(), amount: amount, reason: reason || 'תיקון ידני', at: U.nowISO(), kind: 'manual' });
    PS.store.log('xp', 'תיקון XP ידני: ' + U.xp(amount) + ' · ' + (reason || ''));
    afterChange(before, amount, reason, true);
    return ev;
  }
  function setRevoked(id, revoked) {
    var ev = PS.store.get('xp', id);
    if (!ev) return;
    var before = info();
    PS.store.putRaw('xp', Object.assign({}, ev, { revoked: !!revoked, revokedAt: revoked ? U.nowISO() : null }));
    PS.store.log('xp', (revoked ? 'בוטל אירוע XP: ' : 'שוחזר אירוע XP: ') + ev.reason + ' (' + ev.amount + ')');
    afterChange(before, revoked ? -ev.amount : ev.amount, ev.reason, true);
  }

  function afterChange(before, amount, reason, silent) {
    var after = info();
    if (!silent && amount > 0 && PS.prefs.get('xpToasts') && PS.fx) PS.fx.xpToast(amount, reason);
    if (after.level > before.level) {
      for (var l = before.level + 1; l <= after.level; l++) {
        if (PS.notify) PS.notify.push('level', 'עלית לרמה ' + l + '!', 'התואר החדש שלך: ' + titleFor(l), { key: 'level:' + l });
        PS.store.log('level', 'עלייה לרמה ' + l + ' · ' + titleFor(l));
      }
      if (PS.fx && PS.prefs.get('levelUpAnimation')) PS.fx.levelUp(after.level, titleFor(after.level), amount);
      else if (PS.ui) PS.ui.toast('עלית לרמה ' + after.level + ' · ' + titleFor(after.level), 'gold');
    }
  }

  /* ---------------- achievements ---------------- */

  /* Snapshot of real tracked counts. Demo records never count toward achievements. */
  function counts() {
    function real(c) { return PS.store.list(c).filter(function (r) { return !r.demo; }); }
    var lessons = real('lessons'), songs = real('songs'), courses = real('courses'), tasks = real('tasks'), goals = real('goals');
    var modulesDone = 0;
    courses.forEach(function (c) { (c.modules || []).forEach(function (m) { if (m.done) modulesDone++; }); });
    return {
      lessons: lessons.length,
      lessonsDone: lessons.filter(function (l) { return l.status === 'completed'; }).length,
      songs: songs.length,
      songsLearned: songs.filter(function (s) { return s.status === 'learned'; }).length,
      favorites: songs.filter(function (s) { return s.favorite; }).length,
      coursesStarted: courses.filter(function (c) { return c.status === 'in_progress' || c.status === 'completed' || (c.modules || []).some(function (m) { return m.done; }); }).length,
      coursesDone: courses.filter(function (c) { return c.status === 'completed'; }).length,
      modulesDone: modulesDone,
      tasksDone: tasks.filter(function (t) { return t.done; }).length,
      notes: real('notes').length,
      journal: real('journal').length,
      resources: real('resources').length,
      goalsDone: goals.filter(function (g) { return g.status === 'completed'; }).length,
      monthlyGoalsDone: goals.filter(function (g) { return g.status === 'completed' && g.period === 'monthly'; }).length,
      milestonesDone: goals.filter(function (g) { return g.status === 'completed' && g.category === 'milestone'; }).length,
      weeklyGoalsHit: PS.store.list('xp').filter(function (e) { return e.key && e.key.indexOf('weekly-goal:') === 0 && !e.revoked; }).length,
      level: info().level
    };
  }

  function A(id, cat, rarity, icon, name, desc, field, target) {
    return { id: id, cat: cat, rarity: rarity, icon: icon, name: name, desc: desc, field: field, target: target };
  }
  var ACH = [
    A('first-lesson', 'lessons', 'common', 'calendar', 'השיעור הראשון נרשם', 'רשמת את השיעור הראשון שלך במערכת', 'lessons', 1),
    A('first-lesson-done', 'lessons', 'common', 'check', 'נוכחות ראשונה', 'סימנת שיעור ראשון כהושלם', 'lessonsDone', 1),
    A('five-lessons', 'lessons', 'rare', 'medal', 'חמישה שיעורים', 'השלמת 5 שיעורי פסנתר', 'lessonsDone', 5),
    A('twenty-lessons', 'lessons', 'epic', 'crown', 'תלמיד מתמיד', 'השלמת 20 שיעורי פסנתר', 'lessonsDone', 20),
    A('first-song', 'songs', 'common', 'music', 'השיר הראשון בספרייה', 'הוספת את השיר הראשון לספרייה', 'songs', 1),
    A('first-song-learned', 'songs', 'rare', 'star', 'השיר הראשון נלמד', 'סימנת שיר ראשון כנלמד', 'songsLearned', 1),
    A('five-songs-learned', 'songs', 'epic', 'disc', 'רפרטואר מתגבש', 'למדת 5 שירים', 'songsLearned', 5),
    A('ten-songs-learned', 'songs', 'legendary', 'trophy', 'עשרה שירים', 'למדת 10 שירים', 'songsLearned', 10),
    A('favorites-five', 'songs', 'common', 'heart', 'אוסף אהבות', 'סימנת 5 שירים כמועדפים', 'favorites', 5),
    A('first-course-started', 'courses', 'common', 'book', 'הקורס הראשון התחיל', 'התחלת ללמוד קורס ראשון', 'coursesStarted', 1),
    A('first-module', 'courses', 'common', 'layers', 'מודול ראשון', 'השלמת מודול ראשון בקורס', 'modulesDone', 1),
    A('first-course-done', 'courses', 'epic', 'graduation', 'בוגר קורס', 'השלמת את הקורס הראשון', 'coursesDone', 1),
    A('five-courses-done', 'courses', 'legendary', 'crown', 'חמישה קורסים', 'השלמת 5 קורסים', 'coursesDone', 5),
    A('ten-tasks', 'organization', 'common', 'list', 'מסודר', 'השלמת 10 משימות', 'tasksDone', 10),
    A('fifty-tasks', 'organization', 'rare', 'list', 'מכונת ארגון', 'השלמת 50 משימות', 'tasksDone', 50),
    A('organized-week', 'organization', 'rare', 'sparkle', 'שבוע מאורגן', 'עמדת ביעד השבועי שלך', 'weeklyGoalsHit', 1),
    A('first-note', 'organization', 'common', 'note', 'המחברת נפתחה', 'כתבת את הפתק הראשון במחברת השיעורים', 'notes', 1),
    A('ten-notes', 'organization', 'rare', 'note', 'מחברת עשירה', 'כתבת 10 פתקים', 'notes', 10),
    A('first-journal', 'organization', 'common', 'pen', 'יומן מוזיקלי', 'כתבת רשומת יומן ראשונה', 'journal', 1),
    A('first-resource', 'organization', 'common', 'folder', 'ספרן', 'שמרת משאב ראשון בספרייה', 'resources', 1),
    A('first-goal', 'goals', 'rare', 'target', 'יעד הושג', 'השגת יעד אישי ראשון', 'goalsDone', 1),
    A('monthly-goal', 'goals', 'rare', 'calendar', 'יעד חודשי הושג', 'השגת יעד חודשי', 'monthlyGoalsDone', 1),
    A('personal-milestone', 'goals', 'epic', 'flag', 'אבן דרך אישית', 'השלמת אבן דרך אישית משמעותית', 'milestonesDone', 1),
    A('level-5', 'goals', 'rare', 'bolt', 'רמה 5', 'הגעת לרמה 5', 'level', 5),
    A('level-10', 'goals', 'legendary', 'bolt', 'רמה 10', 'הגעת לרמה 10', 'level', 10)
  ];
  var ACH_CATS = { lessons: 'שיעורים', songs: 'שירים', courses: 'קורסים', organization: 'ארגון', goals: 'יעדים ורמות' };
  var RARITY = { common: 'נפוץ', rare: 'נדיר', epic: 'אפי', legendary: 'אגדי' };

  function achievementState() {
    var c = counts();
    return ACH.map(function (a) {
      var rec = PS.store.get('achievements', a.id);
      var cur = Math.min(c[a.field] || 0, a.target);
      return Object.assign({}, a, { unlocked: !!rec, unlockedAt: rec && rec.unlockedAt, current: cur, met: (c[a.field] || 0) >= a.target });
    });
  }

  function checkAchievements() {
    var c = counts();
    ACH.forEach(function (a) {
      if ((c[a.field] || 0) >= a.target && !PS.store.get('achievements', a.id)) {
        PS.store.putRaw('achievements', { id: a.id, unlockedAt: U.nowISO() });
        PS.store.log('achievement', 'הישג נפתח: ' + a.name, { coll: 'achievements', id: a.id });
        if (PS.notify) PS.notify.push('achievement', 'הישג חדש: ' + a.name, a.desc, { key: 'ach:' + a.id });
        if (PS.fx && PS.prefs.get('achievementAnimation')) PS.fx.achievement(a);
      }
    });
  }

  /* ---------------- weekly learning goal ---------------- */
  /* Learning actions = completed tasks + completed lessons + completed modules + learned songs. */
  function actionsInRange(from, to) {
    var n = 0;
    function inR(iso) { var d = U.toDate(iso); return d && d >= from && d < to; }
    PS.store.list('tasks').forEach(function (t) { if (t.done && inR(t.completedAt)) n++; });
    PS.store.list('lessons').forEach(function (l) { if (l.status === 'completed' && inR(l.completedAt)) n++; });
    PS.store.list('songs').forEach(function (s) { if (s.status === 'learned' && inR(s.learnedAt)) n++; });
    PS.store.list('courses').forEach(function (c) { (c.modules || []).forEach(function (m) { if (m.done && inR(m.doneAt)) n++; }); });
    return n;
  }
  function weekly() {
    var from = U.startOfWeek(new Date());
    var to = U.addDays(from, 7);
    var target = Math.max(1, +PS.prefs.get('weeklyGoal') || 5);
    var done = actionsInRange(from, to);
    return { done: done, target: target, pct: Math.min(1, done / target), reached: done >= target, weekKey: U.dkey(from) };
  }
  function checkWeekly() {
    var w = weekly();
    if (w.reached) {
      var ev = award('weekly-goal:' + w.weekKey, XP.weekly, 'עמידה ביעד השבועי', null);
      if (ev) {
        PS.store.log('goal', 'היעד השבועי הושג (' + w.done + '/' + w.target + ')');
        if (PS.fx) PS.fx.confetti();
      }
    }
  }

  PS.game = {
    XP: XP, TITLES: TITLES, ACH: ACH, ACH_CATS: ACH_CATS, RARITY: RARITY,
    xpToNext: xpToNext, levelFromXP: levelFromXP, titleFor: titleFor,
    info: info, events: events, lifetimeXP: lifetimeXP, award: award, adjust: adjust, setRevoked: setRevoked, hasKey: hasKey,
    counts: counts, achievementState: achievementState, checkAchievements: checkAchievements,
    weekly: weekly, checkWeekly: checkWeekly, actionsInRange: actionsInRange
  };
})();
