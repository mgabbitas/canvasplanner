# Canvas Planner

A Firefox extension that turns your Canvas assignments into a realistic weekly plan.
It gives every unfinished assignment a self-assigned target day, spreads the work
across the week within the time you actually have each day, and aims to finish the
week's work early (by Wednesday, by default) instead of on the official due date.

Canvas tells you *when* things are due. It doesn't tell you that 16 of them land on
the same Saturday. Canvas Planner does, and spreads them out before that happens.

> **Status:** early, personal project, under active development. It currently works
> with one Canvas site (`byui.instructure.com`) and in Firefox only.

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
  time you have.
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
  check items off yourself and uncheck them later.
- **Time estimates you control.** Each item's estimate comes from, in order:
  1. minutes you pick on the item (a dropdown in 15-minute steps),
  2. your rules that name a class,
  3. the instructor's stated time ("should take about 30 minutes"), scaled by how fast
     you usually work,
  4. your general rules,
  5. a default for the assignment type.
- **Estimate rules.** For example "Physics + *report* → 25 min" or "any *quiz* → S".
  Rules can match a class, an assignment type and/or a title keyword. Hover an
  estimate to see where it came from.
- **Your time, per day.** Set default minutes for each weekday, block days entirely,
  or click a day in the planner to change just that date (0 = day off).
- **Settings page.**
  - Week start and target day.
  - Per-day capacity.
  - Minutes per size and defaults per assignment type.
  - Estimate rules.
  - Include or rename classes.
  - Auto-sync interval.
- **Export / import** of your settings and per-item changes as a JSON file (no Canvas
  content in it), plus reset and clear-all.
- Light and dark mode follow your system setting.

### Coming next
- **Next week:** view next week's projected plan and pull work into this week (by
  day's worth, by amount of time, or item by item).
- **Pins** to keep an item on its due date, and a **14-day forecast strip** showing
  how much is due each day.
- **Polish:** better error states, keyboard access review, and a permanent install.

### Later
- **Time tracking.** When you check an item off, log how long it took and how hard it
  was. The planner then learns your real averages by class, type and keyword (for
  example "reports in this class take you about 25 minutes") and uses them as
  estimates.

## How it works

1. **Sync.** The new-tab page calls the Canvas REST API
   (`/api/v1/courses`, `/api/v1/courses/:id/assignments`) with your browser session,
   one class at a time, following pagination and backing off if Canvas rate-limits.
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

### Right now (development install)
Firefox only allows permanently installing signed add-ons, so for now the extension
is loaded temporarily and needs reloading after Firefox restarts.

1. Install [Node.js](https://nodejs.org/) (for the dev scripts) and clone this repo.
2. In the repo, run `npm install`.
3. Start a Firefox window with a separate, persistent profile:
   ```
   npm start
   ```
   This opens `about:debugging`. The first time, log into Canvas in that window; the
   profile remembers the login.
4. Click **Load Temporary Add-on…** and choose `manifest.json` in the repo.
5. Open a new tab.

### Permanent install
*Coming in a later milestone:* signing the extension as an unlisted add-on so it can
be installed normally.

## Development

```
npm test          # run all tests (Node's built-in test runner)
npm start         # open Firefox (dev profile) at about:debugging
npx web-ext lint  # check the manifest and extension files
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
src/ui/        new-tab planner page + settings view
test/          tests
test/fixtures/ real Canvas API data (not committed)
```

Real Canvas data in `test/fixtures/` contains grades and is ignored by git. Tests that
need it skip themselves when it isn't present.

The full requirements and decision log are in [`SPEC.md`](SPEC.md).
