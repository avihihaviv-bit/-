/* Piano Studio — home dashboard (customizable widgets, all figures from stored data). */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;

  var customizing = false;

  var WIDGETS = {
    hero: { label: 'כרטיס פתיחה', render: hero },
    today: { label: 'סקירת היום', render: today },
    quick: { label: 'פעולות מהירות', render: quick },
    progress: { label: 'התקדמות', render: progress },
    chart: { label: 'התקדמות חודשית', render: chart },
    learning: { label: 'בלמידה עכשיו', render: learning },
    activity: { label: 'פעילות אחרונה', render: activity },
    milestones: { label: 'אבני דרך', render: milestones }
  };
  var HALF = { chart: true, learning: true, activity: true, milestones: true };

  /* ---------- data helpers ---------- */
  function nextLesson() {
    var now = new Date();
    return PS.store.list('lessons').filter(function (l) {
      if (l.status !== 'upcoming' && l.status !== 'rescheduled') return false;
      var d = U.combine(l.date, l.time);
      return d && d.getTime() + (l.duration || 0) * 60000 > now.getTime();
    }).sort(U.byKey(function (l) { return U.dkey(l.date) + (l.time || ''); }))[0] || null;
  }
  function currentSong() {
    var learning = PS.store.list('songs').filter(function (s) { return s.status === 'learning'; });
    learning.sort(U.byKey('priority'));
    return learning[0] || PS.store.list('songs').filter(function (s) { return s.status === 'reviewing'; })[0] || null;
  }
  function upcomingDeadline() {
    var today = U.todayKey();
    var items = [];
    PS.store.list('tasks').forEach(function (t) { if (!t.done && t.dueDate && t.dueDate > today) items.push({ date: t.dueDate, title: t.title, kind: 'משימה', href: '#/tasks?open=' + t.id }); });
    PS.store.list('goals').forEach(function (g) { if (g.status === 'active' && g.deadline && g.deadline >= today) items.push({ date: g.deadline, title: g.title, kind: 'יעד', href: '#/goals' }); });
    PS.store.list('courses').forEach(function (c) { if (c.status !== 'completed' && c.targetDate && c.targetDate >= today) items.push({ date: c.targetDate, title: c.title, kind: 'קורס', href: '#/courses/' + c.id }); });
    PS.store.list('songs').forEach(function (s) { if (s.status !== 'learned' && s.status !== 'archived' && s.targetDate && s.targetDate >= today) items.push({ date: s.targetDate, title: s.title, kind: 'שיר', href: '#/songs/' + s.id }); });
    items.sort(U.byKey('date'));
    return items[0] || null;
  }

  /* ---------- widgets ---------- */
  function hero() {
    var g = PS.game.info();
    var w = PS.game.weekly();
    var c = PS.game.counts();
    var name = PS.prefs.get('name');
    var bars = [0.35, 0.6, 0.85, 0.5, 0.95, 0.7, 0.4, 0.75, 0.55, 0.9, 0.45, 0.65, 0.3, 0.8, 0.5, 0.7, 0.38, 0.6];
    var viz = '<svg class="hero-viz" viewBox="0 0 330 120" aria-hidden="true"><defs><linearGradient id="heroGold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--gold-2)"/><stop offset="1" stop-color="var(--gold-deep)" stop-opacity=".25"/></linearGradient></defs>' +
      bars.map(function (b, i) { var h = 110 * b; return '<rect x="' + (i * 18.4 + 2) + '" y="' + (115 - h) + '" width="9" height="' + h + '" rx="4.5" style="--s1:' + (0.35 + (b * 0.4)).toFixed(2) + ';--s2:' + (1 - b * 0.35).toFixed(2) + ';animation-delay:' + (-i * 0.23).toFixed(2) + 's"/>'; }).join('') + '</svg>';
    return '<section class="hero" aria-label="פתיח">' +
      '<div style="position:relative;z-index:1">' +
        '<div class="hero-kicker">' + I('sparkle') + 'רמה ' + g.level + ' · ' + esc(g.title) + '</div>' +
        '<h1>' + esc(U.greeting()) + (name ? ', <em>' + esc(name) + '</em>' : '') + '</h1>' +
        '<p class="hero-sub">המסע המוזיקלי שלך ממשיך כאן</p>' +
        '<div class="hero-xp"><div class="hero-xp-row"><span>התקדמות לרמה ' + (g.level + 1) + '</span><span class="num">' + U.ltr(U.num(g.into) + ' / ' + U.num(g.need) + ' XP') + '</span></div>' + ui.bar(g.pct, 'pbar-l') + '</div>' +
        '<div class="hero-stats">' +
          '<div class="hero-stat"><small>שירים שנלמדו</small><b class="num">' + c.songsLearned + '</b></div>' +
          '<div class="hero-stat"><small>שיעורים שהתקיימו</small><b class="num">' + c.lessonsDone + '</b></div>' +
          '<div class="hero-stat"><small>קורסים שהושלמו</small><b class="num">' + c.coursesDone + '</b></div>' +
          '<div class="hero-stat"><small>XP מצטבר</small><b class="num">' + U.num(g.lifetime) + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="hero-side">' + viz +
        '<div class="hero-week">' + ui.ring(w.pct, 58, w.done + '/' + w.target) +
          '<div><b>' + (w.reached ? 'היעד השבועי הושג ✦' : 'היעד השבועי') + '</b><small>' + (w.reached ? 'כל הכבוד! ' + U.xp(PS.game.XP.weekly) : 'עוד ' + (w.target - w.done) + ' פעולות למידה השבוע') + '</small></div></div>' +
      '</div>' +
    '</section>';
  }

  function today() {
    var nl = nextLesson();
    var t = U.todayKey();
    var tasksToday = PS.store.list('tasks').filter(function (x) { return !x.done && x.dueDate && x.dueDate <= t; }).sort(U.byKey('dueDate'));
    var song = currentSong();
    var dl = upcomingDeadline();
    var courses = PS.store.list('courses').filter(function (c) { return c.status === 'in_progress'; });
    function card(icon, label, body, foot, href, isEmpty) {
      return '<div class="card today-card lift' + (isEmpty ? ' empty-card' : '') + '"' + (href ? ' data-href="' + href + '" tabindex="0" role="link"' : '') + '>' +
        '<div class="label">' + I(icon) + esc(label) + '</div><div class="big">' + body + '</div><div class="foot">' + (foot || '') + '</div></div>';
    }
    var start = nl && U.combine(nl.date, nl.time);
    return '<section aria-label="סקירת היום"><div class="section-head"><h2>' + I('sparkle') + 'היום שלך</h2></div><div class="today-grid stagger">' +
      (nl ? card('clock', 'השיעור הבא', U.bidi(nl.title), '<span class="countdown">' + (start > new Date() ? 'בעוד ' + esc(U.countdown(start)) : 'מתקיים עכשיו') + '</span><span>' + esc(U.relDay(nl.date)) + (nl.time ? ' · ' + esc(nl.time) : '') + '</span>', '#/lessons/' + nl.id)
        : card('clock', 'השיעור הבא', 'אין שיעור מתוכנן', '<button type="button" class="btn btn-sm btn-ghost" data-act="add-lesson">' + I('plus') + 'קביעת שיעור</button>', null, true)) +
      (tasksToday.length ? card('list', 'משימות להיום', tasksToday.length + ' ' + (tasksToday.length === 1 ? 'משימה' : 'משימות') + ' · ' + U.bidi(tasksToday[0].title), tasksToday.some(function (x) { return x.dueDate < t; }) ? '<span class="chip chip-red">יש משימות באיחור</span>' : '<span>מתוכננות להיום</span>', '#/tasks?view=today')
        : card('list', 'משימות להיום', 'אין משימות להיום', '<button type="button" class="btn btn-sm btn-ghost" data-act="add-task">' + I('plus') + 'משימה חדשה</button>', null, true)) +
      (song ? card('music', 'השיר שבלמידה', U.bidi(song.title), '<span style="flex:1;min-width:80px">' + ui.bar((song.progress || 0) / 100, 'pbar-xs') + '</span><span class="num">' + (song.progress || 0) + '%</span>', '#/songs/' + song.id)
        : card('music', 'השיר שבלמידה', 'עוד לא נבחר שיר ללמידה', '<a class="btn btn-sm btn-ghost" href="#/songs">' + I('music') + 'לספריית השירים</a>', null, true)) +
      (dl ? card('flag', 'המועד הקרוב', U.bidi(dl.title), '<span class="chip chip-muted">' + esc(dl.kind) + '</span><span>' + esc(U.relDay(dl.date)) + '</span>', dl.href)
        : card('flag', 'המועד הקרוב', 'אין מועדים קרובים', '<span>מועדי יעד של משימות, קורסים ויעדים יופיעו כאן</span>', null, true)) +
      (courses.length ? card('book', 'קורסים בתהליך', courses.length + ' ' + (courses.length === 1 ? 'קורס' : 'קורסים') + ' · ' + U.bidi(courses[0].title), '<span style="flex:1;min-width:80px">' + ui.bar(PS.domain.courseProgress(courses[0]), 'pbar-xs') + '</span><span class="num">' + Math.round(PS.domain.courseProgress(courses[0]) * 100) + '%</span>', courses.length === 1 ? '#/courses/' + courses[0].id : '#/courses')
        : card('book', 'קורסים בתהליך', 'אין קורס פעיל', '<button type="button" class="btn btn-sm btn-ghost" data-act="add-course">' + I('plus') + 'הוספת קורס</button>', null, true)) +
    '</div></section>';
  }

  function quick() {
    var items = [['add-lesson', 'שיעור', 'clock'], ['add-song', 'שיר', 'music'], ['add-course', 'קורס', 'book'], ['add-task', 'משימה', 'list'], ['add-note', 'פתק', 'note'], ['add-goal', 'יעד', 'target']];
    return '<section aria-label="פעולות מהירות"><div class="section-head"><h2>' + I('plus') + 'הוספה מהירה</h2></div><div class="quick-grid">' +
      items.map(function (i) { return '<button type="button" class="quick-btn" data-act="' + i[0] + '"><span class="qi">' + I(i[2]) + '</span>' + esc(i[1]) + '</button>'; }).join('') + '</div></section>';
  }

  function progress() {
    var c = PS.game.counts();
    var w = PS.game.weekly();
    var monthStart = U.startOfMonth(new Date());
    var nextMonth = U.addMonths(monthStart, 1);
    var tasksMonth = PS.stats.inRange(PS.stats.D.tasksCompleted(), { from: monthStart, to: nextMonth });
    var lessonsMonth = PS.stats.inRange(PS.stats.D.lessonsAttended(), { from: monthStart, to: nextMonth });
    function tile(icon, label, value, sub) {
      return '<div class="card stat"><div class="stat-label">' + I(icon) + esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + sub + '</div></div>';
    }
    return '<section aria-label="התקדמות"><div class="section-head"><h2>' + I('chart') + 'התקדמות</h2><a href="#/stats">לסטטיסטיקה המלאה ' + I('chevronLeft') + '</a></div><div class="stat-tiles stagger">' +
      tile('target', 'השלמה שבועית', Math.round(w.pct * 100) + '%', w.done + ' מתוך ' + w.target + ' פעולות') +
      tile('music', 'שירים שנלמדו', c.songsLearned, c.songs + ' שירים בספרייה') +
      tile('clock', 'שיעורים שהתקיימו', c.lessonsDone, lessonsMonth + ' החודש') +
      tile('list', 'משימות שהושלמו', c.tasksDone, tasksMonth + ' החודש') +
    '</div></section>';
  }

  function chart() {
    var data = PS.stats.monthlyActions(6);
    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    return '<div class="card pad"><div class="card-head"><h3>' + I('chart') + 'פעולות למידה בחצי השנה האחרונה</h3></div>' +
      (total ? PS.chart.bars(data, { height: 190, unit: 'פעולות', title: 'פעולות למידה לפי חודש' }) +
        '<p class="small faint" style="margin-top:8px">משימות, שיעורים, מודולים ושירים שהושלמו בכל חודש</p>'
        : ui.empty({ icon: 'chart', title: 'עוד אין היסטוריה להצגה', text: 'השלימו משימה, שיעור או מודול — והתרשים יתחיל להתמלא מנתונים אמיתיים.' }).replace('class="empty"', 'class="empty compact"')) +
    '</div>';
  }

  function learning() {
    var songs = PS.store.list('songs').filter(function (s) { return s.status === 'learning' || s.status === 'reviewing'; }).sort(U.byKey('priority')).slice(0, 4);
    var courses = PS.store.list('courses').filter(function (c) { return c.status === 'in_progress'; }).slice(0, 3);
    if (!songs.length && !courses.length) {
      return '<div class="card pad"><div class="card-head"><h3>' + I('music') + 'בלמידה עכשיו</h3></div>' + ui.empty({ icon: 'music', title: 'אין שירים או קורסים בלמידה', text: 'סמנו שיר כ"בלמידה" או התחילו קורס כדי לעקוב אחרי ההתקדמות כאן.', action: { act: 'add-song', label: 'הוספת שיר' } }).replace('class="empty"', 'class="empty compact"') + '</div>';
    }
    return '<div class="card"><div class="card-head" style="padding:18px 20px 0"><h3>' + I('music') + 'בלמידה עכשיו</h3><a class="link" href="#/songs?c=learning">הכל</a></div><div class="list">' +
      songs.map(function (s) {
        return '<div class="list-row" data-href="#/songs/' + s.id + '" tabindex="0" role="link">' + ui.cover(s, 'cover-sm') +
          '<div class="grow"><span class="title">' + U.bidi(s.title) + '</span><span class="sub">' + U.bidi(s.artist || PS.schema.labels.songStatus[s.status]) + '</span></div>' +
          '<div class="trail" style="width:110px">' + ui.bar((s.progress || 0) / 100, 'pbar-xs') + '<span class="num small muted">' + (s.progress || 0) + '%</span></div></div>';
      }).join('') +
      courses.map(function (c) {
        var p = PS.domain.courseProgress(c);
        return '<div class="list-row" data-href="#/courses/' + c.id + '" tabindex="0" role="link"><span class="palette-icon">' + I('book') + '</span>' +
          '<div class="grow"><span class="title">' + U.bidi(c.title) + '</span><span class="sub">' + (c.modules || []).filter(function (m) { return m.done; }).length + '/' + (c.modules || []).length + ' מודולים</span></div>' +
          '<div class="trail" style="width:110px">' + ui.bar(p, 'pbar-xs') + '<span class="num small muted">' + Math.round(p * 100) + '%</span></div></div>';
      }).join('') + '</div></div>';
  }

  var ACT_ICON = { create: 'plus', task: 'check', lesson: 'clock', song: 'music', course: 'book', goal: 'target', achievement: 'trophy', level: 'bolt', xp: 'sparkle', backup: 'download' };
  function activity() {
    var items = PS.store.list('activity').sort(U.byKey('at', 'desc')).slice(0, 7);
    return '<div class="card pad"><div class="card-head"><h3>' + I('history') + 'פעילות אחרונה</h3><a class="link" href="#/journey">למסע המלא</a></div>' +
      (items.length ? '<ul class="activity">' + items.map(function (a) {
        return '<li><span class="a-icon">' + I(ACT_ICON[a.type] || 'sparkle') + '</span><span class="a-text">' + U.bidi(a.text) + '<small>' + esc(U.timeAgo(a.at)) + '</small></span></li>';
      }).join('') + '</ul>' : ui.empty({ icon: 'history', title: 'עדיין אין פעילות', text: 'כל פעולה שתבצעו — שיר שנוסף, משימה שהושלמה, פתק שנכתב — תופיע כאן.' }).replace('class="empty"', 'class="empty compact"')) + '</div>';
  }

  function milestones() {
    var st = PS.game.achievementState();
    var recent = st.filter(function (a) { return a.unlocked; }).sort(U.byKey('unlockedAt', 'desc')).slice(0, 2);
    var nextOnes = st.filter(function (a) { return !a.unlocked; }).sort(function (a, b) { return (b.current / b.target) - (a.current / a.target); }).slice(0, 4 - recent.length);
    return '<div class="card pad"><div class="card-head"><h3>' + I('flag') + 'אבני דרך</h3><a class="link" href="#/achievements">כל ההישגים</a></div><div class="milestones">' +
      recent.map(function (a) {
        return '<div class="milestone done"><span class="m-icon">' + I(a.icon) + '</span><div class="grow"><b>' + esc(a.name) + '</b><small>נפתח ' + esc(U.timeAgo(a.unlockedAt)) + '</small></div>' + I('checkCircle', 'gold') + '</div>';
      }).join('') +
      nextOnes.map(function (a) {
        return '<div class="milestone"><span class="m-icon">' + I(a.icon) + '</span><div class="grow"><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>' + '<div style="margin-top:6px">' + ui.bar(a.current / a.target, 'pbar-xs') + '</div></div><span class="num small muted">' + a.current + '/' + a.target + '</span></div>';
      }).join('') + '</div></div>';
  }

  /* ---------- render ---------- */
  function render(el) {
    var order = PS.prefs.get('dashboardOrder').filter(function (k) { return WIDGETS[k]; });
    var hidden = PS.prefs.get('dashboardHidden') || [];
    var visible = order.filter(function (k) { return customizing || hidden.indexOf(k) < 0; });
    var html = '<div class="page' + (customizing ? ' customizing' : '') + '">';
    html += '<div class="dash-head"><div></div><div class="page-actions">' +
      (customizing ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-act="dash-customize">' + I('sliders') + 'התאמת הדשבורד</button>') + '</div></div>';
    if (customizing) {
      html += '<div class="customize-bar" role="region" aria-label="התאמת הדשבורד">' + I('sliders') + '<span style="flex:1">סדרו את הווידג׳טים עם החצים, והסתירו את מה שלא נחוץ לכם.</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="dash-reset">איפוס</button><button type="button" class="btn btn-primary btn-sm" data-act="dash-done">' + I('check') + 'סיום</button></div>';
    }
    // half-width widgets are paired into a two-column row
    var i = 0;
    while (i < visible.length) {
      var k = visible[i];
      if (HALF[k] && HALF[visible[i + 1]]) {
        html += '<div class="section grid grid-2">' + widget(visible[i], hidden) + widget(visible[i + 1], hidden) + '</div>';
        i += 2;
      } else {
        html += '<div class="section">' + widget(k, hidden) + '</div>';
        i++;
      }
    }
    if (!visible.length) html += '<div class="card pad">' + ui.empty({ icon: 'sliders', title: 'כל הווידג׳טים מוסתרים', text: 'אפשר להחזיר אותם דרך "התאמת הדשבורד".', action: { act: 'dash-customize', label: 'התאמת הדשבורד' } }) + '</div>';
    html += '</div>';
    el.innerHTML = html;
    var first = el.querySelector('.section');
    if (first) first.style.marginTop = '0';
  }

  function widget(k, hidden) {
    var isHidden = hidden.indexOf(k) >= 0;
    var tools = '<div class="widget-tools"><button type="button" class="icon-btn sm" data-act="dash-move" data-w="' + k + '" data-dir="-1" aria-label="הזזה למעלה: ' + esc(WIDGETS[k].label) + '">' + I('arrowUp') + '</button>' +
      '<button type="button" class="icon-btn sm" data-act="dash-move" data-w="' + k + '" data-dir="1" aria-label="הזזה למטה: ' + esc(WIDGETS[k].label) + '">' + I('arrowDown') + '</button>' +
      '<button type="button" class="icon-btn sm' + (isHidden ? '' : ' on') + '" data-act="dash-toggle" data-w="' + k + '" aria-pressed="' + !isHidden + '" aria-label="' + (isHidden ? 'הצגה' : 'הסתרה') + ': ' + esc(WIDGETS[k].label) + '">' + I(isHidden ? 'eyeOff' : 'eye') + '</button></div>';
    var body;
    try { body = WIDGETS[k].render(); } catch (e) { console.error(e); body = '<div class="card pad muted">שגיאה בטעינת הווידג׳ט</div>'; }
    return '<div class="widget' + (isHidden ? ' hidden-widget' : '') + '" data-widget="' + k + '">' + (customizing ? tools : '') + body + '</div>';
  }

  Object.assign(PS.act, {
    'dash-customize': function () { customizing = true; PS.refresh(); },
    'dash-done': function () { customizing = false; PS.refresh(); PS.ui.toast('הדשבורד עודכן', 'success'); },
    'dash-reset': function () { PS.prefs.set({ dashboardOrder: PS.prefs.DEFAULTS.dashboardOrder.slice(), dashboardHidden: [] }); },
    'dash-move': function (el) {
      var order = PS.prefs.get('dashboardOrder').slice();
      var i = order.indexOf(el.dataset.w), j = i + (+el.dataset.dir);
      if (i < 0 || j < 0 || j >= order.length) return;
      var t = order[i]; order[i] = order[j]; order[j] = t;
      PS.prefs.set('dashboardOrder', order);
    },
    'dash-toggle': function (el) {
      var h = (PS.prefs.get('dashboardHidden') || []).slice();
      var i = h.indexOf(el.dataset.w);
      if (i >= 0) h.splice(i, 1); else h.push(el.dataset.w);
      PS.prefs.set('dashboardHidden', h);
    }
  });

  PS.views.home = { title: function () { return 'בית'; }, render: render, WIDGETS: WIDGETS };
})();
