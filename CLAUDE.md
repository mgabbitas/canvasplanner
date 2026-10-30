# Canvas Planner

A Firefox and Chrome extension that reads my Canvas assignments and builds a schedule of
self-assigned target dates, so homework gets finished early instead of on the official
due date. Full requirements are in `SPEC.md`. Read it before starting any task. If this
file and SPEC.md disagree, stop and ask me.

## What this is not
- Not a homework helper. It never reads or writes coursework and never answers or
  submits anything. Planning only.
- Read-only against Canvas: GET requests only.
- No server, no accounts, no analytics. All data stays in the browser
  (`browser.storage.local`). The only network requests go to the user's own Canvas
  (the school address they chose, always a `*.instructure.com` host; mine is
  `byui.instructure.com`).

## Stack and constraints
- WebExtension for Firefox and Chrome: one codebase, one manifest (SPEC section 9).
  Always call `browser.*` (`src/browser.js` maps it to `chrome` in Chrome). Plain
  JavaScript with ES modules. No framework, no bundler, no build step unless I approve
  one.
- No runtime dependencies. Dev-only tooling allowed: `web-ext`. Ask before adding
  anything else.
- Tests use Node's built-in runner (`node --test`). Set `process.env.TZ =
  'America/Denver'` at the top of each test file so results don't depend on the
  machine's timezone.
- `src/planner/` is pure functions: no `browser.*`, no DOM, no `Date.now()`. Take `now`
  as an argument so everything runs under Node and is testable.
- Dates: do all day math on local calendar dates (`YYYY-MM-DD`), never by adding 24 h
  to a timestamp, so daylight saving can't shift a day. Canvas timestamps are UTC ISO
  strings; convert to the browser's local time for display and day bucketing.

## Security rules (non-negotiable)
- Manifest permissions: `storage`, `alarms` (only if needed), and host permission for
  `https://*.instructure.com/*` (any school's Canvas, approved 2026-10-29). Requests
  only ever go to the one school address the user saved. Never `<all_urls>`, `tabs`,
  `webRequest`, or schools on their own domains. Tell me before adding any permission.
- Canvas content is untrusted. Convert assignment descriptions to plain text and insert
  them only with `textContent`. No `innerHTML` with external data, no `eval`, no remote
  scripts, no inline event handlers.
- Never log or store cookies or session tokens. Sync relies on my existing browser
  login session only.
- Validate and clamp everything read from storage or an imported file.

## Commands
- `npm test`: run all tests. They must pass before you call anything done.
- `npm start`: open Firefox on the persistent dev profile (`~/.cache/canvasplanner-firefox`)
  at `about:debugging`, then Load Temporary Add-on > `manifest.json`. `web-ext run`
  does not work here: CachyOS locks `devtools.debugger.remote-enabled` to false.
- Chrome: in Chromium, `chrome://extensions` > Developer mode > Load unpacked > the
  project folder (reload it there after changes).
- `npx web-ext lint`: lint the manifest (from milestone M2 on).
- `npm run check:ui`: headless-Firefox click-through of the real page with a fake
  `browser` API and the fixture data. Run it after any change in `src/ui/`
  (`-- --screenshot` saves screenshots to `web-ext-artifacts/`).

## Layout
    manifest.json
    src/planner/   pure logic: dates, estimates, scheduling
    src/sync/      Canvas fetch + normalize
    src/storage/   schema, defaults, migrations, merge
    src/ui/        page: app.js (shared state), shell.js, week.js, items.js,
                   settings.js, statsview.js, planner.js (render + startup)
    src/popup/     toolbar popup: today's list with checkboxes
    src/background.js        opens the planner / syncs when you visit Canvas; badge count
    src/content/   content script on Canvas pages (signals a visit only)
    test/          tests
    tools/ui-check/  browser click-through check (not packaged)
    test/fixtures/ real Canvas API JSON (private repo only)

## How to work with me
- Follow the milestones in SPEC.md in order, one at a time. Stop at the end of each with
  tests passing and a short summary.
- Small commits with clear messages.
- Keep `README.md` current for other readers, in the same commit as the change. It is
  deliberately short and plain: what it does, install, using it, a settings overview,
  a short developer section and changelog. Simplicity beats covering every feature.

## Releasing a new version
1. Bump `version` in `manifest.json` and `package.json`; add a changelog line to README.
2. `npm test`, `npm run check:ui`, `npx web-ext lint`, a quick Chromium check (sync,
   popup, badge), then `npm run build`.
3. I upload `web-ext-artifacts/canvas_planner-<version>.zip` at addons.mozilla.org
   ("On your own"), then put the signed `.xpi` in the project folder. I upload the same
   zip to the Chrome Web Store developer dashboard.
4. Publish a GitHub Release `v<version>` with the signed file attached as
   `canvas-planner.xpi` (that exact name: the README links to
   `releases/latest/download/canvas-planner.xpi`). `.xpi` files are never committed.
- Before writing non-trivial logic (especially in `src/planner/`), give me a short
  plain-language explanation of the approach. After each milestone, give a 5 to 10 line
  walkthrough of what changed and why, and call out one or two JS or WebExtension
  concepts worth understanding. I'm early in JS, but my priority is a working tool, so
  don't lecture on simple things.
- If a request conflicts with the spec or looks like a bad idea, say so and suggest an
  alternative before doing it. Be direct.
- Don't guess at anything SPEC.md lists under Assumptions or Open questions. Ask.
- Check Canvas API behavior against `test/fixtures/`, not memory. If the real data
  differs from the spec, tell me.
