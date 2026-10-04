/* Piano Studio — shared utilities (ids, dates, escaping, formatting). */
(function () {
  'use strict';
  var PS = (window.PS = window.PS || {});

  var U = {};

  /* ---------- ids & time ---------- */
  U.uid = function (prefix) {
    var rnd = '';
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(2);
      crypto.getRandomValues(a);
      rnd = a[0].toString(36) + a[1].toString(36);
    } else {
      rnd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + rnd.slice(0, 10);
  };
  U.nowISO = function () { return new Date().toISOString(); };

  /* ---------- escaping ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  };
  /* Only http(s) and mailto links are ever rendered as hrefs. */
  U.safeUrl = function (url) {
    if (!url) return '';
    var s = String(url).trim();
    if (/^(https?:)?\/\//i.test(s) || /^mailto:/i.test(s)) return s.indexOf('//') === 0 ? 'https:' + s : s;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;
    return '';
  };
  U.isUrl = function (s) { return !!U.safeUrl(s); };
  U.hostOf = function (url) {
    try { return new URL(U.safeUrl(url)).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  };

  /* Wrap Latin runs so English titles render correctly inside RTL text. */
  U.bidi = function (s) { return '<bdi>' + U.esc(s) + '</bdi>'; };

  /* ---------- dates ---------- */
  var LOCALE = 'he-IL';
  function fmt(opts) {
    try { return new Intl.DateTimeFormat(LOCALE, opts); } catch (e) { return new Intl.DateTimeFormat(undefined, opts); }
  }
  var F = {
    full: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    dayMonth: fmt({ day: 'numeric', month: 'long' }),
    dayMonthShort: fmt({ day: 'numeric', month: 'short' }),
    date: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
    weekdayShort: fmt({ weekday: 'short' }),
    weekday: fmt({ weekday: 'long' }),
    monthYear: fmt({ month: 'long', year: 'numeric' }),
    monthShort: fmt({ month: 'short' }),
    time: fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
  };

  /* Local date key "YYYY-MM-DD" */
  U.dkey = function (d) {
    d = U.toDate(d);
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.todayKey = function () { return U.dkey(new Date()); };
  U.toDate = function (v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    var d = new Date(v);
    return isNaN(d) ? null : d;
  };
  /* Combine a date key and "HH:MM" into a Date */
  U.combine = function (dateKey, time) {
    var d = U.toDate(dateKey);
    if (!d) return null;
    if (time && /^\d{1,2}:\d{2}$/.test(time)) {
      var t = time.split(':');
      d.setHours(+t[0], +t[1], 0, 0);
    }
    return d;
  };
  U.startOfDay = function (d) { d = new Date(U.toDate(d)); d.setHours(0, 0, 0, 0); return d; };
  U.addDays = function (d, n) { d = new Date(U.toDate(d)); d.setDate(d.getDate() + n); return d; };
  U.addMonths = function (d, n) {
    d = new Date(U.toDate(d));
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  };
  /* Weeks start on Sunday (Israeli convention). */
  U.startOfWeek = function (d) { d = U.startOfDay(d); d.setDate(d.getDate() - d.getDay()); return d; };
  U.startOfMonth = function (d) { d = U.startOfDay(d); d.setDate(1); return d; };
  U.daysBetween = function (a, b) { return Math.round((U.startOfDay(b) - U.startOfDay(a)) / 86400000); };
  U.sameDay = function (a, b) { return U.dkey(a) === U.dkey(b); };
  U.weekKey = function (d) { return U.dkey(U.startOfWeek(d)); };
  U.monthKey = function (d) { d = U.toDate(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

  U.fmtFull = function (d) { d = U.toDate(d); return d ? F.full.format(d) : ''; };
  U.fmtDate = function (d) { d = U.toDate(d); return d ? F.date.format(d) : ''; };
  U.fmtDayMonth = function (d) { d = U.toDate(d); return d ? F.dayMonth.format(d) : ''; };
  U.fmtDayMonthShort = function (d) { d = U.toDate(d); return d ? F.dayMonthShort.format(d) : ''; };
  U.fmtWeekday = function (d) { d = U.toDate(d); return d ? F.weekday.format(d) : ''; };
  U.fmtWeekdayShort = function (d) { d = U.toDate(d); return d ? F.weekdayShort.format(d) : ''; };
  U.fmtMonthYear = function (d) { d = U.toDate(d); return d ? F.monthYear.format(d) : ''; };
  U.fmtMonthShort = function (d) { d = U.toDate(d); return d ? F.monthShort.format(d) : ''; };
  U.fmtTime = function (d) { d = U.toDate(d); return d ? F.time.format(d) : ''; };
  U.fmtDateTime = function (d) { d = U.toDate(d); return d ? F.date.format(d) + ' · ' + F.time.format(d) : ''; };

  /* Human relative day label */
  U.relDay = function (d) {
    d = U.toDate(d);
    if (!d) return '';
    var diff = U.daysBetween(new Date(), d);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff === -1) return 'אתמול';
    if (diff > 1 && diff < 7) return 'בעוד ' + diff + ' ימים';
    if (diff < -1 && diff > -7) return 'לפני ' + -diff + ' ימים';
    return U.fmtDate(d);
  };
  U.timeAgo = function (iso) {
    var d = U.toDate(iso);
    if (!d) return '';
    var s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'הרגע';
    var m = Math.round(s / 60);
    if (m < 60) return m === 1 ? 'לפני דקה' : 'לפני ' + m + ' דקות';
    var h = Math.round(m / 60);
    if (h < 24) return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : 'לפני ' + h + ' שעות';
    var days = Math.round(h / 24);
    if (days === 1) return 'אתמול';
    if (days < 7) return 'לפני ' + days + ' ימים';
    return U.fmtDate(d);
  };
  /* Countdown text to a future date */
  U.countdown = function (d) {
    d = U.toDate(d);
    if (!d) return '';
    var ms = d - Date.now();
    if (ms <= 0) return 'עכשיו';
    var mins = Math.floor(ms / 60000);
    var days = Math.floor(mins / 1440);
    var hours = Math.floor((mins % 1440) / 60);
    var m = mins % 60;
    if (days > 0) return days + ' ימ׳ ' + hours + ' שע׳';
    if (hours > 0) return hours + ' שע׳ ' + m + ' דק׳';
    return m + ' דק׳';
  };
  U.greeting = function () {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 21) return 'ערב טוב';
    return 'לילה טוב';
  };
  U.fmtMinutes = function (min) {
    min = Math.round(+min || 0);
    if (min < 60) return min + ' דק׳';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' שע׳' + (m ? ' ' + m + ' דק׳' : '');
  };

  /* ---------- numbers ---------- */
  U.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  U.pct = function (a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; };
  U.num = function (n) { try { return new Intl.NumberFormat(LOCALE).format(n); } catch (e) { return String(n); } };

  /* ---------- misc ---------- */
  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };
  U.initials = function (name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '♪';
    if (parts.length === 1) return parts[0].slice(0, 2);
    return parts[0][0] + parts[1][0];
  };
  U.deepClone = function (o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); };
  U.byKey = function (key, dir) {
    dir = dir === 'desc' ? -1 : 1;
    return function (a, b) {
      var x = typeof key === 'function' ? key(a) : a[key];
      var y = typeof key === 'function' ? key(b) : b[key];
      if (x === y) return 0;
      if (x === undefined || x === null || x === '') return 1;
      if (y === undefined || y === null || y === '') return -1;
      if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'he') * dir;
      return (x < y ? -1 : 1) * dir;
    };
  };
  U.normalize = function (s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '').replace(/[̀-ͯ]/g, '');
  };
  U.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  };
  U.fileSize = function (bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };
  U.prefersReducedMotion = function () {
    var pref = PS.prefs && PS.prefs.get ? PS.prefs.get('reducedMotion') : 'system';
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  U.plural = function (n, one, many) { return n === 1 ? one : n + ' ' + many; };

  PS.util = U;
})();
