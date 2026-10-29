# Canvas Planner

A Firefox add-on that turns your Canvas assignments into a weekly plan. Instead of
working to the official due dates, every assignment gets an earlier target day, and
the week's work is spread across the time you actually have each day, so it's done by
Wednesday instead of piling up on Saturday.

> Works with BYU-Idaho Canvas (`byui.instructure.com`) in Firefox.

## What it does

- **Plans your week.** Each day shows what to work on, grouped by class, with how many
  items and minutes it adds up to. Today's most urgent item is marked **up next**.
- **Flags what's urgent.** Anything due today is red; anything overdue is called out
  at the top.
- **Fits your schedule.** You choose how many minutes you have each day; work that
  doesn't fit is reported, never quietly pushed past its due date.
- **Bends to your day.** Move any item to another day, start tomorrow's work early
  when you're done, and watch the "done today" count go up as you work.
- **Keeps a streak.** Two counters in the header: weeks in a row you finished
  everything by the target day, and days in a row you finished everything planned.
- **Learns your pace.** When you check something off you can log how long it took. The
  Stats page shows your real averages and suggests better time estimates.
- **Stays private.** It only reads your assignments, using your normal Canvas login.
  Nothing is sent anywhere else, and it never submits or changes anything in Canvas.

## Install

1. **Download** [canvas-planner.xpi](https://github.com/makowood/canvasplanner/releases/latest/download/canvas-planner.xpi)
   (the latest version, signed by Mozilla).
2. **Drag the downloaded file onto any Firefox window** and click **Add** when Firefox
   asks. (Or open `about:addons`, click the ⚙ gear, choose **Install Add-on From
   File…**, and pick the file.)
3. **Open Canvas** while logged in. The planner opens and pulls in your assignments.

The planner also becomes your **new tab page**, so it's one Ctrl+T away.

**Updating:** download the newest file from the same link and install it the same
way. Your settings and history are kept.

## Using it

- **Check off** an item when you finish it. A message pops up with **Undo** and **Log
  time**; logging is optional but makes your estimates better over time. Finished work
  still counts toward today, so today's list doesn't refill as you go, and the header
  shows how much you've done today.
- **The ⋮ menu** on each item lets you **move it** to today, tomorrow or another day
  before it's due, **pin** it to its due day, or **dismiss** it (restore it from
  Dismissed on the right).
- **Done for today?** A button offers to start the next item from tomorrow.
- **Exams** due this week are listed on the right (next week's on Next week). They're
  found by title; use ⋮ → **Not an exam** on anything that isn't one.
- **Click a class** in the sidebar to see everything left in it. Filter by title (e.g.
  "Teach") and set all the shown items' minutes, or mark them in class, in one go.
- **Change an estimate** with the minutes button on any item (or pick **In class** for
  things you do during class, so they don't count as homework time).
- **Pick a day** with the tabs at the top, or the **Week** tab to see everything.
- **Running out of time?** Use **+** next to "Finish by" to give yourself another day.
- **Ahead of schedule?** Open **Next week** and pull work into this week.

## Setting it up

Everything is in **Settings** (left sidebar). Changes save automatically.

| Tab | What to set |
|---|---|
| **Schedule** | Which day your week starts, your target day to finish by (Wednesday by default), and how many minutes you have each weekday. Block days you never do homework. |
| **Estimates** | Rules for how long things take, e.g. "Physics + *report* → 25 min" or "any *quiz* → 15 min". If you usually work faster than the time an instructor states, lower the stated-time scale (70% = you take 70% of it). |
| **Classes** | Hide classes you don't want planned, give them shorter names, and pick a color for each. |
| **Appearance** | Light, dark or system theme, and an accent color. |
| **Sync & behavior** | How often to refresh from Canvas, whether visiting Canvas opens the planner, and how much of next week's work you can pull in at once. |
| **Data** | Export a backup, import one (for example on a new computer), or reset. |

**Tip:** after a couple of weeks of logging times, check **Stats → Suggested estimate
rules** and click **Apply** on the ones that look right.

## For developers

Plain JavaScript, no build step, no runtime dependencies.

```
npm install        # dev tools (web-ext)
npm test           # unit tests
npm run check:ui   # click through the page in headless Firefox (needs local test data)
npm start          # open a dev Firefox profile, then Load Temporary Add-on → manifest.json
npm run build      # package for signing (web-ext-artifacts/)
```

Requirements and design decisions are in [SPEC.md](SPEC.md).

## Planned

- Your own items for things Canvas doesn't track (studying, project milestones).
- Later: Chrome support, and a grading view for TAs.

## Changelog

- **Unreleased**: Streak counters (weeks on target, days on plan) in the header and on
  Stats. Sync login errors now say what Canvas answered and list what to check, with an
  **Allow access** button if Firefox hasn't given the add-on access to Canvas.
- **1.1.0**: Today no longer refills as you check things off. New ⋮ menu on each item
  (move to a day, pin, dismiss), a "done today" count, a button to start tomorrow's work
  early, a page per class for setting many estimates at once, exams on the right, and
  Undo when deleting a rule.
- **1.0.1**: New logo. Fixed logging times, clearer "due today" vs "overdue", correct
  urgency labels on Next week.
- **1.0.0**: First release.
