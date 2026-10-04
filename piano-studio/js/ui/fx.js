/* Piano Studio — celebration effects: intro, confetti, level-up, achievement unlock, XP toasts, sound. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var fx = {};

  function reduced() { return U.prefersReducedMotion(); }

  /* ---------------- intro ---------------- */
  fx.runIntro = function () {
    var root = document.documentElement;
    var el = document.getElementById('intro');
    if (!root.classList.contains('intro-on') || !el) { root.classList.add('app-ready'); if (el) el.remove(); return; }
    try { sessionStorage.setItem('ps.introPlayed', '1'); } catch (e) {}
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      root.classList.add('intro-out');
      root.classList.add('app-ready');
      document.removeEventListener('keydown', finish, true);
      setTimeout(function () { root.classList.remove('intro-on', 'intro-out'); el.remove(); }, 650);
    }
    el.addEventListener('click', finish);
    document.addEventListener('keydown', finish, true);
    setTimeout(finish, 2300);
  };

  /* ---------------- sound (optional, off by default) ---------------- */
  var actx = null;
  fx.chime = function (kind) {
    if (!PS.prefs.get('sound')) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = kind === 'level' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
      notes.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        var t = actx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + 1);
      });
    } catch (e) {}
  };

  /* ---------------- particles / confetti ---------------- */
  var GOLDS = ['#e9d3a6', '#d4b37a', '#b8955b', '#f4efe6', '#c9a46a'];
  function canvasLayer(z) {
    var c = document.createElement('canvas');
    c.className = 'fx-canvas';
    c.style.zIndex = z || 120;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    return { c: c, ctx: ctx };
  }
  fx.confetti = function (opt) {
    if (reduced()) return;
    opt = opt || {};
    var L = canvasLayer(opt.z || 140);
    var parts = [];
    var count = opt.count || 120;
    var ox = opt.x !== undefined ? opt.x : innerWidth / 2, oy = opt.y !== undefined ? opt.y : innerHeight * 0.35;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, w: 4 + Math.random() * 5, h: 7 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: GOLDS[i % GOLDS.length], life: 0 });
    }
    var start = performance.now();
    function tick(now) {
      var t = now - start;
      L.ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.16; p.vx *= 0.99; p.vy *= 0.99;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        L.ctx.save();
        L.ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        L.ctx.translate(p.x, p.y); L.ctx.rotate(p.r);
        L.ctx.fillStyle = p.c;
        L.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        L.ctx.restore();
      });
      if (t < 2600) requestAnimationFrame(tick); else L.c.remove();
    }
    requestAnimationFrame(tick);
  };

  function sparkles(host) {
    if (reduced()) return function () {};
    var L = canvasLayer(1);
    L.c.style.position = 'absolute';
    host.appendChild(L.c);
    var parts = [];
    for (var i = 0; i < 70; i++) parts.push(newP(true));
    function newP(initial) {
      return { x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight / 2 + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 3.2, vy: -Math.random() * 3 - (initial ? 2 : 0.5), s: Math.random() * 2.2 + 0.6, a: 1, c: GOLDS[Math.floor(Math.random() * GOLDS.length)] };
    }
    var alive = true;
    function tick() {
      if (!alive) return;
      L.ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p, i) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.015; p.a -= 0.006;
        if (p.a <= 0) parts[i] = newP(false);
        L.ctx.globalAlpha = Math.max(0, p.a);
        L.ctx.fillStyle = p.c;
        L.ctx.beginPath(); L.ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); L.ctx.fill();
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return function () { alive = false; L.c.remove(); };
  }

  /* ---------------- level-up overlay (queued) ---------------- */
  var queue = [];
  var showing = false;
  function next() {
    if (showing || !queue.length) return;
    showing = true;
    queue.shift()(function () { showing = false; setTimeout(next, 250); });
  }

  fx.levelUp = function (level, title, xp) {
    queue.push(function (done) {
      fx.chime('level');
      var stop = function () {};
      var m = PS.ui.modal({
        title: 'עלייה ברמה',
        size: 'levelup',
        body: '<div class="lvl">' +
          '<div class="lvl-glow" aria-hidden="true"></div>' +
          '<p class="lvl-kicker">רמה חדשה נפתחה</p>' +
          '<div class="lvl-num num" aria-label="רמה ' + level + '">' + level + '</div>' +
          '<h3 class="lvl-title">' + esc(title) + '</h3>' +
          (xp > 0 ? '<p class="lvl-xp">' + I('sparkle') + '+' + xp + ' XP באירוע האחרון</p>' : '') +
          '<p class="lvl-next muted">הרמה הבאה: ' + esc(PS.game.titleFor(level + 1)) + ' · ' + PS.game.xpToNext(level) + ' XP</p>' +
          '<button type="button" class="btn btn-primary btn-lg" data-close autofocus>המשך</button>' +
          '</div>',
        onOpen: function (api) { stop = sparkles(api.el.querySelector('.modal')); },
        onClose: function () { stop(); done(); }
      });
      m.el.classList.add('modal-levelup');
    });
    next();
  };

  /* ---------------- achievement unlock ---------------- */
  fx.achievement = function (a) {
    queue.push(function (done) {
      fx.chime('ach');
      var host = document.getElementById('toasts');
      var el = document.createElement('div');
      el.className = 'ach-pop rarity-' + a.rarity;
      el.setAttribute('role', 'status');
      el.innerHTML = '<div class="ach-pop-badge">' + I(a.icon) + '</div><div><small>הישג נפתח · ' + esc(PS.game.RARITY[a.rarity]) + '</small><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div>';
      host.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });
      setTimeout(function () { el.classList.remove('in'); el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); done(); }, 3600);
    });
    next();
  };

  /* ---------------- XP toast ---------------- */
  fx.xpToast = function (amount, reason) {
    var host = document.getElementById('xp-float');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'xp-pop';
    el.innerHTML = '<b class="num">+' + amount + ' XP</b><span>' + esc(reason || '') + '</span>';
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
    var bar = document.querySelector('.side-xp');
    if (bar) { bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse'); }
  };

  /* ---------------- celebration (song learned, course/goal completed) ---------------- */
  fx.celebrate = function (headline, title, xp) {
    fx.confetti();
    PS.ui.toast(headline + ' ' + (title || '') + (xp ? ' · +' + xp + ' XP' : ''), 'gold', { duration: 5000 });
  };

  PS.fx = fx;
})();
