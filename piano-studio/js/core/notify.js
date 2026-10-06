/* Piano Studio — in-app notification center + reminder scanner.
 * Reminders are generated while the app is open (on load and every minute).
 * There is no push server, so nothing can fire while the app is fully closed;
 * the Settings page states this limitation explicitly.
 */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  var TYPE_PREF = { lesson: 'notifyLessons', task: 'notifyTasks', goal: 'notifyGoals', course: 'notifyCourses', level: 'notifyLevel', achievement: 'notifyAchievements', event: 'notifyLessons', practice: 'practiceReminder' };

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

  var REMINDER_TYPES = ['lesson', 'event', 'task', 'goal', 'course', 'practice'];
  function maybeBrowser(rec) {
    var visible = document.visibilityState === 'visible' && document.hasFocus();
    // in-app: reminders also appear as a toast when the app is in front
    if (visible && REMINDER_TYPES.indexOf(rec.type) >= 0 && PS.ui) {
      PS.ui.toast(rec.title, 'gold', { duration: 6000, action: rec.href ? { label: 'פתיחה', fn: function () { markRead(rec.id); PS.navigate(rec.href); } } : null });
      return;
    }
    if (visible) return;
    showSystem(rec.title, rec.body, rec.key || rec.id, rec.href);
  }
  /* System notification. Service-worker notifications are required on Android Chrome,
   * where `new Notification()` throws; fall back to the constructor on desktop. */
  function showSystem(title, body, tag, href) {
    if (!PS.prefs.get('browserNotifications')) return Promise.resolve(false);
    if (!('Notification' in window) || Notification.permission !== 'granted') return Promise.resolve(false);
    var opts = { body: body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: tag || String(Date.now()), lang: 'he', dir: 'rtl', data: { href: href || '#/' } };
    var viaSW = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null);
    return viaSW.then(function (reg) {
      if (reg && reg.showNotification) return reg.showNotification(title, opts).then(function () { return true; });
      new Notification(title, opts);
      return true;
    }).catch(function () {
      try { new Notification(title, opts); return true; } catch (e) { return false; }
    });
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
    // daily practice reminder (after the chosen time, only if nothing was logged today)
    if (PS.prefs.get('practiceReminder') && PS.practice) {
      var at = U.combine(today, PS.prefs.get('practiceReminderTime') || '19:00');
      if (at && now >= at && !PS.practice.today()) {
        var st = PS.practice.streak();
        push('practice', st.current >= 2 ? 'הרצף שלך בסכנה — ' + st.current + ' ימים' : 'עוד לא נרשם אימון היום',
          st.current >= 2 ? 'רשמו אימון היום כדי לשמור על הרצף' : 'גם 10 דקות נחשבות. רשמו את האימון כשתסיימו.',
          { key: 'practice-rem:' + today, href: '#/practice' });
      }
    }
    if (PS.prefs.lessons()) PS.store.list('lessons').forEach(function (l) {
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
  function start() {
    scan();
    clearInterval(timer);
    timer = setInterval(scan, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') scan(); });
    // a notification tapped while the app was closed/backgrounded asks us to navigate
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'navigate' && e.data.href) PS.navigate(e.data.href);
    });
  }
  function status() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return PS.prefs.get('browserNotifications') ? 'on' : 'off';
    return Notification.permission; // default | denied
  }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

  function requestBrowserPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return Notification.requestPermission();
  }

  PS.notify = { showSystem: showSystem, status: status, isIOS: isIOS, standalone: standalone, list: list, unread: unread, push: push, markRead: markRead, markAllRead: markAllRead, clearAll: clearAll, scan: scan, start: start, requestBrowserPermission: requestBrowserPermission };
})();
