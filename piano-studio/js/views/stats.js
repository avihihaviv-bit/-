/* Piano Studio — statistics page. Every figure is computed from stored records. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var S = PS.stats;

  var state = { range: '90d', compare: true };
  var PRESETS = [['30d', '30 יום'], ['90d', '90 יום'], ['6m', '6 חודשים'], ['12m', '12 חודשים'], ['year', 'השנה'], ['all', 'הכל']];

  PS.act['stats-range'] = function (el) { state.range = el.dataset.v; PS.refresh(); };
  PS.act['stats-compare'] = function (el) { state.compare = el.checked; PS.refresh(); };
  PS.act['export-csv'] = function (el) { PS.backup.exportCSV(el.dataset.c); ui.toast('קובץ CSV ירד', 'success'); };

  function delta(cur, prev, hasPrevData) {
    if (!hasPrevData) return '<span class="delta flat">אין נתונים להשוואה</span>';
    if (prev === 0 && cur === 0) return '<span class="delta flat">ללא שינוי</span>';
    var d = cur - prev;
    return '<span class="delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d + ' לעומת התקופה הקודמת</span>';
  }

  function chartCard(title, icon, dates, r, prev, unit, kind, hasPrev) {
    var data = S.series(dates, r);
    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    var body;
    if (!dates.length) body = ui.empty({ icon: icon, title: 'אין עדיין נתונים', text: 'הנתונים יופיעו כשיהיו רשומות אמיתיות.' }).replace('class="empty"', 'class="empty compact"');
    else if (kind === 'cumulative') {
      var before = dates.filter(function (d) { return d < r.from; }).length;
      var run = before;
      body = PS.chart.line(data.map(function (d) { run += d.value; return { label: d.label, value: run }; }), { unit: unit, title: title });
    } else {
      var cmp = state.compare && hasPrev ? S.series(dates, { from: prev.from, to: prev.to, preset: r.preset }) : null;
      if (cmp && cmp.length !== data.length) cmp = null;
      body = PS.chart.bars(data, { unit: unit, title: title, compare: cmp }) + (cmp ? '<div class="legend" style="margin-top:8px"><span><i style="background:var(--gold)"></i>התקופה הנוכחית</span><span><i style="background:var(--text-faint);opacity:.5"></i>התקופה הקודמת</span></div>' : '');
    }
    return '<div class="card pad"><div class="card-head"><h3>' + I(icon) + esc(title) + '</h3><span class="small muted num">' + total + ' בתקופה</span></div>' + body + '</div>';
  }

  function render(el) {
    var r = S.range(state.range);
    var prev = S.previous(r);
    var D = S.D;
    var practicePts = PS.store.list('practice').map(function (p) { return { date: U.toDate(p.date), value: +p.minutes || 0 }; }).filter(function (p) { return p.date; });
    var pIn = practicePts.filter(function (p) { return p.date >= r.from && p.date < r.to; }).reduce(function (s, p) { return s + p.value; }, 0);
    var pPrev = practicePts.filter(function (p) { return p.date >= prev.from && p.date < prev.to; }).reduce(function (s, p) { return s + p.value; }, 0);
    var lessonsOn = PS.prefs.lessons();
    var lessons = D.lessonsAttended(), songs = D.songsLearned(), courses = D.coursesCompleted(), tasks = D.tasksCompleted(), modules = D.modulesCompleted(), org = D.organization();
    var earliest = null;
    PS.db.COLLECTIONS.forEach(function (c) { if (c === 'notifications') return; PS.store.list(c).forEach(function (x) { var d = U.toDate(x.createdAt); if (d && (!earliest || d < earliest)) earliest = d; }); });
    var hasPrev = !!earliest && earliest < r.from && state.range !== 'all';
    var xp = S.xpPoints();
    var xpIn = xp.filter(function (p) { return p.date >= r.from && p.date < r.to; }).reduce(function (s, p) { return s + p.value; }, 0);
    var xpPrev = xp.filter(function (p) { return p.date >= prev.from && p.date < prev.to; }).reduce(function (s, p) { return s + p.value; }, 0);
    var gr = S.goalRate(r);
    var anyData = practicePts.length || lessons.length || songs.length || courses.length || tasks.length || xp.length || org.length;

    var html = '<div class="page"><div class="page-head"><div><h1>סטטיסטיקה</h1><p class="sub">' + esc(U.fmtDate(r.from)) + ' – ' + esc(U.fmtDate(U.addDays(r.to, -1))) + '</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="practice">' + I('download') + 'אימונים CSV</button><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="songs">' + I('download') + 'שירים CSV</button><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="lessons">' + I('download') + 'שיעורים CSV</button><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="tasks">' + I('download') + 'משימות CSV</button></div></div>';
    html += '<div class="toolbar"><div class="seg" role="group" aria-label="טווח תאריכים">' + PRESETS.map(function (p) { return '<button type="button" class="' + (state.range === p[0] ? 'on' : '') + '" data-act="stats-range" data-v="' + p[0] + '" aria-pressed="' + (state.range === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<label class="field-check small muted"><input type="checkbox" class="check" data-change="stats-compare"' + (state.compare ? ' checked' : '') + '>השוואה לתקופה הקודמת</label></div>';
    if (!anyData) {
      el.innerHTML = html + '<div class="card">' + ui.empty({ icon: 'chart', title: 'אין מספיק היסטוריה עדיין', text: 'הסטטיסטיקה מחושבת רק מרשומות אמיתיות. השלימו שיעור, משימה או שיר — והתרשימים יתחילו להתמלא.' }) + '</div></div>';
      return;
    }
    if (!hasPrev && state.range !== 'all') html += '<div class="banner banner-info">' + I('info') + '<span>אין עדיין נתונים מלפני תחילת הטווח, ולכן אין השוואה לתקופה קודמת.</span></div>';
    function tile(icon, label, cur, prv) {
      return '<div class="card stat"><div class="stat-label">' + I(icon) + esc(label) + '</div><div class="stat-value">' + U.num(cur) + '</div><div class="stat-sub">' + delta(cur, prv, hasPrev) + '</div></div>';
    }
    html += '<div class="stat-tiles stagger">' +
      (lessonsOn ? tile('clock', 'שיעורים שהתקיימו', S.inRange(lessons, r), S.inRange(lessons, prev)) : tile('bolt', 'דקות אימון', pIn, pPrev)) +
      tile('music', 'שירים שנלמדו', S.inRange(songs, r), S.inRange(songs, prev)) +
      tile('list', 'משימות שהושלמו', S.inRange(tasks, r), S.inRange(tasks, prev)) +
      tile('sparkle', 'XP שנצבר', xpIn, xpPrev) + '</div>';
    html += '<div class="grid grid-4 stagger" style="margin-top:14px">' +
      tile('graduation', 'קורסים שהושלמו', S.inRange(courses, r), S.inRange(courses, prev)) +
      tile('layers', 'מודולים שהושלמו', S.inRange(modules, r), S.inRange(modules, prev)) +
      '<div class="card stat"><div class="stat-label">' + I('target') + 'שיעור השגת יעדים</div><div class="stat-value">' + (gr.pct === null ? '—' : Math.round(gr.pct * 100) + '%') + '</div><div class="stat-sub">' + (gr.total ? gr.done + ' מתוך ' + gr.total + ' יעדים בטווח' : 'אין יעדים עם מועד בטווח') + '</div></div>' +
      tile('note', 'פעילות ארגונית', S.inRange(org, r), S.inRange(org, prev)) + '</div>';
    html += '<div class="grid grid-2 section">' +
      '<div class="card pad"><div class="card-head"><h3>' + I('bolt') + 'דקות אימון</h3><span class="small muted num">' + pIn + ' בתקופה</span></div>' +
        (practicePts.length ? PS.chart.bars(S.sumSeries(practicePts, r), { unit: 'דקות', title: 'דקות אימון' }) : ui.empty({ icon: 'bolt', title: 'עוד אין אימונים רשומים' }).replace('class="empty"', 'class="empty compact"')) + '</div>' +
      (lessonsOn ? chartCard('שיעורים שהתקיימו', 'clock', lessons, r, prev, 'שיעורים', 'bars', hasPrev) : '') +
      chartCard('שירים שנלמדו (מצטבר)', 'music', songs, r, prev, 'שירים', 'cumulative', hasPrev) +
      chartCard('משימות שהושלמו', 'list', tasks, r, prev, 'משימות', 'bars', hasPrev) +
      chartCard('קורסים שהושלמו (מצטבר)', 'graduation', courses, r, prev, 'קורסים', 'cumulative', hasPrev) +
      '<div class="card pad"><div class="card-head"><h3>' + I('sparkle') + 'XP לאורך זמן</h3><span class="small muted num">' + xpIn + ' בתקופה</span></div>' +
        (xp.length ? PS.chart.bars(S.sumSeries(xp, r), { unit: 'XP', title: 'XP לאורך זמן' }) : ui.empty({ icon: 'sparkle', title: 'עוד לא נצבר XP' }).replace('class="empty"', 'class="empty compact"')) + '</div>' +
      chartCard('פעילות ארגונית (פתקים, יומן, משימות ומשאבים שנוצרו)', 'note', org, r, prev, 'פריטים', 'bars', hasPrev) +
    '</div>';
    el.innerHTML = html + '</div>';
  }

  PS.views.stats = { title: function () { return 'סטטיסטיקה'; }, render: render };
})();
