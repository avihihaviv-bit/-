/* Piano Studio — lightweight SVG charts with hover tooltips (no dependencies).
 * Single-series charts use the gold accent; comparison uses a muted reference series.
 * Every chart ships an accessible data table (visually hidden) as its text alternative. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var esc = U.esc;

  var tip = null;
  function tooltip() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    return tip;
  }
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { if (tip) tip.classList.remove('on'); return; }
    var el = tooltip();
    el.innerHTML = t.getAttribute('data-tip');
    var r = t.getBoundingClientRect();
    el.classList.add('on');
    var w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = U.clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
    el.style.top = Math.max(8, r.top - h - 10) + 'px';
  });
  document.addEventListener('scroll', function () { if (tip) tip.classList.remove('on'); }, true);

  function table(data, unit, compare) {
    return '<table class="sr-only"><thead><tr><th>תקופה</th><th>' + esc(unit || 'ערך') + '</th>' + (compare ? '<th>תקופה קודמת</th>' : '') + '</tr></thead><tbody>' +
      data.map(function (d, i) { return '<tr><td>' + esc(d.label) + '</td><td>' + d.value + '</td>' + (compare ? '<td>' + (compare[i] ? compare[i].value : '') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }

  /* Vertical bars. opts: { height, unit, compare (array same length), labelEvery } */
  function bars(data, opts) {
    opts = opts || {};
    var H = opts.height || 180, W = Math.max(280, data.length * 34), padB = 24, padT = 14;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }).concat(opts.compare ? opts.compare.map(function (d) { return d.value; }) : []).concat([1])));
    var n = data.length;
    var slot = W / n;
    var bw = Math.min(opts.compare ? 12 : 22, slot * (opts.compare ? 0.32 : 0.56));
    var every = opts.labelEvery || Math.max(1, Math.ceil(n / 6));
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / max); };
    var grid = [0, 0.5, 1].map(function (g) {
      var yy = y(max * g);
      return '<line class="grid" x1="0" x2="' + W + '" y1="' + yy + '" y2="' + yy + '"/>' + (g ? '<text class="axis" x="' + (W - 2) + '" y="' + (yy - 4) + '" text-anchor="end">' + Math.round(max * g) + '</text>' : '');
    }).join('');
    var marks = data.map(function (d, i) {
      // RTL: first period on the right
      var cx = W - (i + 0.5) * slot;
      var out = '';
      function bar(v, x, cls) {
        var top = y(v), h = Math.max(0, H - padB - top);
        if (v > 0 && h < 3) { h = 3; top = H - padB - 3; }
        var r = Math.min(4, bw / 2, h);
        return h > 0 ? '<path class="' + cls + '" d="M' + x + ',' + (H - padB) + 'V' + (top + r) + 'q0,-' + r + ' ' + r + ',-' + r + 'h' + (bw - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + (H - padB) + 'z"/>' : '';
      }
      if (opts.compare) {
        out += bar(opts.compare[i] ? opts.compare[i].value : 0, cx + 1, 'bar-ref');
        out += bar(d.value, cx - bw - 1, 'bar');
      } else out += bar(d.value, cx - bw / 2, 'bar');
      var tipHtml = '<b>' + esc(d.label) + '</b><span>' + d.value + ' ' + esc(opts.unit || '') + '</span>' + (opts.compare && opts.compare[i] ? '<span class="muted">תקופה קודמת: ' + opts.compare[i].value + '</span>' : '');
      out += '<rect class="hit" x="' + (cx - slot / 2) + '" y="0" width="' + slot + '" height="' + H + '" data-tip="' + esc(tipHtml) + '"/>';
      if (i % every === 0 || i === n - 1) out += '<text class="axis" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d.label) + '</text>';
      return out;
    }).join('');
    return '<div class="chart" style="--h:' + H + 'px"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.title || 'תרשים') + '">' + grid + '<line class="baseline" x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '"/>' + marks + '</svg>' + table(data, opts.unit, opts.compare) + '</div>';
  }

  /* Area/line chart (cumulative or per-bucket). */
  function line(data, opts) {
    opts = opts || {};
    var H = opts.height || 180, W = Math.max(300, data.length * 40), padB = 24, padT = 16, padX = 14;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])));
    var n = data.length;
    var x = function (i) { return n === 1 ? W / 2 : W - padX - i * (W - 2 * padX) / (n - 1); };
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / max); };
    var pts = data.map(function (d, i) { return [x(i), y(d.value)]; });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
    var area = path + 'L' + pts[n - 1][0].toFixed(1) + ',' + (H - padB) + 'L' + pts[0][0].toFixed(1) + ',' + (H - padB) + 'Z';
    var every = Math.max(1, Math.ceil(n / 6));
    var gid = 'g' + Math.random().toString(36).slice(2, 7);
    var grid = [0.5, 1].map(function (g) { var yy = y(max * g); return '<line class="grid" x1="0" x2="' + W + '" y1="' + yy + '" y2="' + yy + '"/><text class="axis" x="' + (W - 2) + '" y="' + (yy - 4) + '" text-anchor="end">' + Math.round(max * g) + '</text>'; }).join('');
    var slot = n > 1 ? (W - 2 * padX) / (n - 1) : W;
    var hits = data.map(function (d, i) {
      return '<g class="pt"><circle class="dot" cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="4"/><rect class="hit" x="' + (pts[i][0] - slot / 2) + '" y="0" width="' + slot + '" height="' + H + '" data-tip="' + esc('<b>' + esc(d.label) + '</b><span>' + d.value + ' ' + esc(opts.unit || '') + '</span>') + '"/></g>' +
        ((i % every === 0 || i === n - 1) ? '<text class="axis" x="' + pts[i][0] + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d.label) + '</text>' : '');
    }).join('');
    return '<div class="chart" style="--h:' + H + 'px"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.title || 'תרשים') + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<line class="baseline" x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '"/>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/><path class="line" d="' + path + '" pathLength="1"/>' + hits + '</svg>' + table(data, opts.unit) + '</div>';
  }

  /* Small sparkline for stat tiles */
  function spark(values) {
    if (!values.length) return '';
    var W = 100, H = 28, max = Math.max.apply(null, values.concat([1]));
    var n = values.length;
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + (W - (n === 1 ? W / 2 : i * W / (n - 1))).toFixed(1) + ',' + (H - 2 - (H - 4) * v / max).toFixed(1); }).join('');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  PS.chart = { bars: bars, line: line, spark: spark, niceMax: niceMax };
})();
