# Canvas Planner

A personal Firefox extension that reads my Canvas assignments and builds a schedule of
self-assigned target dates, so homework gets finished early instead of on the official
due date. Full requirements are in `SPEC.md`. Read it before starting any task. If this
file and SPEC.md disagree, stop and ask me.

## What this is not
- Not a homework helper. It never reads or writes coursework and never answers or
  submits anything. Planning only.
- Read-only against Canvas: GET requests only.
- No server, no accounts, no analytics. All data stays in the browser
  (`browser.storage.local`). The only network requests go to my Canvas domain
  (`byui.instructure.com`).

## Stack and constraints
- Firefox WebExtension. Plain JavaScript with ES modules. No framework, no bundler,
  no build step unless I approve one.
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
  `https://byui.instructure.com/*`. Never `<all_urls>`, `tabs`, or `webRequest`.
  Tell me before adding any permission.
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
- `npx web-ext lint`: lint the manifest (from milestone M2 on).

## Layout
    manifest.json
    src/planner/   pure logic: dates, estimates, scheduling
    src/sync/      Canvas fetch + normalize
    src/storage/   schema, defaults, migrations, merge
    src/ui/        new-tab planner page + settings view
    test/          tests
    test/fixtures/ real Canvas API JSON (private repo only)

## How to work with me
- Follow the milestones in SPEC.md in order, one at a time. Stop at the end of each with
  tests passing and a short summary.
- Small commits with clear messages.
- Keep `README.md` current for other readers: when a change affects Features, Install
  or Development, update it in the same commit (move features from "Coming next" to
  "Available now" as they land).
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
