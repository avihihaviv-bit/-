/* Piano Studio — application shell: router, navigation, header, global search,
 * quick-add, notification center, keyboard shortcuts, theme and onboarding. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  PS.views = PS.views || {};
  PS.act = PS.act || {};

  var NAV = [
    { group: 'סקירה', items: [
      { id: 'home', label: 'בית', icon: 'home', href: '#/' },
      { id: 'calendar', label: 'לוח שנה', icon: 'calendar', href: '#/calendar' },
      { id: 'stats', label: 'סטטיסטיקה', icon: 'chart', href: '#/stats' }
    ] },
    { group: 'למידה', items: [
      { id: 'lessons', label: 'שיעורים', icon: 'clock', href: '#/lessons' },
      { id: 'notes', label: 'מחברת שיעורים', icon: 'note', href: '#/notes' },
      { id: 'songs', label: 'שירים', icon: 'music', href: '#/songs' },
      { id: 'courses', label: 'קורסים', icon: 'book', href: '#/courses' }
    ] },
    { group: 'ארגון', items: [
      { id: 'tasks', label: 'משימות', icon: 'list', href: '#/tasks' },
      { id: 'goals', label: 'יעדים', icon: 'target', href: '#/goals' },
      { id: 'resources', label: 'משאבים', icon: 'folder', href: '#/resources' },
      { id: 'journal', label: 'יומן אישי', icon: 'pen', href: '#/journal' }
    ] },
    { group: 'התקדמות', items: [
      { id: 'journey', label: 'המסע המוזיקלי', icon: 'route', href: '#/journey' },
      { id: 'achievements', label: 'הישגים ו-XP', icon: 'trophy', href: '#/achievements' }
    ] }
  ];
  var SETTINGS_ITEM = { id: 'settings', label: 'הגדרות', icon: 'settings', href: '#/settings' };
  var BOTTOM = ['home', 'lessons', '__add', 'songs', '__more'];

  function allNav() { var a = []; NAV.forEach(function (g) { a = a.concat(g.items); }); return a.concat([SETTINGS_ITEM]); }

  var current = { name: 'home', params: [], query: {} };

  /* ---------------- routing ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {};
    var qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean);
    var name = parts[0] || 'home';
    if (!PS.views[name]) name = 'notfound';
    return { name: name, params: parts.slice(1), query: q };
  }

  function navigate(href) {
    if (location.hash === href) render(true);
    else location.hash = href;
  }
  PS.navigate = navigate;

  function render(isNav) {
    var main = document.getElementById('main');
    var route = isNav ? parseHash() : current;
    var changedPage = isNav && (route.name !== current.name || route.params.join('/') !== current.params.join('/'));
    current = route;
    var view = PS.views[route.name] || PS.views.notfound;
    // preserve focus on re-render
    var active = document.activeElement;
    var keep = active && active.getAttribute && active.getAttribute('data-keep');
    var sel = keep && active.selectionStart !== undefined ? [active.selectionStart, active.selectionEnd] : null;
    var scroll = window.scrollY;
    try {
      view.render(main, route);
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="page"><div class="card pad">' + PS.ui.empty({ icon: 'alert', title: 'משהו השתבש בטעינת העמוד', text: String(e && e.message || e) }) + '</div></div>';
    }
    document.title = (view.title ? view.title(route) + ' · ' : '') + 'Piano Studio';
    renderSidebar();
    renderTopbar(view, route);
    renderBottom();
    if (changedPage) {
      main.classList.remove('page-enter');
      void main.offsetWidth;
      main.classList.add('page-enter');
      window.scrollTo(0, 0);
      if (isNav && document.activeElement === document.body) main.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, scroll);
      if (keep) {
        var el = main.querySelector('[data-keep="' + keep + '"]');
        if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
      }
    }
  }
  PS.refresh = function () { render(false); };
  var scheduled = false;
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; render(false); });
  }

  /* ---------------- sidebar ---------------- */
  function avatarHTML(cls) {
    var name = PS.prefs.get('name');
    var ini = PS.prefs.get('initials') || U.initials(name);
    return '<span class="avatar avatar-' + esc(PS.prefs.get('avatarColor') || 'gold') + ' ' + (cls || '') + '" aria-hidden="true">' + esc(ini) + '</span>';
  }
  PS.avatarHTML = avatarHTML;

  function renderSidebar() {
    var sb = document.getElementById('sidebar');
    var g = PS.game.info();
    var collapsed = PS.prefs.get('sidebarCollapsed');
    document.getElementById('app').classList.toggle('collapsed', !!collapsed);
    var counts = { tasks: PS.store.list('tasks').filter(function (t) { return !t.done && t.dueDate && t.dueDate <= U.todayKey(); }).length };
    function item(it) {
      var on = current.name === it.id || (current.name === 'notfound' && false);
      return '<a class="nav-item' + (on ? ' active' : '') + '" href="' + it.href + '"' + (on ? ' aria-current="page"' : '') + ' title="' + esc(it.label) + '">' +
        I(it.icon) + '<span class="nav-label">' + esc(it.label) + '</span>' +
        (counts[it.id] ? '<span class="nav-count num" aria-label="' + counts[it.id] + ' משימות להיום">' + counts[it.id] + '</span>' : '') + '</a>';
    }
    sb.innerHTML =
      '<div class="side-head">' +
        '<a class="brand" href="#/" aria-label="Piano Studio — בית"><span class="brand-mark">' + I('piano') + '</span><span class="brand-name">Piano Studio</span></a>' +
        '<button type="button" class="icon-btn side-collapse" data-act="toggle-sidebar" aria-label="' + (collapsed ? 'הרחבת התפריט' : 'כיווץ התפריט') + '" title="' + (collapsed ? 'הרחבה' : 'כיווץ') + '">' + I('collapse') + '</button>' +
      '</div>' +
      '<button type="button" class="btn btn-primary side-add" data-act="quick-add" aria-haspopup="menu">' + I('plus') + '<span class="nav-label">הוספה מהירה</span></button>' +
      '<nav class="side-nav">' + NAV.map(function (grp) {
        return '<div class="nav-group"><div class="nav-group-label">' + esc(grp.group) + '</div>' + grp.items.map(item).join('') + '</div>';
      }).join('') + '</nav>' +
      '<div class="side-foot">' + item(SETTINGS_ITEM) +
        '<a class="side-profile" href="#/achievements" title="רמה ' + g.level + ' · ' + esc(g.title) + '">' + avatarHTML() +
          '<span class="side-profile-text"><b>' + esc(PS.prefs.get('name') || 'הפרופיל שלי') + '</b><small>רמה ' + g.level + ' · ' + esc(g.title) + '</small>' +
          '<span class="side-xp">' + PS.ui.bar(g.pct, 'pbar-xs') + '</span></span></a>' +
      '</div>';
  }

  function renderTopbar(view, route) {
    var tb = document.getElementById('topbar');
    var unread = PS.notify.unread();
    var theme = document.documentElement.getAttribute('data-theme');
    var title = view.title ? view.title(route) : '';
    tb.innerHTML =
      '<a class="brand brand-mobile" href="#/" aria-label="Piano Studio — בית"><span class="brand-mark">' + I('piano') + '</span><span class="brand-name">Piano Studio</span></a>' +
      '<div class="topbar-title">' + (route.name === 'home' ? '<span class="topbar-date">' + esc(U.fmtFull(new Date())) + '</span>' : '<span class="topbar-crumb">' + esc(title) + '</span>') + '</div>' +
      '<div class="topbar-actions">' +
        '<button type="button" class="search-trigger" data-act="search" aria-label="חיפוש (Ctrl+K)">' + I('search') + '<span>חיפוש…</span><kbd>Ctrl K</kbd></button>' +
        '<button type="button" class="icon-btn only-mobile" data-act="search" aria-label="חיפוש">' + I('search') + '</button>' +
        '<button type="button" class="icon-btn" data-act="toggle-theme" aria-label="' + (theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה') + '" title="ערכת נושא">' + I(theme === 'dark' ? 'sun' : 'moon') + '</button>' +
        '<button type="button" class="icon-btn bell" data-act="notifications" aria-label="התראות' + (unread ? ' (' + unread + ' שלא נקראו)' : '') + '" aria-haspopup="dialog">' + I('bell') + (unread ? '<span class="badge num">' + (unread > 9 ? '9+' : unread) + '</span>' : '') + '</button>' +
        '<a class="icon-btn hide-mobile" href="#/settings" aria-label="הגדרות" title="הגדרות">' + I('settings') + '</a>' +
        '<a href="#/settings" class="topbar-avatar" aria-label="פרופיל והגדרות">' + avatarHTML('avatar-sm') + '</a>' +
      '</div>';
  }

  function renderBottom() {
    var bn = document.getElementById('bottom-nav');
    var map = {};
    allNav().forEach(function (n) { map[n.id] = n; });
    var primary = ['home', 'lessons', 'songs'];
    bn.innerHTML = BOTTOM.map(function (id) {
      if (id === '__add') return '<button type="button" class="bn-add" data-act="quick-add" aria-label="הוספה מהירה">' + I('plus') + '</button>';
      if (id === '__more') {
        var on = primary.indexOf(current.name) < 0 && current.name !== 'home';
        return '<button type="button" class="bn-item' + (on ? ' active' : '') + '" data-act="more-nav" aria-label="עוד">' + I('menu') + '<span>עוד</span></button>';
      }
      var n = map[id];
      var active = current.name === id;
      return '<a class="bn-item' + (active ? ' active' : '') + '" href="' + n.href + '"' + (active ? ' aria-current="page"' : '') + '>' + I(n.icon) + '<span>' + esc(n.label) + '</span></a>';
    }).join('');
  }

  /* ---------------- global search ---------------- */
  function openSearch() {
    if (document.querySelector('.modal-palette')) return;
    var m = PS.ui.modal({
      title: 'חיפוש וניווט', icon: 'search', size: 'palette',
      body: '<div class="palette"><div class="palette-input">' + I('search') + '<input type="search" class="input" placeholder="חפשו שירים, שיעורים, קורסים, משימות, פתקים, יעדים…" aria-label="חיפוש גלובלי" autofocus role="combobox" aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list"></div><div class="palette-results" id="palette-results" role="listbox"></div>' +
        '<div class="palette-hint"><span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span><span><kbd>Enter</kbd> פתיחה</span><span><kbd>Esc</kbd> סגירה</span></div></div>'
    });
    m.el.classList.add('modal-palette');
    var input = m.el.querySelector('input');
    var res = m.el.querySelector('.palette-results');
    var items = [];
    var idx = 0;
    function draw() {
      var q = input.value.trim();
      if (!q) {
        items = allNav().map(function (n) { return { title: n.label, sub: 'מעבר לעמוד', icon: n.icon, href: n.href, label: 'עמוד' }; })
          .concat(QUICK.map(function (a) { return { title: a.label, sub: 'הוספה מהירה', icon: 'plus', act: a.act, label: 'פעולה' }; }));
      } else {
        items = PS.search.query(q, 30);
        allNav().forEach(function (n) { if (U.normalize(n.label).indexOf(U.normalize(q)) >= 0) items.push({ title: n.label, sub: 'מעבר לעמוד', icon: n.icon, href: n.href, label: 'עמוד' }); });
      }
      idx = Math.min(idx, Math.max(0, items.length - 1));
      res.innerHTML = items.length ? items.map(function (it, i) {
        return '<button type="button" class="palette-item' + (i === idx ? ' on' : '') + '" role="option" aria-selected="' + (i === idx) + '" data-i="' + i + '">' +
          '<span class="palette-icon">' + I(it.icon) + '</span><span class="palette-text"><b>' + U.bidi(it.title) + '</b>' + (it.sub ? '<small>' + U.bidi(it.sub) + '</small>' : '') + '</span><span class="chip chip-muted">' + esc(it.label) + '</span></button>';
      }).join('') : '<div class="palette-empty">' + I('search') + '<p>לא נמצאו תוצאות עבור "' + esc(q) + '"</p></div>';
    }
    function open(i) {
      var it = items[i];
      if (!it) return;
      m.close();
      if (it.act) setTimeout(function () { PS.act[it.act](); }, 60);
      else navigate(it.href);
    }
    input.addEventListener('input', function () { idx = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); draw(); scrollOn(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); scrollOn(); }
      else if (e.key === 'Enter') { e.preventDefault(); open(idx); }
    });
    function scrollOn() { var on = res.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    res.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) open(+b.dataset.i); });
    draw();
  }

  /* ---------------- quick add ---------------- */
  var QUICK = [
    { label: 'שיעור פסנתר', icon: 'clock', act: 'add-lesson' },
    { label: 'שיר', icon: 'music', act: 'add-song' },
    { label: 'קורס', icon: 'book', act: 'add-course' },
    { label: 'משימה', icon: 'list', act: 'add-task' },
    { label: 'פתק', icon: 'note', act: 'add-note' },
    { label: 'יעד', icon: 'target', act: 'add-goal' },
    { label: 'אירוע ביומן', icon: 'calendar', act: 'add-event' },
    { label: 'רשומת יומן', icon: 'pen', act: 'add-journal' },
    { label: 'משאב', icon: 'folder', act: 'add-resource' }
  ];
  PS.QUICK = QUICK;
  function quickAdd(anchor) {
    PS.ui.menu(anchor || document.querySelector('.side-add') || document.body, QUICK.map(function (q) { return { label: q.label, icon: q.icon, fn: function () { PS.act[q.act](); } }; }));
  }

  /* ---------------- notifications ---------------- */
  var NTF_ICON = { lesson: 'clock', task: 'list', goal: 'target', course: 'book', level: 'bolt', achievement: 'trophy', event: 'calendar' };
  function openNotifications() {
    var list = PS.notify.list();
    var m = PS.ui.modal({
      title: 'התראות', icon: 'bell', size: 'drawer',
      body: '<div class="ntf-actions"><button type="button" class="btn btn-ghost btn-sm" data-ntf-all ' + (PS.notify.unread() ? '' : 'disabled') + '>' + I('check') + 'סימון הכל כנקרא</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-ntf-clear ' + (list.length ? '' : 'disabled') + '>' + I('trash') + 'ניקוי</button>' +
        '<a class="btn btn-ghost btn-sm" href="#/settings?s=notifications" data-close>' + I('sliders') + 'העדפות</a></div>' +
        (list.length ? '<ul class="ntf-list">' + list.map(function (n) {
          return '<li><button type="button" class="ntf' + (n.read ? '' : ' unread') + '" data-ntf="' + esc(n.id) + '">' +
            '<span class="ntf-icon ntf-' + esc(n.type) + '">' + I(NTF_ICON[n.type] || 'bell') + '</span>' +
            '<span class="ntf-text"><b>' + U.bidi(n.title) + '</b>' + (n.body ? '<span>' + U.bidi(n.body) + '</span>' : '') + '<small>' + esc(U.timeAgo(n.at)) + '</small></span>' +
            (n.read ? '' : '<i class="ntf-dot" aria-label="לא נקרא"></i>') + '</button></li>';
        }).join('') + '</ul>' : PS.ui.empty({ icon: 'bell', title: 'אין התראות', text: 'תזכורות לשיעורים, משימות ויעדים יופיעו כאן כשהאפליקציה פתוחה.' }))
    });
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ntf]');
      if (b) {
        var n = PS.store.get('notifications', b.dataset.ntf);
        PS.notify.markRead(n.id);
        m.close();
        if (n.href) navigate(n.href);
      }
      if (e.target.closest('[data-ntf-all]')) { PS.notify.markAllRead(); m.close(); openNotifications(); }
      if (e.target.closest('[data-ntf-clear]')) { PS.notify.clearAll(); m.close(); }
    });
  }

  function openMoreNav() {
    var m = PS.ui.modal({
      title: 'כל האזורים', icon: 'menu', size: 'sheet',
      body: '<div class="more-grid">' + allNav().map(function (n) {
        return '<a class="more-item' + (current.name === n.id ? ' active' : '') + '" href="' + n.href + '" data-close>' + I(n.icon) + '<span>' + esc(n.label) + '</span></a>';
      }).join('') + '</div>'
    });
    m.el.addEventListener('click', function (e) { var a = e.target.closest('a[href]'); if (a) { m.close(); } });
  }

  function showShortcuts() {
    PS.ui.modal({
      title: 'קיצורי מקלדת', icon: 'keyboard', size: 'sm',
      body: '<dl class="shortcuts">' +
        '<dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd></dt><dd>חיפוש וניווט מהיר</dd>' +
        '<dt><kbd>/</kbd></dt><dd>חיפוש</dd>' +
        '<dt><kbd>N</kbd></dt><dd>תפריט הוספה מהירה</dd>' +
        '<dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>שמירת טופס</dd>' +
        '<dt><kbd>Esc</kbd></dt><dd>סגירת חלון</dd>' +
        '<dt><kbd>?</kbd></dt><dd>הצגת קיצורים</dd></dl>'
    });
  }

  /* ---------------- theme ---------------- */
  function applyTheme() {
    var t = PS.prefs.get('theme');
    if (t === 'system') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var tc = document.querySelector('meta[name=theme-color]');
    if (tc) tc.setAttribute('content', t === 'light' ? '#f6f3ee' : '#0b0b0d');
    document.documentElement.classList.toggle('reduce-motion', U.prefersReducedMotion());
    document.documentElement.classList.toggle('motion-ok', PS.prefs.get('reducedMotion') === 'off');
  }
  PS.applyTheme = applyTheme;
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if (PS.prefs.get('theme') === 'system') { applyTheme(); scheduleRender(); } });
  }

  /* ---------------- global actions ---------------- */
  Object.assign(PS.act, {
    'quick-add': function (el) { quickAdd(el); },
    'search': openSearch,
    'notifications': openNotifications,
    'more-nav': openMoreNav,
    'shortcuts': showShortcuts,
    'toggle-theme': function () {
      var cur = document.documentElement.getAttribute('data-theme');
      PS.prefs.set('theme', cur === 'dark' ? 'light' : 'dark');
      applyTheme();
      scheduleRender();
    },
    'toggle-sidebar': function () { PS.prefs.set('sidebarCollapsed', !PS.prefs.get('sidebarCollapsed')); scheduleRender(); },
    'nav': function (el) { navigate(el.dataset.href); }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && !el.disabled) {
      var fn = PS.act[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el, e); return; }
    }
    var card = e.target.closest('[data-href]');
    if (card && !e.target.closest('a, button, input, label, select, textarea')) navigate(card.dataset.href);
  });
  document.addEventListener('keydown', function (e) {
    var card = e.target.closest && e.target.closest('[data-href]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(card.dataset.href); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (el && PS.act[el.dataset.change]) PS.act[el.dataset.change](el, e);
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (el && PS.act[el.dataset.input]) PS.act[el.dataset.input](el, e);
  });

  /* keyboard shortcuts */
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'כ')) { e.preventDefault(); openSearch(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || PS.ui.topModal()) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); }
    else if (e.key === 'n' || e.key === 'N' || e.key === 'מ') { e.preventDefault(); quickAdd(); }
    else if (e.key === '?') { e.preventDefault(); showShortcuts(); }
  });

  /* ---------------- onboarding ---------------- */
  function maybeOnboard() {
    if (PS.prefs.get('onboarded')) return;
    var hasData = PS.db.COLLECTIONS.some(function (c) { return c !== 'activity' && PS.store.list(c).length; });
    if (hasData) { PS.prefs.set('onboarded', true); return; }
    var m = PS.ui.modal({
      title: 'ברוכים הבאים ל-Piano Studio', icon: 'piano', size: 'md',
      body: '<div class="onboard"><p class="lead">המקום האישי שלך לנהל את המסע המוזיקלי: שיעורים, שירים, קורסים, משימות, יעדים והתקדמות — הכל במקום אחד, נשמר בדפדפן שלך.</p>' +
        '<form class="form" data-onboard><div class="field"><label for="ob-name"><span class="field-label">איך לקרוא לך?</span></label><input id="ob-name" class="input" type="text" maxlength="40" placeholder="השם שלך" autofocus></div>' +
        '<div class="field half"><label for="ob-goal"><span class="field-label">יעד שבועי (פעולות למידה)</span></label><input id="ob-goal" class="input" type="number" min="1" max="50" value="5"></div>' +
        '<div class="field half"><label for="ob-dur"><span class="field-label">אורך שיעור רגיל (דקות)</span></label><input id="ob-dur" class="input" type="number" min="10" max="240" value="45"></div>' +
        '<label class="field field-check"><input type="checkbox" class="check" id="ob-demo"><span>טען נתוני דוגמה כדי להכיר את המערכת (אפשר להסיר בהגדרות)</span></label></form>' +
        '<p class="muted small">פעולת למידה = משימה שהושלמה, שיעור שהתקיים, מודול שהושלם או שיר שנלמד.</p></div>',
      footer: '<button type="button" class="btn btn-ghost" data-close>אחר כך</button><button type="button" class="btn btn-primary" data-ob-go>' + I('sparkle') + 'בואו נתחיל</button>',
      onClose: function () { PS.prefs.set('onboarded', true); }
    });
    function go() {
      var name = m.el.querySelector('#ob-name').value.trim().slice(0, 40);
      var goal = U.clamp(parseInt(m.el.querySelector('#ob-goal').value, 10) || 5, 1, 50);
      var dur = U.clamp(parseInt(m.el.querySelector('#ob-dur').value, 10) || 45, 10, 240);
      PS.prefs.set({ name: name, weeklyGoal: goal, defaultLessonDuration: dur, onboarded: true });
      if (m.el.querySelector('#ob-demo').checked) PS.backup.loadDemo();
      m.close();
      scheduleRender();
      PS.ui.toast(name ? 'נעים להכיר, ' + name + '!' : 'הכל מוכן — בהצלחה!', 'gold');
    }
    m.el.querySelector('[data-ob-go]').onclick = go;
    m.el.querySelector('form').onsubmit = function (e) { e.preventDefault(); go(); };
  }

  /* ---------------- not found ---------------- */
  PS.views.notfound = {
    title: function () { return 'לא נמצא'; },
    render: function (el) {
      el.innerHTML = '<div class="page"><div class="card pad">' + PS.ui.empty({ icon: 'route', title: 'העמוד לא נמצא', text: 'ייתכן שהקישור שגוי או שהרשומה נמחקה.' }) + '<p class="center"><a class="btn btn-ghost" href="#/">חזרה לבית</a></p></div></div>';
    }
  };

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme();
    PS.fx.runIntro();
    PS.db.onError(function (e) { PS.ui.toast('שגיאת שמירה: ' + (e && e.message ? e.message : e), 'error', { duration: 7000 }); });
    PS.db.init().then(function () {
      PS.store.on(function () { scheduleRender(); });
      PS.prefs.on(function () { scheduleRender(); });
      window.addEventListener('hashchange', function () { PS.ui.closeMenu(); render(true); });
      render(true);
      PS.domain.evaluate();
      PS.notify.start();
      if (PS.db.mode() !== 'idb') PS.ui.toast('IndexedDB אינו זמין — הנתונים נשמרים ב-localStorage במגבלת נפח', 'error', { duration: 8000 });
      setTimeout(maybeOnboard, document.documentElement.classList.contains('intro-on') ? 2400 : 300);
      // refresh relative times/countdowns each minute
      setInterval(function () { if (!PS.ui.topModal()) scheduleRender(); }, 60000);
    }).catch(function (e) {
      console.error(e);
      document.getElementById('main').innerHTML = '<div class="page"><div class="card pad">' + PS.ui.empty({ icon: 'alert', title: 'לא ניתן לטעון את מסד הנתונים', text: String(e && e.message || e) }) + '</div></div>';
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }
  boot();
})();
