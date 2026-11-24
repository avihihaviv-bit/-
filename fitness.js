/* Maslul fitness module: workout sessions from a split plan, smart set logging with
   progressive-overload suggestions, auto rest timer, progress charts, body weight,
   plan editor, and the original log + exercise library.
   Every set is stored in state.workoutLog (the original format) so nothing old breaks. */
(function () {
  'use strict';
  var F = window.MaslulFeatures, C = window.MaslulCore;
  if (!F || !C) return;
  function api() { return F.api(); }
  function U() { return F.util; }
  function S() { return api().state(); }
  function FS() { return S().fitness; }
  function save() { api().save(); }
  function esc(x) { return U().esc(x); }
  function ic(n) { return U().ic(n); }
  function tk() { return U().todayKey(); }
  function uid() { return api().uid(); }
  function r1(n) { return Math.round((+n || 0) * 10) / 10; }

  var GROUPS = ['חזה', 'גב', 'כתפיים', 'ידיים', 'רגליים', 'בטן', 'קרדיו', 'אחר'];
  var TYPE_LABEL = { weight: 'משקל × חזרות', bodyweight: 'משקל גוף (חזרות)', time: 'זמן (דקות)' };
  function ex(name, group, sets, reps, type, rest) { return { id: uid(), name: name, group: group, sets: sets, reps: reps, type: type || 'weight', rest: rest || 90 }; }
  function defaultPlan() {
    return { days: [
      { id: uid(), name: 'Upper 1', focus: 'חזה, גב, כתפיים, ידיים, בטן', exercises: [ex('לחיצת חזה', 'חזה', 3, '8-12'), ex('פולי עליון', 'גב', 3, '8-12'), ex('לחיצת כתפיים', 'כתפיים', 3, '8-12'), ex('כפיפת מרפקים', 'ידיים', 3, '10-12', 'weight', 75), ex('פשיטת מרפקים בפולי', 'ידיים', 3, '10-12', 'weight', 75), ex('כפיפות בטן', 'בטן', 3, '12-15', 'bodyweight', 60)] },
      { id: uid(), name: 'Lower 1', focus: 'רגליים, בטן', exercises: [ex('לחיצת רגליים', 'רגליים', 3, '8-12', 'weight', 120), ex('פשיטת ברכיים', 'רגליים', 3, '10-12'), ex('כפיפת ברכיים', 'רגליים', 3, '10-12'), ex('תאומים', 'רגליים', 3, '12-15', 'weight', 60), ex('פלאנק (שניות)', 'בטן', 3, '30-60', 'bodyweight', 60)] },
      { id: uid(), name: 'Upper 2', focus: 'קליסטניקס + גב וכתפיים', exercises: [ex('מתח', 'גב', 2, '6-8', 'bodyweight', 150), ex('מקבילים', 'חזה', 2, '6-8', 'bodyweight', 150), ex('חתירה בכבל', 'גב', 3, '8-12'), ex('הרחקת כתפיים', 'כתפיים', 3, '12-15', 'weight', 60), ex('פטישים', 'ידיים', 3, '10-12', 'weight', 75), ex('הרמת רגליים', 'בטן', 3, '10-15', 'bodyweight', 60)] },
      { id: uid(), name: 'Lower 2 / קרדיו', focus: 'כדורגל, איגרוף, ריצה או אירובי', exercises: [ex('קרדיו / ספורט', 'קרדיו', 1, '30-45', 'time', 0), ex('סקוואט משקל גוף', 'רגליים', 2, '15-20', 'bodyweight', 60)] }
    ] };
  }
  function plan() { var f = FS(); if (!f.plan || !Array.isArray(f.plan.days) || !f.plan.days.length) { f.plan = defaultPlan(); save(); } return f.plan; }
  function dayById(id) { return plan().days.filter(function (d) { return d.id === id; })[0]; }
  function setsOf(name) { var n = (name || '').trim(); return (S().workoutLog || []).filter(function (e) { return (e.machine || '').trim() === n; }); }
  function setDate(e) { return e.date || (e.at ? C.dkey(new Date(e.at)) : ''); }
  // sets of an exercise grouped by session/date, newest first
  function historyOf(name) {
    var by = {}, order = [];
    setsOf(name).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }).forEach(function (e) { var k = e.sessionId || setDate(e); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(e); });
    return order.map(function (k) { return { key: k, date: setDate(by[k][0]), sets: by[k].slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); }) }; });
  }
  function lastSessionSets(name, excludeSessionId) {
    var h = historyOf(name).filter(function (x) { return x.key !== excludeSessionId; });
    return h.length ? h[0] : null;
  }
  function groupOf(name) {
    var n = (name || '').trim(), g = null;
    plan().days.forEach(function (d) { d.exercises.forEach(function (x) { if (x.name.trim() === n) g = x.group; }); });
    return g || 'אחר';
  }
  function fmtSet(e, type) { return type === 'time' ? (e.reps + ' דק׳') : (+e.kg ? r1(e.kg) + '×' + e.reps : e.reps + ' חזרות'); }

  var ui = { tab: 'today', exSel: null, editDay: null };

  /* ---------------- rest timer (floating, wall-clock) ---------------- */
  var rest = { endsAt: 0, total: 0, iv: null };
  function startRest(sec) {
    if (!(sec > 0)) return;
    rest.total = sec; rest.endsAt = Date.now() + sec * 1000;
    clearInterval(rest.iv); rest.iv = setInterval(paintRest, 250); paintRest();
  }
  function stopRest() { clearInterval(rest.iv); rest.endsAt = 0; var b = document.getElementById('ft-rest'); if (b) b.remove(); }
  function paintRest() {
    var left = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000));
    var bar = document.getElementById('ft-rest');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'ft-rest'; bar.className = 'ft-rest'; bar.setAttribute('role', 'timer');
      bar.innerHTML = '<span class="ft-rest-l">מנוחה</span><b class="num" id="ft-rest-t"></b><div class="ft-rest-bar"><i id="ft-rest-f"></i></div><button class="fx-mini" id="ft-rest-plus">+30</button><button class="fx-mini" id="ft-rest-skip">דלג</button>';
      document.body.appendChild(bar);
      bar.querySelector('#ft-rest-plus').addEventListener('click', function () { rest.endsAt += 30000; rest.total += 30; paintRest(); });
      bar.querySelector('#ft-rest-skip').addEventListener('click', stopRest);
    }
    bar.querySelector('#ft-rest-t').textContent = U().pad(Math.floor(left / 60)) + ':' + U().pad(left % 60);
    bar.querySelector('#ft-rest-f').style.width = (rest.total ? (1 - left / rest.total) * 100 : 0) + '%';
    if (left <= 0) {
      clearInterval(rest.iv); rest.endsAt = 0;
      U().beep(); try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      U().notify('focus', 'המנוחה נגמרה', 'לסט הבא 💪');
      bar.classList.add('done'); bar.querySelector('#ft-rest-t').textContent = 'לסט הבא!';
      setTimeout(function () { if (!rest.endsAt) { var b = document.getElementById('ft-rest'); if (b) b.remove(); } }, 4000);
    }
  }

  /* ---------------- render ---------------- */
  function render(el) {
    var f = FS(); plan();
    var tabs = [['today', f.active ? 'אימון פעיל •' : 'אימון היום'], ['progress', 'התקדמות'], ['plan', 'תוכנית'], ['log', 'יומן'], ['library', 'ספרייה']];
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">כושר</h2><p class="page-sub">אימון לפי תוכנית, מעקב משקלים, התקדמות וטיפים</p></div></div>' +
      '<div class="fx-tabs">' + tabs.map(function (t) { return '<button class="fx-tab' + (ui.tab === t[0] ? ' active' : '') + '" data-ft-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="ft-body"></div>';
    var body = el.querySelector('#ft-body');
    try {
      ({ today: renderToday, progress: renderProgress, plan: renderPlan, log: renderLog, library: renderLibrary })[ui.tab](body, el);
    } catch (e) { console.error(e); body.innerHTML = '<div class="card">משהו השתבש במסך הזה. הנתונים שלך בטוחים.</div>'; }
    U().on(el, '[data-ft-tab]', 'click', function (b) { ui.tab = b.dataset.ftTab; render(el); });
  }

  /* ---------- TODAY ---------- */
  function weekStats() {
    var f = FS(), ws = C.weekStartKey(tk());
    var sessions = f.sessions.filter(function (s) { return s.endedAt && s.date >= ws; });
    var days = {}; sessions.forEach(function (s) { days[s.date] = true; });
    (S().workoutLog || []).forEach(function (e) { var d = setDate(e); if (d >= ws) days[d] = true; });
    return { count: Object.keys(days).length, days: days, ws: ws };
  }
  function weekStreak() {
    // consecutive weeks (before this one) that met the weekly goal
    var goal = FS().weeklyGoal, n = 0, ws = C.addDays(C.weekStartKey(tk()), -7);
    var dates = {}; FS().sessions.forEach(function (s) { if (s.endedAt) dates[s.date] = true; }); (S().workoutLog || []).forEach(function (e) { dates[setDate(e)] = true; });
    for (var g = 0; g < 104; g++) { var c = 0; for (var i = 0; i < 7; i++) if (dates[C.addDays(ws, i)]) c++; if (c >= goal) { n++; ws = C.addDays(ws, -7); } else break; }
    return n;
  }
  function renderToday(body, el) {
    var f = FS(), p = plan();
    if (f.active) return renderActive(body, el);
    var idx = ui.pickDay != null ? ui.pickDay : C.nextSplitIndex(f.sessions, p.days);
    var day = p.days[idx] || p.days[0];
    var w = weekStats(), streak = weekStreak();
    var strip = '';
    for (var i = 0; i < 7; i++) { var k = C.addDays(w.ws, i); strip += '<div class="fx-wk-cell' + (w.days[k] ? ' great' : '') + (k === tk() ? ' today' : '') + (k > tk() ? ' fut' : '') + '"><span>' + U().HE_DAYS_SHORT[i] + '</span><b>' + (w.days[k] ? '💪' : '·') + '</b></div>'; }
    body.innerHTML =
      '<div class="ft-hero card"><div class="ft-hero-top"><div><div class="page-sub">האימון הבא בתוכנית</div><div class="ft-hero-name">' + esc(day.name) + '</div><div class="page-sub">' + esc(day.focus || '') + ' · ' + day.exercises.length + ' תרגילים · כ-' + estMinutes(day) + ' דק׳</div></div>' +
        '<button class="btn btn-primary ft-start" id="ft-start">' + ic('play') + 'התחל אימון</button></div>' +
        '<div class="ft-daypick">' + p.days.map(function (d, i) { return '<button class="fx-mini' + (i === idx ? ' fx-mini-on' : '') + '" data-pick="' + i + '">' + esc(d.name) + '</button>'; }).join('') + '</div>' +
        '<div class="ft-preview">' + day.exercises.map(function (x) {
          var last = lastSessionSets(x.name), sug = last ? C.suggestNext(last.sets, x.reps, x.type) : null;
          return '<div class="ft-prev-row"><span class="ft-prev-name">' + esc(x.name) + '</span><span class="page-sub">' + '<bdi dir="ltr">' + x.sets + '×' + esc(x.reps) + '</bdi>' + (x.type === 'time' ? ' דק׳' : '') + '</span>' + (sug && x.type !== 'time' ? '<span class="fx-chip fx-chip-accent">' + (sug.action === 'up' ? '▲ ' + sug.kg + ' ק״ג' : '<bdi dir="ltr">' + last.sets.map(function (s) { return fmtSet(s, x.type); }).slice(-1)[0] + '</bdi>') + '</span>' : '') + '</div>';
        }).join('') + '</div></div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>השבוע</h3><span class="page-sub">' + w.count + '/' + f.weeklyGoal + ' אימונים' + (streak ? ' · 🔥 ' + streak + ' שבועות ברצף' : '') + '</span></div>' + U().progressBar(Math.round(w.count / f.weeklyGoal * 100), w.count >= f.weeklyGoal ? 'var(--success)' : null) + '<div class="fx-week-strip" style="margin-top:10px;">' + strip + '</div></div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>⏱ טיימר מנוחה</h3><span class="page-sub">מתחיל לבד אחרי כל סט באימון</span></div><div class="fx-btn-row">' + [60, 90, 120, 150, 180].map(function (s) { return '<button class="btn btn-ghost btn-sm" data-rest="' + s + '">' + (s % 60 ? s + ' שנ׳' : (s / 60) + ' דק׳') + '</button>'; }).join('') + '</div></div>' +
      bodyweightQuickHtml() +
      '<div class="ft-tip page-sub">💡 העיקרון החשוב: <b>עומס מתקדם</b>. כשכל הסטים מגיעים לקצה העליון של טווח החזרות, מעלים משקל. האפליקציה מציעה לך את זה אוטומטית.</div>';
    U().on(body, '[data-pick]', 'click', function (b) { ui.pickDay = +b.dataset.pick; render(el); });
    body.querySelector('#ft-start').addEventListener('click', function () {
      f.active = { id: 'ses_' + uid(), dayId: day.id, startedAt: Date.now(), extra: [] };
      ui.pickDay = null; save(); render(el); window.scrollTo(0, 0);
    });
    U().on(body, '[data-rest]', 'click', function (b) { startRest(+b.dataset.rest); });
    wireBodyweightQuick(body, el);
  }
  function estMinutes(day) { return Math.round(day.exercises.reduce(function (a, x) { return a + (x.type === 'time' ? (C.parseRepRange(x.reps).max) : x.sets * (0.75 + (x.rest || 90) / 60)); }, 0) + 5); }

  function renderActive(body, el) {
    var f = FS(), a = f.active, day = dayById(a.dayId) || { name: 'אימון חופשי', exercises: [] };
    var list = day.exercises.concat(a.extra || []);
    var sesSets = (S().workoutLog || []).filter(function (e) { return e.sessionId === a.id; });
    var mins = Math.round((Date.now() - a.startedAt) / 60000);
    var vol = sesSets.reduce(function (s, e) { return s + (+e.kg || 0) * (+e.reps || 0); }, 0);
    var doneEx = list.filter(function (x) { return sesSets.filter(function (e) { return (e.machine || '').trim() === x.name.trim(); }).length >= x.sets; }).length;
    body.innerHTML =
      '<div class="ft-live card"><div><div class="page-sub">אימון פעיל</div><div class="ft-hero-name">' + esc(day.name) + '</div></div>' +
        '<div class="ft-live-stats"><span><b class="num" id="ft-elapsed">' + mins + '</b> דק׳</span><span><b class="num">' + sesSets.length + '</b> סטים</span><span><b class="num">' + Math.round(vol) + '</b> ק״ג נפח</span><span><b class="num">' + doneEx + '/' + list.length + '</b> תרגילים</span></div>' +
        U().progressBar(list.length ? Math.round(doneEx / list.length * 100) : 0, 'var(--success)') + '</div>' +
      list.map(function (x, xi) { return exerciseCardHtml(x, xi, sesSets, a); }).join('') +
      '<div class="card fx-card-gap"><div class="ms-add-row"><input type="text" class="ms-input" id="ft-add-ex" list="ft-ex-names" placeholder="הוסף תרגיל לאימון הזה"><datalist id="ft-ex-names">' + allExerciseNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><button class="btn btn-ghost btn-sm" id="ft-add-ex-btn">' + ic('plus') + '</button></div></div>' +
      '<div class="ft-finish-row"><button class="btn btn-primary btn-block" id="ft-finish">' + ic('check') + 'סיים אימון</button><button class="btn btn-ghost" id="ft-cancel">בטל</button></div>';
    var elapsed = setInterval(function () { var t = document.getElementById('ft-elapsed'); if (!t || !FS().active) { clearInterval(elapsed); return; } t.textContent = Math.round((Date.now() - a.startedAt) / 60000); }, 20000);

    U().on(body, '[data-step2]', 'click', function (b) { var inp = body.querySelector('#' + b.dataset.step2); inp.value = r1(Math.max(0, (+inp.value || 0) + (+b.dataset.d))); });
    U().on(body, '[data-logset]', 'click', function (b) {
      var x = list[+b.dataset.logset];
      var kg = +body.querySelector('#kg-' + b.dataset.logset).value || 0;
      var reps = Math.round(+body.querySelector('#rp-' + b.dataset.logset).value || 0);
      if (!reps) { api().toast(x.type === 'time' ? 'כמה דקות?' : 'כמה חזרות עשית?', 'error'); body.querySelector('#rp-' + b.dataset.logset).focus(); return; }
      var prevBest = Math.max.apply(null, [0].concat(setsOf(x.name).map(function (e) { return C.e1rm(e.kg, e.reps); })));
      S().workoutLog.push({ id: uid(), machine: x.name.trim(), kg: x.type === 'weight' ? kg : (x.type === 'bodyweight' ? kg : 0), reps: reps, date: tk(), at: Date.now(), sessionId: a.id, dayId: a.dayId });
      save();
      var isPR = x.type === 'weight' && prevBest > 0 && C.e1rm(kg, reps) > prevBest;
      api().toast(isPR ? '🏆 שיא חדש ב' + x.name + '!' : 'סט נשמר ✓', 'success');
      var nowSets = (S().workoutLog || []).filter(function (e) { return e.sessionId === a.id && e.machine === x.name.trim(); }).length;
      if (x.type !== 'time' && nowSets < x.sets + 3) startRest(x.rest || 90);
      render(el);
      var card = document.querySelector('[data-ex-card="' + b.dataset.logset + '"]'); if (card && nowSets >= x.sets) { var next = document.querySelector('[data-ex-card="' + (+b.dataset.logset + 1) + '"]'); if (next) next.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });
    U().on(body, '[data-delset]', 'click', function (b) { S().workoutLog = S().workoutLog.filter(function (e) { return e.id !== b.dataset.delset; }); save(); render(el); });
    var addEx = function () {
      var n = body.querySelector('#ft-add-ex').value.trim(); if (!n) return;
      a.extra = a.extra || []; a.extra.push({ id: uid(), name: n, group: groupOf(n), sets: 3, reps: '8-12', type: 'weight', rest: 90 }); save(); render(el);
    };
    body.querySelector('#ft-add-ex-btn').addEventListener('click', addEx);
    body.querySelector('#ft-add-ex').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addEx(); } });
    body.querySelector('#ft-cancel').addEventListener('click', function () {
      api().openConfirmModal(sesSets.length ? 'לבטל את האימון? ' + sesSets.length + ' הסטים שרשמת יישארו ביומן.' : 'לבטל את האימון?', function () { f.active = null; save(); stopRest(); render(el); }, { title: 'ביטול אימון', confirmLabel: 'בטל אימון' });
    });
    body.querySelector('#ft-finish').addEventListener('click', function () { finishWorkout(el, day, sesSets); });
  }
  function exerciseCardHtml(x, xi, sesSets, a) {
    var mine = sesSets.filter(function (e) { return (e.machine || '').trim() === x.name.trim(); });
    var last = lastSessionSets(x.name, a.id);
    var sug = last && x.type !== 'time' ? C.suggestNext(last.sets, x.reps, x.type) : null;
    var lastMine = mine[mine.length - 1];
    var preKg = lastMine ? lastMine.kg : (sug ? sug.kg : (last ? last.sets[0].kg : ''));
    var preReps = lastMine ? lastMine.reps : (sug ? sug.reps : C.parseRepRange(x.reps).min);
    var done = mine.length >= x.sets;
    var unit = x.type === 'time' ? 'דקות' : 'חזרות';
    return '<div class="card fx-card-gap ft-ex' + (done ? ' done' : '') + '" data-ex-card="' + xi + '">' +
      '<div class="fx-row-between"><div><div class="ft-ex-name">' + (done ? '✅ ' : '') + esc(x.name) + '</div><div class="page-sub">' + esc(x.group || '') + ' · יעד ' + '<bdi dir="ltr">' + x.sets + '×' + esc(x.reps) + '</bdi>' + ' ' + (x.type === 'time' ? 'דק׳' : '') + (x.rest && x.type !== 'time' ? ' · מנוחה ' + x.rest + ' שנ׳' : '') + '</div></div><span class="ft-count num">' + mine.length + '/' + x.sets + '</span></div>' +
      (last ? '<div class="ft-last page-sub">פעם קודמת (' + U().relDate(last.date) + '): <b dir="ltr">' + last.sets.map(function (s) { return fmtSet(s, x.type); }).join(' , ') + '</b></div>' : '<div class="ft-last page-sub">פעם ראשונה: התחל במשקל נוח שאפשר לבצע בו את כל החזרות בטכניקה טובה.</div>') +
      (sug ? '<div class="ft-sug ft-sug-' + sug.action + '">' + (sug.action === 'up' ? '▲ ' : '→ ') + esc(sug.text) + '</div>' : '') +
      (mine.length ? '<div class="ft-sets">' + mine.map(function (e, i) { return '<span class="ft-set"><b>סט ' + (i + 1) + '</b> <span dir="ltr">' + fmtSet(e, x.type) + '</span><button class="ft-set-x" data-delset="' + e.id + '" aria-label="מחק סט">×</button></span>'; }).join('') + '</div>' : '') +
      '<div class="ft-input">' +
        (x.type === 'weight' || x.type === 'bodyweight' ? '<label class="wl-lbl">' + (x.type === 'bodyweight' ? 'תוספת ק״ג' : 'ק״ג') + '<div class="wl-step"><button type="button" class="wl-step-btn" data-step2="kg-' + xi + '" data-d="-2.5" aria-label="פחות">−</button><input type="number" inputmode="decimal" id="kg-' + xi + '" step="0.5" min="0" value="' + (preKg === '' ? '' : r1(preKg)) + '"><button type="button" class="wl-step-btn" data-step2="kg-' + xi + '" data-d="2.5" aria-label="יותר">+</button></div></label>' : '<input type="hidden" id="kg-' + xi + '" value="0">') +
        '<label class="wl-lbl">' + unit + '<div class="wl-step"><button type="button" class="wl-step-btn" data-step2="rp-' + xi + '" data-d="-1" aria-label="פחות">−</button><input type="number" inputmode="numeric" id="rp-' + xi + '" min="0" value="' + preReps + '"><button type="button" class="wl-step-btn" data-step2="rp-' + xi + '" data-d="1" aria-label="יותר">+</button></div></label>' +
        '<button class="btn ' + (done ? 'btn-ghost' : 'btn-primary') + ' ft-log-btn" data-logset="' + xi + '">' + ic('check') + (done ? 'סט נוסף' : 'סט ' + (mine.length + 1)) + '</button>' +
      '</div></div>';
  }
  function finishWorkout(el, day, sesSets) {
    var f = FS(), a = f.active;
    if (!sesSets.length) { api().toast('עוד לא רשמת אף סט', 'error'); return; }
    var mins = Math.max(1, Math.round((Date.now() - a.startedAt) / 60000));
    var vol = Math.round(sesSets.reduce(function (s, e) { return s + (+e.kg || 0) * (+e.reps || 0); }, 0));
    // PRs: best e1RM in this session beats everything before it
    var prs = [];
    var names = sesSets.map(function (e) { return e.machine; }).filter(function (n, i, arr) { return arr.indexOf(n) === i; });
    names.forEach(function (n) {
      var before = setsOf(n).filter(function (e) { return e.sessionId !== a.id; }).map(function (e) { return C.e1rm(e.kg, e.reps); });
      var now = sesSets.filter(function (e) { return e.machine === n; }).map(function (e) { return C.e1rm(e.kg, e.reps); });
      var bmax = Math.max.apply(null, [0].concat(before)), nmax = Math.max.apply(null, [0].concat(now));
      if (before.length && nmax > bmax) prs.push(n);
    });
    f.sessions.push({ id: a.id, dayId: a.dayId, dayName: day.name, date: tk(), startedAt: a.startedAt, endedAt: Date.now(), minutes: mins, sets: sesSets.length, volume: vol, prs: prs });
    f.active = null;
    save(); stopRest();
    api().grantXPOnce('workout:' + a.id, 40 + Math.min(40, sesSets.length * 2), 'workout', {});
    var st = S(); if (st.habitLog && !((st.habitLog.train || {})[tk()])) { api().toggleHabit('train'); }
    api().flushXP(null);
    ui.tab = 'today'; render(el);
    var m = U().openModal('<div class="ft-done-hero">🎉</div><h3 style="text-align:center;">אימון הושלם!</h3>' +
      '<div class="fx-kpis fx-kpis-sm" style="grid-template-columns:repeat(2,1fr);">' + U().kpi('זמן', mins + ' דק׳') + U().kpi('סטים', sesSets.length) + U().kpi('נפח', vol + ' ק״ג') + U().kpi('שיאים', prs.length ? '🏆 ' + prs.length : '—') + '</div>' +
      (prs.length ? '<p class="page-sub" style="text-align:center;">שיאים חדשים: <b>' + prs.map(esc).join(', ') + '</b></p>' : '') +
      '<p class="page-sub" style="text-align:center;">הרגל "אימון" סומן להיום ✓</p><div class="modal-actions"><button class="btn btn-primary btn-block" id="ft-done-ok">מעולה</button></div>', { noFocus: true });
    m.querySelector('#ft-done-ok').addEventListener('click', api().closeModal);
  }
  function allExerciseNames() {
    var n = {}; plan().days.forEach(function (d) { d.exercises.forEach(function (x) { n[x.name.trim()] = 1; }); }); (S().workoutLog || []).forEach(function (e) { if (e.machine) n[e.machine.trim()] = 1; });
    return Object.keys(n).sort();
  }

  /* ---------- body weight ---------- */
  function bodyweightQuickHtml() {
    var bw = FS().bodyweight.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var last = bw[bw.length - 1], first = bw[0];
    return '<div class="card fx-card-gap"><div class="fx-row-between"><h3>⚖️ משקל גוף</h3>' + (last ? '<span class="page-sub">אחרון: <b class="num">' + last.kg + '</b> ק״ג' + (bw.length > 1 ? ' · ' + (last.kg - first.kg > 0 ? '+' : '') + r1(last.kg - first.kg) + ' מההתחלה' : '') + '</span>' : '') + '</div>' +
      '<div class="ms-add-row" style="margin-top:8px;"><input type="number" inputmode="decimal" step="0.1" min="20" max="300" class="ms-input" id="ft-bw" placeholder="המשקל שלך היום (ק״ג)"><button class="btn btn-ghost btn-sm" id="ft-bw-save">' + ic('plus') + 'שמור</button></div>' +
      (bw.length > 1 ? U().barChart(bw.slice(-12).map(function (x) { return x.kg; }), bw.slice(-12).map(function (x) { return U().fmtDate(x.date); }), { unit: ' ק״ג', highlight: Math.min(11, bw.length - 1), aria: 'משקל גוף' }) : '<p class="page-sub">שקילה פעם בשבוע, באותה שעה, נותנת תמונה אמינה.</p>') + '</div>';
  }
  function wireBodyweightQuick(body, el) {
    var b = body.querySelector('#ft-bw-save'); if (!b) return;
    b.addEventListener('click', function () {
      var v = r1(body.querySelector('#ft-bw').value);
      if (!(v >= 20 && v <= 300)) { api().toast('מספר לא תקין', 'error'); return; }
      var list = FS().bodyweight, ex2 = list.filter(function (x) { return x.date === tk(); })[0];
      if (ex2) ex2.kg = v; else list.push({ date: tk(), kg: v });
      save(); api().toast('נשמר', 'success'); render(el);
    });
  }

  /* ---------- PROGRESS ---------- */
  function renderProgress(body, el) {
    var log = S().workoutLog || [], f = FS(), today = tk();
    if (!log.length) { body.innerHTML = U().emptyState('chart', 'עוד אין נתונים', 'התחל אימון ורשום סטים, והגרפים יתמלאו.'); return; }
    var weeks = [], wl = [], sessW = [];
    for (var w = 7; w >= 0; w--) {
      var ws = C.addDays(C.weekStartKey(today), -7 * w), we = C.addDays(ws, 6);
      var inW = log.filter(function (e) { var d = setDate(e); return d >= ws && d <= we; });
      weeks.push(Math.round(inW.reduce(function (a, e) { return a + (+e.kg || 0) * (+e.reps || 0); }, 0)));
      var dset = {}; inW.forEach(function (e) { dset[setDate(e)] = 1; }); sessW.push(Object.keys(dset).length);
      wl.push(w === 0 ? 'השבוע' : U().fmtDate(ws));
    }
    var monthStart = today.slice(0, 7) + '-01';
    var byGroup = {}; log.filter(function (e) { return setDate(e) >= monthStart; }).forEach(function (e) { var g = groupOf(e.machine); byGroup[g] = (byGroup[g] || 0) + 1; });
    var gKeys = GROUPS.filter(function (g) { return byGroup[g]; });
    var gMax = Math.max.apply(null, [1].concat(gKeys.map(function (g) { return byGroup[g]; })));
    var names = allExerciseNames().filter(function (n) { return setsOf(n).length; });
    if (!ui.exSel || names.indexOf(ui.exSel) < 0) ui.exSel = names[0];
    var h = historyOf(ui.exSel).slice(0, 12).reverse();
    var best = h.map(function (s) { return Math.max.apply(null, s.sets.map(function (e) { return C.e1rm(e.kg, e.reps); })); });
    var topSet = h.map(function (s) { return Math.max.apply(null, s.sets.map(function (e) { return +e.kg || 0; })); });
    var prs = names.map(function (n) { var b = null; setsOf(n).forEach(function (e) { var v = C.e1rm(e.kg, e.reps); if (!b || v > b.v) b = { v: v, e: e }; }); return { n: n, b: b }; }).filter(function (x) { return x.b && x.b.v > 0; }).sort(function (a, b) { return b.b.v - a.b.v; });
    var recentPRs = f.sessions.slice().reverse().filter(function (s) { return s.prs && s.prs.length; }).slice(0, 5);
    var totalSets = log.length, monthSets = log.filter(function (e) { return setDate(e) >= monthStart; }).length;
    body.innerHTML =
      '<div class="fx-kpis">' + U().kpi('אימונים השבוע', sessW[7] + '/' + f.weeklyGoal) + U().kpi('רצף שבועות ביעד', weekStreak() + ' 🔥') + U().kpi('נפח השבוע', weeks[7] + ' ק״ג', weeks[6] ? (weeks[7] >= weeks[6] ? '▲ ' : '▼ ') + Math.abs(Math.round((weeks[7] - weeks[6]) / Math.max(1, weeks[6]) * 100)) + '% משבוע שעבר' : '') + U().kpi('סטים החודש', monthSets, 'סה״כ ' + totalSets) + '</div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>התקדמות בתרגיל</h3><select id="ft-ex-sel" aria-label="בחר תרגיל">' + names.map(function (n) { return '<option' + (n === ui.exSel ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>' +
        (h.length > 1 ? '<p class="page-sub">1RM משוער לכל אימון (כמה היית מרים לחזרה אחת). שיא: <b>' + Math.max.apply(null, best) + ' ק״ג</b> · משקל עבודה אחרון: <b>' + topSet[topSet.length - 1] + ' ק״ג</b></p>' + U().barChart(best, h.map(function (s) { return U().fmtDate(s.date); }), { unit: ' ק״ג', showLabels: h.length <= 8, highlight: best.length - 1, aria: 'התקדמות 1RM משוער' }) :
          '<p class="page-sub">צריך לפחות שני אימונים בתרגיל הזה כדי לראות מגמה.</p>') +
        '<div class="ft-hist">' + historyOf(ui.exSel).slice(0, 6).map(function (s) { return '<div class="fx-day-row"><span class="fx-day-time">' + U().relDate(s.date) + '</span><span dir="ltr" style="text-align:right;">' + s.sets.map(function (e) { return fmtSet(e, 'weight'); }).join(' , ') + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="grid-2 fx-card-gap"><div class="card"><h3>נפח שבועי</h3>' + U().barChart(weeks, wl, { unit: ' ק״ג', highlight: 7, aria: 'נפח שבועי' }) + '<p class="page-sub" style="margin-bottom:0;">נפח = משקל × חזרות של כל הסטים</p></div>' +
        '<div class="card"><h3>אימונים בשבוע</h3>' + U().barChart(sessW, wl, { highlight: 7, max: Math.max(f.weeklyGoal, 1), unit: ' אימונים', aria: 'אימונים בשבוע' }) + '<p class="page-sub" style="margin-bottom:0;">יעד: ' + f.weeklyGoal + ' בשבוע</p></div></div>' +
      (gKeys.length ? '<div class="card fx-card-gap"><h3>סטים לפי קבוצת שריר · החודש</h3>' + gKeys.map(function (g) { return '<div class="fx-hrow"><span class="fx-hname">' + g + '</span>' + U().progressBar(Math.round(byGroup[g] / gMax * 100)) + '<span class="num fx-hval">' + byGroup[g] + '</span></div>'; }).join('') +
        balanceHint(byGroup) + '</div>' : '') +
      '<div class="card fx-card-gap"><h3>🏆 שיאים אישיים</h3>' + prs.slice(0, 10).map(function (x, i) { return '<div class="fx-day-row"><span class="ft-rank">' + (i + 1) + '</span><span style="flex:1">' + esc(x.n) + '</span><span class="page-sub num" dir="ltr">' + fmtSet(x.b.e, 'weight') + '</span><span class="num"><b>' + x.b.v + '</b> ק״ג 1RM</span></div>'; }).join('') +
        (recentPRs.length ? '<p class="page-sub" style="margin-top:10px;">שיאים אחרונים: ' + recentPRs.map(function (s) { return U().relDate(s.date) + ' (' + s.prs.map(esc).join(', ') + ')'; }).join(' · ') + '</p>' : '') +
        '<p class="page-sub" style="font-size:11.5px;margin-bottom:0;">1RM משוער לפי נוסחת Epley. זו הערכה, לא מדידה, ולא כדאי לנסות חזרה מקסימלית בלי השגחה.</p></div>' +
      bodyweightQuickHtml();
    body.querySelector('#ft-ex-sel').addEventListener('change', function (e) { ui.exSel = e.target.value; render(el); });
    wireBodyweightQuick(body, el);
  }
  function balanceHint(g) {
    var push = (g['חזה'] || 0) + (g['כתפיים'] || 0), pull = g['גב'] || 0, legs = g['רגליים'] || 0, upper = push + pull + (g['ידיים'] || 0);
    var tips = [];
    if (push > 0 && pull < push * 0.7) tips.push('יש הרבה יותר דחיפה (חזה/כתפיים) ממשיכה (גב). כדאי להוסיף סטים לגב בשביל כתפיים בריאות ויציבה.');
    if (upper > 0 && legs < upper * 0.3) tips.push('רגליים מקבלות מעט סטים יחסית לפלג גוף עליון.');
    return tips.length ? '<div class="fx-insight fx-insight-habit" style="margin-top:10px;">' + tips.map(esc).join('<br>') + '</div>' : '<p class="page-sub" style="margin:10px 0 0;">האיזון בין קבוצות השריר נראה טוב ✓</p>';
  }

  /* ---------- PLAN ---------- */
  function renderPlan(body, el) {
    var p = plan(), f = FS();
    body.innerHTML =
      '<div class="card"><div class="fx-row-between"><h3>יעד שבועי</h3><div class="fx-counter"><button class="wl-step-btn" id="ft-goal-m" aria-label="פחות">−</button><span class="num">' + f.weeklyGoal + '</span><button class="wl-step-btn" id="ft-goal-p" aria-label="יותר">+</button></div></div><p class="page-sub" style="margin:0;">כמה אימונים בשבוע. חלוקת האימונים מסתובבת לפי הסדר: כל אימון מתחיל מהיום הבא בתוכנית.</p></div>' +
      p.days.map(function (d, di) {
        var editing = ui.editDay === d.id;
        return '<div class="card fx-card-gap ft-day"><div class="fx-row-between">' +
          (editing ? '<input type="text" class="ms-input" data-day-name="' + d.id + '" value="' + esc(d.name) + '" maxlength="30" style="flex:1;font-weight:700;">' : '<div><h3 style="margin:0;">' + (di + 1) + '. ' + esc(d.name) + '</h3><div class="page-sub">' + esc(d.focus || '') + ' · כ-' + estMinutes(d) + ' דק׳</div></div>') +
          '<div class="fx-btn-row" style="margin:0;"><button class="fx-mini" data-day-edit="' + d.id + '">' + (editing ? ic('check') + 'סיום' : ic('edit') + 'עריכה') + '</button>' + (editing ? '<button class="fx-mini" data-day-del="' + d.id + '" aria-label="מחק יום">' + ic('trash') + '</button>' : '') + '</div></div>' +
          (editing ? '<input type="text" class="ms-input" data-day-focus="' + d.id + '" value="' + esc(d.focus || '') + '" placeholder="מיקוד (למשל: חזה, גב)" style="margin-top:8px;width:100%;">' : '') +
          '<div class="ft-plan-list">' + d.exercises.map(function (x, xi) {
            return '<div class="ft-plan-ex"><span class="ft-plan-n">' + esc(x.name) + '</span><span class="page-sub">' + '<bdi dir="ltr">' + x.sets + '×' + esc(x.reps) + '</bdi>' + ' · ' + esc(x.group) + (x.type !== 'weight' ? ' · ' + TYPE_LABEL[x.type] : '') + '</span>' +
              (editing ? '<span class="ft-plan-act"><button class="fx-mini" data-ex-up="' + d.id + '|' + xi + '"' + (xi === 0 ? ' disabled' : '') + ' aria-label="למעלה">▲</button><button class="fx-mini" data-ex-edit="' + d.id + '|' + x.id + '" aria-label="ערוך">' + ic('edit') + '</button><button class="fx-mini" data-ex-del="' + d.id + '|' + x.id + '" aria-label="מחק">' + ic('x') + '</button></span>' : '') + '</div>';
          }).join('') + '</div>' +
          (editing ? '<button class="btn btn-ghost btn-sm" data-ex-add="' + d.id + '" style="margin-top:8px;">' + ic('plus') + 'תרגיל</button>' : '') +
        '</div>';
      }).join('') +
      '<div class="fx-btn-row"><button class="btn btn-ghost btn-sm" id="ft-day-add">' + ic('plus') + 'יום אימון</button><button class="btn btn-ghost btn-sm" id="ft-plan-reset">' + ic('reset') + 'תוכנית ברירת מחדל</button></div>';
    var goal = function (d) { f.weeklyGoal = Math.max(1, Math.min(7, f.weeklyGoal + d)); save(); render(el); };
    body.querySelector('#ft-goal-m').addEventListener('click', function () { goal(-1); });
    body.querySelector('#ft-goal-p').addEventListener('click', function () { goal(1); });
    U().on(body, '[data-day-edit]', 'click', function (b) { ui.editDay = ui.editDay === b.dataset.dayEdit ? null : b.dataset.dayEdit; render(el); });
    U().on(body, '[data-day-name]', 'change', function (i) { var d = dayById(i.dataset.dayName); d.name = i.value.trim() || d.name; save(); });
    U().on(body, '[data-day-focus]', 'change', function (i) { dayById(i.dataset.dayFocus).focus = i.value.trim(); save(); });
    U().on(body, '[data-day-del]', 'click', function (b) {
      if (p.days.length <= 1) { api().toast('צריך לפחות יום אחד', 'error'); return; }
      api().openConfirmModal('למחוק את יום האימון? (הסטים שכבר רשמת נשארים ביומן)', function () { p.days = p.days.filter(function (d) { return d.id !== b.dataset.dayDel; }); ui.editDay = null; save(); render(el); });
    });
    U().on(body, '[data-ex-up]', 'click', function (b) { var q = b.dataset.exUp.split('|'), d = dayById(q[0]), i = +q[1]; var t = d.exercises[i]; d.exercises[i] = d.exercises[i - 1]; d.exercises[i - 1] = t; save(); render(el); });
    U().on(body, '[data-ex-del]', 'click', function (b) { var q = b.dataset.exDel.split('|'), d = dayById(q[0]); d.exercises = d.exercises.filter(function (x) { return x.id !== q[1]; }); save(); render(el); });
    U().on(body, '[data-ex-add]', 'click', function (b) { openExerciseEditor(dayById(b.dataset.exAdd), null, el); });
    U().on(body, '[data-ex-edit]', 'click', function (b) { var q = b.dataset.exEdit.split('|'), d = dayById(q[0]); openExerciseEditor(d, d.exercises.filter(function (x) { return x.id === q[1]; })[0], el); });
    body.querySelector('#ft-day-add').addEventListener('click', function () { var d = { id: uid(), name: 'יום ' + (p.days.length + 1), focus: '', exercises: [] }; p.days.push(d); ui.editDay = d.id; save(); render(el); });
    body.querySelector('#ft-plan-reset').addEventListener('click', function () { api().openConfirmModal('להחזיר את התוכנית לברירת המחדל? (היומן וההיסטוריה לא נמחקים)', function () { FS().plan = defaultPlan(); ui.editDay = null; save(); render(el); }); });
  }
  function openExerciseEditor(day, x, el) {
    var isEdit = !!x; x = x || { name: '', group: 'חזה', sets: 3, reps: '8-12', type: 'weight', rest: 90 };
    var m = U().openModal('<h3>' + (isEdit ? 'עריכת תרגיל' : 'תרגיל חדש') + ' · ' + esc(day.name) + '</h3>' +
      '<div class="field"><label>שם</label><input type="text" id="xe-name" list="xe-names" maxlength="40" value="' + esc(x.name) + '" autofocus><datalist id="xe-names">' + allExerciseNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field-row"><div class="field"><label>קבוצת שריר</label><select id="xe-group">' + GROUPS.map(function (g) { return '<option' + (x.group === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></div><div class="field"><label>סוג</label><select id="xe-type">' + Object.keys(TYPE_LABEL).map(function (t) { return '<option value="' + t + '"' + (x.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field-row"><div class="field"><label>סטים</label><input type="number" id="xe-sets" min="1" max="10" value="' + x.sets + '"></div><div class="field"><label>טווח חזרות / דקות</label><input type="text" id="xe-reps" maxlength="10" value="' + esc(x.reps) + '" placeholder="8-12"></div><div class="field"><label>מנוחה (שנ׳)</label><input type="number" id="xe-rest" min="0" max="600" step="15" value="' + x.rest + '"></div></div>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-block" id="xe-save">' + ic('check') + 'שמור</button><button class="btn btn-ghost" id="xe-x" aria-label="סגור">' + ic('x') + '</button></div>');
    m.querySelector('#xe-x').addEventListener('click', api().closeModal);
    m.querySelector('#xe-save').addEventListener('click', function () {
      var name = m.querySelector('#xe-name').value.trim(); if (!name) { m.querySelector('#xe-name').classList.add('fx-invalid'); return; }
      var v = { name: name, group: m.querySelector('#xe-group').value, type: m.querySelector('#xe-type').value, sets: Math.max(1, Math.min(10, +m.querySelector('#xe-sets').value || 3)), reps: m.querySelector('#xe-reps').value.trim() || '8-12', rest: Math.max(0, +m.querySelector('#xe-rest').value || 0) };
      if (isEdit) Object.assign(x, v); else day.exercises.push(Object.assign({ id: uid() }, v));
      save(); api().closeModal(); render(el);
    });
  }

  /* ---------- LOG ---------- */
  function renderLog(body, el) {
    var legacy = api().fitnessLegacy();
    var ses = FS().sessions.slice().sort(function (a, b) { return b.endedAt - a.endedAt; });
    body.innerHTML = '<div id="ft-legacy-log"></div>' +
      '<div class="card fx-card-gap"><h3>היסטוריית אימונים</h3>' + (ses.length ? ses.slice(0, 30).map(function (s) {
        return '<div class="fx-day-row"><span class="fx-day-time">' + U().relDate(s.date) + '</span><span style="flex:1"><b>' + esc(s.dayName || '') + '</b> · ' + s.minutes + ' דק׳ · ' + s.sets + ' סטים · ' + s.volume + ' ק״ג' + (s.prs && s.prs.length ? ' · 🏆 ' + s.prs.length : '') + '</span><button class="fx-mini" data-ses-del="' + s.id + '" aria-label="מחק אימון">' + ic('trash') + '</button></div>';
      }).join('') : '<p class="page-sub">אימונים שתסיים בלשונית "אימון היום" יופיעו כאן.</p>') + '</div>';
    var host = body.querySelector('#ft-legacy-log');
    host.innerHTML = legacy.logHtml();
    legacy.wireLog(host);
    U().on(body, '[data-ses-del]', 'click', function (b) {
      api().openConfirmModal('למחוק את רשומת האימון? הסטים עצמם יישארו ביומן למעלה.', function () { FS().sessions = FS().sessions.filter(function (s) { return s.id !== b.dataset.sesDel; }); save(); render(el); });
    });
  }

  /* ---------- LIBRARY ---------- */
  function renderLibrary(body) {
    var L = api().fitnessLegacy();
    body.innerHTML =
      '<a href="' + L.EXTERNAL_FITNESS_APP + '" target="_blank" rel="noopener" class="card card-tight ft-ext"><div><div style="font-weight:700;">אפליקציית כושר חיצונית</div><div class="page-sub">נפתח בכרטיסייה חדשה</div></div><span class="btn btn-ghost btn-sm" style="pointer-events:none;">פתיחה ↗</span></a>' +
      '<div class="card fx-card-gap"><h3>תרגילים לפי שריר</h3><p class="page-sub">סרטונים שנשמרו. לחיצה על קבוצה פותחת אותה.</p>' + L.EX_LIBRARY.map(function (g) {
        return '<details class="fx-drill"><summary>' + esc(g.group) + ' <span class="page-sub">(' + g.items.length + ')</span></summary><ul class="ex-list">' + g.items.map(function (it) { return '<li><span class="lb">' + esc(it[0]) + '</span>' + (it[1] ? '<a href="' + it[1] + '" target="_blank" rel="noopener">צפייה ↗</a>' : '<span class="plain">אין קישור</span>') + '</li>'; }).join('') + '</ul></details>';
      }).join('') + '</div>' +
      '<div class="card fx-card-gap"><h3>הכי טוב לכל שריר: מדע ואלופים</h3><div class="tip-row">' + L.SCIENCE_LINKS.map(function (l) { return '<a class="tip-chip" href="' + l[1] + '" target="_blank" rel="noopener">' + esc(l[0]) + ' ↗</a>'; }).join('') + '</div></div>' +
      '<div class="card fx-card-gap"><h3>טיפים לאימון ולשריפת שומן</h3><div class="tip-row">' + L.TIP_LINKS.map(function (l) { return '<a class="tip-chip" href="' + l[1] + '" target="_blank" rel="noopener">' + esc(l[0]) + ' ↗</a>'; }).join('') + '</div></div>' +
      '<div class="card fx-card-gap"><h3>עקרונות בסיס</h3><ul class="fx-steps">' +
        '<li><b>עומס מתקדם:</b> כשכל הסטים מגיעים לקצה העליון של טווח החזרות, מעלים משקל (2.5 ק״ג או המדרגה הקטנה במכונה).</li>' +
        '<li><b>קליסטניקס:</b> 2 סטים של 6-8 חזרות עד כשל, עם 2-2.5 דקות מנוחה.</li>' +
        '<li><b>נפח:</b> כ-10-20 סטים לשבוע לכל קבוצת שריר זה טווח טוב להתפתחות.</li>' +
        '<li><b>טכניקה לפני משקל:</b> אם הטכניקה נשברת, המשקל כבד מדי.</li>' +
        '<li><b>שינה וחלבון:</b> השריר נבנה במנוחה. כ-1.6-2 גרם חלבון לק״ג גוף ביום, ושינה של 8 שעות.</li></ul>' +
        '<p class="page-sub" style="margin-bottom:0;">מידע כללי, לא ייעוץ רפואי. כאב חד או מתמשך: לעצור ולהתייעץ.</p></div>';
  }

  // register as the fitness screen (overrides the old single long page; old functions stay for the Log tab)
  F.modules.push({ id: 'fitness', label: 'כושר', icon: 'dumbbell', group: 'body', render: render, override: true });
  F.fitness = { startRest: startRest, render: render };
})();
