/* Piano Studio — goals & milestones (weekly / monthly / long-term, auto or manual tracking). */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var L = PS.schema.labels;

  var state = { tab: 'active' };
  var TABS = [
    { id: 'active', label: 'פעילים', test: function (g) { return g.status === 'active'; } },
    { id: 'weekly', label: 'שבועיים', test: function (g) { return g.period === 'weekly' && g.status !== 'abandoned'; } },
    { id: 'monthly', label: 'חודשיים', test: function (g) { return g.period === 'monthly' && g.status !== 'abandoned'; } },
    { id: 'long', label: 'ארוכי טווח', test: function (g) { return g.period === 'long' && g.status !== 'abandoned'; } },
    { id: 'completed', label: 'הושגו', test: function (g) { return g.status === 'completed'; } },
    { id: 'all', label: 'הכל', test: function () { return true; } }
  ];

  function openForm(rec, preset) {
    ui.editForm({ coll: 'goals', record: rec || preset || null, icon: 'target', intro: '<div class="banner banner-info">' + I('info') + '<span>במדידה אוטומטית היעד מתעדכן מרשומות אמיתיות (למשל שירים שסומנו כנלמדו) מתאריך ההתחלה ועד המועד. במעקב ידני — אתם מעדכנים את הערך.</span></div>' });
  }

  Object.assign(PS.act, {
    'add-goal': function (el, preset) { openForm(null, preset && !preset.target ? preset : null); },
    'goal-edit': function (el) { openForm(PS.store.get('goals', el.dataset.id)); },
    'goal-step': function (el) {
      var g = PS.store.get('goals', el.dataset.id);
      var v = Math.max(0, (+g.current || 0) + (+el.dataset.d));
      PS.store.update('goals', g.id, { current: v });
    },
    'goal-set': function (el) {
      var g = PS.store.get('goals', el.dataset.id);
      ui.prompt({ title: 'עדכון התקדמות', label: 'ערך נוכחי (מתוך ' + g.target + ')', type: 'number', value: String(g.current || 0), min: 0, icon: 'target' }).then(function (v) {
        if (v === null) return;
        var n = Math.max(0, Math.min(100000, Math.round(+v)));
        if (isNaN(n)) return ui.toast('נדרש מספר', 'error');
        PS.store.update('goals', g.id, { current: n });
      });
    },
    'goal-complete': function (el) {
      var g = PS.store.get('goals', el.dataset.id);
      ui.confirm({ title: 'לסמן את היעד כהושג?', html: 'היעד <b>' + U.bidi(g.title) + '</b> יסומן כהושג' + (g.reward ? ' ויוענקו ' + g.reward + ' XP (פעם אחת בלבד)' : '') + '.', confirmLabel: 'היעד הושג!' }).then(function (ok) {
        if (ok) PS.store.update('goals', g.id, { status: 'completed', current: g.metric === 'manual' ? Math.max(+g.current || 0, +g.target) : g.current });
      });
    },
    'goal-menu': function (el) {
      var g = PS.store.get('goals', el.dataset.id);
      var items = [{ label: 'עריכה', icon: 'edit', fn: function () { openForm(g); } }];
      if (g.status !== 'active') items.push({ label: 'החזרה לפעיל', icon: 'refresh', fn: function () { PS.store.update('goals', g.id, { status: 'active' }); } });
      if (g.status === 'active') items.push({ label: 'השהיה', icon: 'clock', fn: function () { PS.store.update('goals', g.id, { status: 'paused' }); } });
      if (g.status !== 'abandoned') items.push({ label: 'סימון כנזנח', icon: 'x', fn: function () { PS.store.update('goals', g.id, { status: 'abandoned' }); } });
      items.push({ sep: true }, { label: 'מחיקה', icon: 'trash', danger: true, fn: function () { ui.confirmDelete('goals', g.id); } });
      ui.menu(el, items);
    },
    'goals-tab': function (el) { state.tab = el.dataset.v; PS.refresh(); }
  });

  function card(g) {
    var cur = PS.domain.goalCurrent(g);
    var p = PS.domain.goalProgress(g);
    var days = g.deadline ? U.daysBetween(new Date(), g.deadline) : null;
    var auto = g.metric && g.metric !== 'manual';
    var related = [].concat((g.songIds || []).map(function (id) { var s = PS.store.get('songs', id); return s && '<a href="#/songs/' + s.id + '">' + I('music') + U.bidi(s.title) + '</a>'; }),
      (g.courseIds || []).map(function (id) { var c = PS.store.get('courses', id); return c && '<a href="#/courses/' + c.id + '">' + I('book') + U.bidi(c.title) + '</a>'; }),
      (g.lessonIds || []).map(function (id) { var l = PS.store.get('lessons', id); return l && '<a href="#/lessons/' + l.id + '">' + I('clock') + U.bidi(l.title) + '</a>'; })).filter(Boolean);
    return '<article class="card goal-card lift">' +
      '<div class="row"><div class="row" style="gap:6px">' + ui.status('goals', g.status) + '<span class="chip chip-muted">' + esc(L.goalPeriod[g.period] || '') + '</span>' + (g.priority === 'high' ? ui.priority('high') : '') + '</div>' +
      '<button type="button" class="icon-btn sm" data-act="goal-menu" data-id="' + g.id + '" aria-label="פעולות" aria-haspopup="menu">' + I('more') + '</button></div>' +
      '<h3>' + U.bidi(g.title) + '</h3>' + (g.description ? '<p class="small muted">' + U.bidi(g.description) + '</p>' : '') +
      '<div class="row" style="gap:16px;align-items:center">' + ui.ring(p, 64) +
        '<div style="flex:1;min-width:0"><div class="goal-val">' + cur + ' <small>/ ' + g.target + '</small></div><div class="small muted">' + esc(L.goalMetric[g.metric] || '') + (auto ? ' · אוטומטי' : '') + '</div>' +
        (g.deadline ? '<div class="small ' + (days < 0 && g.status === 'active' ? 'overdue' : 'muted') + '" style="margin-top:2px;' + (days < 0 && g.status === 'active' ? 'color:var(--red)' : '') + '">' + I('flag') + ' ' + esc(U.fmtDate(g.deadline)) + (g.status === 'active' ? (days > 0 ? ' · עוד ' + days + ' ימים' : days === 0 ? ' · היום' : ' · המועד עבר') : '') + '</div>' : '') + '</div></div>' +
      (related.length ? '<div class="meta">' + related.join('') + '</div>' : '') +
      (g.status === 'active' ? '<div class="row" style="margin-top:4px">' +
        (!auto ? '<button type="button" class="btn btn-ghost btn-sm" data-act="goal-step" data-id="' + g.id + '" data-d="-1" aria-label="הפחתה">−</button><button type="button" class="btn btn-ghost btn-sm" data-act="goal-step" data-id="' + g.id + '" data-d="1" aria-label="הוספה">+1</button><button type="button" class="btn btn-ghost btn-sm" data-act="goal-set" data-id="' + g.id + '">עדכון</button>' : '') +
        '<span class="spacer"></span><button type="button" class="btn btn-sm btn-primary" data-act="goal-complete" data-id="' + g.id + '">' + I('check') + 'הושג</button></div>'
        : g.completedAt ? '<div class="small gold">' + I('sparkle') + ' הושג ב-' + esc(U.fmtDate(g.completedAt)) + (g.reward ? ' · ' + U.xp(g.reward) : '') + '</div>' : '') +
    '</article>';
  }

  function render(el) {
    var all = PS.store.list('goals');
    var tab = TABS.filter(function (t) { return t.id === state.tab; })[0] || TABS[0];
    var PR = { high: 0, medium: 1, low: 2 };
    var list = all.filter(tab.test).sort(function (a, b) {
      var sa = a.status === 'active' ? 0 : 1, sb = b.status === 'active' ? 0 : 1;
      return sa - sb || (PR[a.priority] - PR[b.priority]) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
    });
    var completed = all.filter(function (g) { return g.status === 'completed'; }).sort(U.byKey('completedAt', 'desc'));
    var active = all.filter(function (g) { return g.status === 'active'; });
    var closed = all.filter(function (g) { return g.status === 'completed' || g.status === 'abandoned'; });
    var rate = closed.length ? completed.length / closed.length : null;
    var html = '<div class="page"><div class="page-head"><div><h1>יעדים ואבני דרך</h1><p class="sub">הגדירו לאן אתם רוצים להגיע — והמערכת תעקוב אחרי ההתקדמות האמיתית</p></div>' +
      '<div class="page-actions"><button type="button" class="btn btn-primary" data-act="add-goal">' + I('plus') + 'יעד חדש</button></div></div>';
    html += '<div class="grid grid-3 stagger" style="margin-bottom:20px">' +
      '<div class="card stat"><div class="stat-label">' + I('target') + 'יעדים פעילים</div><div class="stat-value">' + active.length + '</div><div class="stat-sub">' + active.filter(function (g) { return g.deadline && U.daysBetween(new Date(), g.deadline) <= 7 && U.daysBetween(new Date(), g.deadline) >= 0; }).length + ' עם מועד בשבוע הקרוב</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('trophy') + 'יעדים שהושגו</div><div class="stat-value">' + completed.length + '</div><div class="stat-sub">' + completed.reduce(function (s, g) { return s + (+g.reward || 0); }, 0) + ' XP מיעדים</div></div>' +
      '<div class="card stat"><div class="stat-label">' + I('chart') + 'שיעור הצלחה</div><div class="stat-value">' + (rate === null ? '—' : Math.round(rate * 100) + '%') + '</div><div class="stat-sub">' + (rate === null ? 'יחושב אחרי שיעד ייסגר' : 'מתוך ' + closed.length + ' יעדים שנסגרו') + '</div></div></div>';
    html += '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (t.id === state.tab) + '" class="' + (t.id === state.tab ? 'on' : '') + '" data-act="goals-tab" data-v="' + t.id + '">' + esc(t.label) + ' <span class="count">' + all.filter(t.test).length + '</span></button>'; }).join('') + '</div>';
    html += list.length ? '<div class="grid grid-auto stagger">' + list.map(card).join('') + '</div>' :
      '<div class="card">' + ui.empty(all.length ? { icon: 'target', title: 'אין יעדים בלשונית הזו', text: 'נסו לשונית אחרת או הגדירו יעד חדש.' } : { icon: 'target', title: 'עוד לא הוגדרו יעדים', text: 'למשל: ללמוד 5 שירים עד סוף השנה, להשלים 2 קורסים, או לארגן את כל ההערות מהשיעורים.', action: { act: 'add-goal', label: 'יעד ראשון' } }) + '</div>';
    // milestone timeline
    html += '<div class="section"><div class="section-head"><h2>' + I('route') + 'ציר אבני הדרך</h2></div><div class="card pad">';
    var upcoming = active.filter(function (g) { return g.deadline; }).sort(U.byKey('deadline')).slice(0, 5);
    if (!completed.length && !upcoming.length) html += '<p class="faint small">אבני דרך שהושגו ויעדים עם מועד יופיעו כאן לפי סדר כרונולוגי.</p>';
    else {
      html += '<ul class="history">' + upcoming.map(function (g) { return '<li><b>' + U.bidi(g.title) + '</b> · <span class="muted">יעד מתוכנן</span><small>' + esc(U.fmtDate(g.deadline)) + ' · ' + Math.round(PS.domain.goalProgress(g) * 100) + '%</small></li>'; }).join('') +
        completed.slice(0, 10).map(function (g) { return '<li><b>' + U.bidi(g.title) + '</b> · <span class="gold">הושג</span><small>' + esc(U.fmtDate(g.completedAt)) + '</small></li>'; }).join('') + '</ul>';
    }
    html += '</div></div></div>';
    el.innerHTML = html;
  }

  PS.views.goals = { title: function () { return 'יעדים'; }, render: render };
})();
