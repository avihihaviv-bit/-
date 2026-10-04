/* Piano Studio — statistics computed from stored records only. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;

  /* Range presets -> {from, to} (to is exclusive) */
  function range(preset) {
    var today = U.startOfDay(new Date());
    var to = U.addDays(today, 1);
    var from;
    switch (preset) {
      case '30d': from = U.addDays(to, -30); break;
      case '90d': from = U.addDays(to, -90); break;
      case '6m': from = U.startOfMonth(U.addMonths(today, -5)); break;
      case '12m': from = U.startOfMonth(U.addMonths(today, -11)); break;
      case 'year': from = new Date(today.getFullYear(), 0, 1); break;
      default: from = earliest() || U.addDays(to, -30);
    }
    return { from: from, to: to, preset: preset };
  }
  function previous(r) {
    var len = r.to - r.from;
    return { from: new Date(r.from - len), to: new Date(r.from.getTime()) };
  }
  function earliest() {
    var min = null;
    PS.db.COLLECTIONS.forEach(function (c) {
      if (c === 'notifications') return;
      PS.store.list(c).forEach(function (r) { var d = U.toDate(r.createdAt); if (d && (!min || d < min)) min = d; });
    });
    return min ? U.startOfMonth(min) : null;
  }

  /* Bucket keys between from/to: weekly for short ranges, monthly otherwise. */
  function buckets(r) {
    var days = U.daysBetween(r.from, r.to);
    var out = [];
    if (days <= 92) {
      var w = U.startOfWeek(r.from);
      while (w < r.to) { out.push({ from: w, to: U.addDays(w, 7), label: U.fmtDayMonthShort(w) }); w = U.addDays(w, 7); }
    } else {
      var m = U.startOfMonth(r.from);
      while (m < r.to) { var n = U.addMonths(m, 1); out.push({ from: m, to: n, label: U.fmtMonthShort(m) }); m = n; }
    }
    return out;
  }

  /* Generic: count of dates (from records) per bucket */
  function series(dates, r) {
    var bs = buckets(r);
    return bs.map(function (b) {
      return { label: b.label, from: b.from, value: dates.filter(function (d) { return d >= b.from && d < b.to; }).length };
    });
  }
  function sumSeries(points, r) { // points: [{date, value}]
    return buckets(r).map(function (b) {
      return { label: b.label, from: b.from, value: points.reduce(function (s, p) { return p.date >= b.from && p.date < b.to ? s + p.value : s; }, 0) };
    });
  }

  function dates(coll, filter, dateFn) {
    return PS.store.list(coll).filter(filter).map(dateFn).map(U.toDate).filter(Boolean);
  }
  var D = {
    lessonsAttended: function () { return dates('lessons', function (l) { return l.status === 'completed'; }, function (l) { return U.combine(l.date, l.time) || l.completedAt; }); },
    songsLearned: function () { return dates('songs', function (s) { return s.status === 'learned'; }, function (s) { return s.learnedAt; }); },
    coursesCompleted: function () { return dates('courses', function (c) { return c.status === 'completed'; }, function (c) { return c.completedAt; }); },
    tasksCompleted: function () { return dates('tasks', function (t) { return t.done; }, function (t) { return t.completedAt; }); },
    modulesCompleted: function () {
      var out = [];
      PS.store.list('courses').forEach(function (c) { (c.modules || []).forEach(function (m) { if (m.done && m.doneAt) out.push(U.toDate(m.doneAt)); }); });
      return out.filter(Boolean);
    },
    organization: function () {
      // created notes, journal entries, tasks and resources = organizational activity
      var out = [];
      ['notes', 'journal', 'tasks', 'resources'].forEach(function (c) { out = out.concat(dates(c, function () { return true; }, function (r) { return r.createdAt; })); });
      return out;
    }
  };

  function inRange(ds, r) { return ds.filter(function (d) { return d >= r.from && d < r.to; }).length; }

  function xpPoints() {
    return PS.store.list('xp').filter(function (e) { return !e.revoked; }).map(function (e) { return { date: U.toDate(e.at), value: e.amount }; }).filter(function (p) { return p.date; });
  }

  function goalRate(r) {
    var gs = PS.store.list('goals').filter(function (g) {
      var dl = U.toDate(g.deadline);
      var done = U.toDate(g.completedAt);
      return (done && done >= r.from && done < r.to) || (dl && dl >= r.from && dl < r.to);
    });
    var done = gs.filter(function (g) { return g.status === 'completed'; }).length;
    return { total: gs.length, done: done, pct: gs.length ? done / gs.length : null };
  }

  /* Last N months bar data for dashboard */
  function monthlyActions(n) {
    var out = [];
    var start = U.startOfMonth(U.addMonths(new Date(), -(n - 1)));
    for (var i = 0; i < n; i++) {
      var from = U.addMonths(start, i), to = U.addMonths(start, i + 1);
      out.push({ label: U.fmtMonthShort(from), from: from, value: PS.game.actionsInRange(from, to) });
    }
    return out;
  }

  PS.stats = { range: range, previous: previous, buckets: buckets, series: series, sumSeries: sumSeries, D: D, inRange: inRange, xpPoints: xpPoints, goalRate: goalRate, monthlyActions: monthlyActions };
})();
