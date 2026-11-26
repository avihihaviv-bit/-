/* Maslul background music: generated live with the Web Audio API (no audio files,
   no copyright, works offline). Three styles: calm pads + bells, lo-fi beat, focus drone.
   Browsers only allow sound after a user gesture, so it never autoplays: if it was on last
   time, it resumes on the first tap/key press. */
(function () {
  'use strict';
  var F = window.MaslulFeatures, C = window.MaslulCore;
  if (!F || !C) return;
  function api() { return F.api(); }
  function U() { return F.util; }
  // fill defaults in place: always return the SAME stored object, so changes to it are what gets saved
  function prefs() {
    var p = api().state().prefs;
    if (!p.music || typeof p.music !== 'object') p.music = {};
    var d = { on: false, style: 'calm', volume: 0.35, pauseHidden: true };
    Object.keys(d).forEach(function (k) { if (p.music[k] === undefined) p.music[k] = d[k]; });
    return p.music;
  }
  function save() { api().save(); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var STYLES = {
    calm: { label: 'רגוע', desc: 'פדים רכים ופעמונים', emoji: '🌙' },
    lofi: { label: 'לו-פיי', desc: 'ביט שקט ואקורדים חמים', emoji: '☕' },
    focus: { label: 'ריכוז', desc: 'צליל רקע מינימלי ללמידה', emoji: '🎯' }
  };

  var E = { ctx: null, master: null, bus: null, rev: null, playing: false, timer: null, next: 0, step: 0, style: null, noise: null, events: 0 };

  function ensureCtx() {
    if (E.ctx) return E.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var ctx = E.ctx = new AC();
    E.master = ctx.createGain(); E.master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    E.master.connect(comp); comp.connect(ctx.destination);
    E.bus = ctx.createBiquadFilter(); E.bus.type = 'lowpass'; E.bus.frequency.value = 2600; E.bus.Q.value = 0.3;
    E.bus.connect(E.master);
    // generated reverb: decaying stereo noise impulse
    var len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    E.rev = ctx.createConvolver(); E.rev.buffer = ir;
    var wet = ctx.createGain(); wet.gain.value = 0.42; E.rev.connect(wet); wet.connect(E.master);
    var nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    E.noise = nb;
    return ctx;
  }
  function out(node, revAmt) {
    node.connect(E.bus);
    if (revAmt) { var g = E.ctx.createGain(); g.gain.value = revAmt; node.connect(g); g.connect(E.rev); }
  }

  /* ---------- instruments ---------- */
  function pad(t, midi, dur, vol) {
    var ctx = E.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5); f.frequency.linearRampToValueAtTime(800, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(2.5, dur * 0.35)); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 3);
    [[ 'sine', 0 ], [ 'triangle', 6 ], [ 'sine', -5 ]].forEach(function (o, i) {
      var osc = ctx.createOscillator(); osc.type = o[0]; osc.frequency.value = mtof(midi); osc.detune.value = o[1];
      var og = ctx.createGain(); og.gain.value = i === 1 ? 0.35 : 0.5;
      osc.connect(og); og.connect(f); osc.start(t); osc.stop(t + dur + 3.2);
    });
    f.connect(g); out(g, 0.6); E.events++;
  }
  function bell(t, midi, vol) {
    var ctx = E.ctx, g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(midi); o2.type = 'sine'; o2.frequency.value = mtof(midi) * 2.76; g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g); o2.connect(g2); g2.connect(g); o.start(t); o2.start(t); o.stop(t + 3); o2.stop(t + 3);
    out(g, 0.9); E.events++;
  }
  function keys(t, midi, dur, vol) { // soft electric-piano-ish
    var ctx = E.ctx, g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator(), trem = ctx.createOscillator(), tg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(midi); o2.type = 'triangle'; o2.frequency.value = mtof(midi); o2.detune.value = 4;
    trem.frequency.value = 4.5; tg.gain.value = vol * 0.18; trem.connect(tg); tg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    var mix = ctx.createGain(); mix.gain.value = 0.5; o.connect(g); o2.connect(mix); mix.connect(g);
    [o, o2, trem].forEach(function (x) { x.start(t); x.stop(t + dur + 1); });
    out(g, 0.35); E.events++;
  }
  function kick(t, vol) {
    var ctx = E.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(E.master); o.start(t); o.stop(t + 0.4); E.events++;
  }
  function noiseHit(t, freq, q, dur, vol, type) {
    var ctx = E.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = E.noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); out(g, 0.15); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); E.events++;
  }

  /* ---------- styles: each schedules one "step" ---------- */
  var CALM = [[38, 50, 54, 57, 61], [35, 50, 54, 57, 61], [31, 55, 59, 62, 66], [33, 57, 62, 64, 66]]; // Dmaj7 Bm9 Gmaj7 A6sus
  var PENTA_D = [74, 76, 78, 81, 83, 86, 88];
  var LOFI = [[41, 57, 60, 64, 65], [40, 55, 59, 62, 64], [38, 57, 60, 62, 65], [36, 55, 59, 60, 64]]; // Fmaj7 Em7 Dm9 Cmaj7
  var PENTA_C = [72, 74, 76, 79, 81, 84];
  var SCHED = {
    calm: { beat: 1.0, step: function (t, i) {
      if (i % 8 === 0) { var ch = CALM[(i / 8) % CALM.length]; ch.forEach(function (m, k) { pad(t, m, 8, k === 0 ? 0.06 : 0.035); }); }
      if (Math.random() < 0.32) bell(t + Math.random() * 0.4, PENTA_D[Math.floor(Math.random() * PENTA_D.length)], 0.05 + Math.random() * 0.03);
    } },
    lofi: { beat: 60 / 72, step: function (t, i) {
      var b = 60 / 72, bar = Math.floor(i / 4), inBar = i % 4;
      if (i % 8 === 0) { var ch = LOFI[(i / 8) % LOFI.length]; ch.forEach(function (m, k) { keys(t, k === 0 ? m : m, b * 7, k === 0 ? 0.07 : 0.045); }); }
      if (inBar === 0 || (inBar === 2 && bar % 2 === 1)) kick(t, 0.32);
      if (inBar === 2 && bar % 2 === 0) kick(t + b * 0.5, 0.18);
      if (inBar === 1 || inBar === 3) noiseHit(t, 1800, 0.8, 0.18, 0.09);
      noiseHit(t, 8000, 1, 0.04, 0.03, 'highpass'); noiseHit(t + b * 0.56, 8000, 1, 0.04, 0.02, 'highpass'); // swung hats
      if (Math.random() < 0.28) keys(t + b * (Math.random() < 0.5 ? 0 : 0.56), PENTA_C[Math.floor(Math.random() * PENTA_C.length)], b, 0.035);
      if (Math.random() < 0.5) noiseHit(t + Math.random() * b, 3000 + Math.random() * 3000, 8, 0.01, 0.012); // vinyl crackle
    } },
    focus: { beat: 1.0, step: function (t, i) {
      if (i % 16 === 0) { pad(t, 38, 16, 0.05); pad(t, 45, 16, 0.03); pad(t, 57, 16, 0.018); }
      var arp = [62, 66, 69, 73, 76, 73, 69, 66];
      if (i % 2 === 0) bell(t, arp[(i / 2) % arp.length], 0.022);
    } }
  };

  function tick() {
    if (!E.playing) return;
    var sty = SCHED[E.style], ahead = E.ctx.currentTime + 0.6;
    while (E.next < ahead) { try { sty.step(E.next, E.step); } catch (e) { console.error(e); } E.step++; E.next += sty.beat; }
  }
  function play(style) {
    var ctx = ensureCtx();
    if (!ctx) { api().toast('הדפדפן לא תומך בניגון', 'error'); return false; }
    if (ctx.state === 'suspended') ctx.resume();
    E.style = STYLES[style] ? style : 'calm';
    if (!E.playing) { E.next = ctx.currentTime + 0.1; E.step = 0; }
    E.playing = true;
    var v = prefs().volume;
    E.master.gain.cancelScheduledValues(ctx.currentTime);
    E.master.gain.setValueAtTime(Math.max(0.0001, E.master.gain.value), ctx.currentTime);
    E.master.gain.linearRampToValueAtTime(v, ctx.currentTime + 2.5);
    clearInterval(E.timer); E.timer = setInterval(tick, 120); tick();
    paintAll();
    return true;
  }
  function stop() {
    if (!E.ctx) return;
    E.playing = false; clearInterval(E.timer);
    var t = E.ctx.currentTime;
    E.master.gain.cancelScheduledValues(t); E.master.gain.setValueAtTime(E.master.gain.value, t); E.master.gain.linearRampToValueAtTime(0, t + 1.2);
    paintAll();
  }
  function setVolume(v) {
    prefs().volume = v; save();
    if (E.ctx && E.playing) { var t = E.ctx.currentTime; E.master.gain.cancelScheduledValues(t); E.master.gain.setTargetAtTime(v, t, 0.15); }
  }
  function toggle() {
    var p = prefs();
    if (E.playing) { stop(); p.on = false; save(); api().toast('המוזיקה כובתה'); }
    else if (play(p.style)) { p.on = true; save(); api().toast(STYLES[p.style].emoji + ' מוזיקת רקע: ' + STYLES[p.style].label, 'success'); }
  }
  function setStyle(s) {
    var p = prefs(); p.style = s; save();
    if (E.playing) { stop(); setTimeout(function () { play(s); }, 1300); } else { play(s); p.on = true; save(); }
    paintAll();
  }

  /* ---------- UI ---------- */
  function controlsHtml(compact) {
    var p = prefs();
    return '<div class="mu-ctl' + (compact ? ' compact' : '') + '">' +
      '<button class="btn ' + (E.playing ? 'btn-primary' : 'btn-ghost') + ' mu-toggle" data-mu-toggle aria-pressed="' + E.playing + '">' + (E.playing ? '⏸ השהה' : '▶ נגן') + '</button>' +
      '<div class="mu-styles" role="radiogroup" aria-label="סגנון">' + Object.keys(STYLES).map(function (k) { return '<button class="fx-mini' + (p.style === k ? ' fx-mini-on' : '') + '" role="radio" aria-checked="' + (p.style === k) + '" data-mu-style="' + k + '" title="' + STYLES[k].desc + '">' + STYLES[k].emoji + ' ' + STYLES[k].label + '</button>'; }).join('') + '</div>' +
      '<label class="mu-vol"><span>🔈</span><input type="range" min="0" max="100" value="' + Math.round(p.volume * 100) + '" data-mu-vol aria-label="עוצמה"><span>🔊</span></label>' +
      (E.playing ? '<div class="mu-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' : '') +
    '</div>';
  }
  function wire(root) {
    U().on(root, '[data-mu-toggle]', 'click', function () { toggle(); });
    U().on(root, '[data-mu-style]', 'click', function (b) { setStyle(b.dataset.muStyle); });
    U().on(root, '[data-mu-vol]', 'input', function (r) { setVolume(+r.value / 100); });
  }
  function paintAll() {
    document.querySelectorAll('[data-mu-host]').forEach(function (h) { h.innerHTML = controlsHtml(h.dataset.muHost === 'compact'); wire(h); });
    var sb = document.getElementById('sb-music'); if (sb) { sb.classList.toggle('on', E.playing); sb.setAttribute('aria-pressed', E.playing); sb.title = E.playing ? 'השהה מוזיקה (M)' : 'נגן מוזיקת רקע (M)'; }
  }

  // dashboard widget
  F.widgets.music = {
    label: 'מוזיקת רקע',
    html: function () { return '<div class="card"><div class="fx-row-between"><h3>🎵 מוזיקת רקע</h3><span class="page-sub">נוצרת בזמן אמת, בלי קבצים</span></div><div data-mu-host="compact">' + controlsHtml(true) + '</div></div>'; },
    wire: function (n) { wire(n); }
  };
  // settings card
  var prevSettings = F.hooks.settings;
  F.hooks.settings = function (el) {
    if (prevSettings) prevSettings(el);
    var p = prefs(), box = document.createElement('div');
    box.innerHTML = '<div class="card fx-card-gap"><h3>🎵 מוזיקת רקע</h3><p class="page-sub">מוזיקה רגועה שנוצרת בדפדפן בזמן אמת: בלי קבצים ובלי אינטרנט. מקש M מפעיל ומשהה.</p><div data-mu-host="full">' + controlsHtml(false) + '</div>' +
      '<div class="settings-row" style="border:none;padding-bottom:0;"><div><div class="lbl">השהה כשהאפליקציה ברקע</div><div class="desc">חוסך סוללה כשעוברים לאפליקציה אחרת</div></div><label class="switch"><input type="checkbox" id="mu-hidden"' + (p.pauseHidden ? ' checked' : '') + '><span></span></label></div></div>';
    var anchor = el.querySelector('#upd-card');
    el.insertBefore(box.firstChild, anchor ? anchor.nextSibling : el.children[1] || null);
    wire(el.querySelector('[data-mu-host="full"]').parentNode);
    el.querySelector('#mu-hidden').addEventListener('change', function (e) { prefs().pauseHidden = e.target.checked; save(); });
  };

  var origBoot = F.boot;
  F.boot = function (bridge) {
    origBoot(bridge);
    // sidebar button (desktop)
    var brand = document.querySelector('.sidebar .brand');
    if (brand && !document.getElementById('sb-music')) {
      var b = document.createElement('button'); b.id = 'sb-music'; b.className = 'sb-collapse sb-music'; b.setAttribute('aria-label', 'מוזיקת רקע'); b.textContent = '🎵';
      b.addEventListener('click', toggle); brand.insertBefore(b, document.getElementById('sb-collapse'));
    }
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M' || e.key === 'צ') { e.preventDefault(); toggle(); }
    });
    // resume the user's choice on the first gesture (browsers block autoplay)
    if (prefs().on) {
      var resume = function () { document.removeEventListener('pointerdown', resume, true); document.removeEventListener('keydown', resume, true); if (prefs().on && !E.playing) play(prefs().style); };
      document.addEventListener('pointerdown', resume, true); document.addEventListener('keydown', resume, true);
    }
    document.addEventListener('visibilitychange', function () {
      if (!E.ctx || !prefs().pauseHidden) return;
      if (document.visibilityState === 'hidden' && E.playing) E.ctx.suspend(); else if (document.visibilityState === 'visible' && E.playing) E.ctx.resume();
    });
  };
  F.music = { toggle: toggle, play: play, stop: stop, isPlaying: function () { return E.playing; }, debug: function () { return { events: E.events, state: E.ctx && E.ctx.state, style: E.style, gain: E.master && E.master.gain.value }; } };
})();
