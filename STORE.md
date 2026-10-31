# Submitting Planner for Canvas 1.4.1

Step by step: Firefox (addons.mozilla.org, listed, so it auto-updates) and the Chrome
Web Store. Text to paste is in "Listing text" at the bottom.

## 0. Before either store (5 minutes)

1. [ ] **Push to GitHub** so the privacy policy and license links work:
   `git push`
2. [ ] **Check the copyright name** in `LICENSE`: it says `mgabbitas`. Swap in your
   full name if you'd like, then commit and push.
3. [ ] **Build the zip:** `npm run build` →
   `web-ext-artifacts/planner_for_canvas-1.4.1.zip` (the same file goes to both stores).
4. [ ] **Make the images:** `npm run shots:store` → `web-ext-artifacts/store/`:
   `1-this-week.png` … `6-popup.png` (1280×800 screenshots, made-up classes) and
   `promo-tile-440x280.png`. Store icon: `icons/logo-128.png`.

## 1. Firefox: addons.mozilla.org

1. [ ] Go to <https://addons.mozilla.org/developers/addons> and sign in.
2. [ ] Open **Canvas Planner** (your existing add-on; the name updates from the new
   zip) → **Upload New Version**.
3. [ ] **How to distribute this version:** choose **On this site**. Continue.
4. [ ] Upload `planner_for_canvas-1.4.1.zip`. Wait for validation; the one warning
   (`service_worker` ignored by Firefox) is expected. Continue.
5. [ ] **Source code:** "Do you need to submit source code?" → **No**.
6. [ ] **Describe the add-on** (first listed version only):
   - Name: `Planner for Canvas`
   - Add-on URL (slug): `planner-for-canvas`
   - Summary: paste **Summary** below
   - Description: paste **Description** below
   - Categories: **Other** (or the closest fit offered)
   - Support email/website: `https://github.com/mgabbitas/canvasplanner/issues`
   - License: **MIT License**
   - Privacy policy: tick "This add-on has a privacy policy" and paste the text of
     `PRIVACY.md` (AMO wants the text, not a link)
   - Notes to reviewer: paste **Notes for reviewers** below
7. [ ] **Submit Version.** It's signed automatically and usually public within minutes
   to a day; a human may still review it later.
8. [ ] On the add-on's **Edit Product Page**: upload screenshots `1-…` to `6-…`,
   set Homepage to `https://github.com/mgabbitas/canvasplanner`, and save.
9. [ ] **Check updates reach your friends:** on a Firefox that has the old version,
   about:addons → ⚙ → **Check for Updates**. It should offer 1.4.1. (If it doesn't
   within a day, they can install from the AMO page once; same ID, settings are kept.)
10. [ ] Send Claude the AMO page link (`https://addons.mozilla.org/firefox/addon/planner-for-canvas/`
    if the slug was free) to switch the README's install section to it.

## 2. Chrome Web Store

1. [ ] Go to <https://chrome.google.com/webstore/devconsole> → **New item** → upload
   `planner_for_canvas-1.4.1.zip`. (A warning about `browser_specific_settings` is
   fine; it's Firefox's section.)
2. [ ] **Store listing** tab:
   - Description: paste **Description** below
   - Category: **Education** (or Productivity → Workflow & Planning)
   - Language: English
   - Store icon: `icons/logo-128.png`
   - Screenshots: `1-…` to `6-…` (1280×800)
   - Small promo tile: `promo-tile-440x280.png`
   - Homepage URL: `https://github.com/mgabbitas/canvasplanner`
   - Support URL: `https://github.com/mgabbitas/canvasplanner/issues`
   - Save draft.
3. [ ] **Privacy** tab:
   - Single purpose: paste **Single purpose** below
   - Permission justifications: paste each one from below (storage, host permission;
     if it asks about the content script or new tab, those are below too)
   - Remote code: **No, I am not using remote code**
   - Data usage: tick **Website content** (it reads assignment titles and
     descriptions from Canvas, kept only in the browser), then tick all three
     certifications. If Google's wording says data kept only on the device isn't
     "collected", leave the boxes unticked instead.
   - Privacy policy URL: `https://github.com/mgabbitas/canvasplanner/blob/main/PRIVACY.md`
   - Save draft.
4. [ ] **Distribution** tab: free, all regions, visibility **Unlisted** (only people
   with the link) or **Public**. Switch any time without a new upload.
5. [ ] If the **Account** tab asks you to verify your contact email, do it (the
   submit button stays grey until then).
6. [ ] **Submit for review.** First reviews take a few days, sometimes longer for
   extensions with broad host access; the justification explains it.
7. [ ] Once approved, send Claude the store link for the README.

## Every release after this

1. Claude: bump version, changelog, tests, `check:ui`, lint, Chromium check, build.
2. You: AMO → Upload New Version → **On this site** → upload the zip (listing stays).
3. You: Chrome dashboard → the item → **Package** → Upload new package → Submit.
4. GitHub Release with the signed `.xpi` (download it from AMO's version page) as
   `canvas-planner.xpi`, for anyone still installing by hand.

---

## Listing text

**Name:** Planner for Canvas

**Summary** (AMO, 250 characters max):
> Turns your Canvas assignments into a weekly plan with earlier target days, so
> homework is done by Wednesday instead of the night it's due. Read-only, private,
> works with any school's Canvas. Not affiliated with Instructure.

**Short description** (Chrome reads it from the manifest; already set):
> Plans self-assigned target dates for your Canvas assignments, so work gets done early.

**Description** (both stores):

> Planner for Canvas turns your Canvas assignments into a weekly plan. Instead of
> working to the official due dates, every assignment gets an earlier target day, and
> the week's work is spread across the time you actually have each day, so it's done
> by Wednesday instead of piling up on the weekend.
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
> byui.instructure.com). Planner for Canvas is an independent, open-source (MIT)
> project, not made by or affiliated with Instructure.

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
  new tab, as the listing says.

**Notes for reviewers** (AMO; also fine for Chrome if asked):
> Plain JavaScript, no bundler, no minification, no remote code; the zip is the source
> (also at https://github.com/mgabbitas/canvasplanner, MIT). Network requests go only
> to the Canvas address the user enters (always *.instructure.com), GET only, with
> `credentials: 'include'` so the browser's existing Canvas login is used. Canvas text
> is inserted with textContent only. Testing needs a Canvas account; without one you'll
> see the first-run screen asking for a school address. Formerly listed as "Canvas
> Planner" (unlisted versions up to 1.3.0); renamed for the listing.
