# Canvas Planner

A Firefox extension that turns your Canvas assignments into a realistic weekly plan.
It gives every unfinished assignment a self-assigned target day, spreads the work
across the week within the time you actually have each day, and aims to finish the
week's work early (by Wednesday, by default) instead of on the official due date.

Canvas tells you *when* things are due. It doesn't tell you that 16 of them land on
the same Saturday. Canvas Planner does, and spreads them out before that happens.

> **Status:** version 1.0, a personal project. It works with one Canvas site
> (`byui.instructure.com`) and in Firefox only.

## What it is (and isn't)

- **A planner, not a homework helper.** It reads assignment titles, due dates and
  submission status. It never reads or writes coursework and never submits anything.
- **Read-only.** It only makes `GET` requests to Canvas.
- **Private.** No server, no account, no analytics. It uses your existing Canvas login
  in the browser (no API token), and everything it stores stays in your browser's
  extension storage.

## Features

### Available now
- **Your week, planned.** Replaces the new-tab page with a day-by-day plan from today
  to your target day. Each day has a load bar showing planned minutes against the
  time you have. A tab per day shows its item count and minutes (plus a **Week** tab
  for every day at once); each day groups its items by class, and today's most urgent
  item is marked **up next**. The header shows what's left today.
- **Sync from Canvas.** Pulls all active classes and their assignments using your
  browser login. Syncs on its own when the data is stale, or on demand with
  **Sync now**. If you're logged out, it says so and changes nothing.
- **Smart scheduling.**
  - Work is placed as early as possible, never after its due date and never before it
    unlocks.
  - Anything due before 5 PM is planned for the day before.
  - Overdue work, including from earlier weeks, is scheduled today until you finish
    or dismiss it.
  - If Wednesday has passed, the rest of the week's work is scheduled as soon as
    possible and flagged **behind plan**.
- **Banners** for overdue work, "won't fit by Wednesday" (with **Add a day**), and
  items at risk of missing their due date.
- **Done tracking.** Items submitted in Canvas are done automatically. You can also
  check items off yourself; a Gmail-style message lets you **Undo** for a few seconds.
- **Time tracking.** After checking an item off, choose **Log time** to record how long
  it took and how hard it was (1-5). Items Canvas marked done can be logged from the
  Done list.
- **Stats.** How long you actually spend per class, per assignment type and per
  weekday, how your real time compares with the estimates, and **suggested estimate
  rules** from your averages that you can apply with one click.
- **Opens when you visit Canvas.** The first Canvas visit in a browser session opens
  the planner and syncs; later visits sync quietly when data is stale (can be turned
  off).
- **Time estimates you control.** Each item's estimate comes from, in order:
  1. minutes you pick on the item (a dropdown in 15-minute steps),
  2. your rules that name a class (a rule can also mark items as in-class),
  3. the instructor's stated time ("should take about 30 minutes"), scaled by how fast
     you usually work,
  4. your general rules,
  5. a default for the assignment type.
- **Estimate rules.** For example "Physics + *report* → 25 min" or "any *quiz* → S".
  Rules can match a class, an assignment type and/or a title keyword. Hover an
  estimate to see where it came from.
- **Your time, per day.** Set default minutes for each weekday, block days entirely,
  or click a day in the planner to change just that date (0 = day off).
- **Settings**, organized in tabs:
  - Week start and target day.
  - Per-day capacity.
  - Minutes per size and defaults per assignment type.
  - Estimate rules.
  - Include or rename classes.
  - Auto-sync interval.
- **Next week.** Switch to a projected plan for next week, built as if this week's
  work were done, with its own target day and per-date minutes. Pull work into this
  week one item at a time, a whole day's worth, or by amount of time (earliest due
  first). Pulled items can be sent back. By default, pulling unlocks once this week's
  own work is done, and you can keep pulling until you have 3 hours of unfinished
  pulled work (both adjustable).
- **In-class activities.** Mark an item (or a whole kind of item, by rule) as done in
  class: it shows on its class day but takes none of your homework time.
- **Pins.** Pin an item to keep it on its due date instead of letting the planner move
  it earlier.
- **14-day forecast strip** (collapsible) showing how many items and minutes are *due* each day,
  with days over your available time highlighted.
- **Dismiss and restore** overdue items you don't plan to do.
- **Export / import** of your settings and per-item changes as a JSON file (no Canvas
  content in it), plus reset and clear-all.
