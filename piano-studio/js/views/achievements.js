/* Piano Studio — level, achievements gallery and the auditable XP ledger. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;

  var state = { tab: 'achievements', filter: 'all', showAll: false };

  Object.assign(PS.act, {
    'ach-tab': function (el) { state.tab = el.dataset.v; PS.refresh(); },
    'ach-filter': function (el) { state.filter = el.dataset.v; PS.refresh(); },
    'xp-more': function () { state.showAll = true; PS.refresh(); },
    'xp-revoke': function (el) {
      var ev = PS.store.get('xp', el.dataset.id);
      ui.confirm({ title: 'ביטול אירוע XP', html: 'לבטל את <b>' + U.bidi(ev.reason) + '</b> (' + ev.amount + ' XP)? האירוע יישאר בהיסטוריה כמבוטל ולא ייספר. אפשר לשחזר אותו בכל עת.', confirmLabel: 'ביטול האירוע', danger: true }).then(function (ok) { if (ok) PS.game.setRevoked(ev.id, true); });
    },
    'xp-restore': function (el) { PS.game.setRevoked(el.dataset.id, false); ui.toast('האירוע שוחזר', 'success'); },
    'xp-adjust': function () {
      var m = ui.modal({
        title: 'תיקון XP ידני', icon: 'sliders', size: 'sm',
        body: '<form class="form"><div class="field"><label for="xa-a"><span class="field-label">כמות (שלילי להפחתה)</span></label><input id="xa-a" class="input" type="number" min="-1000" max="1000" step="1" value="10" required></div>' +
          '<div class="field"><label for="xa-r"><span class="field-label">סיבה (נשמרת בהיסטוריה)</span></label><input id="xa-r" class="input" maxlength="120" placeholder="למשל: אבן דרך אישית — הופעה ראשונה" required></div></form>' +
          '<p class="small faint">תיקונים ידניים מסומנים בהיסטוריה כ"ידני" כדי שהיומן יישאר שקוף.</p>',
        footer: '<button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-primary" data-ok>' + I('check') + 'שמירה</button>'
      });
      m.el.querySelector('[data-ok]').onclick = function () {
        var a = Math.round(+m.el.querySelector('#xa-a').value);
        var r = m.el.querySelector('#xa-r').value.trim();
        if (!a || isNaN(a) || Math.abs(a) > 1000) { m.el.querySelector('#xa-a').focus(); return; }
        if (!r) { m.el.querySelector('#xa-r').focus(); return; }
        if (PS.game.lifetimeXP() + a < 0) { ui.toast('אי אפשר לרדת מתחת ל-0 XP', 'error'); return; }
        PS.game.adjust(a, r);
        m.close();
        ui.toast('נרשם תיקון של ' + (a > 0 ? '+' : '') + a + ' XP', 'success');
      };
    }
  });

  function levelCard() {
    var g = PS.game.info();
    return '<div class="card level-card">' +
      '<div class="level-badge" aria-label="רמה ' + g.level + '"><b class="num">' + g.level + '</b><small>LEVEL</small></div>' +
      '<div><p class="small gold" style="font-weight:600;letter-spacing:.04em">הרמה הנוכחית</p><h2>' + esc(g.title) + '</h2>' +
        '<div style="margin-top:14px;max-width:520px"><div class="hero-xp-row"><span>' + U.num(g.into) + ' / ' + U.num(g.need) + ' XP לרמה ' + (g.level + 1) + '</span><span>עוד ' + U.num(g.remaining) + '</span></div>' + ui.bar(g.pct, 'pbar-l') + '</div></div>' +
      '<div class="stack" style="gap:10px;min-width:200px">' +
        '<div><small class="muted">XP מצטבר (לכל הזמנים)</small><div class="goal-val num">' + U.num(g.lifetime) + '</div></div>' +
        '<div><small class="muted">פרס הרמה הבאה</small><div style="font-weight:600">' + I('crown') + ' התואר "' + esc(g.nextTitle) + '"</div></div></div></div>';
  }

  function achievements() {
    var st = PS.game.achievementState();
    var unlocked = st.filter(function (a) { return a.unlocked; }).length;
    var list = st.filter(function (a) { return state.filter === 'all' || (state.filter === 'unlocked' ? a.unlocked : !a.unlocked); });
    var html = '<div class="toolbar"><div class="seg">' + [['all', 'הכל (' + st.length + ')'], ['unlocked', 'נפתחו (' + unlocked + ')'], ['locked', 'נעולים (' + (st.length - unlocked) + ')']].map(function (f) { return '<button type="button" class="' + (state.filter === f[0] ? 'on' : '') + '" data-act="ach-filter" data-v="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div></div>';
    Object.keys(PS.game.ACH_CATS).forEach(function (cat) {
      var items = list.filter(function (a) { return a.cat === cat; });
      if (!items.length) return;
      html += '<div class="section"><div class="section-head"><h2>' + esc(PS.game.ACH_CATS[cat]) + '</h2><span class="small muted">' + items.filter(function (a) { return a.unlocked; }).length + '/' + items.length + '</span></div><div class="ach-grid stagger">' +
        items.map(function (a) {
          return '<article class="card ach ' + (a.unlocked ? 'unlocked' : 'locked') + '" aria-label="' + esc(a.name) + (a.unlocked ? ' — נפתח' : ' — נעול') + '">' +
            '<div class="ach-badge">' + I(a.icon) + (a.unlocked ? '' : '<span class="lock">' + I('lock') + '</span>') + '</div>' +
            '<h3>' + esc(a.name) + '</h3><p>' + esc(a.desc) + '</p>' +
            (!a.unlocked && a.target > 1 ? '<div>' + ui.bar(a.current / a.target, 'pbar-xs') + '</div>' : '') +
            '<div class="ach-foot"><span class="rarity rarity-' + a.rarity + '">' + esc(PS.game.RARITY[a.rarity]) + '</span><span>' + (a.unlocked ? esc(U.fmtDate(a.unlockedAt)) : a.current + '/' + a.target) + '</span></div></article>';
        }).join('') + '</div></div>';
    });
    return html;
  }

  function ledger() {
    var evs = PS.game.events();
    var shown = state.showAll ? evs : evs.slice(0, 40);
    var X = PS.game.XP;
    var html = '<div class="grid grid-2" style="margin-bottom:18px"><div class="card pad"><div class="card-head"><h3>' + I('sparkle') + 'איך צוברים XP</h3></div><dl class="kv">' +
      '<dt>השלמת משימה</dt><dd class="xp-amt">+' + X.task + '</dd><dt>שיעור שהתקיים</dt><dd class="xp-amt">+' + X.lesson + '</dd><dt>השלמת מודול בקורס</dt><dd class="xp-amt">+' + X.module + '</dd>' +
      '<dt>סיום קורס</dt><dd class="xp-amt">+' + X.course + '</dd><dt>שיר שנלמד</dt><dd class="xp-amt">+' + X.song + '</dd><dt>עמידה ביעד השבועי</dt><dd class="xp-amt">+' + X.weekly + '</dd><dt>השגת יעד / אבן דרך</dt><dd class="xp-amt">לפי הגדרת היעד</dd></dl>' +
      '<p class="small faint" style="margin-top:12px">כל רשומה מתגמלת פעם אחת בלבד. ביטול השלמה וסימון מחדש לא מעניקים XP נוסף. XP מתגמל פעולות שנרשמו — לא מודד מיומנות נגינה.</p></div>' +
      '<div class="card pad"><div class="card-head"><h3>' + I('crown') + 'מפת הרמות</h3></div><div class="list" style="max-height:290px;overflow-y:auto">' +
      (function () {
        var g = PS.game.info();
        var out = '', cum = 0;
        for (var l = 1; l <= 16; l++) {
          out += '<div class="list-row" style="padding:8px 4px' + (l === g.level ? ';background:var(--gold-soft);border-radius:10px' : '') + '"><span class="num" style="width:28px;font-weight:700;' + (l <= g.level ? 'color:var(--gold)' : 'color:var(--text-faint)') + '">' + l + '</span><span class="grow"><span class="title" style="font-weight:500">' + esc(PS.game.titleFor(l)) + '</span></span><span class="small muted num">' + U.num(cum) + ' XP</span></div>';
          cum += PS.game.xpToNext(l);
        }
        return out;
      })() + '</div></div></div>';
    html += '<div class="card"><div class="card-head" style="padding:18px 20px 0"><h3>' + I('history') + 'יומן XP (' + evs.length + ' אירועים)</h3><button type="button" class="btn btn-ghost btn-sm" data-act="xp-adjust">' + I('sliders') + 'תיקון ידני</button></div>';
    if (!evs.length) html += ui.empty({ icon: 'sparkle', title: 'עוד לא נצבר XP', text: 'השלימו משימה, סמנו שיעור שהתקיים או מודול בקורס — וכל אירוע יירשם כאן.' });
    else {
      html += '<div class="table-wrap"><table class="xp-table"><thead><tr><th>תאריך</th><th>פעולה</th><th>סוג</th><th>XP</th><th><span class="sr-only">פעולות</span></th></tr></thead><tbody>' +
        shown.map(function (e) {
          return '<tr class="' + (e.revoked ? 'revoked' : '') + '"><td class="num small">' + esc(U.fmtDateTime(e.at)) + '</td><td>' + U.bidi(e.reason) + '</td><td>' + (e.kind === 'manual' ? '<span class="chip chip-blue">ידני</span>' : '<span class="chip chip-muted">אוטומטי</span>') + (e.revoked ? ' <span class="chip chip-red">בוטל</span>' : '') + '</td>' +
            '<td class="xp-amt' + (e.amount < 0 ? ' neg' : '') + '">' + (e.amount > 0 ? '+' : '') + e.amount + '</td>' +
            '<td>' + (e.revoked ? '<button type="button" class="btn btn-ghost btn-sm" data-act="xp-restore" data-id="' + e.id + '">שחזור</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="xp-revoke" data-id="' + e.id + '">ביטול</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (!state.showAll && evs.length > 40 ? '<p class="center" style="padding:12px"><button type="button" class="btn btn-ghost btn-sm" data-act="xp-more">הצגת הכל</button></p>' : '');
    }
    return html + '</div>';
  }

  function render(el) {
    var html = '<div class="page"><div class="page-head"><div><h1>הישגים ו-XP</h1><p class="sub">תגמול על ארגון ואבני דרך אמיתיות — שקוף וניתן לבדיקה</p></div></div>' + levelCard();
    html += '<div class="tabs" role="tablist" style="margin-top:22px">' + [['achievements', 'אוסף ההישגים', 'trophy'], ['ledger', 'יומן XP ורמות', 'history']].map(function (t) { return '<button type="button" role="tab" aria-selected="' + (state.tab === t[0]) + '" class="' + (state.tab === t[0] ? 'on' : '') + '" data-act="ach-tab" data-v="' + t[0] + '">' + I(t[2]) + t[1] + '</button>'; }).join('') + '</div>';
    html += state.tab === 'achievements' ? achievements() : ledger();
    el.innerHTML = html + '</div>';
  }

  PS.views.achievements = { title: function () { return 'הישגים'; }, render: render };
})();
