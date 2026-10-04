# Piano Studio

A personal management app for real-world piano learning: lessons, a lesson notebook, songs, courses, tasks, goals, a calendar, a journal, resources, statistics, and an XP and achievements system. The interface is in Hebrew and right-to-left, with dark mode as the default.

> This is **not** a virtual piano and does not measure playing. It only tracks things you record yourself.

## How it is built

- A static PWA with no build step and no dependencies. It uses plain JavaScript modules on a shared `window.PS` namespace, the Heebo and Frank Ruhl Libre fonts from Google Fonts, and inline SVG icons and charts.
- **Local-first storage.** All records are kept in **IndexedDB** (`piano-studio` database, one object store per collection) and mirrored in memory for fast reads. If IndexedDB is unavailable, the app falls back to localStorage. Small preferences are stored in `localStorage` (`ps.prefs.v1`). Local files are stored as Blobs in IndexedDB on the current device only.
- The app has no backend, no accounts and no cloud sync. Data stays in the browser where it was entered. Use **Settings → Data & backup** to export or import JSON, export CSV, and back up your data.

```
index.html          app shell and the theme/intro decision made before first paint
css/app.css         design tokens (dark and light), components, RTL layout, animations
js/core/            util, prefs, schema (form and validation definitions), db (IndexedDB),
                    store (CRUD and safe deletes), domain (status transitions), gamification (XP, levels,
                    achievements), notify, stats, search, backup
js/ui/              icons, components (modal, forms, markdown, toasts), charts, fx (intro, level-up)
js/views/           one file per page
tests/smoke.cjs     end-to-end test (Playwright)
```

## Running locally

```bash
cd piano-studio
npx http-server . -p 5173 -c-1     # or any static server
# open http://localhost:5173
node tests/smoke.cjs http://localhost:5173/   # requires Playwright and Chromium
```

## Deploying to Vercel (as a new project)

The `piano-studio/` folder is a self-contained static site, and `vercel.json` sets the headers.

**Dashboard:** Vercel → *Add New… → Project* → import this GitHub repository → set **Root Directory** to `piano-studio` → Framework preset **Other**, with no build command and no output directory → *Deploy*.

**CLI:**

```bash
cd piano-studio
npx vercel --prod      # when prompted, create a new project (do not link it to an existing one)
```

## Known limitations

- Reminders are generated only while the app is open, on load and then once a minute. With no push server, nothing fires while the app is fully closed. Browser notifications show only while a tab is open in the background.
- Data does not sync between devices. Use JSON export and import to move it.
- Local files are not included in the JSON backup, which contains only their metadata.
- The interface is available in Hebrew only.
