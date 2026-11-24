/* Maslul extras: update checker, what's-new, shortcuts help, more dashboard widgets,
   and additions to the classic screens (fitness, money, learning).
   Loaded after features.js; it only extends MaslulFeatures through its public hooks. */
(function () {
  'use strict';
  var F = window.MaslulFeatures, C = window.MaslulCore;
  if (!F || !C) return;
  var APP_VERSION = '2026.11.24.2';
  var CHANGELOG = [
    { v: '2026.11.24.2', items: ['עמוד כושר חדש בלשוניות: אימון היום, התקדמות, תוכנית, יומן וספרייה', 'אימון לפי תוכנית: רישום סטים עם הצעה אוטומטית למשקל הבא (עומס מתקדם)', 'טיימר מנוחה שמתחיל לבד אחרי כל סט, וזיהוי שיאים חדשים', 'גרף התקדמות לכל תרגיל, נפח שבועי, איזון קבוצות שריר ומשקל גוף', 'עורך תוכנית: ימים, תרגילים, סטים, טווח חזרות ומנוחה', 'סיום אימון מסמן אוטומטית את הרגל "אימון"'] },
    { v: '2026.11.24.1', items: ['כפתור "בדוק עדכונים" בהגדרות ובתפריט, עם התראה כשיש גרסה חדשה', 'מטריצת אייזנהאואר, דחייה למחר ושכפול משימות', 'אירועים חוזרים וצבעים בלוח השנה, ותצוגת "סדר יום"', 'צלילי רקע ויעד יומי בפוקוס', 'מפת התמדה של 16 שבועות וייצוא CSV בנתונים', 'בכושר: טיימר מנוחה, נפח אימון שבועי ושיאים', 'בכסף: גרף חודשי והוצאה מובילה', 'בלמידה: ספירה לאחור למבחנים', 'בבית: 3 המשימות החשובות, רצועת שבוע, אירועי היום וצ׳ק-אין מצב רוח', 'תרגיל אקראי בעמוד הדיבור, היסטוריית סקירות, צבעים ומונה מילים לפתקים'] }
  ];

  function api() { return F.api(); }
  function U() { return F.util; }
  function S() { return api().state(); }
  function chain(id, fn) { var prev = F.hooks[id]; F.hooks[id] = function (el) { if (prev) prev(el); fn(el); }; }

  /* ================= updates ================= */
  var upd = { status: 'idle', remote: null, checkedAt: 0 };
  function checkForUpdates(manual) {
    if (location.protocol === 'file:') { upd.status = 'unsupported'; if (manual) api().toast('בדיקת עדכונים זמינה רק באתר עצמו', 'error'); paintUpdateUI(); return Promise.resolve(); }
    if (navigator.onLine === false) { upd.status = 'offline'; if (manual) api().toast('אין חיבור לאינטרנט', 'error'); paintUpdateUI(); return Promise.resolve(); }
    upd.status = 'checking'; paintUpdateUI();
    var swUpdate = (navigator.serviceWorker && navigator.serviceWorker.getRegistration) ? navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).catch(function () {}) : Promise.resolve();
    return Promise.all([swUpdate, fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })])
      .then(function (res) {
        var remote = res[1];
        upd.remote = remote; upd.checkedAt = Date.now();
        upd.status = remote.version && remote.version !== APP_VERSION ? 'available' : 'latest';
        if (manual) api().toast(upd.status === 'available' ? 'יש גרסה חדשה: ' + remote.version : 'יש לך את הגרסה האחרונה ✓', 'success');
        if (upd.status === 'available') showUpdateBanner();
        paintUpdateUI();
      })
      .catch(function () { upd.status = 'error'; if (manual) api().toast('הבדיקה נכשלה. נסה שוב מאוחר יותר', 'error'); paintUpdateUI(); });
  }
  function applyUpdate() {
    api().toast('מעדכן…');
    // the service worker is network-first for our files, so a reload fetches the new version; clear its cache too for good measure
    var clear = window.caches ? caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); }).catch(function () {}) : Promise.resolve();
    clear.then(function () { location.reload(); });
  }
  function showUpdateBanner() {
    if (document.getElementById('upd-banner')) return;
    var b = document.createElement('div');
    b.id = 'upd-banner'; b.className = 'fx-upd-banner'; b.setAttribute('role', 'status');
    b.innerHTML = '<span>✨ גרסה חדשה של מסלול זמינה</span><button class="btn btn-primary btn-sm" id="upd-go">עדכן עכשיו</button><button class="fx-mini" id="upd-x" aria-label="אחר כך">אחר כך</button>';
    document.body.appendChild(b);
    document.getElementById('upd-go').addEventListener('click', applyUpdate);
    document.getElementById('upd-x').addEventListener('click', function () { b.remove(); });
  }
  function updateCardHtml() {
    var st = upd.status;
    var line = { idle: 'לא נבדק עדיין בפתיחה הזו', checking: 'בודק…', latest: 'יש לך את הגרסה האחרונה ✓', available: 'גרסה חדשה זמינה: ' + (upd.remote && upd.remote.version), error: 'הבדיקה נכשלה', offline: 'אין חיבור לאינטרנט', unsupported: 'הבדיקה זמינה רק באתר עצמו (לא בקובץ מקומי)' }[st];
    return '<div class="card fx-card-gap" id="upd-card"><h3>גרסה ועדכונים</h3>' +
      '<div class="settings-row"><div><div class="lbl">גרסה מותקנת: <span class="num" dir="ltr">' + APP_VERSION + '</span></div><div class="desc" id="upd-line">' + line + (upd.checkedAt ? ' · נבדק ב-' + new Date(upd.checkedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '') + '</div></div>' +
        '<div class="fx-btn-row" style="margin:0;">' + (st === 'available' ? '<button class="btn btn-primary btn-sm" id="upd-apply">עדכן עכשיו</button>' : '') + '<button class="btn btn-ghost btn-sm" id="upd-check"' + (st === 'checking' ? ' disabled' : '') + '>' + U().ic('reset') + 'בדוק עדכונים</button></div></div>' +
      '<div class="settings-row" style="border:none;padding-bottom:0;"><div><div class="lbl">מה חדש</div><div class="desc">רשימת השינויים האחרונים</div></div><button class="btn btn-ghost btn-sm" id="upd-news">' + U().ic('star') + 'מה חדש</button></div>' +
      '<div class="settings-row" style="border:none;padding-bottom:0;"><div><div class="lbl">קיצורי מקלדת</div><div class="desc">במחשב: לחץ ?</div></div><button class="btn btn-ghost btn-sm" id="upd-keys">⌨ הצג</button></div></div>';
  }
  function paintUpdateUI() {
    var card = document.getElementById('upd-card');
    if (card) { var tmp = document.createElement('div'); tmp.innerHTML = updateCardHtml(); card.replaceWith(tmp.firstChild); wireUpdateCard(); }
  }
  function wireUpdateCard() {
    var c = document.getElementById('upd-check'); if (c) c.addEventListener('click', function () { checkForUpdates(true); });
    var a = document.getElementById('upd-apply'); if (a) a.addEventListener('click', applyUpdate);
    var n = document.getElementById('upd-news'); if (n) n.addEventListener('click', openWhatsNew);
    var k = document.getElementById('upd-keys'); if (k) k.addEventListener('click', openShortcuts);
  }
  function openWhatsNew() {
    U().openModal('<h3>✨ מה חדש במסלול</h3>' + CHANGELOG.map(function (c) { return '<div class="page-sub num" dir="ltr" style="text-align:right;">' + c.v + '</div><ul class="fx-steps">' + c.items.map(function (i) { return '<li>' + U().esc(i) + '</li>'; }).join('') + '</ul>'; }).join('') +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="wn-ok">מעולה</button></div>', { noFocus: true });
    document.getElementById('wn-ok').addEventListener('click', api().closeModal);
  }
  function openShortcuts() {
    var rows = [['N', 'הוספה מהירה'], ['Ctrl + K  /  /', 'חיפוש בכל האפליקציה'], ['T', 'שגרה יומית'], ['H', 'הרגלים'], ['F', 'פוקוס'], ['G', 'כושר'], ['?', 'החלון הזה'], ['Esc', 'סגירת חלון']];
    U().openModal('<h3>⌨ קיצורי מקלדת</h3><div class="fx-keys">' + rows.map(function (r) { return '<div><kbd>' + r[0] + '</kbd><span>' + r[1] + '</span></div>'; }).join('') + '</div><div class="modal-actions"><button class="btn btn-ghost btn-block" id="kb-ok">סגור</button></div>', { noFocus: true });
    document.getElementById('kb-ok').addEventListener('click', api().closeModal);
  }

  chain('settings', function (el) {
    var box = document.createElement('div');
    box.innerHTML = updateCardHtml();
    el.insertBefore(box.firstChild, el.querySelector('.page-head').nextSibling);
    wireUpdateCard();
  });

  /* ================= more dashboard widgets ================= */
  var W = F.widgets;
  W.top3 = {
    label: '3 הדברים הכי חשובים להיום',
    html: function () {
      var tk = U().todayKey(), list = (S().reviews['top3:' + tk] || []).filter(function (x) { return x && x.trim(); });
      var done = S().reviews['top3done:' + tk] || {};
      return '<div class="card"><div class="fx-row-between"><h3>3 החשובים להיום</h3><button class="btn btn-ghost btn-sm" data-w-top3-edit>' + U().ic('edit') + 'ערוך</button></div>' +
        (list.length ? list.map(function (t, i) { return '<label class="fx-pick"><input type="checkbox" data-top3-i="' + i + '"' + (done[i] ? ' checked' : '') + '><span' + (done[i] ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + U().esc(t) + '</span></label>'; }).join('')
          : '<p class="page-sub">מה שלושת הדברים שאם תעשה רק אותם, היום יהיה מוצלח?</p><button class="btn btn-primary btn-sm" data-w-top3-edit>' + U().ic('plus') + 'קבע עכשיו</button>') + '</div>';
    },
    wire: function (n) {
      var tk = U().todayKey();
      U().on(n, '[data-w-top3-edit]', 'click', function () {
        var cur = S().reviews['top3:' + tk] || [];
        var m = U().openModal('<h3>3 החשובים להיום</h3>' + [0, 1, 2].map(function (i) { return '<input type="text" class="ms-input fx-top3" data-t3="' + i + '" maxlength="80" value="' + U().esc(cur[i] || '') + '" placeholder="' + (i + 1) + '.">'; }).join('') + '<div class="modal-actions"><button class="btn btn-primary btn-block" id="t3-save">שמור</button></div>');
        document.getElementById('t3-save').addEventListener('click', function () { S().reviews['top3:' + tk] = [0, 1, 2].map(function (i) { return m.querySelector('[data-t3="' + i + '"]').value.trim(); }); api().save(); api().closeModal(); api().rerender(); });
      });
      U().on(n, '[data-top3-i]', 'change', function (c) {
        var d = S().reviews['top3done:' + tk] = S().reviews['top3done:' + tk] || {};
        d[c.dataset.top3I] = c.checked; api().save();
        var all = (S().reviews['top3:' + tk] || []).filter(function (x) { return x && x.trim(); });
        if (all.length && all.every(function (_, i) { return d[i]; })) { api().grantXPOnce('top3:' + tk, 30, 'top3', {}); api().flushXP(c); api().toast('שלושת החשובים הושלמו! 🎯', 'success'); }
        api().rerender();
      });
    }
  };
  W.week = {
    label: 'רצועת השבוע',
    html: function () {
      var tk = U().todayKey(), st = S(), start = C.addDays(tk, -C.parseKey(tk).getDay()), cells = '';
      for (var i = 0; i < 7; i++) {
        var k = C.addDays(start, i), c = C.dayCompletion(st, k);
        var cls = k > tk ? 'fut' : c.rate == null ? '' : c.rate >= 80 ? 'great' : c.rate >= 50 ? 'ok' : 'low';
        cells += '<div class="fx-wk-cell ' + cls + (k === tk ? ' today' : '') + '"><span>' + U().HE_DAYS_SHORT[i] + '</span><b class="num">' + (k > tk || c.rate == null ? '·' : c.rate + '%') + '</b></div>';
      }
      return '<div class="card"><h3>השבוע שלך</h3><div class="fx-week-strip">' + cells + '</div></div>';
    }
  };
  W.events = {
    label: 'אירועים היום',
    html: function () {
      var tk = U().todayKey(), ev = U().dayItems(tk).events, tm = U().dayItems(C.addDays(tk, 1)).events;
      if (!ev.length && !tm.length) return '';
      var row = function (e, when) { return '<div class="fx-day-row"><span class="fx-day-time" dir="ltr">' + (e.time || '—') + '</span><span><i class="fx-dot" style="background:' + (e.color || 'var(--accent-2)') + '"></i>' + U().esc(e.title) + '</span><span class="fx-chip">' + when + '</span></div>'; };
      return '<div class="card"><div class="fx-row-between"><h3>אירועים</h3><button class="btn btn-ghost btn-sm" data-go="calendar">לוח שנה</button></div>' + ev.map(function (e) { return row(e, 'היום'); }).join('') + tm.map(function (e) { return row(e, 'מחר'); }).join('') + '</div>';
    }
  };
  W.mood = {
    label: 'צ׳ק-אין מצב רוח',
    html: function () {
      var tk = U().todayKey(), r = S().reviews['day:' + tk] || {};
      var faces = ['😞', '😕', '😐', '🙂', '😄'];
      return '<div class="card fx-row-between"><div><h3>איך אתה מרגיש היום?</h3><div class="page-sub">' + (r.mood ? 'סימנת ' + faces[r.mood - 1] + ' · אפשר לשנות' : 'לחיצה אחת, נשמר בסקירות') + '</div></div><div class="fx-faces">' + faces.map(function (f, i) { return '<button class="fx-face' + (r.mood === i + 1 ? ' on' : '') + '" data-mood="' + (i + 1) + '" aria-label="מצב רוח ' + (i + 1) + '">' + f + '</button>'; }).join('') + '</div></div>';
    },
    wire: function (n) {
      U().on(n, '[data-mood]', 'click', function (b) { var tk = U().todayKey(); var r = S().reviews['day:' + tk] = S().reviews['day:' + tk] || {}; r.mood = +b.dataset.mood; api().save(); api().toast('נשמר', 'success'); api().rerender(); });
    }
  };

  /* ================= money: monthly chart, top category ================= */
  chain('money', function (el) {
    var entries = (S().money && S().money.entries) || [];
    if (!entries.length) return;
    var now = new Date(), months = [], exp = [], inc = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1), key = d.getFullYear() + '-' + U().pad(d.getMonth() + 1);
      months.push(d.toLocaleDateString('he-IL', { month: 'short' }));
      exp.push(Math.round(entries.filter(function (e) { return e.type !== 'income' && (e.date || '').slice(0, 7) === key; }).reduce(function (a, e) { return a + (+e.amount || 0); }, 0)));
      inc.push(Math.round(entries.filter(function (e) { return e.type === 'income' && (e.date || '').slice(0, 7) === key; }).reduce(function (a, e) { return a + (+e.amount || 0); }, 0)));
    }
    var thisKey = now.getFullYear() + '-' + U().pad(now.getMonth() + 1), byCat = {};
    entries.filter(function (e) { return e.type !== 'income' && (e.date || '').slice(0, 7) === thisKey; }).forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
    var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    var dayOfMonth = now.getDate(), daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var forecast = dayOfMonth ? Math.round(exp[5] / dayOfMonth * daysInMonth) : 0;
    var box = document.createElement('div');
    box.innerHTML = '<div class="grid-2 fx-card-gap"><div class="card"><h3>הוצאות לפי חודש (₪)</h3>' + U().barChart(exp, months, { showLabels: true, highlight: 5, unit: ' ₪', aria: 'הוצאות חודשיות' }) + '</div>' +
      '<div class="card"><h3>החודש</h3><div class="fx-kpis fx-kpis-sm" style="grid-template-columns:1fr 1fr;">' + U().kpi('הוצאות', exp[5] + ' ₪') + U().kpi('הכנסות', inc[5] + ' ₪') + U().kpi('תחזית לסוף החודש', forecast + ' ₪', 'לפי הקצב עד היום') + U().kpi('יתרה', (inc[5] - exp[5]) + ' ₪') + '</div>' +
      (top ? '<p class="page-sub">ההוצאה המובילה החודש: <b>' + U().esc(catName(top)) + '</b> (' + Math.round(byCat[top]) + ' ₪)</p>' : '') + '</div></div>';
    var head = el.querySelector('.page-head');
    el.insertBefore(box, head ? head.nextSibling : el.firstChild);
  });
  function catName(id) { var map = { food: 'אוכל', games: 'משחקים', tech: 'טכנולוגיה', fitness: 'כושר', hobby: 'תחביבים', edu: 'לימודים', shopping: 'קניות', other: 'אחר' }; return map[id] || id; }

  /* ================= learning: exam countdown ================= */
  chain('learning', function (el) {
    var exams = ((S().learning && S().learning.exams) || []).filter(function (e) { return e.date && e.date >= U().todayKey(); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!exams.length) return;
    var tk = U().todayKey();
    var box = document.createElement('div');
    box.innerHTML = '<div class="card fx-card-gap"><h3>📅 ספירה לאחור למבחנים</h3><div class="fx-exams">' + exams.slice(0, 6).map(function (e) {
      var days = Math.round((C.parseKey(e.date) - C.parseKey(tk)) / 864e5);
      return '<div class="fx-exam' + (days <= 3 ? ' soon' : '') + '"><b class="num">' + (days === 0 ? 'היום!' : days) + '</b><span>' + (days === 0 ? '' : 'ימים') + '</span><div class="fx-exam-t">' + U().esc(e.title) + '</div><button class="fx-mini" data-exam-plan="' + e.id + '">' + U().ic('plus') + 'משימת למידה</button></div>';
    }).join('') + '</div></div>';
    var head = el.querySelector('.page-head');
    el.insertBefore(box, head ? head.nextSibling : el.firstChild);
    U().on(box, '[data-exam-plan]', 'click', function (b) {
      var ex = exams.filter(function (x) { return x.id === b.dataset.examPlan; })[0];
      U().openTaskEditor(null, { title: 'ללמוד ל' + ex.title, due: C.addDays(ex.date, -1) < tk ? tk : C.addDays(ex.date, -1), category: 'לימודים', priority: 'high', estimate: 60 });
    });
  });

  /* ================= boot ================= */
  var origBoot = F.boot;
  F.boot = function (bridge) {
    origBoot(bridge);
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); openShortcuts(); }
    });
    var st = bridge.state();
    // after an update: show what's new once (not on the very first install)
    if (st.prefs.seenVersion && st.prefs.seenVersion !== APP_VERSION) setTimeout(openWhatsNew, 1500);
    st.prefs.seenVersion = APP_VERSION; bridge.save();
    setTimeout(function () { checkForUpdates(false); }, 4000);
    setInterval(function () { checkForUpdates(false); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - upd.checkedAt > 10 * 60 * 1000) checkForUpdates(false); });
  };
  F.checkForUpdates = function () { return checkForUpdates(true); };
  F.APP_VERSION = APP_VERSION;
})();
