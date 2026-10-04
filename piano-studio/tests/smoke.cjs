/* Piano Studio end-to-end smoke test (Playwright, Chromium). Run: node tests/smoke.cjs [baseUrl] */
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '';
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); }

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  const dismiss = async () => { for (let i = 0; i < 4; i++) { if (await page.isVisible('.modal-levelup')) { await page.click('.modal-levelup .lvl .btn'); await page.waitForTimeout(500); } } };
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + n + '.png', fullPage: false }); };

  await page.goto(BASE);
  // intro shows on first load
  check('intro animation shown on first load', await page.evaluate(() => document.documentElement.classList.contains('intro-on')));
  await page.waitForTimeout(3200);
  check('intro finished and removed', await page.evaluate(() => !document.getElementById('intro')));
  // onboarding
  await page.waitForSelector('#ob-name', { timeout: 4000 });
  await page.fill('#ob-name', 'יואב');
  await page.click('[data-ob-go]');
  await page.waitForTimeout(400);
  const hero = await page.textContent('.hero h1');
  check('dashboard greeting uses name', /יואב/.test(hero), hero);
  await shot('01-dashboard-empty');

  // every nav page renders
  const routes = ['', 'calendar', 'stats', 'lessons', 'notes', 'songs', 'courses', 'tasks', 'goals', 'resources', 'journal', 'journey', 'achievements', 'settings'];
  for (const r of routes) {
    await page.goto(BASE + '#/' + r);
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => !!document.querySelector('#main .page') && !/משהו השתבש/.test(document.getElementById('main').textContent));
    check('route #/' + r + ' renders', ok);
  }

  // create a lesson through the UI
  await page.goto(BASE + '#/lessons');
  await page.click('.page-actions [data-act="add-lesson"]');
  await page.fill('[name="title"]', 'שיעור עם רונית');
  const tomorrow = await page.evaluate(() => PS.util.dkey(PS.util.addDays(new Date(), 1)));
  await page.fill('[name="date"]', tomorrow);
  await page.fill('[name="time"]', '17:30');
  await page.fill('[name="teacher"]', 'רונית');
  await page.click('[data-save]');
  await page.waitForTimeout(400);
  check('lesson detail opens after create', /#\/lessons\/les_/.test(page.url()));
  // validation: empty title is rejected
  await page.goto(BASE + '#/lessons');
  await page.click('.page-actions [data-act="add-lesson"]');
  await page.fill('[name="title"]', '');
  await page.click('[data-save]');
  await page.waitForTimeout(200);
  check('form validation blocks empty title', await page.isVisible('.field.invalid'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await page.isVisible('.modal-wrap')) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }

  // persistence after reload
  await page.reload();
  await page.waitForTimeout(600);
  const lessonCount = await page.evaluate(() => PS.store.list('lessons').length);
  check('lesson persists after reload (IndexedDB)', lessonCount === 1, 'count=' + lessonCount);
  check('intro not replayed within same session', await page.evaluate(() => !document.documentElement.classList.contains('intro-on')));

  // songs: add 2, change status to learned -> +75 XP once
  const xp0 = await page.evaluate(() => PS.game.lifetimeXP());
  await page.evaluate(() => {
    PS.store.create('songs', { title: 'Clair de Lune', artist: 'Debussy', genre: 'קלאסי', status: 'learning', progress: 40 });
    PS.store.create('songs', { title: 'River Flows in You', artist: 'Yiruma', status: 'wishlist' });
  });
  const songId = await page.evaluate(() => PS.store.list('songs').find((s) => s.title === 'Clair de Lune').id);
  await page.goto(BASE + '#/songs/' + songId);
  await page.waitForTimeout(200);
  await page.selectOption('[data-change="song-status"]', 'learned');
  await page.waitForTimeout(400);
  let xp1 = await page.evaluate(() => PS.game.lifetimeXP());
  check('song learned awards 75 XP', xp1 - xp0 === 75, `${xp0} -> ${xp1}`);
  await page.selectOption('[data-change="song-status"]', 'reviewing');
  await page.waitForTimeout(200);
  await page.selectOption('[data-change="song-status"]', 'learned');
  await page.waitForTimeout(400);
  let xp2 = await page.evaluate(() => PS.game.lifetimeXP());
  check('re-marking song learned does not award again', xp2 === xp1, `${xp1} -> ${xp2}`);
  await page.reload(); await page.waitForTimeout(500);
  check('song status persists after reload', await page.evaluate((id) => PS.store.get('songs', id).status, songId) === 'learned');
  await page.keyboard.press('Escape');

  await dismiss();
  // tasks: create + complete via UI, undo, re-complete -> XP once
  await page.goto(BASE + '#/tasks');
  await page.fill('[data-quick-task] input', 'לחפש תווים');
  await page.press('[data-quick-task] input', 'Enter');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => PS.game.lifetimeXP());
  await page.click('.task [data-act="task-toggle"]');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => PS.game.lifetimeXP());
  check('completing a task awards 10 XP', after - before === 10, `${before} -> ${after}`);
  const tid = await page.evaluate(() => PS.store.list('tasks')[0].id);
  await page.evaluate((id) => { PS.store.update('tasks', id, { done: false }); PS.store.update('tasks', id, { done: true }); PS.store.update('tasks', id, { title: 'לחפש תווים (עודכן)' }); }, tid);
  await page.waitForTimeout(300);
  check('undo/redo/edit task never re-awards XP', await page.evaluate(() => PS.game.lifetimeXP()) === after);
  check('XP events are individual and unique per key', await page.evaluate(() => { const k = PS.store.list('xp').map((e) => e.key); return new Set(k).size === k.length; }));

  // course with modules
  const cid = await page.evaluate(() => PS.store.create('courses', { title: 'Piano Fundamentals', moduleCount: 2, status: 'planned' }).id);
  await page.goto(BASE + '#/courses/' + cid);
  await page.waitForTimeout(200);
  const x3 = await page.evaluate(() => PS.game.lifetimeXP());
  await page.click('.module [data-act="module-toggle"] >> nth=0');
  await page.waitForTimeout(300);
  check('module completion awards 20 XP and starts course', await page.evaluate((id) => PS.store.get('courses', id).status, cid) === 'in_progress' && await page.evaluate(() => PS.game.lifetimeXP()) - x3 === 20);
  await dismiss();
  await page.click('.module [data-act="module-toggle"] >> nth=1');
  await page.waitForTimeout(800);
  const cst = await page.evaluate((id) => PS.store.get('courses', id).status, cid);
  check('completing all modules completes course (+20 +100 XP)', cst === 'completed' && await page.evaluate(() => PS.game.lifetimeXP()) - x3 === 140, cst);
  await page.waitForTimeout(500);
  if (await page.isVisible('.modal-levelup')) await shot('05-levelup');
  await dismiss();

  // level math
  const lv = await page.evaluate(() => [PS.game.xpToNext(1), PS.game.xpToNext(2), PS.game.xpToNext(5), PS.game.levelFromXP(99).level, PS.game.levelFromXP(100).level, PS.game.levelFromXP(235).level, PS.game.levelFromXP(234).into]);
  check('level curve round(100+35*(L-1)^1.45)', lv[0] === 100 && lv[1] === 135 && lv[2] === Math.round(100 + 35 * Math.pow(4, 1.45)) && lv[3] === 1 && lv[4] === 2 && lv[5] === 3 && lv[6] === 134, JSON.stringify(lv));

  // achievements only when criteria met
  const ach = await page.evaluate(() => PS.store.list('achievements').map((a) => a.id).sort());
  check('achievements unlocked match real data', ach.includes('first-lesson') && ach.includes('first-song') && ach.includes('first-song-learned') && ach.includes('first-course-done') && !ach.includes('five-lessons') && !ach.includes('ten-songs-learned'), ach.join(','));

  await dismiss();
  // dashboard stats reflect data
  await page.goto(BASE + '#/');
  await page.waitForTimeout(300);
  const heroStats = await page.$$eval('.hero-stat b', (els) => els.map((e) => e.textContent));
  check('dashboard stats reflect data (1 song learned, 0 lessons, 1 course)', heroStats[0] === '1' && heroStats[1] === '0' && heroStats[2] === '1', heroStats.join('|'));
  await shot('02-dashboard');

  // calendar: lesson on correct date
  await page.goto(BASE + '#/calendar');
  await page.waitForTimeout(200);
  const onDate = await page.evaluate((d) => { const cell = document.querySelector('.month .day[data-date="' + d + '"]'); return cell ? cell.textContent : 'NO CELL'; }, tomorrow);
  check('calendar shows lesson on correct date', /רונית/.test(onDate), onDate.slice(0, 60));
  await shot('03-calendar');

  await dismiss();
  // overlap warning
  await page.evaluate(() => PS.act['add-event'](null, {}));
  await page.waitForTimeout(200);
  await page.fill('.modal [name="title"]', 'קונצרט');
  await page.fill('.modal [name="date"]', tomorrow);
  await page.fill('.modal [name="time"]', '17:45');
  await page.click('.modal [data-save]');
  await page.waitForTimeout(300);
  check('overlap warning shown for conflicting event', /התנגשות/.test(await page.textContent('body')));
  await page.click('.modal-wrap:last-of-type [data-ok]');
  await page.waitForTimeout(300);

  await dismiss();
  // search
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  await page.fill('.palette-input input', 'clair');
  await page.waitForTimeout(200);
  const res = await page.textContent('.palette-results');
  check('global search (Ctrl+K) finds song', /Clair de Lune/.test(res));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('search result navigates to record', /#\/songs\//.test(page.url()));

  await dismiss();
  // notes with markdown + draft
  await page.goto(BASE + '#/notes');
  await page.click('.page-actions [data-act="add-note"]');
  await page.fill('.modal [name="title"]', 'פדאל');
  await page.fill('.modal [name="body"]', '## כותרת\n- [ ] לנסות תיבות 1-8\n- **חשוב**');
  await page.waitForTimeout(900);
  check('note draft auto-saved', await page.evaluate(() => !!localStorage.getItem('ps.draft.notes.new')));
  await page.click('.modal [data-save]');
  await page.waitForTimeout(400);
  check('markdown renders checklist + heading', await page.isVisible('.prose ul.checklist') && await page.isVisible('.prose h4'));
  await page.click('.prose [data-md-line]');
  await page.waitForTimeout(300);
  check('checklist toggles in stored note', await page.evaluate(() => /\[x\]/.test(PS.store.list('notes')[0].body)));

  await dismiss();
  // theme persists
  await page.goto(BASE + '#/settings');
  await page.selectOption('#s-theme', 'light');
  await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(500);
  check('theme preference persists', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
  await shot('04-settings-light');
  await page.selectOption('#s-theme', 'dark');
  // intro toggle
  await page.evaluate(() => { PS.prefs.set('intro', false); sessionStorage.clear(); });
  await page.reload(); await page.waitForTimeout(300);
  check('intro can be disabled', await page.evaluate(() => !document.documentElement.classList.contains('intro-on')));

  // export / import
  const exported = await page.evaluate(() => JSON.stringify(PS.backup.exportObject()));
  const bad = await page.evaluate(() => PS.backup.validateImport('{"oops":1}'));
  check('import rejects malformed data', !bad.ok && bad.errors.length > 0, bad.errors[0]);
  const good = await page.evaluate((t) => { const v = PS.backup.validateImport(t); return { ok: v.ok, songs: v.counts.songs, xp: v.counts.xp }; }, exported);
  check('import validates exported backup', good.ok && good.songs === 2, JSON.stringify(good));
  const xpBefore = await page.evaluate(() => PS.game.lifetimeXP());
  await page.evaluate(async (t) => { await PS.backup.clearAll(); const v = PS.backup.validateImport(t); await PS.backup.applyImport(v); }, exported);
  await page.reload(); await page.waitForTimeout(500);
  check('import restores data + XP after wipe', await page.evaluate(() => PS.store.list('songs').length) === 2 && await page.evaluate(() => PS.game.lifetimeXP()) === xpBefore);

  // stats page, journey
  await page.goto(BASE + '#/stats'); await page.waitForTimeout(300);
  check('stats charts rendered from data', await page.$$eval('.chart svg', (e) => e.length) >= 3);
  await page.goto(BASE + '#/journey'); await page.waitForTimeout(200);
  check('journey timeline lists real events', await page.$$eval('.tl-item', (e) => e.length) >= 3);
  await page.goto(BASE + '#/achievements'); await page.waitForTimeout(200);
  await shot('06-achievements');

  // mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  for (const r of ['', 'songs', 'calendar', 'tasks', 'lessons', 'settings', 'stats', 'achievements']) {
    await page.goto(BASE + '#/' + r); await page.waitForTimeout(250);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('mobile #/' + r + ' has no horizontal overflow', ov <= 0, 'overflow=' + ov);
  }
  check('mobile bottom nav visible', await page.isVisible('.bottom-nav .bn-add'));
  await page.goto(BASE + '#/'); await page.waitForTimeout(300);
  await shot('07-mobile-dashboard');
  check('RTL document direction', await page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl');

  check('no console / page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
