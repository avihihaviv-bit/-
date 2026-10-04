/* Piano Studio — in-app notification center + reminder scanner.
 * Reminders are generated while the app is open (on load and every minute).
 * There is no push server, so nothing can fire while the app is fully closed;
 * the Settings page states this limitation explicitly.
 */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var TYPE_PREF = { lesson: 'notifyLessons', task: 'notifyTasks', goal: 'notifyGoals', course: 'notifyCourses', level: 'notifyLevel', achievement: 'notifyAchievements', event: 'notifyLessons' };

  function list() { return PS.store.list('notifications').sort(U.byKey('at', 'desc')); }
  function unread() { return PS.store.list('notifications').filter(function (n) { return !n.read; }).length; }

  function push(type, title, body, opt) {
    opt = opt || {};
    var pref = TYPE_PREF[type];
    if (pref && PS.prefs.get(pref) === false) return null;
    if (opt.key && PS.store.list('notifications').some(function (n) { return n.key === opt.key; })) return null;
    var rec = PS.store.putRaw('notifications', {
      id: U.uid('ntf'), type: type, title: title, body: body || '', key: opt.key || null,
      refColl: opt.refColl || null, refId: opt.refId || null, href: opt.href || null, read: false, at: U.nowISO()
    });
    // trim
    var all = list();
    if (all.length > 150) all.slice(150).forEach(function (n) { PS.db.del('notifications', n.id); });
    maybeBrowser(rec);
    return rec;
  }

  function maybeBrowser(rec) {
    if (!PS.prefs.get('browserNotifications')) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return; // in-app UI already shows it
    try { new Notification(rec.title, { body: rec.body, icon: 'icons/icon-192.png', tag: rec.key || rec.id, lang: 'he', dir: 'rtl' }); } catch (e) {}
  }

  function markRead(id) {
    var n = PS.store.get('notifications', id);
    if (n && !n.read) PS.store.putRaw('notifications', Object.assign({}, n, { read: true }));
  }
  function markAllRead() {
    PS.store.batch(function () {
      PS.store.list('notifications').forEach(function (n) { if (!n.read) PS.store.putRaw('notifications', Object.assign({}, n, { read: true })); });
    });
  }
  function clearAll() {
    PS.store.batch(function () { PS.store.list('notifications').forEach(function (n) { PS.db.del('notifications', n.id); }); PS.store.emit('notifications'); });
  }

  /* Generate due reminders from real records. Each reminder is keyed so it appears once. */
  function scan() {
    var now = new Date();
    var today = U.todayKey();
    PS.store.list('lessons').forEach(function (l) {
      if (l.status !== 'upcoming' && l.status !== 'rescheduled') return;
      var start = U.combine(l.date, l.time);
      if (!start) return;
      var mins = (start - now) / 60000;
      var lead = +l.reminder || 0;
      if (lead > 0 && mins > 0 && mins <= lead) {
        push('lesson', 'שיעור בקרוב: ' + l.title, 'מתחיל ב-' + U.fmtTime(start) + (l.location ? ' · ' + l.location : ''), { key: 'lesson-rem:' + l.id + ':' + l.date + l.time, refColl: 'lessons', refId: l.id, href: '#/lessons/' + l.id });
      }
    });
    PS.store.list('events').forEach(function (e) {
      var start = U.combine(e.date, e.time || '09:00');
      var lead = +e.reminder || 0;
      var mins = (start - now) / 60000;
      if (lead > 0 && mins > 0 && mins <= lead) push('event', 'תזכורת: ' + e.title, U.fmtDateTime(start), { key: 'event-rem:' + e.id + ':' + e.date, refColl: 'events', refId: e.id, href: '#/calendar' });
    });
    PS.store.list('tasks').forEach(function (t) {
      if (t.done || !t.dueDate) return;
      if (t.dueDate === today) push('task', 'משימה להיום: ' + t.title, 'מועד היעד הוא היום', { key: 'task-due:' + t.id + ':' + t.dueDate, refColl: 'tasks', refId: t.id, href: '#/tasks' });
      else if (t.dueDate < today) push('task', 'משימה באיחור: ' + t.title, 'מועד היעד היה ' + U.fmtDate(t.dueDate), { key: 'task-over:' + t.id + ':' + t.dueDate, refColl: 'tasks', refId: t.id, href: '#/tasks' });
    });
    PS.store.list('goals').forEach(function (g) {
      if (g.status !== 'active' || !g.deadline) return;
      var d = U.daysBetween(now, g.deadline);
      if (d >= 0 && d <= 3) push('goal', 'יעד מתקרב: ' + g.title, d === 0 ? 'מועד היעד היום' : 'נותרו ' + d + ' ימים', { key: 'goal-dl:' + g.id + ':' + g.deadline, refColl: 'goals', refId: g.id, href: '#/goals' });
    });
    PS.store.list('courses').forEach(function (c) {
      if (c.status === 'completed' || !c.targetDate) return;
      var d = U.daysBetween(now, c.targetDate);
      if (d >= 0 && d <= 7) push('course', 'יעד קורס מתקרב: ' + c.title, 'הושלמו ' + Math.round(PS.domain.courseProgress(c) * 100) + '% · ' + (d === 0 ? 'היעד היום' : 'נותרו ' + d + ' ימים'), { key: 'course-dl:' + c.id + ':' + c.targetDate, refColl: 'courses', refId: c.id, href: '#/courses/' + c.id });
    });
  }

  var timer = null;
  function start() { scan(); clearInterval(timer); timer = setInterval(scan, 60000); }

  function requestBrowserPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return Notification.requestPermission();
  }

  PS.notify = { list: list, unread: unread, push: push, markRead: markRead, markAllRead: markAllRead, clearAll: clearAll, scan: scan, start: start, requestBrowserPermission: requestBrowserPermission };
})();
