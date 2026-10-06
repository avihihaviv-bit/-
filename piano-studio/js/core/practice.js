/* Piano Studio — practice log helpers (records only: minutes and songs you report yourself). */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  function sessions() { return PS.store.list('practice'); }

  /* dateKey -> total minutes */
  function byDay() {
    var m = {};
    sessions().forEach(function (s) { if (s.date) m[s.date] = (m[s.date] || 0) + (+s.minutes || 0); });
    return m;
  }

  /* Current streak counts consecutive practice days ending today — or yesterday,
   * so the streak isn't shown as broken before today's practice is logged. */
  function streak() {
    var days = byDay();
    var keys = Object.keys(days).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      run = prev && U.daysBetween(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    });
    var cur = 0;
    var d = days[U.todayKey()] ? new Date() : U.addDays(new Date(), -1);
    while (days[U.dkey(d)]) { cur++; d = U.addDays(d, -1); }
    return { current: cur, best: best, today: !!days[U.todayKey()] };
  }

  function minutesInRange(from, to) {
    return sessions().reduce(function (s, p) { var d = U.toDate(p.date); return d && d >= from && d < to ? s + (+p.minutes || 0) : s; }, 0);
  }
  function daysInRange(from, to) {
    var set = {};
    sessions().forEach(function (p) { var d = U.toDate(p.date); if (d && d >= from && d < to) set[p.date] = 1; });
    return Object.keys(set).length;
  }
  function today() { return byDay()[U.todayKey()] || 0; }
  function week() { var f = U.startOfWeek(new Date()); return { minutes: minutesInRange(f, U.addDays(f, 7)), days: daysInRange(f, U.addDays(f, 7)) }; }
  function totalMinutes() { return sessions().reduce(function (s, p) { return s + (+p.minutes || 0); }, 0); }
  function minutesForSong(id) { return sessions().reduce(function (s, p) { return (p.songIds || []).indexOf(id) >= 0 ? s + (+p.minutes || 0) : s; }, 0); }

  PS.practice = { sessions: sessions, byDay: byDay, streak: streak, minutesInRange: minutesInRange, daysInRange: daysInRange, today: today, week: week, totalMinutes: totalMinutes, minutesForSong: minutesForSong };
})();
