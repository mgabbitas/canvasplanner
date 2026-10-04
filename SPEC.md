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

**Out of v1 (design so they can be added, do not build):** time logging, difficulty
ratings, LLM time estimates (keep the `estimate.source` field for this), homelab or
phone sync, notifications, other Canvas sites, anything that writes to Canvas.

**Planned direction (after v1):** time tracking. I log how long each assignment
actually took, and the tool learns averages by course, type and keyword (e.g. "Course
A reports take 25 min on average") and uses them as estimates. Keep estimates
explainable by `estimate.source` and keep course, type and title on every item so
logged times can be grouped later.

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
`lastError`), `weekState` (keyed by week start date: `{ extraDays }`), `courses`
(map by course id: `{ name }`, Canvas names from the last sync).

Derived item fields set by sync: `canvasDone`, `nonSubmittable`, `prevDueAt`, `hidden`.

Item, Canvas-owned fields (overwritten on every sync): `id`, `courseId`, `title`,
`type`, `dueAt`, `unlockAt`, `lockAt`, `points`, `canvasStatus`, `submittedAt`,
`descriptionText` (plain text, truncated), `url`.

Item, user-owned fields (sync never touches these): `manualDone`, `sizeOverride`,
`pinned`, `dismissed`, `pulledIn`.

Merge rules:
- Match on Canvas `id`. Never create duplicates.
- `done = manualDone || canvasDone`, where canvasDone means `workflow_state` is
  `submitted`, `graded`, or `pending_review`, or `submission.excused` is true.
  Canvas-done items can't be un-checked. Manually-done items can.
- If `dueAt` changes, keep `prevDueAt` and show a "due date changed" chip.
- If an item disappears from a successful fetch of its course, hide it (don't delete).

## 5. Estimates
Each item gets `estimate: { minutes, source }`. Resolution order, highest wins:
1. `sizeOverride` (XS/S/M/L, mapped through the size to minutes setting), source `manual`
2. First matching estimate rule that names a course, source `rule`
3. Minutes the instructor states in the description (e.g. "should take about 15
   minutes"), times the stated-time scale, source `stated`. Use a conservative regex
   and test against fixtures.
4. First matching estimate rule with no course (keyword is a case-insensitive title
   substring; list order), source `rule`
5. Type default, source `type`
6. Global default size M, source `default`

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
2. Pinned items are placed on their due date, and that counts toward the day's load.
3. Sort the rest by due date ascending, then minutes descending, then title.
4. Place each on the earliest eligible day where `load + minutes <= capacity`. A day
   with nothing on it accepts any item, even one larger than the capacity (flag the
   day as over capacity).
5. No eligible day has room: put it in `overflow`. The UI shows a banner ("N items,
   X min won't fit by Wednesday") with an Add a day button.
6. If `today > cutoff` (Wednesday has passed): use `dueDate` as the window end instead
   of the cutoff, schedule as soon as possible, and flag every remaining item
   `behind`. Items that still can't fit before their due date go in `atRisk`.

Add a day: increments `extraDays` for this week (the cutoff moves to Thursday, then
Friday). Also offer Remove a day. Cannot pass the end of the planning week.

Pull next week:
- Enabled only when nothing is left undone in the current week, unless the
  `gatePullOnCompletion` setting is off.
- Modes: next day's worth (all undone items due on the earliest upcoming day after this
  week) or by size (choose XS/S/M/L; earliest-due first, ties smallest first).
- Pulled items set `pulledIn` and are planned by the same algorithm. Each has a "send
  back" action. Items that aren't unlocked yet are listed as "not open yet".

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
| Include non-submittable items (`none`, `on_paper`) | on |

Estimate rules replace plain title keyword rules. Each rule has an optional course,
an optional type and an optional title keyword (at least one), and gives either a size
or exact minutes. First matching rule in list order wins, so specific rules go above
general ones (e.g. "Course A + report: 25 min" above "report: L").

Also: Export (one JSON file of settings and user-owned data), Import (validate the
schema, confirm before replacing), Reset to defaults, Clear all data. Validate and
clamp every value, and fall back to the last valid setting on bad input.

## 9. Extension architecture
- Firefox only, Manifest V3 (M0: Firefox 156 supports everything needed; background
  runs as an event page, host permissions are granted at install).
- New tab override (`chrome_url_overrides.newtab`) hosts the planner page.
- Permissions per CLAUDE.md. The Canvas host is hardcoded in the manifest.
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
  type and keyword, and the stated-time scale), plus export/import.
- **M4. Interactions.** Add/remove a day, pull next week, size chip, pin, forecast
  strip, banners.
- **M5. Polish.** Error states, dark mode, keyboard access, and instructions for
  installing long-term (signing as an unlisted add-on, or running a Firefox build that
  allows unsigned add-ons).

## 11. Decisions, assumptions, open questions
**Decided with me:** plan only the current week; pull next week is a manual button;
done means submitted or graded; leftover work after Wednesday is scheduled ASAP and
flagged "behind plan"; time logging, difficulty and LLM estimates come later; the
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

**Open questions:** none.

Decided 2026-09-30: pull-by-size orders by due date,
then smallest first; the forecast includes not-yet-unlocked items.
