/* Piano Studio — domain rules: status transitions, completion timestamps, XP triggers,
 * history, recurring tasks, course modules and goal tracking. Called by the store. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var XP = function () { return PS.game.XP; };

  /* ---------- course helpers ---------- */
  function courseProgress(c) {
    var mods = c.modules || [];
    if (!mods.length) return c.status === 'completed' ? 1 : 0;
    return mods.filter(function (m) { return m.done; }).length / mods.length;
  }

  function beforeSave(coll, prev, next) {
    var now = U.nowISO();
    switch (coll) {
      case 'tasks':
        next.done = !!next.done;
        if (next.done && !(prev && prev.done)) next.completedAt = now;
        if (!next.done) next.completedAt = null;
        break;

      case 'lessons':
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) next.completedAt = next.completedAt && prev ? next.completedAt : now;
        if (next.status !== 'completed') next.completedAt = null;
        break;

      case 'songs':
        next.history = Array.isArray(next.history) ? next.history.slice() : [];
        next.priority = typeof next.priority === 'number' ? next.priority : Date.now();
        if (!prev) next.history.push({ at: now, type: 'added', to: next.status });
        else if (prev.status !== next.status) next.history.push({ at: now, type: 'status', from: prev.status, to: next.status });
        if (next.status === 'learned') {
          if (!(prev && prev.status === 'learned')) { next.learnedAt = now; next.progress = 100; }
        } else next.learnedAt = null;
        if (next.status === 'learning' && !next.startedAt) next.startedAt = now;
        // progress milestones (25/50/75/100) recorded once each
        next.milestones = Object.assign({}, next.milestones || {});
        [25, 50, 75, 100].forEach(function (m) {
          if ((next.progress || 0) >= m && !next.milestones[m]) {
            next.milestones[m] = now;
            if (prev) next.history.push({ at: now, type: 'progress', to: m });
          }
        });
        if (next.history.length > 80) next.history = next.history.slice(-80);
        break;

      case 'courses':
        next.modules = Array.isArray(next.modules) ? next.modules.map(function (m) { return Object.assign({}, m); }) : [];
        if (!prev && next.moduleCount && !next.modules.length) {
          for (var i = 1; i <= next.moduleCount; i++) next.modules.push({ id: U.uid('mod'), title: 'מודול ' + i, done: false, notes: '', url: '' });
        }
        delete next.moduleCount;
        var prevMods = {};
        ((prev && prev.modules) || []).forEach(function (m) { prevMods[m.id] = m; });
        next.modules.forEach(function (m) {
          if (!m.id) m.id = U.uid('mod');
          if (m.done && !(prevMods[m.id] && prevMods[m.id].done)) m.doneAt = now;
          if (!m.done) m.doneAt = null;
        });
        next.timeLog = Array.isArray(next.timeLog) ? next.timeLog : [];
        var p = courseProgress(next);
        if (next.modules.length && p === 1 && next.status !== 'completed') next.status = 'completed';
        if (next.modules.some(function (m) { return m.done; }) && (next.status === 'planned' || next.status === 'wishlist')) next.status = 'in_progress';
        if (next.status === 'in_progress' && !next.startDate) next.startDate = U.todayKey();
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) next.completedAt = now;
        if (next.status !== 'completed') next.completedAt = null;
        next.milestones = Object.assign({}, next.milestones || {});
        [25, 50, 75, 100].forEach(function (m) { if (Math.round(courseProgress(next) * 100) >= m && !next.milestones[m]) next.milestones[m] = now; });
        break;

      case 'goals':
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) next.completedAt = now;
        if (next.status !== 'completed') next.completedAt = null;
        break;

      case 'notes':
      case 'journal':
        if (prev && (prev.body !== next.body || prev.title !== next.title)) {
          next.history = (prev.history || []).concat([{ at: prev.updatedAt, title: prev.title, body: prev.body }]).slice(-15);
        }
        break;
    }
    return next;
  }

  function afterSave(coll, prev, next) {
    var title = next.title || next.name || '';
    var ref = { coll: coll, id: next.id };
    var isNew = !prev;
    if (isNew && !next.demo) {
      var verb = { practice: null, lessons: 'נוסף שיעור', notes: 'נכתב פתק', songs: 'נוסף שיר', courses: 'נוסף קורס', tasks: 'נוספה משימה', goals: 'הוגדר יעד', events: 'נוסף אירוע ליומן', journal: 'נכתבה רשומת יומן', resources: 'נשמר משאב', collections: 'נוצר אוסף' }[coll];
      if (verb) PS.store.log('create', verb + (title ? ': ' + title : ''), ref);
    }

    switch (coll) {
      case 'tasks':
        if (next.done && !(prev && prev.done)) {
          PS.store.log('task', 'משימה הושלמה: ' + title, ref);
          PS.game.award('task:' + next.id, XP().task, 'משימה הושלמה · ' + title, ref);
          spawnRecurrence(next);
        }
        break;
      case 'lessons':
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) {
          PS.store.log('lesson', 'שיעור הושלם: ' + title, ref);
          PS.game.award('lesson:' + next.id, XP().lesson, 'השתתפות בשיעור · ' + title, ref);
        }
        if (prev && prev.status !== next.status && next.status === 'cancelled') PS.store.log('lesson', 'שיעור בוטל: ' + title, ref);
        break;
      case 'songs':
        if (next.status === 'learned' && !(prev && prev.status === 'learned')) {
          PS.store.log('song', 'שיר נלמד: ' + title, ref);
          var ev = PS.game.award('song:' + next.id, XP().song, 'שיר נלמד · ' + title, ref);
          if (PS.fx) PS.fx.celebrate('השיר נלמד!', title, ev ? ev.amount : 0);
        } else if (prev && prev.status !== next.status) {
          PS.store.log('song', 'סטטוס השיר "' + title + '" עודכן ל' + PS.schema.labels.songStatus[next.status], ref);
        } else if (prev && (prev.progress || 0) !== (next.progress || 0)) {
          var crossed = [25, 50, 75].filter(function (m) { return (prev.progress || 0) < m && next.progress >= m; });
          if (crossed.length) PS.store.log('song', 'התקדמות ב"' + title + '": ' + next.progress + '%', ref);
        }
        break;
      case 'courses':
        var prevMods = {};
        ((prev && prev.modules) || []).forEach(function (m) { prevMods[m.id] = m; });
        (next.modules || []).forEach(function (m) {
          if (m.done && !(prevMods[m.id] && prevMods[m.id].done) && prev) {
            PS.store.log('course', 'מודול הושלם: ' + m.title + ' · ' + title, ref);
            PS.game.award('module:' + next.id + ':' + m.id, XP().module, 'מודול הושלם · ' + m.title, ref);
          }
        });
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) {
          PS.store.log('course', 'קורס הושלם: ' + title, ref);
          var cev = PS.game.award('course:' + next.id, XP().course, 'קורס הושלם · ' + title, ref);
          if (PS.fx) PS.fx.celebrate('הקורס הושלם!', title, cev ? cev.amount : 0);
        } else if (prev && prev.status !== next.status && next.status === 'in_progress') {
          PS.store.log('course', 'התחלת את הקורס: ' + title, ref);
        }
        break;
      case 'goals':
        if (next.status === 'completed' && !(prev && prev.status === 'completed')) completeGoalEffects(next);
        break;
      case 'practice':
        if (next.demo) break;
        if (isNew) PS.store.log('practice', 'אימון נרשם: ' + U.fmtMinutes(next.minutes) + (next.focus ? ' · ' + next.focus : ''), ref);
        // one reward per practice day — logging several sessions on the same day pays once
        PS.game.award('practice-day:' + next.date, XP().practiceDay, 'יום אימון · ' + U.fmtDate(next.date), ref);
        break;
    }
    scheduleEvaluate();
  }

  function completeGoalEffects(g) {
    PS.store.log('goal', 'יעד הושג: ' + g.title, { coll: 'goals', id: g.id });
    var ev = PS.game.award('goal:' + g.id, Math.max(0, +g.reward || 0), 'יעד הושג · ' + g.title, { coll: 'goals', id: g.id });
    if (PS.fx) PS.fx.celebrate('היעד הושג!', g.title, ev ? ev.amount : 0);
  }

  /* Recurring tasks: completing an instance creates the next one exactly once. */
  function spawnRecurrence(t) {
    if (!t.recurrence || t.recurrence === 'none' || t.spawnedNextId) return;
    var base = t.dueDate || U.todayKey();
    var due = t.recurrence === 'daily' ? U.addDays(base, 1) : t.recurrence === 'weekly' ? U.addDays(base, 7) : U.addMonths(base, 1);
    var copy = {
      title: t.title, description: t.description, priority: t.priority, category: t.category, estimate: t.estimate,
      recurrence: t.recurrence, songId: t.songId, lessonId: t.lessonId, courseId: t.courseId, notes: t.notes,
      subtasks: (t.subtasks || []).map(function (s) { return { id: U.uid('st'), title: s.title, done: false }; }),
      dueDate: U.dkey(due), done: false, seriesId: t.seriesId || t.id
    };
    var nt = PS.store.create('tasks', copy);
    var cur = PS.store.get('tasks', t.id);
    PS.db.put('tasks', Object.assign({}, cur, { spawnedNextId: nt.id, seriesId: t.seriesId || t.id }));
  }

  /* ---------- goals: auto-tracked metrics ---------- */
  function goalCurrent(g) {
    if (!g.metric || g.metric === 'manual') return +g.current || 0;
    var from = U.toDate(g.startDate) || U.toDate(g.createdAt) || new Date(0);
    from = U.startOfDay(from);
    var to = g.deadline ? U.addDays(g.deadline, 1) : new Date(8640000000000000);
    function inR(iso) { var d = U.toDate(iso); return d && d >= from && d < to; }
    switch (g.metric) {
      case 'songs_learned': return PS.store.list('songs').filter(function (s) { return s.status === 'learned' && inR(s.learnedAt); }).length;
      case 'lessons_completed': return PS.store.list('lessons').filter(function (l) { return l.status === 'completed' && inR(l.completedAt); }).length;
      case 'courses_completed': return PS.store.list('courses').filter(function (c) { return c.status === 'completed' && inR(c.completedAt); }).length;
      case 'tasks_completed': return PS.store.list('tasks').filter(function (t) { return t.done && inR(t.completedAt); }).length;
      case 'practice_minutes': return PS.store.list('practice').reduce(function (s, p) { return inR(p.date) ? s + (+p.minutes || 0) : s; }, 0);
      case 'practice_days': var ds = {}; PS.store.list('practice').forEach(function (p) { if (inR(p.date)) ds[p.date] = 1; }); return Object.keys(ds).length;
      case 'notes_written': return PS.store.list('notes').filter(function (n) { return inR(n.createdAt); }).length;
      case 'favorite_songs': return PS.store.list('songs').filter(function (s) { return s.favorite; }).length;
      case 'modules_completed':
        var n = 0;
        PS.store.list('courses').forEach(function (c) { (c.modules || []).forEach(function (m) { if (m.done && inR(m.doneAt)) n++; }); });
        return n;
    }
    return 0;
  }
  function goalProgress(g) { var t = Math.max(1, +g.target || 1); return Math.min(1, goalCurrent(g) / t); }

  function checkGoals() {
    PS.store.list('goals').forEach(function (g) {
      if (g.status === 'active' && goalCurrent(g) >= (+g.target || 1)) {
        PS.store.update('goals', g.id, { status: 'completed' }, { force: true });
      }
    });
  }

  /* Debounced evaluation of derived rewards after any change. */
  var evalTimer = null;
  function scheduleEvaluate() {
    clearTimeout(evalTimer);
    evalTimer = setTimeout(evaluate, 30);
  }
  function evaluate() {
    try {
      checkGoals();
      PS.game.checkWeekly();
      PS.game.checkAchievements();
    } catch (e) { console.error(e); }
  }

  PS.domain = {
    beforeSave: beforeSave, afterSave: afterSave, evaluate: evaluate, scheduleEvaluate: scheduleEvaluate,
    courseProgress: courseProgress, goalCurrent: goalCurrent, goalProgress: goalProgress
  };
})();