- **Looks.** A sidebar for navigation (a ☰ menu on narrow windows) and an overview
  column on wide screens. System, light or dark theme, six accent colors, and a color
  per class (shown as a stripe and dot beside the class name).

### Coming next
- **Polish:** better error states, a keyboard and accessibility review, and a
  permanent install (signed add-on).

## How it works

1. **Sync.** The planner page (or, when you visit Canvas, the background script) calls
   the Canvas REST API (`/api/v1/courses`, `/api/v1/courses/:id/assignments`) with
   your browser session, one class at a time, following pagination and backing off if Canvas rate-limits.
2. **Normalize and merge.** Assignments become simple items. Canvas fields are
   refreshed on every sync. Your own data (checks, minutes, dismissals) is never
   overwritten. Items that disappear from Canvas are hidden, not deleted.
3. **Plan.** A pure function packs the week:
   - Pinned and overdue items go first.
   - Everything else is sorted by due date, then largest first.
   - Each item goes on the earliest day in its window that still has room.
   - Anything that doesn't fit is reported, not silently pushed past its due date.

All day math uses local calendar dates, so daylight-saving changes can't shift an
item to the wrong day.

## Install

### Install the signed add-on
Release Firefox only installs add-ons signed by Mozilla. Canvas Planner is signed as an
**unlisted** add-on: Mozilla checks and signs it, but it isn't listed on the public
add-ons site.

1. Download the latest `.xpi` file from this repo's **Releases** page (or build one
   yourself, below).
2. In Firefox, open `about:addons`, click the gear icon, and choose
   **Install Add-on From File…**. Pick the `.xpi`.
3. Visit Canvas while logged in. The planner opens and syncs. It also replaces your
   new-tab page.

Moving from a development install? Your data lives in that profile. Use
**Settings → Data → Export** there, then **Import** in the new install.

### Sign your own build
1. Sign in at [addons.mozilla.org](https://addons.mozilla.org) and create API
   credentials at the [API keys page](https://addons.mozilla.org/developers/addon/api/key/).
2. In the repo, create `.amo.env` (gitignored, and never packaged):
   ```
   WEB_EXT_API_KEY=user:12345678:123
   WEB_EXT_API_SECRET=your-secret
   ```
3. Bump `version` in `manifest.json` and `package.json` (each signed version must be
   new), then run `npm install` once and `npm run sign`. The signed `.xpi` lands in
   `web-ext-artifacts/`.

### Development install (temporary)
1. Install [Node.js](https://nodejs.org/) and clone this repo, then `npm install`.
2. Run `npm start`. It opens a separate Firefox profile at `about:debugging`; log into
   Canvas in that window the first time.
3. Click **Load Temporary Add-on…** and choose `manifest.json`. Temporary add-ons are
   removed when Firefox closes.

## Development

```
npm test          # run all tests (Node's built-in test runner)
npm start         # open Firefox (dev profile) at about:debugging
npx web-ext lint  # check the manifest and extension files
npm run build     # package an unsigned .zip
npm run sign      # sign an unlisted .xpi (needs .amo.env)
```

- Plain JavaScript ES modules, no framework, no build step, no runtime dependencies.
- `src/planner/` is pure logic (dates, estimates, scheduling) and runs under Node, so
  the planner is fully tested without a browser.
- Tests run with `TZ=America/Denver` set in each file, so results don't depend on the
  machine's timezone.

```
manifest.json
src/planner/   pure logic: dates, estimates, scheduling
src/sync/      Canvas fetch + normalize
src/storage/   schema, defaults, migrations, merge, export/import
src/ui/        new-tab planner page, stats and settings views
src/background.js, src/content/   Canvas-visit detection (no page reading)
test/          tests
test/fixtures/ real Canvas API data (not committed)
```

Real Canvas data in `test/fixtures/` contains grades and is ignored by git. Tests that
need it skip themselves when it isn't present.

The full requirements and decision log are in [`SPEC.md`](SPEC.md).

## Changelog

### 1.0.0
First release: Canvas sync with your browser login, a weekly plan with self-assigned
target days, day tabs with class groups and counts, due-today flags, next-week
projection and pulling, per-item minutes and in-class activities, estimate rules,
time and difficulty logging with stats and rule suggestions, themes and class
colors, export/import, and auto-open when you visit Canvas.
