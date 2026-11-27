/* Maslul routine details: every activity in the daily routine can have a description
   (e.g. what's in the home workout, which page of the learning site, a link).
   It is hidden in the list and shows only when you tap the activity.
   Stored per activity NAME so it appears on every day; "only today" is optional. */
(function () {
  'use strict';
  var F = window.MaslulFeatures, C = window.MaslulCore;
  if (!F || !C) return;
  function api() { return F.api(); }
  function U() { return F.util; }
  function S() { return api().state(); }
  function save() { api().save(); }
  function esc(x) { return U().esc(x); }
  function ic(n) { return U().ic(n); }

  function info(t) { try { return C.activityInfo(S().activityNotes, t); } catch (e) { return null; } }
  F.hasActivityInfo = function (t) { return !!info(t); };

  // text -> safe HTML: escaped, line breaks kept, bullet lines tidy, http(s) links clickable
  function richText(text) {
    var lines = esc(text).split('\n'), out = [], inList = false;
    lines.forEach(function (line) {
      var l = line.replace(/(https?:\/\/[^\s<]+)/g, function (u) { var clean = u.replace(/[.,;:!?)]+$/, ''), tail = u.slice(clean.length); return '<a href="' + clean + '" target="_blank" rel="noopener noreferrer">' + clean + '</a>' + tail; });
      var isLi = /^\s*([-•*]|\d+[.)])\s+/.test(line);
      if (isLi && !inList) { out.push('<ul>'); inList = true; }
      if (!isLi && inList) { out.push('</ul>'); inList = false; }
      if (isLi) out.push('<li>' + l.replace(/^\s*([-•*]|\d+[.)])\s+/, '') + '</li>');
      else if (l.trim()) out.push('<p>' + l + '</p>');
      else out.push('<div class="rt-gap"></div>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  function openActivity(t) {
    if (!t) return;
    var key = C.activityKey(t.title);
    var m = U().openModal('', { noFocus: true });
    m.classList.add('rt-sheet');
    var mode = 'view';

    function paint() {
      var cur = info(t), done = !!t.done;
      if (mode === 'view') {
        m.innerHTML =
          '<div class="rt-head"><div class="rt-time num" dir="ltr">' + esc(t.time) + '</div><h3 class="rt-title">' + esc(t.title) + '</h3>' +
            (done ? '<span class="fx-chip fx-chip-accent">בוצע ✓</span>' : '') + '</div>' +
          (cur ? '<div class="rt-body">' + richText(cur.text) + '</div>' +
              '<div class="page-sub rt-scope">' + (cur.scope === 'day' ? 'תיאור ליום הזה בלבד' : 'התיאור הזה מופיע בכל הימים שבהם יש "' + esc(t.title) + '"') + '</div>'
            : '<div class="rt-empty">' + ic('note') + '<div><b>עוד אין תיאור לפעילות הזאת</b><div class="page-sub">אפשר לכתוב מה עושים בה: תרגילים, סדר, קישור לאתר, זמן, מה להכין.</div></div></div>') +
          '<div class="modal-actions rt-actions">' +
            (!done ? '<button class="btn btn-primary" id="rt-done">' + ic('check') + 'סיימתי</button>' : '') +
            '<button class="btn ' + (cur ? 'btn-ghost' : 'btn-primary') + '" id="rt-edit-txt">' + ic('edit') + (cur ? 'ערוך תיאור' : 'כתוב תיאור') + '</button>' +
            '<button class="btn btn-ghost" id="rt-edit-act" aria-label="ערוך שעה, שם או קטגוריה">' + ic('calendar') + 'שעה ושם</button>' +
            '<button class="btn btn-ghost" id="rt-close" aria-label="סגור">' + ic('x') + '</button>' +
          '</div>';
        m.querySelector('#rt-close').addEventListener('click', api().closeModal);
        m.querySelector('#rt-edit-txt').addEventListener('click', function () { mode = 'edit'; paint(); });
        m.querySelector('#rt-edit-act').addEventListener('click', function () { api().closeModal(); api().openTaskModal(t); });
        var d = m.querySelector('#rt-done');
        if (d) d.addEventListener('click', function () { api().setRoutineDone(t.id, true); api().flushXP(d); api().closeModal(); api().toast('בוצע ✓', 'success'); api().rerender(); });
      } else {
        var dayOnly = !!(t.notes && String(t.notes).trim()) && (!S().activityNotes[key] || !S().activityNotes[key].text);
        var text = cur ? cur.text : '';
        m.innerHTML =
          '<h3 class="rt-title">תיאור: ' + esc(t.title) + '</h3>' +
          '<div class="field"><label for="rt-text">מה עושים בפעילות הזאת?</label>' +
            '<textarea id="rt-text" rows="9" maxlength="4000" placeholder="למשל:&#10;- 3 סטים שכיבות סמיכה&#10;- 3 סטים בטן&#10;- 10 דקות מתיחות&#10;&#10;אפשר להדביק קישור: https://…">' + esc(text) + '</textarea></div>' +
          '<label class="rt-day"><input type="checkbox" id="rt-dayonly"' + ((cur && cur.scope === 'day') || (!cur && false) ? ' checked' : '') + '> <span>רק ליום הזה<br><span class="page-sub">אם לא מסומן, התיאור יופיע בכל הימים שבהם יש "' + esc(t.title) + '"</span></span></label>' +
          '<div class="modal-actions"><button class="btn btn-primary btn-block" id="rt-save">' + ic('check') + 'שמור</button>' + (cur ? '<button class="btn btn-danger" id="rt-del" aria-label="מחק תיאור">' + ic('trash') + '</button>' : '') + '<button class="btn btn-ghost" id="rt-cancel" aria-label="ביטול">' + ic('x') + '</button></div>';
        var ta = m.querySelector('#rt-text'); setTimeout(function () { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 40);
        m.querySelector('#rt-cancel').addEventListener('click', function () { mode = 'view'; paint(); });
        m.querySelector('#rt-save').addEventListener('click', function () {
          var v = ta.value.trim(), dayOnly2 = m.querySelector('#rt-dayonly').checked;
          if (dayOnly2) { t.notes = v; }
          else {
            t.notes = ''; // the all-days text must be the one shown
            if (v) S().activityNotes[key] = { text: v, updatedAt: Date.now() }; else delete S().activityNotes[key];
          }
          save(); api().toast(v ? 'התיאור נשמר' : 'התיאור נמחק', 'success'); mode = 'view'; paint(); api().rerender();
        });
        var del = m.querySelector('#rt-del');
        if (del) del.addEventListener('click', function () {
          api().openConfirmModal('למחוק את התיאור של "' + t.title + '"?' + (cur.scope === 'all' ? ' הוא יימחק מכל הימים.' : ''), function () {
            t.notes = ''; delete S().activityNotes[key]; save(); api().toast('התיאור נמחק'); api().rerender();
          });
        });
      }
    }
    paint();
  }
  F.openActivity = openActivity;

  // dashboard "now" card: add a details button
  var prevDash = F.hooks.dashboard;
  F.hooks.dashboard = function (el) {
    if (prevDash) prevDash(el);
    var card = el.querySelector('.now-card'), act = card && card.querySelector('.now-actions');
    if (!act || act.querySelector('[data-now-details]')) return;
    var now = api().nowNextLater().now;
    if (!now) return;
    var b = document.createElement('button');
    b.className = 'btn btn-ghost btn-sm'; b.setAttribute('data-now-details', '1');
    b.innerHTML = ic('note') + (info(now) ? 'מה עושים' : 'פרטים');
    b.addEventListener('click', function () { openActivity(now); });
    act.insertBefore(b, act.firstChild.nextSibling);
  };
})();
