# Listing Canvas Planner (1.4.0)

Your checklist for putting 1.4.0 on addons.mozilla.org (listed, so Firefox
auto-updates it) and the Chrome Web Store. Everything to paste is further down.

## Before you start

- [ ] **Pick a license.** AMO asks for one. The repo has none, which means "all rights
  reserved". MIT is the common choice for small open projects; "All Rights Reserved"
  is also an option on AMO. Tell Claude if you want a `LICENSE` file added.
- [ ] **The name.** "Canvas" is Instructure's trademark. Stores sometimes push back on
  names that sound official. The listing says "not affiliated with Instructure",
  which is usually enough. If a reviewer objects, rename to "Planner for Canvas" (only
  the name changes; the add-on ID stays the same).
- [ ] **Build:** `npm run build` makes `web-ext-artifacts/canvas_planner-1.4.0.zip`
  (already built and checked). `npm run shots:store` remakes the screenshots in
  `web-ext-artifacts/store/` (made-up classes, no real data).

## Firefox: addons.mozilla.org (listed)

1. [ ] Developer Hub → My Add-ons → Canvas Planner → **Upload New Version**.
2. [ ] Choose **On this site** (not "On your own"). Upload the 1.4.0 zip.
3. [ ] Source code question: **No** (nothing is minified or bundled).
4. [ ] Fill in the listing from "Listing text" below: name, summary, description,
   categories, support site, homepage, privacy policy (paste the policy text, or
   link it), license.
5. [ ] Upload the 6 screenshots `1-…` to `6-…` from `web-ext-artifacts/store/`.
6. [ ] Notes to reviewer: paste "Notes for reviewers" below.
7. [ ] Submit. It's automatically signed, then may get a human review later.
8. [ ] **Once it's public:** send Claude the AMO page URL. Claude will switch the
   README's install link to it, and add an "Add to Firefox" note for friends.

Your friends' installs (same add-on ID) should pick up 1.4.0 on Firefox's next update
check (about once a day), or right away with about:addons → ⚙ → Check for Updates.
Ask one of them to check after it's approved.

## Chrome Web Store

1. [ ] Developer Dashboard → **New item** → upload the same 1.4.0 zip.
2. [ ] **Store listing** tab: description (below), category **Education** (or
   Productivity → Workflow & Planning), language English, the 128px icon
   `icons/logo-128.png`, screenshots `1-…` to `6-…`, small promo tile
   `promo-tile-440x280.png`. Homepage and support URLs below.
3. [ ] **Privacy** tab:
   - Single purpose: paste "Single purpose" below.
   - Permission justifications: paste each one below.
   - Remote code: **No, I am not using remote code.**
   - Data usage: the extension keeps assignment info in your browser and never sends
     it to you or anyone. The closest box is **Website content** (it reads assignment
     titles and descriptions from Canvas). Tick it, then tick all three
     certifications (not sold, not used for unrelated purposes, not used for credit).
     If Google's wording says local-only data doesn't count as "collected", leave every
     box unticked instead. Either way, the policy says the same thing.
   - Privacy policy URL: below.
4. [ ] **Distribution:** Unlisted (only people with the link) or Public. You can
   switch later without a new upload.
5. [ ] Submit for review. First reviews can take a few days. Broad host access
   (`*.instructure.com`) sometimes means a longer review; the justification covers it.
6. [ ] **Once it's live:** send Claude the store URL for the README.

## Each release from now on

Same zip to both stores. AMO: Upload New Version (listed). Chrome: Package → Upload
new package, then Submit for review. Keep the GitHub Release with the `.xpi` for
anyone who installed by hand, until everyone's on a store version.

---

## Listing text

**Name:** Canvas Planner

**Summary** (AMO, 250 characters max):
> Turns your Canvas assignments into a weekly plan with earlier target days, so
> homework is done by Wednesday instead of the night it's due. Read-only, private,
> works with any school's Canvas. Not affiliated with Instructure.

**Short description** (Chrome takes this from the manifest, already set):
> Plans self-assigned target dates for your Canvas assignments, so work gets done early.

**Description** (both stores):

> Canvas Planner turns your Canvas assignments into a weekly plan. Instead of working
> to the official due dates, every assignment gets an earlier target day, and the
> week's work is spread across the time you actually have each day, so it's done by
> Wednesday instead of piling up on the weekend.
>
> What it does:
> • Plans your week: each day shows what to work on, grouped by class, with how long
>   it should take. Today's most urgent item is marked "up next".
> • Fits your schedule: set how much homework time you have each day and which day you
>   want to be done by. Work that doesn't fit is called out, never quietly pushed past
>   its due date.
> • Flags what's urgent: due today, due tomorrow and overdue work stand out.
> • Takes your own tasks: add things Canvas doesn't track, one-off or repeating.
> • Learns your pace: log how long things took, and Stats suggests better estimates.
> • Streaks for weeks on target and days on plan.
> • Toolbar button with today's list and a count of what's left.
> • Themes, dark mode, and a calendar (.ics) export.
>
> Heads up: the planner becomes your new tab page, and the first time you open Canvas
> in a browser session it opens the planner and syncs (you can turn that off in
> Settings → General).
>
> Private by design: it only reads your courses and assignments from your school's
> Canvas, using the login already in your browser. Everything stays in your browser.
> No account, no server, no analytics. It never submits or changes anything in Canvas.
>
> Works with any school's Canvas at an instructure.com address (like
> byui.instructure.com). Canvas Planner is an independent project, not made by or
> affiliated with Instructure.

**Categories:** AMO: Other (or the closest fit offered). Chrome: Education.

**Homepage:** https://github.com/mgabbitas/canvasplanner

**Support:** https://github.com/mgabbitas/canvasplanner/issues

**Privacy policy URL:** https://github.com/mgabbitas/canvasplanner/blob/main/PRIVACY.md

**Single purpose** (Chrome):
> Plan the user's Canvas homework: read their assignments from their school's Canvas
> and lay them out as a weekly schedule with earlier target days, in a new-tab page and
> a toolbar popup.

**Permission justifications** (Chrome):
- **storage:** Saves the user's settings, synced assignments and progress in the
  browser. Nothing is stored anywhere else.
- **Host permission `https://*.instructure.com/*`:** Canvas is hosted at a different
  instructure.com address for each school (e.g. byui.instructure.com). The extension
  reads the user's courses and assignments from the one address they enter, using GET
  requests only, with their existing login.
- **Content script on `*.instructure.com`:** Only sends a "user is on Canvas" message so
  the extension can open the planner or refresh data. It reads nothing from the page.
- **New tab override:** The planner is the extension's main page and is shown on the
  new tab, as described in the listing.

**Notes for reviewers** (AMO; also fine for Chrome's "additional info" if asked):
> Plain JavaScript, no bundler, no minification, no remote code; what's in the zip is
> the source (also at https://github.com/mgabbitas/canvasplanner). Network requests go
> only to the Canvas address the user enters (always *.instructure.com), GET only, with
> `credentials: 'include'` so the browser's existing Canvas login is used. Canvas text
> is inserted with textContent only. To try it you need a Canvas account; without one
> you'll see the first-run screen asking for a school address.
