/* Piano Studio — musical journey timeline, derived only from real stored records. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;

  var TYPES = {
    lesson: { label: 'שיעורים', icon: 'clock', tone: 'tone-gold' },
    song: { label: 'שירים שנלמדו', icon: 'music', tone: 'tone-green' },
    course: { label: 'קורסים', icon: 'graduation', tone: 'tone-violet' },
    goal: { label: 'יעדים', icon: 'target', tone: 'tone-blue' },
    achievement: { label: 'הישגים', icon: 'trophy', tone: 'tone-gold' },
    level: { label: 'רמות', icon: 'bolt', tone: 'tone-gold' },
    note: { label: 'פתקים חשובים', icon: 'pin', tone: 'tone-rose' },
    start: { label: 'התחלות', icon: 'flag', tone: 'tone-muted' }
  };
  var state = { hide: {}, from: '', to: '' };

  function events() {
    var out = [];
    PS.store.list('lessons').forEach(function (l) { if (l.status === 'completed') out.push({ type: 'lesson', at: U.combine(l.date, l.time) || U.toDate(l.completedAt), title: 'שיעור: ' + l.title, sub: [l.teacher, (l.topics || []).join(', ')].filter(Boolean).join(' · '), href: '#/lessons/' + l.id }); });
    PS.store.list('songs').forEach(function (s) {
      if (s.status === 'learned' && s.learnedAt) out.push({ type: 'song', at: U.toDate(s.learnedAt), title: 'למדתי את ' + s.title, sub: s.artist || '', href: '#/songs/' + s.id });
      if (s.startedAt) out.push({ type: 'start', at: U.toDate(s.startedAt), title: 'התחלתי ללמוד את ' + s.title, sub: s.artist || '', href: '#/songs/' + s.id });
    });
    PS.store.list('courses').forEach(function (c) {
      if (c.status === 'completed' && c.completedAt) out.push({ type: 'course', at: U.toDate(c.completedAt), title: 'השלמתי את הקורס ' + c.title, sub: c.instructor || '', href: '#/courses/' + c.id });
      if (c.startDate && c.status !== 'wishlist' && c.status !== 'planned') out.push({ type: 'start', at: U.toDate(c.startDate), title: 'התחלתי את הקורס ' + c.title, sub: c.instructor || '', href: '#/courses/' + c.id });
    });
    PS.store.list('goals').forEach(function (g) { if (g.status === 'completed' && g.completedAt) out.push({ type: 'goal', at: U.toDate(g.completedAt), title: 'יעד הושג: ' + g.title, sub: PS.schema.labels.goalPeriod[g.period] || '', href: '#/goals' }); });
    var defs = {};
    PS.game.ACH.forEach(function (a) { defs[a.id] = a; });
    PS.store.list('achievements').forEach(function (a) { var d = defs[a.id]; if (d) out.push({ type: 'achievement', at: U.toDate(a.unlockedAt), title: 'הישג: ' + d.name, sub: d.desc, href: '#/achievements' }); });
    PS.store.list('notes').forEach(function (n) { if (n.pinned) out.push({ type: 'note', at: U.toDate(n.createdAt), title: n.title, sub: PS.schema.labels.noteType[n.type] || '', href: '#/notes/' + n.id }); });
    // level-ups reconstructed from the XP ledger
    var total = 0, lvl = 1;
    PS.store.list('xp').filter(function (e) { return !e.revoked; }).sort(U.byKey('at')).forEach(function (e) {
      total += e.amount;
      var nl = PS.game.levelFromXP(total).level;
      while (nl > lvl) { lvl++; out.push({ type: 'level', at: U.toDate(e.at), title: 'עליתי לרמה ' + lvl, sub: PS.game.titleFor(lvl), href: '#/achievements' }); }
      if (nl < lvl) lvl = nl;
    });
    return out.filter(function (e) { return e.at; });
  }

  Object.assign(PS.act, {
    'journey-toggle': function (el) { state.hide[el.dataset.k] = !state.hide[el.dataset.k]; PS.refresh(); },
    'journey-range': function (el) { state[el.dataset.k] = el.value; PS.refresh(); },
    'journey-preset': function (el) {
      var p = el.dataset.v;
      state.to = '';
      state.from = p === 'all' ? '' : U.dkey(p === 'month' ? U.addDays(new Date(), -30) : p === '3m' ? U.addMonths(new Date(), -3) : U.addMonths(new Date(), -12));
      PS.refresh();
    }
  });

  function render(el) {
    var all = events();
    var from = state.from ? U.toDate(state.from) : null;
    var to = state.to ? U.addDays(state.to, 1) : null;
    var list = all.filter(function (e) { return !state.hide[e.type] && (!from || e.at >= from) && (!to || e.at < to); }).sort(function (a, b) { return b.at - a.at; });
    var html = '<div class="page"><div class="page-head"><div><h1>המסע המוזיקלי</h1><p class="sub">כל רגע משמעותי בדרך — כפי שנרשם בפועל</p></div></div>';
    html += '<div class="toolbar"><div class="seg">' + [['all', 'הכל'], ['month', '30 יום'], ['3m', '3 חודשים'], ['year', 'שנה']].map(function (p) { return '<button type="button" data-act="journey-preset" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<label class="row small muted">מ-<input class="input input-sm" style="width:auto" type="date" value="' + esc(state.from) + '" data-change="journey-range" data-k="from" aria-label="מתאריך"></label>' +
      '<label class="row small muted">עד<input class="input input-sm" style="width:auto" type="date" value="' + esc(state.to) + '" data-change="journey-range" data-k="to" aria-label="עד תאריך"></label></div>';
    html += '<div class="cal-legend">' + Object.keys(TYPES).map(function (k) {
      var n = all.filter(function (e) { return e.type === k; }).length;
      return '<button type="button" class="chip ' + (state.hide[k] ? 'chip-muted' : TYPES[k].tone.replace('tone', 'chip')) + '" data-act="journey-toggle" data-k="' + k + '" aria-pressed="' + !state.hide[k] + '">' + I(state.hide[k] ? 'eyeOff' : TYPES[k].icon) + esc(TYPES[k].label) + ' ' + n + '</button>';
    }).join('') + '</div>';
    if (!list.length) {
      html += '<div class="card">' + ui.empty(all.length ? { icon: 'route', title: 'אין אירועים בטווח שנבחר', text: 'נסו טווח תאריכים או סוגי אירועים אחרים.' } : { icon: 'route', title: 'המסע שלך מתחיל כאן', text: 'כשתשלימו שיעור, תלמדו שיר או תשיגו יעד — הרגעים האלה יופיעו כאן. שום דבר לא ממוצא.' }) + '</div>';
    } else {
      html += '<div class="timeline">';
      var lastMonth = '';
      list.forEach(function (e) {
        var mk = U.monthKey(e.at);
        if (mk !== lastMonth) { html += '<div class="tl-month">' + esc(U.fmtMonthYear(e.at)) + '</div>'; lastMonth = mk; }
        var t = TYPES[e.type];
        html += '<a class="card tl-item lift" href="' + e.href + '" style="text-decoration:none;color:inherit"><span class="tl-dot" aria-hidden="true"></span><span class="tl-icon ' + t.tone + '">' + I(t.icon) + '</span>' +
          '<span class="grow"><b>' + U.bidi(e.title) + '</b>' + (e.sub ? '<small>' + U.bidi(e.sub) + '</small>' : '') + '</span><small class="muted num">' + esc(U.fmtDayMonthShort(e.at)) + '</small></a>';
      });
      html += '</div>';
    }
    el.innerHTML = html + '</div>';
  }

  PS.views.journey = { title: function () { return 'המסע המוזיקלי'; }, render: render, events: events };
})();
