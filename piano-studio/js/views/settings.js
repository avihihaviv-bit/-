/* Piano Studio — settings, personalization and data management. */
(function () {
  'use strict';
  var PS = window.PS;
  var U = PS.util;
  var I = PS.icon;
  var esc = U.esc;
  var ui = PS.ui;
  var P = PS.prefs;

  var SECTIONS = [['profile', 'פרופיל', 'user'], ['appearance', 'מראה ותנועה', 'sun'], ['learning', 'למידה ולוח שנה', 'music'], ['notifications', 'התראות ו-XP', 'bell'], ['dashboard', 'דשבורד', 'grid'], ['data', 'נתונים וגיבוי', 'download'], ['about', 'אודות', 'info']];
  var COLORS = ['gold', 'ivory', 'graphite', 'rose', 'sage'];

  function sw(k, label, sub) {
    return '<div class="set-row"><div class="lbl"><b id="l-' + k + '">' + esc(label) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="ctl"><label class="switch"><input type="checkbox" data-change="pref-set" data-k="' + k + '" aria-labelledby="l-' + k + '"' + (P.get(k) ? ' checked' : '') + '><span></span></label></div></div>';
  }
  function sel(k, label, sub, options) {
    return '<div class="set-row"><div class="lbl"><b><label for="s-' + k + '">' + esc(label) + '</label></b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="ctl"><select id="s-' + k + '" class="input input-sm" data-change="pref-set" data-k="' + k + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(P.get(k)) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div></div>';
  }
  function num(k, label, sub, min, max) {
    return '<div class="set-row"><div class="lbl"><b><label for="n-' + k + '">' + esc(label) + '</label></b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="ctl"><input id="n-' + k + '" class="input input-sm" style="width:110px" type="number" min="' + min + '" max="' + max + '" value="' + esc(P.get(k)) + '" data-change="pref-set" data-k="' + k + '" data-min="' + min + '" data-max="' + max + '"></div></div>';
  }

  Object.assign(PS.act, {
    'pref-set': function (el) {
      var k = el.dataset.k, v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') {
        v = parseInt(el.value, 10);
        if (isNaN(v)) { el.value = P.get(k); return ui.toast('נדרש מספר', 'error'); }
        v = U.clamp(v, +el.dataset.min, +el.dataset.max);
        el.value = v;
      } else v = el.value;
      P.set(k, v);
      if (k === 'theme' || k === 'reducedMotion') PS.applyTheme();
      ui.toast('ההגדרה נשמרה', 'success', { duration: 1600 });
    },
    'pref-text': U.debounce(function (el) { P.set(el.dataset.k, el.value.trim().slice(0, +el.getAttribute('maxlength') || 60)); }, 400),
    'pref-color': function (el) { P.set('avatarColor', el.dataset.v); },
    'browser-notify': function () {
      PS.notify.requestBrowserPermission().then(function (r) {
        if (r === 'granted') {
          P.set('browserNotifications', true);
          ui.toast('ההתראות הופעלו', 'success');
          PS.notify.showSystem('Piano Studio', 'ההתראות פועלות. כך תיראה תזכורת.', 'welcome', '#/');
        }
        else if (r === 'unsupported') ui.toast('הדפדפן הזה לא תומך בהתראות', 'error');
        else { P.set('browserNotifications', false); ui.toast('ההרשאה לא ניתנה — אפשר לשנות בהגדרות הדפדפן', 'error'); }
      });
    },
    'browser-notify-off': function () { P.set('browserNotifications', false); },
    'test-notify': function () {
      PS.notify.push('event', 'בדיקת התראה', 'כך תיראה תזכורת ב-Piano Studio', { key: 'test:' + Date.now() });
      PS.notify.showSystem('בדיקת התראה', 'כך תיראה תזכורת ב-Piano Studio', 'test', '#/').then(function (shown) {
        ui.toast(shown ? 'נשלחה התראת מערכת ונוספה למרכז ההתראות' : 'נוספה התראה למרכז ההתראות (התראות מערכת כבויות)', 'success');
      });
    },
    'genre-add': function () {
      ui.prompt({ title: 'ז׳אנר חדש', label: 'שם הז׳אנר' }).then(function (v) {
        if (!v) return;
        var g = (P.get('genres') || PS.schema.DEFAULT_GENRES).slice();
        if (g.indexOf(v) < 0) g.push(v.slice(0, 40));
        P.set('genres', g);
      });
    },
    'genre-del': function (el) { P.set('genres', (P.get('genres') || PS.schema.DEFAULT_GENRES).filter(function (g) { return g !== el.dataset.g; })); },
    'export-json': function () { var n = PS.backup.exportJSON(); ui.toast('הגיבוי ירד: ' + n, 'success'); },
    'import-json': function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = function () {
        var f = input.files[0];
        if (!f) return;
        if (f.size > 50 * 1048576) return ui.toast('הקובץ גדול מדי (מעל 50MB)', 'error');
        var reader = new FileReader();
        reader.onload = function () { previewImport(String(reader.result), f.name); };
        reader.onerror = function () { ui.toast('לא ניתן לקרוא את הקובץ', 'error'); };
        reader.readAsText(f);
      };
      input.click();
    },
    'demo-load': function () { PS.backup.loadDemo(); ui.toast('נתוני הדוגמה נטענו', 'success'); },
    'demo-remove': function () {
      ui.confirm({ title: 'הסרת נתוני דוגמה', text: 'כל הרשומות שסומנו כנתוני דוגמה יימחקו. הנתונים שיצרתם בעצמכם יישארו.', confirmLabel: 'הסרה', danger: true }).then(function (ok) {
        if (ok) { PS.backup.removeDemo(); ui.toast('נתוני הדוגמה הוסרו', 'success'); }
      });
    },
    'clear-all': function () {
      ui.confirm({ title: 'מחיקת כל הנתונים', html: '<b>כל</b> השיעורים, השירים, הקורסים, המשימות, היומן, ה-XP וההגדרות יימחקו מהדפדפן הזה לצמיתות.<br><br>מומלץ להוריד גיבוי קודם.', confirmLabel: 'המשך', danger: true }).then(function (ok) {
        if (!ok) return;
        ui.prompt({ title: 'אישור סופי', label: 'הקלידו "מחיקה" כדי לאשר', icon: 'alert', confirmLabel: 'מחיקת הכל' }).then(function (v) {
          if (v !== 'מחיקה') { if (v !== null) ui.toast('הטקסט לא תאם — לא נמחק דבר', 'info'); return; }
          PS.backup.clearAll().then(function () { try { sessionStorage.clear(); } catch (e) {} location.hash = '#/'; location.reload(); });
        });
      });
    },
    'dash-reset-settings': function () { P.set({ dashboardOrder: P.DEFAULTS.dashboardOrder.slice(), dashboardHidden: [] }); ui.toast('הדשבורד אופס', 'success'); },
    'replay-intro': function () { try { sessionStorage.removeItem('ps.introPlayed'); } catch (e) {} location.reload(); }
  });

  function previewImport(text, name) {
    var v = PS.backup.validateImport(text);
    if (!v.ok) {
      ui.modal({ title: 'הייבוא נכשל', icon: 'alert', size: 'md', body: '<p class="confirm-text">הקובץ <b>' + esc(name) + '</b> לא עבר בדיקה, ולכן לא שונה דבר.</p><ul class="issue-list">' + v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>', footer: '<button type="button" class="btn btn-primary" data-close>הבנתי</button>' });
      return;
    }
    var LBL = { lessons: 'שיעורים', notes: 'פתקים', songs: 'שירים', collections: 'אוספים', courses: 'קורסים', tasks: 'משימות', goals: 'יעדים', events: 'אירועים', journal: 'יומן', resources: 'משאבים', xp: 'אירועי XP', achievements: 'הישגים', notifications: 'התראות', activity: 'פעילות' };
    var m = ui.modal({
      title: 'תצוגה מקדימה של הייבוא', icon: 'upload', size: 'md',
      body: '<p class="confirm-text">הקובץ <b>' + esc(name) + '</b>' + (v.exportedAt ? ' (נוצר ' + esc(U.fmtDateTime(v.exportedAt)) + ')' : '') + ' תקין. זה מה שייובא:</p>' +
        '<div class="import-preview">' + Object.keys(LBL).map(function (k) { return '<div><span>' + LBL[k] + '</span><b class="num">' + (v.counts[k] || 0) + '</b></div>'; }).join('') + '</div>' +
        (v.warnings.length ? '<div class="banner banner-gold">' + I('alert') + '<span>' + v.warnings.length + ' הערות</span></div><ul class="issue-list">' + v.warnings.slice(0, 30).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="banner banner-red" style="margin-top:14px">' + I('alert') + '<span>הייבוא <b>יחליף</b> את כל הנתונים הנוכחיים בדפדפן הזה.</span></div>' +
        '<label class="field-check"><input type="checkbox" class="check" id="imp-backup" checked><span>להוריד קודם גיבוי של הנתונים הנוכחיים (מומלץ)</span></label>',
      footer: '<button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-danger" data-ok>' + I('upload') + 'החלפת הנתונים</button>'
    });
    m.el.querySelector('[data-ok]').onclick = function () {
      if (m.el.querySelector('#imp-backup').checked) PS.backup.exportJSON();
      PS.backup.applyImport(v).then(function () {
        m.close();
        PS.applyTheme();
        PS.domain.evaluate();
        ui.toast('הנתונים יובאו בהצלחה', 'success');
      }).catch(function (e) { ui.toast('הייבוא נכשל: ' + e.message, 'error'); });
    };
  }

  function render(el, route) {
    var section = route.query.s;
    var hasDemo = PS.backup.hasDemo();
    var notifSupported = 'Notification' in window;
    var perm = notifSupported ? Notification.permission : 'unsupported';
    var genres = P.get('genres') || PS.schema.DEFAULT_GENRES;
    var html = '<div class="page"><div class="page-head"><div><h1>הגדרות</h1><p class="sub">התאמה אישית, העדפות וניהול הנתונים שלך</p></div></div><div class="settings-layout">' +
      '<nav class="settings-nav" aria-label="קטגוריות הגדרות">' + SECTIONS.map(function (s) { return '<a href="#/settings?s=' + s[0] + '" data-scroll="' + s[0] + '" class="' + (section === s[0] ? 'on' : '') + '">' + I(s[2]) + esc(s[1]) + '</a>'; }).join('') + '</nav><div>';

    html += '<section class="card set-section" id="set-profile"><h2>' + I('user') + 'פרופיל</h2><p class="muted">השם מופיע בברכה בדשבורד. ההגדרות נשמרות במכשיר הזה.</p>' +
      '<div class="set-row"><div class="lbl"><b><label for="p-name">שם תצוגה</label></b></div><div class="ctl"><input id="p-name" class="input input-sm" maxlength="40" value="' + esc(P.get('name')) + '" data-input="pref-text" data-k="name" data-keep="p-name" placeholder="השם שלך"></div></div>' +
      '<div class="set-row"><div class="lbl"><b><label for="p-ini">ראשי תיבות לאווטאר</label></b><small>ריק = נגזר מהשם</small></div><div class="ctl">' + PS.avatarHTML() + '<input id="p-ini" class="input input-sm" style="width:90px" maxlength="3" value="' + esc(P.get('initials')) + '" data-input="pref-text" data-k="initials" data-keep="p-ini"></div></div>' +
      '<div class="set-row"><div class="lbl"><b>צבע אווטאר</b></div><div class="ctl swatches" role="radiogroup" aria-label="צבע אווטאר">' + COLORS.map(function (c) { return '<button type="button" role="radio" aria-checked="' + (P.get('avatarColor') === c) + '" aria-label="' + c + '" class="avatar-' + c + (P.get('avatarColor') === c ? ' on' : '') + '" data-act="pref-color" data-v="' + c + '"></button>'; }).join('') + '</div></div></section>';

    html += '<section class="card set-section" id="set-appearance"><h2>' + I('sun') + 'מראה ותנועה</h2><p class="muted">ברירת המחדל היא מצב כהה.</p>' +
      sel('theme', 'ערכת נושא', '', [['dark', 'כהה'], ['light', 'בהיר'], ['system', 'לפי המערכת']]) +
      sel('language', 'שפה', 'כרגע הממשק זמין בעברית בלבד. שמות באנגלית מוצגים כראוי בתוך הממשק.', [['he', 'עברית']]) +
      sel('reducedMotion', 'הפחתת תנועה', 'לפי המערכת = מכבד את הגדרת הנגישות של המכשיר', [['system', 'לפי המערכת'], ['on', 'מופעלת — בלי אנימציות'], ['off', 'כבויה — אנימציות מלאות']]) +
      sw('intro', 'אנימציית פתיחה', 'מוצגת פעם אחת בכל פתיחה של האפליקציה, ואפשר לדלג בלחיצה') +
      '<div class="set-row"><div class="lbl"><b>צפייה חוזרת בפתיחה</b></div><div class="ctl"><button type="button" class="btn btn-ghost btn-sm" data-act="replay-intro">' + I('refresh') + 'הצגה עכשיו</button></div></div>' +
      sw('sound', 'צלילי אפקט', 'צליל עדין בעלייה ברמה ובפתיחת הישג (כבוי כברירת מחדל)') + '</section>';

    html += '<section class="card set-section" id="set-learning"><h2>' + I('music') + 'למידה ולוח שנה</h2><p class="muted">פעולת למידה = משימה שהושלמה, שיעור שהתקיים, מודול שהושלם או שיר שנלמד.</p>' +
      '<div class="set-row"><div class="lbl"><b id="l-lessonsEnabled">אני לומד/ת עם מורה</b><small>מציג את ניהול השיעורים, הערות מורה ושיעורי בית. כבוי = לימוד עצמאי.</small></div><div class="ctl"><label class="switch"><input type="checkbox" data-change="pref-set" data-k="lessonsEnabled" aria-labelledby="l-lessonsEnabled"' + (P.get('lessonsEnabled') ? ' checked' : '') + '><span></span></label></div></div>' +
      num('dailyPracticeGoal', 'יעד אימון יומי (דקות)', 'משמש לטבעת היומית ולמפת האימונים', 5, 300) +
      num('weeklyGoal', 'יעד שבועי (פעולות למידה)', 'עמידה ביעד מעניקה ' + PS.game.XP.weekly + ' XP פעם אחת בשבוע', 1, 50) +
      num('defaultLessonDuration', 'אורך שיעור ברירת מחדל (דקות)', '', 10, 240) +
      sel('calendarView', 'תצוגת לוח שנה מועדפת', '', [['month', 'חודש'], ['week', 'שבוע'], ['day', 'יום'], ['agenda', 'סדר יום']]) +
      '<div class="set-row"><div class="lbl"><b>ז׳אנרים</b><small>מופיעים בבחירה בעת הוספת שיר</small></div><div class="ctl" style="max-width:420px">' + genres.map(function (g) { return '<span class="tag-chip"><bdi>' + esc(g) + '</bdi><button type="button" data-act="genre-del" data-g="' + esc(g) + '" aria-label="הסרת ' + esc(g) + '">' + I('x') + '</button></span>'; }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-act="genre-add">' + I('plus') + 'ז׳אנר</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>תבנית שיעור</b><small>' + (P.get('lessonTemplate') ? 'מוגדרת: ' + esc(P.get('lessonTemplate').title || '') : 'לא הוגדרה — שמרו שיעור כתבנית מתפריט השיעור') + '</small></div><div class="ctl">' + (P.get('lessonTemplate') ? '<button type="button" class="btn btn-ghost btn-sm" data-act="lesson-template-clear">מחיקת התבנית</button>' : '') + '</div></div></section>';

    html += '<section class="card set-section" id="set-notifications"><h2>' + I('bell') + 'התראות ו-XP</h2><p class="muted">התראות מערכת מוצגות כשהאפליקציה פתוחה או ברקע (גם כאפליקציה מותקנת בטלפון), ובפתיחה היא משלימה כל תזכורת שהגיע זמנה. אין שרת התראות, ולכן <b>כשהאפליקציה סגורה לגמרי תזכורות לא נשלחות</b>.</p>' +
      sw('practiceReminder', 'תזכורת אימון יומית', 'אם עד השעה שנבחרה לא נרשם אימון באותו יום') +
      '<div class="set-row"><div class="lbl"><b><label for="s-prt">שעת תזכורת האימון</label></b></div><div class="ctl"><input id="s-prt" class="input input-sm" style="width:130px" type="time" value="' + esc(P.get('practiceReminderTime') || '19:00') + '" data-change="pref-set" data-k="practiceReminderTime"></div></div>' +
      sw('notifyLessons', P.get('lessonsEnabled') ? 'שיעורים ואירועים קרובים' : 'אירועים קרובים ביומן', 'לפי זמן התזכורת שהוגדר בכל פריט') + sw('notifyTasks', 'מועדי משימות', 'משימות להיום ובאיחור') + sw('notifyGoals', 'מועדי יעדים', '3 ימים לפני המועד') + sw('notifyCourses', 'יעדי קורסים', 'שבוע לפני תאריך היעד') + sw('notifyLevel', 'עלייה ברמה') + sw('notifyAchievements', 'הישגים חדשים') +
      '<div class="set-row"><div class="lbl"><b>התראות דפדפן</b><small>' + (perm === 'unsupported' ? 'הדפדפן הזה לא תומך בהתראות' : perm === 'denied' ? 'ההרשאה נחסמה בהגדרות הדפדפן' : P.get('browserNotifications') && perm === 'granted' ? 'פעילות' : 'דורש הרשאה — תתבקש רק אחרי לחיצה') + '</small></div><div class="ctl">' +
        (perm === 'unsupported' || perm === 'denied' ? '' : P.get('browserNotifications') && perm === 'granted' ? '<button type="button" class="btn btn-ghost btn-sm" data-act="browser-notify-off">כיבוי</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="browser-notify">' + I('bell') + 'הפעלה</button>') +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="test-notify">בדיקה</button></div></div>' +
      sw('xpToasts', 'הודעות XP', 'הודעה קטנה בכל פעם שנצבר XP') + sw('levelUpAnimation', 'אנימציית עלייה ברמה') + sw('achievementAnimation', 'אנימציית פתיחת הישג') + '</section>';

    html += '<section class="card set-section" id="set-dashboard"><h2>' + I('grid') + 'דשבורד</h2><p class="muted">שינוי סדר והסתרה של ווידג׳טים נעשים ישירות בדשבורד.</p>' +
      '<div class="set-row"><div class="lbl"><b>התאמת הדשבורד</b><small>' + ((P.get('dashboardHidden') || []).length ? (P.get('dashboardHidden') || []).length + ' ווידג׳טים מוסתרים' : 'כל הווידג׳טים מוצגים') + '</small></div><div class="ctl"><a class="btn btn-ghost btn-sm" href="#/" data-act="dash-customize-go">' + I('sliders') + 'לעריכה</a><button type="button" class="btn btn-ghost btn-sm" data-act="dash-reset-settings">איפוס</button></div></div></section>';

    html += '<section class="card set-section" id="set-data"><h2>' + I('download') + 'נתונים וגיבוי</h2><p class="muted">כל הנתונים נשמרים מקומית בדפדפן (IndexedDB' + (PS.db.mode() !== 'idb' ? ' — לא זמין, נעשה שימוש ב-localStorage' : '') + '). אין חשבון ענן ואין סנכרון בין מכשירים — גבו מדי פעם.</p>' +
      '<div class="set-row"><div class="lbl"><b>ייצוא גיבוי מלא (JSON)</b><small>כל הרשומות וההגדרות. קבצים מקומיים אינם כלולים.</small></div><div class="ctl"><button type="button" class="btn btn-primary btn-sm" data-act="export-json">' + I('download') + 'הורדת גיבוי</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>ייבוא מגיבוי</b><small>הקובץ נבדק ומוצגת תצוגה מקדימה לפני שמשהו מוחלף</small></div><div class="ctl"><button type="button" class="btn btn-ghost btn-sm" data-act="import-json">' + I('upload') + 'בחירת קובץ…</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>ייצוא CSV</b><small>לפתיחה באקסל / Google Sheets</small></div><div class="ctl"><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="songs">שירים</button><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="lessons">שיעורים</button><button type="button" class="btn btn-ghost btn-sm" data-act="export-csv" data-c="tasks">משימות</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>נתוני דוגמה</b><small>' + (hasDemo ? 'קיימים נתוני דוגמה במערכת' : 'רשומות לדוגמה להיכרות. לא מעניקות XP או הישגים.') + '</small></div><div class="ctl">' + (hasDemo ? '<button type="button" class="btn btn-ghost btn-sm" data-act="demo-remove">' + I('trash') + 'הסרת נתוני הדוגמה</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="demo-load">' + I('sparkle') + 'טעינת נתוני דוגמה</button>') + '</div></div>' +
      '<div class="set-row"><div class="lbl"><b style="color:var(--red)">מחיקת כל הנתונים</b><small>מוחק את כל הנתונים המקומיים מהדפדפן הזה לצמיתות</small></div><div class="ctl"><button type="button" class="btn btn-danger btn-sm" data-act="clear-all">' + I('trash') + 'מחיקה…</button></div></div></section>';

    html += '<section class="card set-section" id="set-about"><h2>' + I('info') + 'אודות</h2><p class="muted">Piano Studio — מרכז ניהול אישי ללמידת פסנתר. זו אינה אפליקציית נגינה: היא מארגנת שיעורים, שירים, קורסים, משימות ויעדים מהעולם האמיתי.</p>' +
      '<div class="set-row"><div class="lbl"><b>קיצורי מקלדת</b></div><div class="ctl"><button type="button" class="btn btn-ghost btn-sm" data-act="shortcuts">' + I('keyboard') + 'הצגה</button></div></div>' +
      '<div class="set-row"><div class="lbl"><b>גרסת סכמת נתונים</b></div><div class="ctl num muted">' + PS.db.SCHEMA_VERSION + '</div></div></section>';
    el.innerHTML = html + '</div></div></div>';
    if (section) {
      var t = el.querySelector('#set-' + section);
      if (t) setTimeout(function () { t.scrollIntoView({ behavior: U.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); }, 60);
      history.replaceState(null, '', '#/settings');
      delete route.query.s;
    }
  }
  PS.act['dash-customize-go'] = function () { PS.navigate('#/'); setTimeout(function () { PS.act['dash-customize'](); }, 50); };

  PS.views.settings = { title: function () { return 'הגדרות'; }, render: render };
})();
