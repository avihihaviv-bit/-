/* Piano Studio — reusable UI: toasts, modals, confirm, menus, schema-driven forms,
 * markdown, progress, empty states and status chips. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = {};

  /* ---------------- toasts ---------------- */
  ui.toast = function (msg, type, opt) {
    opt = opt || {};
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    var icon = { success: 'checkCircle', error: 'alert', gold: 'sparkle', info: 'info' }[type || 'info'] || 'info';
    el.innerHTML = I(icon) + '<span class="toast-msg">' + esc(msg) + '</span>' +
      (opt.action ? '<button class="toast-action" type="button">' + esc(opt.action.label) + '</button>' : '') +
      '<button class="toast-close" type="button" aria-label="סגור">' + I('x') + '</button>';
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });
    var t = setTimeout(close, opt.duration || 3800);
    function close() {
      clearTimeout(t);
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }
    el.querySelector('.toast-close').onclick = close;
    if (opt.action) el.querySelector('.toast-action').onclick = function () { opt.action.fn(); close(); };
    return close;
  };

  /* ---------------- modal ---------------- */
  var stack = [];
  ui.modal = function (o) {
    var prevFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML =
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal modal-' + (o.size || 'md') + '" role="dialog" aria-modal="true" aria-labelledby="mt-' + stack.length + '">' +
        '<header class="modal-head"><h2 id="mt-' + stack.length + '" class="modal-title">' + (o.icon ? I(o.icon) : '') + '<span>' + esc(o.title || '') + '</span></h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="סגור (Esc)">' + I('x') + '</button></header>' +
        '<div class="modal-body">' + (o.body || '') + '</div>' +
        (o.footer ? '<footer class="modal-foot">' + o.footer + '</footer>' : '') +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    var api = { el: wrap, body: wrap.querySelector('.modal-body'), close: close, closed: false };
    stack.push(api);
    requestAnimationFrame(function () { wrap.classList.add('in'); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) { e.preventDefault(); attemptClose(); } });
    function attemptClose() {
      if (o.beforeClose && o.beforeClose() === false) return;
      close();
    }
    api.attemptClose = attemptClose;
    function close(result) {
      if (api.closed) return;
      api.closed = true;
      stack = stack.filter(function (m) { return m !== api; });
      wrap.classList.remove('in');
      wrap.classList.add('out');
      setTimeout(function () {
        wrap.remove();
        if (!stack.length) document.body.classList.remove('modal-open');
      }, 220);
      if (o.onClose) o.onClose(result);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus(); } catch (e) {}
    }
    if (o.onOpen) o.onOpen(api);
    setTimeout(function () {
      var f = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body textarea, .modal-body select, .modal-body button') || wrap.querySelector('.modal');
      if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
    }, 40);
    return api;
  };
  ui.topModal = function () { return stack[stack.length - 1] || null; };
  /* Focus trap for the top-most modal */
  document.addEventListener('keydown', function (e) {
    var top = ui.topModal();
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); top.attemptClose(); return; }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(top.el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  ui.confirm = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      var m = ui.modal({
        title: o.title || 'אישור',
        icon: o.danger ? 'alert' : 'info',
        size: 'sm',
        body: '<p class="confirm-text">' + (o.html || esc(o.text || '')) + '</p>',
        footer: '<button type="button" class="btn btn-ghost" data-close>' + esc(o.cancelLabel || 'ביטול') + '</button>' +
                '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-ok autofocus>' + esc(o.confirmLabel || 'אישור') + '</button>',
        onClose: function () { if (!done) resolve(false); }
      });
      m.el.querySelector('[data-ok]').onclick = function () { done = true; resolve(true); m.close(); };
    });
  };

  ui.prompt = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      var m = ui.modal({
        title: o.title, size: 'sm', icon: o.icon || 'edit',
        body: '<form class="form" data-prompt><label class="field"><span class="field-label">' + esc(o.label || '') + '</span>' +
          '<input class="input" type="' + (o.type || 'text') + '" value="' + esc(o.value || '') + '" ' + (o.min !== undefined ? 'min="' + o.min + '"' : '') + ' autofocus required></label></form>',
        footer: '<button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-primary" data-ok>' + esc(o.confirmLabel || 'שמירה') + '</button>',
        onClose: function () { if (!done) resolve(null); }
      });
      var input = m.el.querySelector('input');
      function ok() { var v = input.value.trim(); if (!v) { input.focus(); return; } done = true; resolve(v); m.close(); }
      m.el.querySelector('[data-ok]').onclick = ok;
      m.el.querySelector('form').onsubmit = function (e) { e.preventDefault(); ok(); };
    });
  };

  /* ---------------- popover menu ---------------- */
  var openMenu = null;
  ui.menu = function (anchor, items) {
    ui.closeMenu();
    var el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map(function (it, i) {
      if (it.sep) return '<div class="menu-sep"></div>';
      return '<button type="button" role="menuitem" class="menu-item' + (it.danger ? ' danger' : '') + '" data-i="' + i + '">' + (it.icon ? I(it.icon) : '') + '<span>' + esc(it.label) + '</span></button>';
    }).join('');
    document.body.appendChild(el);
    var r = anchor.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    requestAnimationFrame(function () { el.classList.add('in'); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      var it = items[+b.dataset.i];
      ui.closeMenu();
      if (it && it.fn) it.fn();
    });
    el.addEventListener('keydown', function (e) {
      var btns = Array.prototype.slice.call(el.querySelectorAll('.menu-item'));
      var i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      if (e.key === 'Escape') { e.stopPropagation(); ui.closeMenu(); anchor.focus(); }
    });
    openMenu = el;
    var first = el.querySelector('.menu-item');
    if (first) first.focus();
    return el;
  };
  ui.closeMenu = function () { if (openMenu) { openMenu.remove(); openMenu = null; } };
  document.addEventListener('mousedown', function (e) { if (openMenu && !openMenu.contains(e.target)) ui.closeMenu(); });
  window.addEventListener('resize', function () { ui.closeMenu(); });

  /* ---------------- small pieces ---------------- */
  ui.empty = function (o) {
    return '<div class="empty">' +
      '<div class="empty-art" aria-hidden="true"><div class="empty-keys"><i></i><i></i><i></i><i></i><i></i></div>' + I(o.icon || 'music') + '</div>' +
      '<h3 class="empty-title">' + esc(o.title) + '</h3>' +
      (o.text ? '<p class="empty-text">' + esc(o.text) + '</p>' : '') +
      (o.action ? '<button type="button" class="btn btn-primary" data-act="' + esc(o.action.act) + '"' + (o.action.data ? ' ' + o.action.data : '') + '>' + I('plus') + esc(o.action.label) + '</button>' : '') +
      '</div>';
  };
  ui.bar = function (pct, cls) {
    pct = U.clamp(Math.round((pct || 0) * 100), 0, 100);
    return '<div class="pbar ' + (cls || '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="--w:' + pct + '%"></span></div>';
  };
  ui.ring = function (pct, size, label, sub) {
    size = size || 64;
    var r = (size - 8) / 2, c = 2 * Math.PI * r;
    pct = U.clamp(pct || 0, 0, 1);
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="' + Math.round(pct * 100) + '%">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '"><circle class="ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" style="--off:' + (c * (1 - pct)).toFixed(1) + '"/></svg>' +
      '<div class="ring-label">' + (label !== undefined ? label : Math.round(pct * 100) + '%') + (sub ? '<small>' + sub + '</small>' : '') + '</div></div>';
  };
  ui.chip = function (text, tone, icon) { return '<span class="chip chip-' + (tone || 'muted') + '">' + (icon ? I(icon) : '') + esc(text) + '</span>'; };

  var STATUS_TONE = {
    lessons: { upcoming: 'gold', completed: 'green', cancelled: 'red', rescheduled: 'blue' },
    songs: { wishlist: 'muted', planned: 'blue', learning: 'gold', reviewing: 'violet', learned: 'green', archived: 'muted' },
    courses: { wishlist: 'muted', planned: 'blue', in_progress: 'gold', paused: 'muted', completed: 'green' },
    goals: { active: 'gold', completed: 'green', paused: 'muted', abandoned: 'red' }
  };
  var STATUS_LABEL = { lessons: 'lessonStatus', songs: 'songStatus', courses: 'courseStatus', goals: 'goalStatus' };
  ui.status = function (coll, status) {
    var L = PS.schema.labels[STATUS_LABEL[coll]] || {};
    return '<span class="chip chip-' + ((STATUS_TONE[coll] || {})[status] || 'muted') + '"><i class="dot"></i>' + esc(L[status] || status) + '</span>';
  };
  ui.priority = function (p) {
    if (!p) return '';
    return '<span class="prio prio-' + esc(p) + '" title="עדיפות ' + esc(PS.schema.labels.priority[p]) + '">' + esc(PS.schema.labels.priority[p]) + '</span>';
  };
  ui.tags = function (tags) {
    if (!tags || !tags.length) return '';
    return '<div class="tags">' + tags.map(function (t) { return '<span class="tag">#' + U.bidi(t) + '</span>'; }).join('') + '</div>';
  };
  ui.linkBtn = function (url, label, icon) {
    var u = U.safeUrl(url);
    if (!u) return '';
    return '<a class="link-btn" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + I(icon || 'external') + '<span>' + esc(label || U.hostOf(u)) + '</span></a>';
  };
  /* Elegant generated cover when no image is set */
  ui.cover = function (rec, cls) {
    var u = U.safeUrl(rec.coverUrl);
    var seed = 0;
    String(rec.title || '').split('').forEach(function (ch) { seed = (seed * 31 + ch.charCodeAt(0)) % 360; });
    if (u) return '<div class="cover ' + (cls || '') + '"><img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><span class="cover-fallback" style="--h:' + seed + '">' + esc(U.initials(rec.title)) + '</span></div>';
    return '<div class="cover ' + (cls || '') + '"><span class="cover-fallback" style="--h:' + seed + '"><span class="cover-keys"></span>' + esc(U.initials(rec.title)) + '</span></div>';
  };

  /* ---------------- markdown (safe subset) ---------------- */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, url) {
      var u = U.safeUrl(url.replace(/&amp;/g, '&'));
      return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>' : t;
    });
    s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, function (m, pre, url) {
      var u = U.safeUrl(url.replace(/&amp;/g, '&'));
      return u ? pre + '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' : m;
    });
    return '<bdi>' + s + '</bdi>';
  }
  /* Renders markdown. Checklist items carry data-line so they can be toggled in place. */
  ui.md = function (text, opt) {
    opt = opt || {};
    var lines = String(text || '').split('\n');
    var html = [], list = null, para = [];
    function flushPara() { if (para.length) { html.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } }
    function closeList() { if (list) { html.push('</' + list + '>'); list = null; } }
    lines.forEach(function (line, i) {
      var m;
      if (/^\s*$/.test(line)) { flushPara(); closeList(); return; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); var lv = m[1].length + 2; html.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'); return; }
      if (/^\s*---+\s*$/.test(line)) { flushPara(); closeList(); html.push('<hr>'); return; }
      if ((m = line.match(/^\s*>\s?(.*)$/))) { flushPara(); closeList(); html.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/))) {
        flushPara();
        if (list !== 'ul class="checklist"') { closeList(); html.push('<ul class="checklist">'); list = 'ul class="checklist"'; }
        var on = m[1] !== ' ';
        html.push('<li class="' + (on ? 'done' : '') + '"><label><input type="checkbox" ' + (on ? 'checked' : '') + (opt.interactive ? ' data-md-line="' + i + '"' : ' disabled') + '><span>' + inline(m[2]) + '</span></label></li>');
        return;
      }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; } html.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; } html.push('<li>' + inline(m[1]) + '</li>'); return; }
      closeList();
      para.push(line);
    });
    flushPara(); closeList();
    return html.join('').replace(/<\/ul class="checklist">/g, '</ul>');
  };
  /* Toggle a checklist item in markdown source by line number */
  ui.mdToggle = function (text, line) {
    var lines = String(text || '').split('\n');
    var l = lines[line];
    if (l === undefined) return text;
    lines[line] = /\[( )\]/.test(l) ? l.replace('[ ]', '[x]') : l.replace(/\[(x|X)\]/, '[ ]');
    return lines.join('\n');
  };
  ui.mdPlain = function (text) {
    return String(text || '').replace(/^#{1,3}\s+/gm, '').replace(/^\s*[-*]\s+\[( |x|X)\]\s*/gm, '☐ ').replace(/^\s*[-*]\s+/gm, '• ').replace(/\*\*|`|_/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  };

  /* ---------------- schema-driven forms ---------------- */
  function refOptions(coll) {
    var list = PS.store.list(coll);
    if (coll === 'lessons') list.sort(U.byKey('date', 'desc'));
    else list.sort(U.byKey(function (r) { return PS.store.titleOf(coll, r); }));
    return list.map(function (r) {
      var t = PS.store.titleOf(coll, r);
      if (coll === 'lessons') t += ' · ' + U.fmtDate(r.date);
      if (coll === 'songs' && r.artist) t += ' — ' + r.artist;
      return { value: r.id, label: t };
    });
  }

  function fieldHTML(f, val, isNew) {
    var id = 'f-' + f.k + '-' + Math.random().toString(36).slice(2, 7);
    var label = '<span class="field-label">' + esc(f.label) + (f.req ? ' <b class="req" aria-hidden="true">*</b>' : '') + '</span>';
    var help = f.help ? '<small class="field-help">' + esc(f.help) + '</small>' : '';
    var err = '<small class="field-error" id="' + id + '-err" aria-live="polite"></small>';
    var attrs = 'id="' + id + '" name="' + f.k + '" data-field="' + f.k + '" aria-describedby="' + id + '-err"' + (f.req ? ' required aria-required="true"' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '');
    var inner = '';
    var v = val === undefined || val === null ? '' : val;
    switch (f.type) {
      case 'text':
        var dl = f.datalist ? PS.schema.resolve(f.datalist) : null;
        inner = '<input class="input" type="text" ' + attrs + (f.max ? ' maxlength="' + f.max + '"' : '') + ' value="' + esc(v) + '"' + (dl ? ' list="' + id + '-dl"' : '') + '>' +
          (dl ? '<datalist id="' + id + '-dl">' + dl.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' : '');
        break;
      case 'url':
        inner = '<input class="input" type="url" dir="ltr" inputmode="url" ' + attrs + ' value="' + esc(v) + '" placeholder="https://">';
        break;
      case 'textarea':
        inner = '<textarea class="input" rows="3" ' + attrs + (f.max ? ' maxlength="' + f.max + '"' : '') + '>' + esc(v) + '</textarea>';
        break;
      case 'markdown':
        inner = '<div class="md-editor" data-md>' +
          '<div class="md-toolbar" role="toolbar" aria-label="עיצוב טקסט">' +
            '<button type="button" class="md-tb" data-md-cmd="h" title="כותרת">' + I('heading') + '</button>' +
            '<button type="button" class="md-tb" data-md-cmd="b" title="מודגש">' + I('bold') + '</button>' +
            '<button type="button" class="md-tb" data-md-cmd="ul" title="רשימה">' + I('bullets') + '</button>' +
            '<button type="button" class="md-tb" data-md-cmd="cl" title="רשימת משימות">' + I('checklist') + '</button>' +
            '<button type="button" class="md-tb" data-md-cmd="q" title="ציטוט">' + I('quote') + '</button>' +
            '<span class="md-sp"></span>' +
            '<div class="seg seg-sm" role="tablist"><button type="button" class="on" data-md-mode="edit">עריכה</button><button type="button" data-md-mode="preview">תצוגה</button></div>' +
          '</div>' +
          '<textarea class="input md-input" rows="9" ' + attrs + (f.max ? ' maxlength="' + f.max + '"' : '') + ' placeholder="כתבו כאן… # כותרת, - רשימה, - [ ] משימה, **מודגש**">' + esc(v) + '</textarea>' +
          '<div class="md-preview prose" hidden></div>' +
        '</div>';
        break;
      case 'number':
        inner = '<input class="input" type="number" inputmode="decimal" ' + attrs + (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') + ' value="' + esc(v) + '">';
        break;
      case 'range':
        inner = '<div class="range-row"><input class="range" type="range" ' + attrs + ' min="' + (f.min || 0) + '" max="' + (f.max || 100) + '" step="5" value="' + esc(v || 0) + '"><output class="range-out num">' + esc(v || 0) + '%</output></div>';
        break;
      case 'date':
        inner = '<input class="input" type="date" ' + attrs + ' value="' + esc(v) + '">';
        break;
      case 'time':
        inner = '<input class="input" type="time" ' + attrs + ' value="' + esc(v) + '">';
        break;
      case 'select':
        var options = PS.schema.resolve(f.options) || [];
        var hasVal = options.some(function (o) { return String(o.value) === String(v); });
        inner = '<select class="input" ' + attrs + '>' +
          (!f.req && f.def === undefined ? '<option value="">—</option>' : '') +
          (!hasVal && v ? '<option value="' + esc(v) + '" selected>' + esc((f.k === 'type' && PS.schema.labels.noteType[v]) || v) + '</option>' : '') +
          options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
          (f.allowNew ? '<option value="__new__">+ הוספת ערך חדש…</option>' : '') +
          '</select>';
        break;
      case 'checkbox':
        return '<label class="field field-check' + (f.half ? ' half' : '') + '"><input type="checkbox" class="check" ' + attrs + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>';
      case 'tags':
        inner = '<div class="tag-input" data-tags>' + (v || []).map(function (t) { return tagChip(t); }).join('') +
          '<input class="tag-entry" type="text" id="' + id + '" placeholder="הקלידו ולחצו Enter" aria-label="' + esc(f.label) + '"></div>';
        break;
      case 'ref':
        inner = '<select class="input" ' + attrs + '><option value="">— ללא —</option>' +
          refOptions(f.ref).map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === v ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
        break;
      case 'refs':
        var ro = refOptions(f.ref);
        var sel = v || [];
        inner = '<div class="refs" data-refs="' + f.ref + '">' +
          '<div class="refs-chosen">' + sel.map(function (rid) {
            var o = ro.filter(function (x) { return x.value === rid; })[0];
            return o ? refChip(o) : '';
          }).join('') + '</div>' +
          (ro.length ? '<div class="refs-search"><input class="input input-sm" type="search" id="' + id + '" placeholder="חיפוש והוספה…" aria-label="' + esc(f.label) + '"><div class="refs-list" hidden></div></div>' : '<small class="field-help">אין עדיין רשומות לקשר</small>') +
          '</div>';
        break;
      case 'links':
        inner = '<div class="rows" data-links>' + (v || []).map(linkRow).join('') + '</div><button type="button" class="btn btn-ghost btn-sm" data-add-link>' + I('plus') + 'הוספת קישור</button>';
        break;
      case 'subtasks':
        inner = '<div class="rows" data-subtasks>' + (v || []).map(subRow).join('') + '</div><button type="button" class="btn btn-ghost btn-sm" data-add-sub>' + I('plus') + 'הוספת תת-משימה</button>';
        break;
      case 'file':
        inner = '<div class="file-field" data-file>' +
          (v && v.id ? '<div class="file-current" data-file-current="' + esc(v.id) + '">' + I('file') + '<span>' + esc(v.name) + ' · ' + U.fileSize(v.size) + '</span><button type="button" class="btn btn-ghost btn-sm" data-file-remove>הסרה</button></div>' : '') +
          '<input type="file" class="input" id="' + id + '" aria-label="' + esc(f.label) + '">' +
          '<small class="field-help">' + (PS.db.mode() === 'idb' ? 'הקובץ נשמר בדפדפן במכשיר הזה בלבד (IndexedDB), לא מועלה לשרת ולא נכלל בגיבוי JSON. עד 25MB.' : 'אחסון קבצים מקומי אינו זמין בדפדפן זה — השתמשו בקישור חיצוני.') + '</small></div>';
        break;
    }
    return '<div class="field' + (f.half ? ' half' : '') + (f.type === 'markdown' ? ' field-md' : '') + '" data-wrap="' + f.k + '">' +
      (f.type === 'tags' || f.type === 'refs' || f.type === 'links' || f.type === 'subtasks' || f.type === 'file' ? '<span class="field-label-wrap">' + label + '</span>' : '<label for="' + id + '">' + label + '</label>') +
      inner + help + err + '</div>';
  }
  function tagChip(t) { return '<span class="tag-chip"><bdi>' + esc(t) + '</bdi><button type="button" data-tag-remove aria-label="הסרת תגית ' + esc(t) + '">' + I('x') + '</button><input type="hidden" value="' + esc(t) + '"></span>'; }
  function refChip(o) { return '<span class="tag-chip" data-ref-id="' + esc(o.value) + '"><bdi>' + esc(o.label) + '</bdi><button type="button" data-ref-remove aria-label="הסרה">' + I('x') + '</button></span>'; }
  function linkRow(l) {
    l = l || {};
    return '<div class="row-item" data-link-row><input class="input input-sm" type="text" placeholder="תיאור" value="' + esc(l.label || '') + '" data-l="label"><input class="input input-sm" dir="ltr" type="url" placeholder="https://" value="' + esc(l.url || '') + '" data-l="url"><button type="button" class="icon-btn" data-row-remove aria-label="הסרה">' + I('trash') + '</button></div>';
  }
  function subRow(s) {
    s = s || {};
    return '<div class="row-item" data-sub-row data-id="' + esc(s.id || U.uid('st')) + '"><input type="checkbox" class="check" ' + (s.done ? 'checked' : '') + ' aria-label="בוצע"><input class="input input-sm" type="text" placeholder="תת-משימה" value="' + esc(s.title || '') + '" data-s="title"><button type="button" class="icon-btn" data-row-remove aria-label="הסרה">' + I('trash') + '</button></div>';
  }

  function wireForm(form, fields) {
    // tags
    form.querySelectorAll('[data-tags]').forEach(function (box) {
      var input = box.querySelector('.tag-entry');
      function add() {
        input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (t) {
          var exists = Array.prototype.some.call(box.querySelectorAll('input[type=hidden]'), function (h) { return h.value === t; });
          if (!exists) input.insertAdjacentHTML('beforebegin', tagChip(t));
        });
        input.value = '';
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
        else if (e.key === 'Backspace' && !input.value) { var chips = box.querySelectorAll('.tag-chip'); if (chips.length) chips[chips.length - 1].remove(); }
      });
      input.addEventListener('blur', add);
      box.addEventListener('click', function (e) { if (e.target.closest('[data-tag-remove]')) e.target.closest('.tag-chip').remove(); else if (e.target === box) input.focus(); });
    });
    // refs
    form.querySelectorAll('[data-refs]').forEach(function (box) {
      var coll = box.dataset.refs;
      var input = box.querySelector('input[type=search]');
      var listEl = box.querySelector('.refs-list');
      var chosen = box.querySelector('.refs-chosen');
      chosen.addEventListener('click', function (e) { if (e.target.closest('[data-ref-remove]')) e.target.closest('.tag-chip').remove(); });
      if (!input) return;
      function show() {
        var q = U.normalize(input.value);
        var picked = Array.prototype.map.call(chosen.querySelectorAll('[data-ref-id]'), function (c) { return c.dataset.refId; });
        var opts = refOptions(coll).filter(function (o) { return picked.indexOf(o.value) < 0 && (!q || U.normalize(o.label).indexOf(q) >= 0); }).slice(0, 8);
        listEl.innerHTML = opts.length ? opts.map(function (o) { return '<button type="button" class="refs-opt" data-v="' + esc(o.value) + '"><bdi>' + esc(o.label) + '</bdi></button>'; }).join('') : '<div class="refs-none">לא נמצאו תוצאות</div>';
        listEl.hidden = false;
      }
      input.addEventListener('focus', show);
      input.addEventListener('input', show);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); var b = listEl.querySelector('.refs-opt'); if (b) b.click(); }
        if (e.key === 'Escape' && !listEl.hidden) { e.stopPropagation(); listEl.hidden = true; }
      });
      input.addEventListener('blur', function () { setTimeout(function () { listEl.hidden = true; }, 180); });
      listEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
      listEl.addEventListener('click', function (e) {
        var b = e.target.closest('.refs-opt');
        if (!b) return;
        var o = refOptions(coll).filter(function (x) { return x.value === b.dataset.v; })[0];
        if (o) chosen.insertAdjacentHTML('beforeend', refChip(o));
        input.value = '';
        show();
      });
    });
    // repeatable rows
    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-row-remove]')) e.target.closest('.row-item').remove();
      if (e.target.closest('[data-add-link]')) { var r = e.target.closest('.field').querySelector('[data-links]'); r.insertAdjacentHTML('beforeend', linkRow()); r.lastElementChild.querySelector('input').focus(); }
      if (e.target.closest('[data-add-sub]')) { var s = e.target.closest('.field').querySelector('[data-subtasks]'); s.insertAdjacentHTML('beforeend', subRow()); s.lastElementChild.querySelector('[data-s]').focus(); }
      if (e.target.closest('[data-file-remove]')) { var cur = e.target.closest('[data-file-current]'); cur.dataset.removed = '1'; cur.hidden = true; }
    });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-s="title"]')) {
        e.preventDefault();
        var rows = e.target.closest('[data-subtasks]');
        rows.insertAdjacentHTML('beforeend', subRow());
        rows.lastElementChild.querySelector('[data-s]').focus();
      }
    });
    // range output
    form.querySelectorAll('input[type=range]').forEach(function (r) {
      r.addEventListener('input', function () { r.parentNode.querySelector('output').textContent = r.value + '%'; });
    });
    // select "add new"
    form.querySelectorAll('select').forEach(function (s) {
      var last = s.value;
      s.addEventListener('change', function () {
        if (s.value !== '__new__') { last = s.value; return; }
        ui.prompt({ title: 'ערך חדש', label: 'שם' }).then(function (v) {
          if (!v) { s.value = last; return; }
          var o = document.createElement('option');
          o.value = v; o.textContent = v; o.selected = true;
          s.insertBefore(o, s.querySelector('option[value="__new__"]'));
          last = v;
          if (s.name === 'genre') {
            var g = (PS.prefs.get('genres') || PS.schema.DEFAULT_GENRES).slice();
            if (g.indexOf(v) < 0) { g.push(v); PS.prefs.set('genres', g); }
          }
        });
      });
    });
    // markdown editors
    form.querySelectorAll('[data-md]').forEach(function (ed) { ui.wireMarkdown(ed); });
  }

  ui.wireMarkdown = function (ed) {
    var ta = ed.querySelector('textarea');
    var pv = ed.querySelector('.md-preview');
    ed.querySelectorAll('[data-md-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        ed.querySelectorAll('[data-md-mode]').forEach(function (x) { x.classList.toggle('on', x === b); });
        var prev = b.dataset.mdMode === 'preview';
        pv.hidden = !prev; ta.hidden = prev;
        if (prev) pv.innerHTML = ta.value.trim() ? ui.md(ta.value) : '<p class="muted">אין עדיין תוכן</p>';
      });
    });
    ed.querySelectorAll('[data-md-cmd]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cmd = b.dataset.mdCmd;
        var s = ta.selectionStart, e = ta.selectionEnd, val = ta.value;
        if (cmd === 'b') {
          var sel = val.slice(s, e) || 'טקסט';
          ta.setRangeText('**' + sel + '**', s, e, 'end');
        } else {
          var ls = val.lastIndexOf('\n', s - 1) + 1;
          var le = val.indexOf('\n', e); if (le < 0) le = val.length;
          var prefix = { h: '## ', ul: '- ', cl: '- [ ] ', q: '> ' }[cmd];
          var block = val.slice(ls, le).split('\n').map(function (l) { return l.indexOf(prefix) === 0 ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,3} |- \[[ xX]\] |- |> )/, ''); }).join('\n');
          ta.setRangeText(block, ls, le, 'end');
        }
        ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var s = ta.selectionStart, val = ta.value;
      var ls = val.lastIndexOf('\n', s - 1) + 1;
      var line = val.slice(ls, s);
      var m = line.match(/^(\s*)(- \[[ xX]\] |- |\* |\d+[.)] )(.*)$/);
      if (!m) return;
      e.preventDefault();
      if (!m[3].trim()) { ta.setRangeText('', ls, s, 'end'); return; }
      var next = m[2].indexOf('[') >= 0 ? '- [ ] ' : /\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + '. ' : m[2];
      ta.setRangeText('\n' + m[1] + next, s, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  function collect(form, fields) {
    var out = {};
    fields.forEach(function (f) {
      var wrap = form.querySelector('[data-wrap="' + f.k + '"]') || form.querySelector('[name="' + f.k + '"]');
      if (!wrap) return;
      var el = form.querySelector('[name="' + f.k + '"]');
      switch (f.type) {
        case 'checkbox': out[f.k] = el.checked; break;
        case 'tags': out[f.k] = Array.prototype.map.call(wrap.querySelectorAll('.tag-chip input[type=hidden]'), function (h) { return h.value; }); var pending = wrap.querySelector('.tag-entry').value.trim(); if (pending) out[f.k].push(pending); break;
        case 'refs': out[f.k] = Array.prototype.map.call(wrap.querySelectorAll('[data-ref-id]'), function (c) { return c.dataset.refId; }); break;
        case 'links': out[f.k] = Array.prototype.map.call(wrap.querySelectorAll('[data-link-row]'), function (r) { return { label: r.querySelector('[data-l=label]').value.trim(), url: r.querySelector('[data-l=url]').value.trim() }; }).filter(function (l) { return l.url; }); break;
        case 'subtasks': out[f.k] = Array.prototype.map.call(wrap.querySelectorAll('[data-sub-row]'), function (r) { return { id: r.dataset.id, title: r.querySelector('[data-s]').value.trim(), done: r.querySelector('.check').checked }; }).filter(function (s) { return s.title; }); break;
        case 'file': break; // handled asynchronously in submit
        default: out[f.k] = el ? el.value : '';
      }
      if (f.type === 'select' && out[f.k] === '__new__') out[f.k] = '';
    });
    return out;
  }

  function showErrors(form, errors) {
    form.querySelectorAll('.field-error').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('.invalid').forEach(function (e) { e.classList.remove('invalid'); });
    var first = null;
    Object.keys(errors).forEach(function (k) {
      var wrap = form.querySelector('[data-wrap="' + k + '"]');
      if (!wrap) return;
      wrap.classList.add('invalid');
      var e = wrap.querySelector('.field-error');
      if (e) e.textContent = errors[k];
      if (!first) first = wrap.querySelector('input, textarea, select');
    });
    if (first) first.focus();
  }

  /*
   * Open a modal form for an entity.
   * o: { coll, record (existing or partial), title, onSaved(rec), draftKey, beforeSubmit(values) -> Promise|values }
   */
  ui.editForm = function (o) {
    var def = PS.schema.defs[o.coll];
    var isNew = !(o.record && o.record.id && PS.store.get(o.coll, o.record.id));
    var rec = Object.assign(PS.schema.defaults(o.coll), o.record || {});
    var fields = def.fields.filter(function (f) { return !(f.createOnly && !isNew) && !(f.lessons && !PS.prefs.lessons()); });
    var draftKey = o.draft ? 'ps.draft.' + o.coll + '.' + (isNew ? 'new' : rec.id) : null;
    var draft = null;
    if (draftKey) {
      try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) { draft = null; }
      if (draft && !isNew && draft.savedAt < rec.updatedAt) draft = null;
    }
    var body = (draft ? '<div class="banner banner-gold" data-draft-banner>' + I('history') + '<span>נמצאה טיוטה שלא נשמרה מ-' + esc(U.timeAgo(draft.savedAt)) + '</span><button type="button" class="btn btn-sm btn-primary" data-draft-restore>שחזור</button><button type="button" class="btn btn-sm btn-ghost" data-draft-discard>מחיקה</button></div>' : '') +
      (o.intro || '') +
      '<form class="form" novalidate>' + fields.map(function (f) { return fieldHTML(f, rec[f.k], isNew); }).join('') + '<button type="submit" hidden></button></form>';
    var saved = false;
    var dirty = false;
    var m = ui.modal({
      title: o.title || (isNew ? 'הוספת ' + def.label : 'עריכת ' + def.label),
      icon: o.icon,
      size: o.size || 'lg',
      body: body,
      footer: (draftKey ? '<span class="draft-status" aria-live="polite"></span>' : '') +
        '<button type="button" class="btn btn-ghost" data-close>ביטול</button>' +
        '<button type="button" class="btn btn-primary" data-save>' + I('check') + (isNew ? 'הוספה' : 'שמירה') + '</button>',
      beforeClose: function () {
        if (saved || !dirty || draftKey) return true;
        ui.confirm({ title: 'לסגור בלי לשמור?', text: 'השינויים שביצעתם לא יישמרו.', confirmLabel: 'סגירה בלי שמירה', danger: true }).then(function (ok) { if (ok) { saved = true; m.close(); } });
        return false;
      }
    });
    var form = m.el.querySelector('form');
    wireForm(form, fields);
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('change', function () { dirty = true; });
    if (draftKey) {
      var status = m.el.querySelector('.draft-status');
      var saveDraft = U.debounce(function () {
        if (saved) return;
        try {
          localStorage.setItem(draftKey, JSON.stringify({ savedAt: U.nowISO(), values: collect(form, fields) }));
          status.textContent = 'טיוטה נשמרה ' + U.fmtTime(new Date());
        } catch (e) { status.textContent = 'לא ניתן לשמור טיוטה'; }
      }, 700);
      form.addEventListener('input', saveDraft);
      form.addEventListener('change', saveDraft);
      var banner = m.el.querySelector('[data-draft-banner]');
      if (banner) {
        banner.querySelector('[data-draft-restore]').onclick = function () {
          var vals = Object.assign({}, rec, draft.values);
          form.innerHTML = fields.map(function (f) { return fieldHTML(f, vals[f.k], isNew); }).join('') + '<button type="submit" hidden></button>';
          wireForm(form, fields);
          banner.remove();
          dirty = true;
        };
        banner.querySelector('[data-draft-discard]').onclick = function () { localStorage.removeItem(draftKey); banner.remove(); };
      }
    }
    function submit() {
      var values = collect(form, fields);
      var fileField = fields.filter(function (f) { return f.type === 'file'; })[0];
      var p = Promise.resolve(values);
      if (fileField) {
        var wrap = form.querySelector('[data-wrap="' + fileField.k + '"]');
        var input = wrap.querySelector('input[type=file]');
        var cur = wrap.querySelector('[data-file-current]');
        var file = input.files && input.files[0];
        values[fileField.k] = cur && !cur.dataset.removed ? rec[fileField.k] : null;
        if (cur && cur.dataset.removed && rec[fileField.k]) values.__deleteFile = rec[fileField.k].id;
        if (file) {
          if (file.size > 25 * 1048576) { showErrors(form, (function () { var e = {}; e[fileField.k] = 'הקובץ גדול מ-25MB'; return e; })()); return; }
          p = PS.db.putFile(file, file.name).then(function (meta) {
            if (rec[fileField.k] && rec[fileField.k].id) values.__deleteFile = rec[fileField.k].id;
            values[fileField.k] = meta;
            return values;
          });
        }
      }
      p.then(function (vals) {
        if (o.beforeSubmit) return Promise.resolve(o.beforeSubmit(vals, isNew)).then(function (r) { return r === false ? null : vals; });
        return vals;
      }).then(function (vals) {
        if (!vals) return;
        var delFile = vals.__deleteFile; delete vals.__deleteFile;
        var check = PS.schema.validate(o.coll, Object.assign({}, rec, vals));
        if (Object.keys(check.errors).length) { showErrors(form, check.errors); return; }
        var out;
        try {
          out = isNew ? PS.store.create(o.coll, Object.assign({}, o.record || {}, vals)) : PS.store.update(o.coll, rec.id, vals);
        } catch (err) {
          if (err.errors) { showErrors(form, err.errors); return; }
          throw err;
        }
        if (delFile) PS.db.deleteFile(delFile);
        saved = true;
        if (draftKey) localStorage.removeItem(draftKey);
        m.close();
        ui.toast(isNew ? def.label + ' נוסף/ה בהצלחה' : 'השינויים נשמרו', 'success');
        if (o.onSaved) o.onSaved(out, isNew);
      }).catch(function (err) {
        console.error(err);
        ui.toast('השמירה נכשלה: ' + (err && err.message ? err.message : 'שגיאה לא ידועה'), 'error');
      });
    }
    m.el.querySelector('[data-save]').onclick = submit;
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    return m;
  };

  /* Delete with confirmation + reference count + undo-free honesty. */
  ui.confirmDelete = function (coll, id, after) {
    var rec = PS.store.get(coll, id);
    if (!rec) return;
    var refs = PS.store.referencesTo(coll, id);
    var def = PS.schema.defs[coll];
    ui.confirm({
      title: 'מחיקת ' + (def ? def.label : 'רשומה'),
      html: 'למחוק את <b>' + U.bidi(PS.store.titleOf(coll, rec)) + '</b>? הפעולה אינה הפיכה.' +
        (refs ? '<br><span class="muted">הרשומה מקושרת ל-' + refs + ' רשומות אחרות — הקישורים יוסרו, הרשומות עצמן יישמרו.</span>' : '') +
        '<br><span class="muted">נקודות XP שכבר הוענקו נשמרות בהיסטוריה.</span>',
      confirmLabel: 'מחיקה', danger: true
    }).then(function (ok) {
      if (!ok) return;
      PS.store.remove(coll, id);
      ui.toast('נמחק', 'info');
      if (after) after();
    });
  };

  PS.ui = ui;
})();
