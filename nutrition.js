/* Maslul nutrition module: today's meals as a checklist, water, rough protein/calorie
   estimate, extra foods, 14-day tracking, editable weekly plan, shopping list and targets.
   The original 7-day plan stays the default; edits are stored separately in state.nutrition.plan. */
(function () {
  'use strict';
  var F = window.MaslulFeatures, C = window.MaslulCore;
  if (!F || !C) return;
  function api() { return F.api(); }
  function U() { return F.util; }
  function S() { return api().state(); }
  function N() { return S().nutrition; }
  function save() { api().save(); }
  function esc(x) { return U().esc(x); }
  function ic(n) { return U().ic(n); }
  function tk() { return U().todayKey(); }

  var ui = { tab: 'today', weekDay: null, edit: false };
  function plan() { var n = N(); return Array.isArray(n.plan) && n.plan.length ? n.plan : api().nutritionLegacy().PLAN; }
  function editablePlan() { var n = N(); if (!Array.isArray(n.plan) || !n.plan.length) { n.plan = JSON.parse(JSON.stringify(api().nutritionLegacy().PLAN)); save(); } return n.plan; }
  function dayLog(k) { var n = N(); k = k || tk(); if (!n.log[k]) n.log[k] = { day: null, eaten: {}, extras: [] }; var l = n.log[k]; l.eaten = l.eaten || {}; l.extras = l.extras || []; return l; }
  function peekLog(k) { return N().log[k] || null; }
  // default plan day = weekday (Sunday = day 1); the user can switch and it's remembered for that date
  function todayPlanIndex(k) { var l = peekLog(k || tk()); if (l && l.day != null && plan()[l.day]) return l.day; return Math.min(plan().length - 1, C.parseKey(k || tk()).getDay()); }
  function bodyweight() { var bw = ((S().fitness && S().fitness.bodyweight) || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }); return bw.length ? bw[bw.length - 1].kg : null; }
  function targets() {
    var n = N(), w = bodyweight();
    return {
      protein: n.proteinGoal || (w ? Math.round(w * 1.6) : 100),
      water: n.waterGoal || (w ? Math.max(6, Math.min(14, Math.round(w * 35 / 250))) : 8),
      fromWeight: !!w && !n.proteinGoal, weight: w
    };
  }
  function dayTotals(k) {
    var l = peekLog(k), p = plan(), idx = todayPlanIndex(k), day = p[idx];
    var eatenP = 0, eatenK = 0, mealsDone = 0;
    (day ? day.meals : []).forEach(function (m, i) { if (l && l.eaten[i]) { mealsDone++; var e = C.estimateMeals([m]); eatenP += e.protein; eatenK += e.kcal; } });
    ((l && l.extras) || []).forEach(function (x) { eatenP += +x.p || 0; eatenK += +x.k || 0; });
    var planned = C.estimateMeals(day ? day.meals : []);
    return { mealsDone: mealsDone, meals: day ? day.meals.length : 0, protein: Math.round(eatenP), kcal: Math.round(eatenK / 10) * 10, plannedP: planned.protein, plannedK: planned.kcal, water: N().water[k] || 0 };
  }

  function render(el) {
    var tabs = [['today', 'היום'], ['week', 'תוכנית שבועית'], ['track', 'מעקב'], ['tools', 'כלים וקניות']];
    el.innerHTML = '<div class="page-head"><div><h2 class="page-title">תזונה</h2><p class="page-sub">מה אוכלים היום, כמה שתית, ואיך זה מסתדר לאורך השבוע</p></div></div>' +
      '<div class="fx-tabs">' + tabs.map(function (t) { return '<button class="fx-tab' + (ui.tab === t[0] ? ' active' : '') + '" data-nt="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="nt-body"></div>';
    var body = el.querySelector('#nt-body');
    try { ({ today: renderToday, week: renderWeek, track: renderTrack, tools: renderTools })[ui.tab](body, el); }
    catch (e) { console.error(e); body.innerHTML = '<div class="card">משהו השתבש במסך הזה. הנתונים שלך בטוחים.</div>'; }
    U().on(el, '[data-nt]', 'click', function (b) { ui.tab = b.dataset.nt; ui.edit = false; render(el); });
  }

  /* ---------- TODAY ---------- */
  function renderToday(body, el) {
    var k = tk(), p = plan(), idx = todayPlanIndex(k), day = p[idx], l = peekLog(k) || { eaten: {}, extras: [] };
    var t = dayTotals(k), tg = targets();
    var pctMeals = t.meals ? Math.round(t.mealsDone / t.meals * 100) : 0;
    var workedOut = (S().workoutLog || []).some(function (e) { return (e.date || '') === k; }) || ((S().fitness && S().fitness.active) ? true : false);
    var glasses = '';
    for (var g = 0; g < tg.water; g++) glasses += '<button class="nt-glass' + (g < t.water ? ' on' : '') + '" data-glass="' + (g + 1) + '" aria-label="' + (g + 1) + ' כוסות">💧</button>';
    body.innerHTML =
      '<div class="fx-kpis fx-kpis-sm">' +
        U().kpi('ארוחות', t.mealsDone + '/' + t.meals, pctMeals + '%') +
        U().kpi('חלבון (הערכה)', t.protein + ' ג׳', 'יעד ~' + tg.protein + ' ג׳') +
        U().kpi('מים', t.water + '/' + tg.water, 'כוסות') +
        U().kpi('קלוריות (הערכה)', t.kcal || '—', 'בתוכנית ~' + t.plannedK) +
      '</div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>' + esc(day.emoji || '🍽') + ' ' + esc(day.title) + '</h3><select id="nt-day" aria-label="איזה יום בתוכנית">' + p.map(function (d, i) { return '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>' + esc(d.title) + '</option>'; }).join('') + '</select></div>' +
        U().progressBar(pctMeals, pctMeals >= 100 ? 'var(--success)' : null) +
        (workedOut ? '<div class="fx-insight fx-insight-time" style="margin-top:10px;">💪 התאמנת היום. אחרי אימון כדאי חלבון ופחמימה תוך שעה-שעתיים (למשל מעדן חלבון ובננה).</div>' : '') +
        '<div class="nt-meals">' + day.meals.map(function (m, i) {
          var est = C.estimateMeals([m]), on = !!l.eaten[i];
          return '<div class="nt-meal' + (on ? ' on' : '') + '"><button class="nt-check" data-meal="' + i + '" aria-pressed="' + on + '" aria-label="' + (on ? 'בטל סימון' : 'סמן שאכלתי') + ' ' + esc(m.name) + '">' + (on ? ic('check') : '') + '</button>' +
            '<div class="nt-meal-body"><div class="nt-meal-h"><b>' + esc(m.name) + '</b><span class="page-sub">~' + est.protein + ' ג׳ חלבון · ~' + est.kcal + ' קל׳</span></div>' +
            '<div class="nt-items">' + m.items.map(function (it) { return '<span class="nt-item">' + esc(it) + '</span>'; }).join('') + '</div></div></div>';
        }).join('') + '</div></div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>💧 מים</h3><div class="fx-counter"><button class="wl-step-btn" id="nt-w-m" aria-label="פחות">−</button><span class="num">' + t.water + '</span><button class="wl-step-btn" id="nt-w-p" aria-label="עוד כוס">+</button></div></div>' +
        '<div class="nt-glasses">' + glasses + '</div><p class="page-sub" style="margin:6px 0 0;">יעד: ' + tg.water + ' כוסות (' + (tg.water * 250 / 1000) + ' ליטר)' + (tg.weight ? ' לפי המשקל שלך' : '') + '. ביום אימון קצת יותר.</p></div>' +
      '<div class="card fx-card-gap"><h3>אכלתי עוד משהו</h3>' +
        '<div class="nt-extra-row"><input type="text" class="ft-name-in" id="nt-x" maxlength="60" placeholder="מה? (למשל: 2 ביצים, טוסט, פיצה)"><button class="btn btn-primary btn-sm" id="nt-x-add">' + ic('plus') + 'הוסף</button></div>' +
        '<div class="page-sub" id="nt-x-hint" style="min-height:18px;margin-top:4px;"></div>' +
        (l.extras.length ? '<div class="fx-task-list">' + l.extras.map(function (x, i) { return '<div class="fx-day-row"><span style="flex:1">' + esc(x.text) + '</span><span class="page-sub">' + (x.p ? '~' + x.p + ' ג׳ חלבון' : 'בלי הערכה') + '</span><button class="fx-mini" data-x-del="' + i + '" aria-label="מחק">' + ic('x') + '</button></div>'; }).join('') + '</div>' : '') + '</div>' +
      '<p class="page-sub nt-disclaimer">הערכות החלבון והקלוריות גסות ומבוססות על גדלי מנות טיפוסיים, כדי לתת כיוון ולא לספור. בגיל צעיר ועם 4 אימונים בשבוע, אם אתה רעב, לאכול עוד זה בסדר.</p>';

    body.querySelector('#nt-day').addEventListener('change', function (e) { dayLog(k).day = +e.target.value; save(); render(el); });
    U().on(body, '[data-meal]', 'click', function (b) {
      var lg = dayLog(k), i = b.dataset.meal; lg.eaten[i] = !lg.eaten[i]; if (!lg.eaten[i]) delete lg.eaten[i];
      if (lg.day == null) lg.day = idx;
      save();
      var tt = dayTotals(k);
      if (tt.meals && tt.mealsDone === tt.meals) { api().grantXPOnce('meals:' + k, 20, 'nutrition', {}); api().flushXP(b); api().toast('כל הארוחות של היום ✓', 'success'); }
      render(el);
    });
    var setWater = function (v) { N().water[k] = Math.max(0, Math.min(30, v)); save(); if (N().water[k] >= targets().water) { api().grantXPOnce('water:' + k, 10, 'nutrition', {}); api().flushXP(null); } render(el); };
    body.querySelector('#nt-w-p').addEventListener('click', function () { setWater((N().water[k] || 0) + 1); });
    body.querySelector('#nt-w-m').addEventListener('click', function () { setWater((N().water[k] || 0) - 1); });
    U().on(body, '[data-glass]', 'click', function (b) { var v = +b.dataset.glass; setWater((N().water[k] || 0) === v ? v - 1 : v); });
    var xi = body.querySelector('#nt-x'), hint = body.querySelector('#nt-x-hint');
    xi.addEventListener('input', function () { var e = C.estimateFood(xi.value); hint.textContent = e ? 'הערכה: ~' + e.protein + ' ג׳ חלבון, ~' + e.kcal + ' קלוריות' : (xi.value.trim() ? 'אין הערכה למאכל הזה, יישמר בלי מספרים' : ''); });
    var addX = function () {
      var v = xi.value.trim(); if (!v) { xi.focus(); return; }
      var e = C.estimateFood(v);
      dayLog(k).extras.push({ text: v, p: e ? e.protein : 0, k: e ? e.kcal : 0, at: Date.now() });
      save(); api().toast('נוסף', 'success'); render(el);
    };
    body.querySelector('#nt-x-add').addEventListener('click', addX);
    xi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addX(); } });
    U().on(body, '[data-x-del]', 'click', function (b) { dayLog(k).extras.splice(+b.dataset.xDel, 1); save(); render(el); });
  }

  /* ---------- WEEK (view + edit) ---------- */
  function renderWeek(body, el) {
    var p = ui.edit ? editablePlan() : plan();
    if (ui.weekDay == null) ui.weekDay = todayPlanIndex();
    var d = p[ui.weekDay] || p[0], est = C.estimateMeals(d.meals), custom = Array.isArray(N().plan) && N().plan.length;
    body.innerHTML =
      '<div class="range-tabs nut-tabs">' + p.map(function (x, i) { return '<button data-wd="' + i + '" class="' + (ui.weekDay === i ? 'active' : '') + '">' + esc(x.emoji || '') + ' יום ' + (i + 1) + '</button>'; }).join('') + '</div>' +
      '<div class="card"><div class="fx-row-between"><div><h3 style="margin:0;">' + esc(d.emoji || '') + ' ' + esc(d.title) + '</h3><div class="page-sub">~' + est.protein + ' ג׳ חלבון · ~' + est.kcal + ' קלוריות (הערכה)</div></div>' +
        '<button class="btn ' + (ui.edit ? 'btn-primary' : 'btn-ghost') + ' btn-sm" id="nt-edit">' + ic(ui.edit ? 'check' : 'edit') + (ui.edit ? 'סיום עריכה' : 'עריכה') + '</button></div>' +
        d.meals.map(function (m, mi) {
          return '<div class="nut-meal">' + (ui.edit ? '<div class="nt-edit-h"><input type="text" class="ms-input" data-mname="' + mi + '" value="' + esc(m.name) + '" maxlength="50"><button class="fx-mini" data-mdel="' + mi + '" aria-label="מחק ארוחה">' + ic('trash') + '</button></div>' : '<div class="nut-meal-name">' + esc(m.name) + '</div>') +
            '<ul class="nut-item-list">' + m.items.map(function (it, ii) { var e = C.estimateFood(it); return '<li>' + esc(it) + (e && e.protein >= 3 ? ' <span class="page-sub">(~' + e.protein + ' ג׳)</span>' : '') + (ui.edit ? ' <button class="fx-mini" data-idel="' + mi + '|' + ii + '" aria-label="הסר">' + ic('x') + '</button>' : '') + '</li>'; }).join('') + '</ul>' +
            (ui.edit ? '<div class="ms-add-row"><input type="text" class="ms-input" data-iadd-in="' + mi + '" maxlength="60" placeholder="הוסף מאכל (למשל: 2 ביצים)"><button class="btn btn-ghost btn-sm" data-iadd="' + mi + '" aria-label="הוסף">' + ic('plus') + '</button></div>' : '') + '</div>';
        }).join('') +
        (ui.edit ? '<div class="fx-btn-row"><button class="btn btn-ghost btn-sm" id="nt-madd">' + ic('plus') + 'ארוחה</button>' + (custom ? '<button class="btn btn-ghost btn-sm" id="nt-reset">' + ic('reset') + 'חזרה לתוכנית המקורית</button>' : '') + '</div>' : '') +
      '</div>' + quantityRuleHtml();
    U().on(body, '[data-wd]', 'click', function (b) { ui.weekDay = +b.dataset.wd; render(el); });
    body.querySelector('#nt-edit').addEventListener('click', function () { ui.edit = !ui.edit; if (ui.edit) editablePlan(); render(el); });
    if (!ui.edit) return;
    var day = editablePlan()[ui.weekDay];
    U().on(body, '[data-mname]', 'change', function (i) { day.meals[+i.dataset.mname].name = i.value.trim() || day.meals[+i.dataset.mname].name; save(); });
    U().on(body, '[data-mdel]', 'click', function (b) { day.meals.splice(+b.dataset.mdel, 1); save(); render(el); });
    U().on(body, '[data-idel]', 'click', function (b) { var q = b.dataset.idel.split('|'); day.meals[+q[0]].items.splice(+q[1], 1); save(); render(el); });
    var addItem = function (mi) { var inp = body.querySelector('[data-iadd-in="' + mi + '"]'), v = inp.value.trim(); if (!v) { inp.focus(); return; } day.meals[mi].items.push(v); save(); render(el); var n = document.querySelector('[data-iadd-in="' + mi + '"]'); if (n) n.focus(); };
    U().on(body, '[data-iadd]', 'click', function (b) { addItem(+b.dataset.iadd); });
    U().on(body, '[data-iadd-in]', 'keydown', function (i, e) { if (e.key === 'Enter') { e.preventDefault(); addItem(+i.dataset.iaddIn); } });
    body.querySelector('#nt-madd').addEventListener('click', function () { day.meals.push({ name: 'ארוחה חדשה', items: [] }); save(); render(el); });
    var rs = body.querySelector('#nt-reset');
    if (rs) rs.addEventListener('click', function () { api().openConfirmModal('לחזור לתוכנית המקורית? השינויים שלך בתוכנית יימחקו (המעקב היומי נשאר).', function () { N().plan = null; ui.edit = false; save(); render(el); }); });
  }
  function quantityRuleHtml() {
    var L = api().nutritionLegacy();
    return '<div class="card card-tight fx-card-gap"><h3 style="margin-bottom:10px;">⚖️ כלל פשוט לכמויות</h3><ul class="nut-item-list">' + L.RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ---------- TRACK ---------- */
  function renderTrack(body) {
    var tg = targets(), days = [], lbl = [], prot = [], water = [];
    var good = 0, logged = 0;
    for (var i = 13; i >= 0; i--) {
      var k = C.addDays(tk(), -i), l = peekLog(k), t = dayTotals(k);
      lbl.push(U().fmtDate(k));
      var has = !!(l && (Object.keys(l.eaten).length || l.extras.length)) || t.water > 0;
      days.push(has && t.meals ? Math.round(t.mealsDone / t.meals * 100) : null);
      prot.push(has ? t.protein : null); water.push(has ? t.water : null);
      if (has) { logged++; if (t.meals && t.mealsDone / t.meals >= 0.8) good++; }
    }
    var streak = 0, kk = tk();
    if (!(dayTotals(kk).meals && dayTotals(kk).mealsDone / dayTotals(kk).meals >= 0.8)) kk = C.addDays(kk, -1);
    for (var g = 0; g < 365; g++) { var tt = dayTotals(kk); if (tt.meals && tt.mealsDone / tt.meals >= 0.8) { streak++; kk = C.addDays(kk, -1); } else break; }
    var avgP = prot.filter(function (x) { return x != null; }), avgW = water.filter(function (x) { return x != null; });
    var mean = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; };
    if (!logged) { body.innerHTML = U().emptyState('bowl', 'עוד אין מעקב', 'סמן ארוחות ומים בלשונית "היום", והגרפים יתמלאו.'); return; }
    var tips = [];
    if (mean(avgP) != null && mean(avgP) < tg.protein * 0.75) tips.push('החלבון הממוצע (~' + mean(avgP) + ' ג׳) נמוך מהיעד. הכי קל להוסיף: מעדן חלבון, יוגורט או עוד 2 ביצים ביום.');
    if (mean(avgW) != null && mean(avgW) < tg.water * 0.7) tips.push('שותה פחות מים מהיעד. בקבוק ליד המיטה ובתיק עוזר.');
    if (good / Math.max(1, logged) >= 0.8) tips.push('התמדה מעולה בארוחות. ככה בונים שריר 💪');
    body.innerHTML = '<div class="fx-kpis">' + U().kpi('ימים מעל 80% ארוחות', good + '/' + logged) + U().kpi('רצף ימים טובים', streak + ' 🔥') + U().kpi('חלבון ממוצע', mean(avgP) != null ? '~' + mean(avgP) + ' ג׳' : '—', 'יעד ~' + tg.protein) + U().kpi('מים ממוצע', mean(avgW) != null ? mean(avgW) + ' כוסות' : '—', 'יעד ' + tg.water) + '</div>' +
      '<div class="card fx-card-gap"><h3>אחוז ארוחות · 14 יום</h3>' + U().barChart(days, lbl, { max: 100, unit: '%', highlight: 13, aria: 'אחוז ארוחות יומי' }) + '</div>' +
      '<div class="grid-2 fx-card-gap"><div class="card"><h3>חלבון (הערכה, ג׳)</h3>' + U().barChart(prot, lbl, { max: tg.protein, unit: ' ג׳', highlight: 13, aria: 'חלבון יומי' }) + '</div><div class="card"><h3>מים (כוסות)</h3>' + U().barChart(water, lbl, { max: tg.water, unit: ' כוסות', highlight: 13, aria: 'מים יומי' }) + '</div></div>' +
      (tips.length ? '<div class="card fx-card-gap"><h3>תובנות</h3>' + tips.map(function (x) { return '<div class="fx-insight">' + esc(x) + '</div>'; }).join('') + '</div>' : '');
  }

  /* ---------- TOOLS: targets + shopping list ---------- */
  function renderTools(body, el) {
    var tg = targets(), n = N(), list = C.shoppingList(plan()), sh = n.shopping || {};
    var have = list.filter(function (x) { return sh[x.key]; }).length;
    body.innerHTML =
      '<div class="card"><h3>היעדים שלי</h3>' +
        '<p class="page-sub">' + (tg.weight ? 'מחושב לפי המשקל האחרון שרשמת בכושר (' + tg.weight + ' ק״ג): חלבון ~1.6 ג׳ לק״ג, מים ~35 מ״ל לק״ג.' : 'רשום משקל גוף בעמוד הכושר, והיעדים יחושבו לפיו. בינתיים: ברירת מחדל.') + '</p>' +
        '<div class="ft-input">' +
          '<div class="ft-field"><label class="ft-field-l" for="nt-pg">יעד חלבון ליום (ג׳)</label><div class="ft-num-box"><input type="number" id="nt-pg" min="30" max="300" step="5" value="' + tg.protein + '"><span class="ft-unit">גרם</span></div></div>' +
          '<div class="ft-field"><label class="ft-field-l" for="nt-wg">יעד מים (כוסות)</label><div class="ft-num-box"><input type="number" id="nt-wg" min="4" max="20" value="' + tg.water + '"><span class="ft-unit">כוסות</span></div></div>' +
        '</div>' + (n.proteinGoal || n.waterGoal ? '<button class="btn btn-ghost btn-sm" id="nt-auto" style="margin-top:8px;">' + ic('reset') + 'חזרה לחישוב אוטומטי</button>' : '') + '</div>' +
      '<div class="card fx-card-gap"><div class="fx-row-between"><h3>🛒 רשימת קניות לשבוע</h3><span class="page-sub">' + have + '/' + list.length + ' יש בבית</span></div><p class="page-sub">מחושב מהתוכנית השבועית (' + (Array.isArray(n.plan) && n.plan.length ? 'כולל השינויים שלך' : 'התוכנית המקורית') + '). סמן מה כבר יש.</p>' +
        list.map(function (x) { return '<label class="fx-pick"><input type="checkbox" data-shop="' + x.key + '"' + (sh[x.key] ? ' checked' : '') + '><span' + (sh[x.key] ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + esc(x.label) + '</span><span class="fx-chip">' + x.qty + ' ' + esc(x.unit) + '</span></label>'; }).join('') +
        '<div class="fx-btn-row"><button class="btn btn-ghost btn-sm" id="nt-shop-clear">' + ic('reset') + 'נקה סימונים</button><button class="btn btn-ghost btn-sm" id="nt-shop-copy">' + ic('copy') + 'העתק רשימה</button></div></div>' +
      '<a href="https://avihihaviv-bit.github.io/cals-app/" target="_blank" rel="noopener" class="card card-tight app-link-card fx-card-gap"><span class="app-link-ic">' + ic('bowl') + '</span><div class="app-link-info"><div class="app-link-title">אפליקציית מעקב קלוריות</div><div class="page-sub">למעקב מדויק, נפתח בכרטיסייה חדשה</div></div><span class="btn btn-ghost btn-sm" style="pointer-events:none;flex-shrink:0;">פתיחה ↗</span></a>';
    var setG = function (key, inp, min, max) { inp.addEventListener('change', function () { var v = Math.round(+inp.value || 0); if (v < min || v > max) { api().toast('ערך לא סביר', 'error'); render(el); return; } n[key] = v; save(); api().toast('היעד עודכן', 'success'); render(el); }); };
    setG('proteinGoal', body.querySelector('#nt-pg'), 30, 300);
    setG('waterGoal', body.querySelector('#nt-wg'), 4, 20);
    var au = body.querySelector('#nt-auto'); if (au) au.addEventListener('click', function () { n.proteinGoal = null; n.waterGoal = null; save(); render(el); });
    U().on(body, '[data-shop]', 'change', function (c) { n.shopping[c.dataset.shop] = c.checked; if (!c.checked) delete n.shopping[c.dataset.shop]; save(); render(el); });
    body.querySelector('#nt-shop-clear').addEventListener('click', function () { n.shopping = {}; save(); render(el); });
    body.querySelector('#nt-shop-copy').addEventListener('click', function () {
      var txt = 'רשימת קניות - מסלול\n' + list.filter(function (x) { return !sh[x.key]; }).map(function (x) { return '• ' + x.label + ': ' + x.qty + ' ' + x.unit; }).join('\n');
      var done = function () { api().toast('הרשימה הועתקה', 'success'); };
      try { navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); }); } catch (e) { fallbackCopy(txt); done(); }
    });
  }
  function fallbackCopy(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }

  // dashboard widget: water + meals today
  F.widgets.nutrition = {
    label: 'תזונה ומים היום',
    html: function () {
      var t = dayTotals(tk()), tg = targets();
      return '<div class="card fx-row-between"><div><h3>🍽 תזונה היום</h3><div class="page-sub">' + t.mealsDone + '/' + t.meals + ' ארוחות · ~' + t.protein + ' ג׳ חלבון</div></div>' +
        '<div class="fx-counter"><span class="page-sub">💧</span><button class="wl-step-btn" data-wwater="-1" aria-label="פחות מים">−</button><span class="num">' + t.water + '/' + tg.water + '</span><button class="wl-step-btn" data-wwater="1" aria-label="עוד כוס מים">+</button></div></div>';
    },
    wire: function (n) {
      U().on(n, '[data-wwater]', 'click', function (b) { var k = tk(); N().water[k] = Math.max(0, (N().water[k] || 0) + (+b.dataset.wwater)); save(); if (N().water[k] >= targets().water) { api().grantXPOnce('water:' + k, 10, 'nutrition', {}); api().flushXP(b); } api().rerender(); });
    }
  };
  F.modules.push({ id: 'nutrition', label: 'תזונה', icon: 'bowl', group: 'body', render: render, override: true });
  F.nutrition = { dayTotals: dayTotals, targets: targets };
})();
