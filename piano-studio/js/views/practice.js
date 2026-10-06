/* Piano Studio — practice log: minutes you practiced on your own piano, streaks and history.
 * It records practice; it is not a practice tool. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var quickSong = '';
  var FEEL_TONE = { great: 'green', good: 'gold', ok: 'muted', hard: 'red' };

  function openForm(rec, preset) {
    var m = ui.editForm({ coll: 'practice', record: rec || Object.assign({ minutes: PS.prefs.get('dailyPracticeGoal') || 20 }, preset || {}), icon: 'clock', size: 'md' });
    if (rec && rec.id) {
      var foot = m.el.querySelector('.modal-foot');
      foot.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-danger" data-del style="margin-inline-end:auto">' + I('trash') + 'מחיקה</button>');
      foot.querySelector('[data-del]').onclick = function () { m.close(); ui.confirmDelete('practice', rec.id); };
    }
  }

  Object.assign(PS.act, {
    'add-practice': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'practice-edit': function (el) { openForm(PS.store.get('practice', el.dataset.id)); },
    'practice-quick': function (el) {
      var mins = +el.dataset.m;
      var rec = PS.store.create('practice', { date: U.todayKey(), minutes: mins, songIds: quickSong ? [quickSong] : [] });
      ui.toast('נרשמו ' + U.fmtMinutes(mins) + ' אימון להיום', 'success', { action: { label: 'ביטול', fn: function () { PS.store.remove('practice', rec.id); } } });
    },
    'practice-song': function (el) { quickSong = el.value; }
  });

  function heatmap(byDay) {
    var weeks = 18;
    var end = U.startOfWeek(new Date());
    var start = U.addDays(end, -7 * (weeks - 1));
    var today = U.todayKey();
    var goal = Math.max(5, +PS.prefs.get('dailyPracticeGoal') || 20);
    function level(m) { return !m ? 0 : m < goal / 2 ? 1 : m < goal ? 2 : m < goal * 2 ? 3 : 4; }
    var html = '<div class="heat-wrap"><div class="heat" style="--weeks:' + weeks + '" role="img" aria-label="מפת אימונים ל-' + weeks + ' השבועות האחרונים">';
    for (var w = 0; w < weeks; w++) {
      for (var d = 0; d < 7; d++) {
        var day = U.addDays(start, w * 7 + d), k = U.dkey(day);
        var m = byDay[k] || 0;
        var future = k > today;
        html += '<span class="hc l' + (future ? 'x' : level(m)) + (k === today ? ' today' : '') + '" style="grid-column:' + (w + 1) + ';grid-row:' + (d + 1) + '"' +
          (future ? '' : ' data-tip="' + esc('<b>' + esc(U.fmtFull(day)) + '</b><span>' + (m ? U.fmtMinutes(m) + ' אימון' : 'לא נרשם אימון') + '</span>') + '"') + '></span>';
      }
    }
    html += '</div><div class="heat-legend small muted"><span>פחות</span>' + [0, 1, 2, 3, 4].map(function (l) { return '<span class="hc l' + l + '"></span>'; }).join('') + '<span>יותר</span><span class="faint">· יעד יומי ' + goal + ' דק׳</span></div></div>';
    return html;
  }

  function render(el) {
    var all = PS.practice.sessions().slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)); });
    var byDay = PS.practice.byDay();
    var st = PS.practice.streak();
    var wk = PS.practice.week();
    var todayMin = PS.practice.today();
    var goal = Math.max(5, +PS.prefs.get('dailyPracticeGoal') || 20);
    var total = PS.practice.totalMinutes();
    var songs = PS.store.list('songs').filter(function (s) { return s.status === 'learning' || s.status === 'reviewing' || s.status === 'planned'; }).sort(U.byKey('priority'));

    var html = '<div class="page"><div class="page-head"><div><h1>יומן אימונים</h1><p class="sub">רושמים כמה התאמנתם על הפסנתר — ורואים את הרצף וההתקדמות</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-practice">' + I('plus') + 'רישום אימון מפורט</button></div></div>';

    html += '<div class="card pad quick-practice"><div class="row" style="justify-content:space-between;gap:16px">' +
      '<div class="row" style="gap:16px">' + ui.ring(Math.min(1, todayMin / goal), 70, todayMin + '′', 'היום') +
      '<div><b style="font-size:17px">' + (todayMin >= goal ? 'עמדת ביעד היומי ✦' : todayMin ? 'עוד ' + (goal - todayMin) + ' דק׳ ליעד היומי' : 'התאמנת היום?') + '</b>' +
      '<p class="small muted">רישום מהיר לאימון של היום' + (PS.game.hasKey('practice-day:' + U.todayKey()) ? '' : ' · ' + U.xp(PS.game.XP.practiceDay) + ' ליום אימון') + '</p></div></div>' +
      (songs.length ? '<label class="row small muted" style="gap:8px">על שיר:<select class="input input-sm" style="width:auto;max-width:220px" data-change="practice-song" aria-label="שיר לאימון המהיר"><option value="">— כללי —</option>' + songs.map(function (s) { return '<option value="' + s.id + '"' + (quickSong === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>'; }).join('') + '</select></label>' : '') +
      '</div><div class="chips-row">' + [10, 15, 20, 30, 45, 60, 90].map(function (m) { return '<button type="button" class="btn btn-ghost" data-act="practice-quick" data-m="' + m + '">+' + m + ' דק׳</button>'; }).join('') + '</div></div>';

    html += '<div class="stat-tiles stagger section">' +
      '<div class="card stat"><div class="stat-label">' + I('bolt') + 'רצף נוכחי</div><div class="stat-value">' + st.current + ' <small class="muted" style="font-size:15px">ימים</small></div><div class="stat-sub">השיא: ' + st.best + ' ימים' + (st.current && !st.today ? ' · רשמו היום כדי להמשיך' : '') + '</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('calendar') + 'השבוע</div><div class="stat-value">' + wk.minutes + ' <small class="muted" style="font-size:15px">דק׳</small></div><div class="stat-sub">' + wk.days + ' ימי אימון מתוך 7</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('clock') + 'סה״כ זמן אימון</div><div class="stat-value">' + (total >= 60 ? (total / 60).toFixed(1) + ' <small class="muted" style="font-size:15px">שעות</small>' : total + ' <small class="muted" style="font-size:15px">דק׳</small>') + '</div><div class="stat-sub">' + all.length + ' אימונים רשומים</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('chart') + 'ממוצע ליום אימון</div><div class="stat-value">' + (Object.keys(byDay).length ? Math.round(total / Object.keys(byDay).length) : 0) + ' <small class="muted" style="font-size:15px">דק׳</small></div><div class="stat-sub">' + Object.keys(byDay).length + ' ימי אימון בסך הכל</div></div></div>';

    var r = { from: U.startOfWeek(U.addDays(new Date(), -7 * 11)), to: U.addDays(U.startOfDay(new Date()), 1) };
    var pts = all.map(function (p) { return { date: U.toDate(p.date), value: +p.minutes || 0 }; });
    html += '<div class="grid grid-2 section"><div class="card pad"><div class="card-head"><h3>' + I('grid') + 'מפת אימונים</h3></div>' + heatmap(byDay) + '</div>' +
      '<div class="card pad"><div class="card-head"><h3>' + I('chart') + 'דקות אימון בשבוע</h3><span class="small muted">12 שבועות</span></div>' +
      (all.length ? PS.chart.bars(PS.stats.sumSeries(pts, r), { unit: 'דקות', title: 'דקות אימון בשבוע' }) : ui.empty({ icon: 'chart', title: 'עוד אין אימונים רשומים', text: 'כל אימון שתרשמו יופיע כאן.' }).replace('class="empty"', 'class="empty compact"')) + '</div></div>';

    html += '<div class="section"><div class="section-head"><h2>' + I('history') + 'היסטוריית אימונים</h2></div>';
    if (!all.length) {
      html += '<div class="card">' + ui.empty({ icon: 'clock', title: 'יומן האימונים ריק', text: 'התאמנתם על הפסנתר? לחצו על אחד מכפתורי הדקות למעלה, או רשמו אימון מפורט עם השירים שעבדתם עליהם.', action: { act: 'add-practice', label: 'רישום אימון' } }) + '</div>';
    } else {
      var groups = {}, order = [];
      all.slice(0, 120).forEach(function (p) { if (!groups[p.date]) { groups[p.date] = []; order.push(p.date); } groups[p.date].push(p); });
      html += '<div class="card list">' + order.map(function (k) {
        var list = groups[k];
        var mins = list.reduce(function (s, p) { return s + (+p.minutes || 0); }, 0);
        var d = U.toDate(k);
        return list.map(function (p, i) {
          var sg = (p.songIds || []).map(function (id) { return PS.store.get('songs', id); }).filter(Boolean);
          var course = p.courseId && PS.store.get('courses', p.courseId);
          return '<div class="list-row">' + (i === 0 ? '<div class="date-badge' + (k === U.todayKey() ? ' gold' : '') + '"><b>' + d.getDate() + '</b><small>' + esc(U.fmtMonthShort(d)) + '</small></div>' : '<div style="width:50px"></div>') +
            '<div class="grow"><span class="title">' + esc(U.fmtMinutes(p.minutes)) + (p.focus ? ' · ' + U.bidi(p.focus) : '') + '</span>' +
            '<span class="sub">' + (i === 0 ? esc(U.relDay(k)) + (list.length > 1 ? ' · סה״כ ' + esc(U.fmtMinutes(mins)) : '') : '') + (sg.length ? (i === 0 ? ' · ' : '') + sg.map(function (s) { return U.bidi(s.title); }).join(', ') : '') + (course ? ' · ' + U.bidi(course.title) : '') + '</span></div>' +
            '<div class="trail">' + (p.feel ? '<span class="chip chip-' + (FEEL_TONE[p.feel] || 'muted') + ' hide-xs">' + esc(L.practiceFeel[p.feel] || '') + '</span>' : '') +
            '<button type="button" class="icon-btn sm" data-act="practice-edit" data-id="' + p.id + '" aria-label="עריכת אימון">' + I('edit') + '</button></div></div>';
        }).join('');
      }).join('') + '</div>';
    }
    el.innerHTML = html + '</div></div>';
  }

  PS.views.practice = { title: function () { return 'יומן אימונים'; }, render: render };
})();
