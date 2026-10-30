# SPEC: Canvas Planner (v1)

## 1. Problem
Canvas shows when things are due, not how much lands on one day. One Saturday had 16
items due. This tool gives every unfinished item a self-assigned target date so this
week's work is done by a target day (default Wednesday), spread within a daily capacity
I choose, and never later than the real due date.

## 2. Scope
**In v1:** sync from Canvas, plan, done tracking, add-a-day, pull-next-week, per-item
size override and pin, 14-day due-load forecast, settings editable in a GUI,
export/import.

**Out of v1 (design so they can be added, do not build):** LLM time estimates (keep the `estimate.source` field for this), homelab or
phone sync, notifications, other Canvas sites, anything that writes to Canvas.

**Time tracking (moved into v1 as M5 on 2026-10-04):** when I check an item off, it
asks how long it actually took and how difficult it was (a slider), both optional. A
stats page shows how long I typically spend by class, by assignment type and by
weekday, and suggests estimate rules from my averages (e.g. "Physics reports: you
average 24 min over 6 logged; rule says 45") with an Apply button. Nothing changes
estimates without me applying it. Keep estimates explainable by `estimate.source`.

## 3. Canvas data
Sync uses my existing logged-in browser session. No access token (student tokens are
disabled at my school).

- `GET /api/v1/courses?enrollment_state=active&per_page=50`. Skip courses that come
  back restricted or without a name.
- `GET /api/v1/courses/:id/assignments?include[]=submission&per_page=100`. Follow the
  `Link` header (`rel="next"`) for pagination. Strip a leading `while(1);` from the
  body if present.
- Quizzes, discussions, uploads and external tools all appear in this one list.

Confirmed from real data (see `test/fixtures/`):
- Fields: `id`, `name`, `due_at` (UTC ISO), `unlock_at`, `lock_at`, `points_possible`,
  `submission_types` (array), `submission.workflow_state`, `submission.submitted_at`,
  `description` (HTML), and `html_url` (present on every assignment).
- `workflow_state` values seen: `unsubmitted`, `submitted`, `graded`, `pending_review`.
  `submission.excused: true` also occurs.
- `graded` can have `submitted_at: null` (0-point evaluations), so "done" must use
  `workflow_state`, not the timestamp.
- Types seen: `online_quiz`, `discussion_topic`, `online_upload`, `external_tool`,
  `online_text_entry`, `online_url`, `media_recording`, `none`, `on_paper`.
  `submission_types` is often a multi-type array (e.g. `online_text_entry` +
  `online_upload`).
- Some assignments have no `due_at` (26 of 426 in the fixture).
- `none` and `on_paper` items can't be submitted online; they only become done when
  graded.
- Points are useless for sizing: readings and weekly reports are all 100.
- Due times are not always end-of-day (some 11:30 PM, some 5:00 PM local).
- Weekly evaluations have `unlock_at` (opens Monday) and can't be done early.
- Titles have stray whitespace (e.g. `Report:  Transcript`). Collapse it for display.

Sync behavior:
- Fetch courses sequentially with a short delay. Back off on HTTP 429.
- If a response is not JSON (login page) or is 401/403, show "Log into Canvas, then
  sync" and change nothing. Never scrape the login page.
- If one course fails, keep its existing items untouched and report the error.

## 4. Data model and storage
Everything in `browser.storage.local`, with a `schemaVersion` and a migration function.
Keys: `settings`, `items` (map by Canvas assignment id), `meta` (`lastSyncAt`,
`lastError`), `weekState` (keyed by week start date: `{ extraDays, capacity }`, where `capacity`
maps a date to that day's minutes and overrides the weekday default; weeks older than
8 weeks are pruned), `courses`
(map by course id: `{ name }`, Canvas names from the last sync), `dayLog` (keyed by date:
`{ left: [item ids] }`, the homework still planned for that day the last time the page
drew it; kept about 13 months; exported with settings).

Derived item fields set by sync: `canvasDone`, `nonSubmittable`, `prevDueAt`, `hidden`.

Item, Canvas-owned fields (overwritten on every sync): `id`, `courseId`, `title`,
`type`, `dueAt`, `unlockAt`, `lockAt`, `points`, `canvasStatus`, `submittedAt`,
`descriptionText` (plain text, truncated), `url`.

Item, user-owned fields (sync never touches these): `manualDone`, `minutesOverride`,
`pinned`, `dismissed`, `pulledIn`, `inClass`, `log`, `doneOn` (local date you checked it
off), `plannedOn` (local date you moved it to), `notExam`. Added 2026-10-06 with defaults of null,
so no migration is needed.

Merge rules:
- Match on Canvas `id`. Never create duplicates.
- `done = manualDone || canvasDone`, where canvasDone means `workflow_state` is
  `submitted`, `graded`, or `pending_review`, or `submission.excused` is true.
  Canvas-done items can't be un-checked. Manually-done items can.
- If `dueAt` changes, keep `prevDueAt` and show a "due date changed" chip.
- If an item disappears from a successful fetch of its course, hide it (don't delete).

## 5. Estimates
Each item gets `estimate: { minutes, source }`. Resolution order, highest wins:
1. `minutesOverride` (exact minutes picked on the item), source `manual`
2. First matching estimate rule that names a course, source `rule`
3. Minutes the instructor states in the description (e.g. "should take about 15
   minutes"), times the stated-time scale, source `stated`. Use a conservative regex
   and test against fixtures.
4. First matching estimate rule with no course (keyword is a case-insensitive title
   substring; list order), source `rule`
5. Type default, source `type`
6. Global default size M, source `default`

In-class activities (decided 2026-10-04): an item can be marked "in class" (item-level
`inClass`, or an estimate rule whose value is "in class"). It takes no homework time:
0 minutes, placed on its class day (its local due date, without the before-5-PM shift),
not counted in the forecast, never pulled, and it doesn't keep the pull gate closed.
Past in-class items drop off instead of becoming overdue. An item's own minutes
override beats an in-class rule.

Type resolution: an item's type is the first match in `submission_types`, checked in
this order: quiz (`online_quiz`), discussion (`discussion_topic`), upload
(`online_upload`, `online_text_entry`, `online_url`, `media_recording`), external tool
(`external_tool`). Anything else (including `none`, `on_paper`) is other.

## 6. Planner (pure function)
`plan({ items, settings, weekState, now })` returns everything the UI needs: the days
with their items and minutes, `overdue`, `overflow`, `atRisk`, the pull-next-week
candidates, and the forecast.

Definitions:
- `today` = local date of `now`. Planning week starts on the most recent
  `weekStartDay` on or before today. `cutoff` = first `targetDay` on or after week
  start, plus that week's `extraDays`.
- `dueDate` = local date of `dueAt`, minus one day if the local due time is before
  17:00 (a 9 AM item must be finished the day before).
- In scope: not done, not dismissed, course included, has a `dueAt`, not excluded by
  the non-submittable setting, and (due date is within the planning week, OR before
  the planning week (carried-over overdue), OR `pulledIn`).
- No due date: never scheduled, never pulled, never in the forecast. Returned as
  `noDueDate` and shown in a small list.
- Overdue: in scope, due date before today, including earlier weeks. Scheduled
  first, on today, flagged, until done or dismissed (each has a Dismiss action).

Algorithm:
1. Each item's eligible window: from `max(today, local date of unlockAt)` to
   `min(dueDate, cutoff)`. If the unlock date is after the cutoff, the window is
   unlock date through due date. Blocked weekdays are removed from the window.
2. Work finished today (done day = `doneOn`, else the local date of a Canvas
   `submittedAt`) counts toward today's load at its estimate, so checking items off
   never pulls later work into today. (Decided 2026-10-06.)
3. Moved items are placed on their `plannedOn` day, which counts toward the day's
   load even past capacity. A move is ignored (normal planning resumes) once that day
   is in the past, after the item's last work day, or before it unlocks. Then pinned
   items are placed on their due date, same rule.
4. Sort the rest by due date ascending, then minutes descending, then title.
5. Place each on the earliest eligible day where `load + minutes <= capacity`. A day
   with nothing on it accepts any item, even one larger than the capacity (flag the
   day as over capacity).
6. No eligible day has room: put it in `overflow`. The UI shows a banner ("N items,
   X min won't fit by Wednesday") with an Add a day button.
7. If `today > cutoff` (Wednesday has passed): use `dueDate` as the window end instead
   of the cutoff, schedule as soon as possible, and flag every remaining item
   `behind`. Items that still can't fit before their due date go in `atRisk`.

Add a day: increments `extraDays` for this week (the cutoff moves to Thursday, then
Friday). Also offer Remove a day. Cannot pass the end of the planning week.

Pull next week:
- Gate (decided 2026-10-04): this week's own work (not counting pulled items or
  in-class items) must be done, unless `gatePullOnCompletion` is off. Then pulling
  continues while unfinished pulled work is under `pullCapMinutes` (default 180).
  Every pull, single or bulk, must fit in the room left, except that one item may
  exceed it when nothing is pulled yet (so a big item is never stuck).
- Modes: next day's worth (all undone items due on the earliest upcoming day after this
  week) or by size (choose XS/S/M/L; earliest-due first, ties smallest first).
- Pulled items set `pulledIn` and are planned by the same algorithm. Each has a "send
  back" action. Items that aren't unlocked yet are listed as "not open yet".

Exams (decided 2026-10-06): unfinished items whose title contains "exam" or
"midterm", or a quiz with "final" in the title, due from today through the end of the
week, earliest first. A user field `notExam` removes a false match. Shown in the right
column ("Exams this week", and "Exams next week" on the Next week view), hidden when
there are none.

Done today: count of homework items finished today and their minutes (logged time if
any, else the estimate), shown in the header.

Streaks (decided 2026-10-24): two counters side by side in the This week header, with
current and best on Stats. Neither needs a setting. Homework means not in-class, not
dismissed or hidden, class included.
- Weeks on target, computed from items: a week's homework is what's due in it. Each item
  must be done by that week's target day plus added days, or by its due day if it opens
  after that. A week is a miss once anything is late or still undone past its deadline,
  a hit when all are done in time, pending otherwise (doesn't break the streak). Weeks
  with no homework are skipped. A done item with no known finish day counts as on time.
- Days on plan, from `dayLog`: a past day is a hit if every item left on it was done by
  the end of that day (done day as in section 6, so a Canvas submission made with the
  page closed counts) and something was planned or finished; a miss otherwise. Days
  with nothing planned or done, and days never recorded, are skipped. Today counts only
  once it's a hit. Moving or dismissing an item takes it off a day.

Forecast: for the next 14 days, minutes and count of undone items *due* each day,
independent of the plan. Highlight days over that weekday's capacity.

## 7. UI (new-tab page, plain HTML/CSS/JS)
- Header: last sync time or error, Sync now, week label, target-day control with the
  add-a-day buttons, gear for settings.
- Banners: overflow, behind plan, overdue.
- One section per day from today through the cutoff. Each shows a load bar (minutes over
  capacity) and its items: checkbox, title, course, due time, size chip (click to
  change), pin toggle. Clicking a title opens the Canvas page in a new tab with
  `rel="noopener"`.
- Forecast strip, Pull next week menu, collapsible Done section.
- Item menu (⋮, decided 2026-10-06) on every planned item: Move to (today, tomorrow
  or another day in the item's window this week; "Let the planner decide" clears it),
  Pin to due day, Not an exam / It's an exam (only on titles that look like exams),
  Dismiss (any item, with Undo; restored from the Dismissed panel).
  Moved and pinned items show a chip. When today's homework is all done and later days
  have work, today shows a button to start the next open item from the next day
  (moves it to today).
- Checking an item off shows a toast (about 10 s, paused while hovered or focused)
  with Undo and Log time. Undo restores the item exactly. (Decided 2026-10-04.)
- Layout (revised 2026-10-04): one layout. Day tabs (each with item count, load bar and
  minutes; arrow keys switch) plus a Week tab showing every day; opens on today. Each
  day groups items by class (class header with count and minutes; planned order inside
  a class); today's most urgent homework item is marked "up next". The header shows
  today's count and minutes and the target day with -/+. Pull controls sit in the
  right column on Next week.
- App shell (decided 2026-10-04): left sidebar with navigation, a class color key and
  sync status (collapses behind a menu button under 820px); main column with header
  and today's count; right column on wide
  screens with the forecast, No due date and Dismissed. Theme (system/light/dark),
  six accents, and per-class colors (auto by course id, or picked); color is never the
  only cue (class name always shown).
- Views: This week, Next week, Stats, Settings (tabs: Schedule, Estimates, Classes,
  Sync & behavior, Appearance, Data), addressed by URL hash.
- Class view (decided 2026-10-06, `#class/<id>`, opened from the sidebar's class list):
  every unfinished item of that class, grouped Overdue / This week / Next week / Later /
  No due date, with a title and type filter and "Set all shown to" (auto, in class, or
  minutes) with Undo.
- Respects `prefers-color-scheme`. Keyboard-reachable controls.
- Auto-sync when the page opens if data is older than the `autoSyncMinutes` setting.

## 8. Settings (editable in a GUI)
A Settings view in the planner page (gear). `options_ui` opens the same page in a tab.
All values live in `settings` with a single `defaults.js`. The placeholder defaults
below are guesses, not measurements: I'll edit them.

| Setting | Default |
|---|---|
| Week starts on | Monday |
| Target day | Wednesday |
| Daily capacity, minutes per weekday (with a "set all" control) | 120 each |
| Blocked weekdays (never scheduled) | none |
| Minutes per size: XS / S / M / L | 5 / 20 / 45 / 120 |
| Type defaults: quiz / discussion / upload / external tool / other | S / M / M / XS / M |
| Estimate rules (add, delete, reorder), see below | report, essay, paper, project, exam, midterm, final: L. evaluation, feedback, survey: XS. quiz, reading: S |
| Stated-time scale (instructor-stated minutes x this %) | 100% |
| Per-course: include toggle, display name | all included, Canvas name |
| Auto-sync interval, minutes | 60 (min 15) |
| Gate pull-next-week on completion | on |
| Most unfinished pulled work allowed (minutes) | 180 |
| Forecast strip open (remembered from the strip's toggle) | on |
| Include non-submittable items (`none`, `on_paper`) | on |

Estimate rules replace plain title keyword rules. Each rule has an optional course,
an optional type and an optional title keyword (at least one), and gives either a size
or exact minutes. First matching rule in list order wins, so specific rules go above
general ones (e.g. "Course A + report: 25 min" above "report: L").

Also: Export (one JSON file of settings and user-owned data), Import (validate the
schema, confirm before replacing), Reset to defaults, Clear all data. Validate and
clamp every value, and fall back to the last valid setting on bad input.

## 9. Extension architecture
- Firefox and Chrome, Manifest V3, one codebase and one manifest (Chrome decided
  2026-10-30, see M13). M0: Firefox 156 supports everything needed; background runs as
  an event page, host permissions are granted at install. Chrome runs the same
  background file as a service worker (`background.service_worker`; Firefox ignores
  that key, which is `web-ext lint`'s one expected warning). `src/browser.js` sets
  `browser` to `chrome` where it's missing and loads first in every page and script.
  Icons are PNG (Chrome can't use SVG). Help text that names browser menus checks
  the browser (`IS_FIREFOX` in `src/ui/app.js`).
- New tab override (`chrome_url_overrides.newtab`) hosts the planner page.
- Permissions per CLAUDE.md. The Canvas host is hardcoded in the manifest.
- Canvas visit (decided 2026-10-04): a content script on Canvas pages (not login
  pages) only messages the background script; it reads nothing from the page. The
  first visit per browser session opens the planner with `?sync=1` (setting
  `openOnCanvasVisit`, default on); later visits sync in the background when data is
  stale. No extra permissions: the host permission covers the content script and
  `tabs.create` needs none.
- Sync entry point: background script, `fetch` with `credentials: 'include'`. Confirmed
  in M0 (2026-09-29): 200 JSON, all 9 courses, no content script needed.

## 10. Milestones
Each one ends with `npm test` passing, a commit, and a short walkthrough.

- **M0. Spike, no UI.** Also create `package.json` and `.gitignore`. Prove in Firefox
  that the session-based fetch works. Try a background script with host permission and
  `credentials: 'include'` first. If cookies aren't sent, try a content script on a
  Canvas tab that forwards the data. Output goes to the console. Report which approach
  works before building on it.
- **M1. Normalize + planner core.** Pure code and tests against the fixtures. Scenarios:
  1. Sixteen items due one Saturday get spread within capacity by Wednesday.
  2. Overflow appears, then Add a day resolves it.
  3. Wednesday passed: remaining items are flagged behind and scheduled ASAP.
  4. A locked item (weekly evaluation) is never scheduled before its unlock date.
  5. `graded` with a null `submitted_at` counts as done.
  6. Date math across the DST change on 1 Nov 2026 (the last evaluation is due that
     night).
  7. Blocked weekday, oversized item, pinned item.
  8. Pull next week (by day, by size).
  9. Sync merge keeps `manualDone`, size override and pin, and flags a moved due date.
  10. Stray whitespace in titles is collapsed.
- **M2. Extension shell.** Manifest, sync, storage merge, new-tab page that shows the
  plan and the done checkboxes. Prototype extras: banners, add/remove a day, dismiss
  for overdue items. `web-ext lint` clean. Sync runs from the new-tab page (extension
  pages have the same host permission as the background script).
- **M3. Settings GUI.** Everything in section 8 (including estimate rules by course,
  type and keyword, and the stated-time scale), plus export/import. Also (moved up from
  M4 on 2026-10-04): the per-item minutes chip (a dropdown of minutes: 5, 10, then
15-minute steps; changed from XS/S/M/L sizes on 2026-10-04, schema v3), and a per-date capacity override edited on each day
  in the planner (0 = day off, reset returns to the weekday default).
- **M4. Interactions.** Pull next week, pin, forecast strip. (Add/remove a day and
  banners were done in M2; size chip in M3.) Plus a **Next week** view (decided
  2026-10-04): tabs This week / Next week. Next week shows a projected plan, planned the
  same way as if it were next week's first day and this week's work were done (items
  due this week or earlier are left out), with next week's own target day, added days
  and per-date capacity. Each item there has a "Pull to this week" action, and the
  bulk pull controls (next day's worth, by amount) live there too. Follow-ups
  (2026-10-04): in-class activities, the pull cap, a collapsible forecast strip, and
  a Dismissed panel with Restore.
- **M5. Time tracking and stats.** Check-off prompt for time taken and difficulty
  (both optional), a stats page (by class, type, weekday), and rule suggestions with
  Apply. Decided 2026-10-04: Canvas-done items get a "Log time" button in the Done
  panel (with a "N need a time" count), never a pop-up; weekday stats use the day the
  item was finished/logged; difficulty is a 1-5 slider; a rule is suggested once a
  group has 3+ logs and its average differs from the current estimate by 5+ min.
- **M6. Polish.** Done 2026-10-04: plain-language sync errors, first-run welcome,
  skip link, contrast-checked accents, due-today/tomorrow flags (by real due date,
  no reordering), version 1.0.0, `npm run sign` (unlisted; credentials in a gitignored
  `.amo.env` that is never packaged). `src/ui/planner.js` split into app/shell/
  week/items modules, verified with a headless-Firefox click-through
  (`npm run check:ui`) before and after. Original scope: Error states, dark mode, keyboard access, and instructions for
  installing long-term (signing as an unlisted add-on, or running a Firefox build that
  allows unsigned add-ons).

## 11. Decisions, assumptions, open questions
**Decided with me:** plan only the current week; pull next week is a manual button;
done means submitted or graded; leftover work after Wednesday is scheduled ASAP and
flagged "behind plan"; LLM estimates come later; the
extension replaces the calendar-feed idea because the session API works.

Decided 2026-09-29 after reviewing the fixture: multi-type resolution order (section 5);
items with no due date are listed but never scheduled; non-submittable items are
planned by default with a setting to exclude them; due before 17:00 means the target
is the previous day.

**Assumptions. Verify or ask before relying on them:**
- `pending_review` and `excused` count as done (both states confirmed to occur).
- Week starts Monday; capacity is the same for every weekday by default.

Decided 2026-09-30: overdue items from earlier weeks carry over until done or
dismissed; estimates become editable per course, type and keyword (M3); time tracking
is the planned direction after v1.

Decided 2026-10-04: course-specific estimate rules beat instructor-stated times;
general rules don't (section 5).

Decided 2026-10-29: an item belongs to the week of its **work deadline** (the due day,
or the day before if due before 17:00), always on. So Monday-morning work is planned
the week before, by its target day; Monday-night work stays next week's. Streaks keep
using the due date (so past weeks aren't recounted). A separate "Due next" panel was
dropped as redundant with this rule and the forecast strip.

Decided 2026-10-29 (1.3.0): any school's Canvas at a `*.instructure.com` address. The
user enters it on the welcome card (or a Canvas visit offers it); stored as `canvas.host`,
separate from settings. Stores from before 1.3 that already hold data are BYU-Idaho.
Host permission and content script cover `https://*.instructure.com/*`, but requests
and the Canvas-visit signal only use the saved school (access is checked and requested
for that school only). Changing schools clears everything tied to the old school's
classes: items, classes, per-class names/colors/rules, and your tasks and repeating
tasks; general settings, themes and history stay. A sync that finishes after a switch is
discarded, and an export from another school is refused on import. Instructure's own
sites (community, status, …) are never taken for a school. Schools on their own domains
are not supported (they would need optional permissions and `scripting`).

**Open questions:** none.

Decided 2026-09-30: pull-by-size orders by due date,
then smallest first; the forecast includes not-yet-unlocked items.

## 12. Next versions (decided 2026-10-29)
Two releases. **Next update:** M7–M9. **The one after:** M10–M12. Then Chrome support (M13).

- **M7. Settings redesign.** Keep tabs, restyle and rename:
  - **Week** (was Schedule): week start; one card per weekday with an hours slider
    (0–8 h, 15-minute steps, shown as "1h 30m"; longer days by typing), a labeled
    "Day off" checkbox that greys the card, and a "Finish by" choice on the card that
    highlights the target day.
  - **Rules** (was Estimates): a class picker at the top ("All classes" first). A class
    shows a card edged in its color with that class's rules; All classes also shows
    the type defaults. A class's own rules always beat All-classes rules (already how
    estimates worked); order matters only within a group.
  - **Sizes removed.** Rules and type defaults pick a time from presets (5m, 10m, 15m,
    20m, 30m, 45m, 1h, 1.5h, 2h, 3h, or custom); existing sizes convert to minutes.
    Pull-by-amount uses fixed amounts instead of sizes.
  - **Classes:** name on the left, color on the right.
  - **Appearance:** unchanged until M10.
  - **General** (was Sync & behavior). **Data:** Reset and Clear in a red danger zone
    with confirmations.
  - Each tab ends with a collapsed **Advanced** section: Rules: stated-time scale.
    General: auto-sync interval, pull gate, pull limit.
- **M8. Toolbar button.** Minimal popup: today's items with checkboxes and a link to
  open the planner. Badge shows the count of today's remaining items. No new
  permissions.
- **M9. Your own tasks and splitting.** Tasks always belong to a class (no general
  tasks or separate categories, to avoid becoming a calendar app). "+ Add task" on the
  main page: class, title and time estimate required; due date and notes optional. No
  due date: the task floats into free time this week; with one, it is planned like a
  Canvas item; either way it can be pinned to a day with the item menu. Repeating
  tasks on chosen weekdays use the normal daily hours. Tasks count everywhere Canvas
  items do (hours, streaks, stats, days ahead), show a small "task" tag, open an edit
  form instead of Canvas, and are kept in history, export/import and the calendar
  export. **Splitting** works on any item: "Split across days" in the item menu breaks
  it into chunks the planner spreads before the due date.
- **M10. Themes.** Preset themes and color combinations plus a full color picker
  (accent and background tint, with a contrast warning); 4–5 more accents. Seasonal
  themes Fall and Christmas, each with light and dark versions, offered by a banner
  when the season starts (Yes / Not now / Don't ask again), never switched
  automatically. Holiday days (Halloween, Thanksgiving, Christmas Day, 4th of July):
  one opt-in setting, asked once; the look applies that day only. Decorations: colors,
  a small icon by the logo (Fall: a pumpkin through Oct 31, then a leaf), themed load
  bars, a light background pattern, and falling snow (Christmas) and occasional
  falling leaves (Fall), behind the panels, with an Effects slider (Off / Light /
  Normal / Lots); CSS and small inline SVGs only, off under `prefers-reduced-motion`.
  Preset scenes (decided 2026-10-29): Ocean a horizon, Sunset a gradient, Forest a
  thick leaf pattern, Lavender sprigs, Patriotic (also the 4th of July look) faint red,
  white and blue stars. Load bars (revised 2026-10-29): neutral grey track, planned time
  in a tint of the accent, finished time in solid accent; over capacity the whole bar is
  red, overriding any theme. Seasonal and holiday looks (Fall, Christmas, Patriotic,
  Halloween, Thanksgiving) draw the finished part as their pattern; red-accent themes
  tint planned time in their other color so red only means over capacity. Holiday looks are a surprise: Settings only
  says "a surprise on a few special days"; on the day a tilted splash line sits under
  the logo. `?preview=july4` (or christmasday, halloween, thanksgiving) on the
  planner page shows a holiday look without saving anything, for testing. Class colors stay as
  set, with an Appearance > Advanced option to recolor them to the theme.
- **M11. Walkthrough, what's new, celebrations.** After the first successful sync,
  pop-ups pointing at the real page: day tabs, up next, check off and log time, the
  item menu, Finish by −/+, pulling next week, the forecast, sidebar classes and
  sync, Settings. Replay from General. After an update, a dismissible "What's new"
  card at the top, shown once per version. "You're N days ahead": N = how many days
  after today have all their planned work done (today must be done too). Built
  2026-10-29: an `onboarding` record ({ seenVersion, toured }) decides tour vs What's
  new on the first load of a version (already synced = existing user: What's new, no
  tour). The "days ahead" cheer joins the open toast (keeping its Undo) or gets its own,
  and a line shows in the header; one General toggle turns cheers and the late-night
  note off. Late-night
  message: between midnight and 4 AM, the page and the toolbar popup gently say that
  anything due today is already as late as it's going to be, so go to bed (no
  notifications, no new permissions).
- **M12. Calendar export.** Download an `.ics` file: one all-day event per item on its
  target day, with the due date in the description. One-time download (no live feed).
- **M13. Chrome support** (decided 2026-10-30). Spike done 2026-10-30: Chromium 156
  loads the extension, and the service worker syncs with the browser's Canvas login.
  No new permissions. Shim, both background entries and PNG icons as in section 9;
  help text and the bug-report line name the right browser. A service worker stops
  when idle, so in-memory background state (the `syncing` flag) can reset: acceptable,
  worst case one extra sync. Chrome caps `storage.local` at 10 MB; a semester of real
  data is about 310 KB, so no `unlimitedStorage`. Testing: `check:ui` stays on Firefox;
  before each release also Load unpacked in Chromium and check sync, popup, badge and
  the Canvas-visit open. Distribution (decided 2026-10-30): from 1.4.0, listed on
  addons.mozilla.org so Firefox auto-updates it, and on the Chrome Web Store (unlisted
  or public, chosen at submission), the same zip for both. Listing text and the
  checklist are in `STORE.md`, the policy in `PRIVACY.md`; `npm run shots:store`
  makes store screenshots from made-up classes.
