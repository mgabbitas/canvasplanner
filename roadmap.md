**Goals and guardrails** (2026-11-11)

- The point: help students finish early, be more disciplined and do better in their classes. A planner, not a homework helper, not a calendar app, not a dashboard of everything.
- Keep it simple, modern and intuitive. It already works well: improve it without piling on. Each new thing should replace confusion, not add it, and ideally needs no explaining.
- Claude: if an idea here doesn't fit these goals, or the extension starts getting heavy or bloated, say so plainly and suggest something smaller.

**Next update**

- Invite people to leave a review, without being annoying. Only ask once, ever: whether they click the link, dismiss it, or ignore it, it never comes back. A small note inside the planner page, not a browser notification (no new permissions). Show it after a good moment, like finishing an item, and only once they've used the planner for a while (maybe 2+ weeks and 10+ items done). Link to the AMO or Chrome Web Store page depending on the browser.

- Day cards (Week, Today, Thu…) aren't the same width: the Week card starts wider (`planner.css` `.day-tab` flex-basis 96px vs `.day-tab.week` 128px), so the row looks uneven. Make them equal and fill the row evenly (same flex-basis, or a grid of equal columns). Check narrow widths still scroll sideways instead of squashing.
- Forecast bars look flat in grey, mostly in light mode. Grey was picked so amber "too much" days stand out in every theme. Ideas: a soft tint of the theme accent at low strength (check it doesn't blend with amber in Fall/Halloween), or a darker/warmer grey just for light mode. A tweak, not a redesign.

**Bugs (fix first, users are hitting these)**

- Overdue items disappearing. Cause found: an item Canvas marks `graded` counts as done, even with no submission. A teacher grading a missing item 0 (fixture: "L03 Prepare: Checkpoint", `missing: true`, score 0) makes it vanish from Overdue. Fix: `missing: true` (nothing submitted, not excused, score 0) stays overdue, with a "missing" chip, until submitted or dismissed. Other graded-without-submission items stay done: they're surveys, paper check-ins and 0-point evaluations. **Done 2026-11-11** (see SPEC sections 3, 4, 6). Missing items Canvas has closed (lock date passed, can't submit anymore): greyed out in their own small "Closed" box for a day or so, then they drop off. Still restorable from Dismissed.
- "N hr won't fit by Friday" that Add a day can't fix. Cause: an item due before the target day (e.g. due Tuesday) can only go on days up to Tuesday. If those are full (overdue items dumped on today, a 2 h exam, a heavy due day), it lands in "won't fit", and moving the target day changes nothing. Fix idea: only items that more days would actually help go in "won't fit" (with Add a day). The rest go on their last possible day anyway, over capacity, and that day turns red: "Tuesday is 1h 20m over. Move something, or give Tuesday more time." **Done 2026-11-11.**
- Overdue items crowding today: they are placed on today first and use up today's hours, pushing today's real work into "won't fit". Decided 2026-11-11: both. Overdue goes in its own "Catch up" list that doesn't push today's real work off today, and today can still show as over its hours. **Done 2026-11-11** (the grade-based order comes with grades). Once grades are in: order Catch up by what helps your grade most (points and weight), and suggest that one as up next. Until then Up next is today's first non-overdue item (fine, 2026-11-11).
- Exams default to 2 h on the exam day, so one exam can wreck the whole week's plan. Decided 2026-11-11: the exam itself takes no homework time (like in-class items); instead, plan study time before it. When an exam shows up, its card in the side column asks "How long do you want to study?" with 30m / 1h / 2h / custom (and "No study time"). The answer becomes study time planned before the exam (reuses tasks and splitting). Open: one block the day before, or spread over the days before.

- Extra credit (2026-11-11): Canvas has no extra-credit flag, so go by title ("extra credit", "bonus"; fixture: "Stand Forever --Extra Credit", 0 pts). Show an "optional" chip, plan it only into time left over after required work (it never makes a day go over or causes "won't fit"), and don't let it break streaks. Dismiss still works. **Done 2026-11-11.**
- Day line was confusing ("2 items · 10m + 3h 50m done of 4h"). Now just "3h 5m / 4h" (planned incl. done / hours), the same as the day tab. What you finished today is only in the green header line. **Done 2026-11-11.**
- Auto-sync default 60 → 30 min. Sync only runs when you open the planner or visit Canvas (no timer in the background), so the cost is a few more requests to Canvas, only then. Existing users on 60 move to 30 too (60 was the default, so almost nobody chose it). **Done 2026-11-11.**
- Sync when you come back to an open planner tab (2026-11-11). A user said "I don't think it updates with Canvas": they left the tab open, came back, and items they'd submitted weren't checked off. The page only syncs when it first loads. Fix: also sync when the tab becomes visible again and the last sync is older than the interval. No new permission. Maybe the toolbar popup too. A true background timer needs the `alarms` permission; only if this isn't enough. **Done 2026-11-11.**

**Cheers and streaks**

- Celebrate getting ahead and finishing on time. Users rarely see the "N days ahead" cheer: it needs all of tomorrow's work done too, and the planner never moves tomorrow's work into today on its own, so it almost never fires. Add small, quiet cheers for things that do happen: finishing an item early ("Done 2 days early"), clearing today's list, finishing the week by the target day. Short toasts, respect the Celebrations setting, don't repeat the same one over and over. **Done 2026-11-11.**
- Streaks: simpler look. Two small counters: a label on top ("Week" / "Day") and a flame with the number under it (the layout you described). Use a small flame icon drawn in the page, not the emoji (emoji look different on every system and can't take the theme's colors). **Done 2026-11-11.**

**Onboarding**

- Choose your classes on first sync: a checklist before the plan shows ("Which classes do you want to plan?"). Pre-uncheck classes that look like announcement shells (e.g. "CSE Majors": no assignments, or nothing but old/overdue items, or no term). Ask again when a new class shows up mid-semester.
- Welcome card: lead with "Open Canvas in another tab and log in. The planner picks up your school from there." (Half works today: visiting Canvas opens the planner with the address pre-filled, if "open on Canvas visit" is on, but you still have to click Save). Typing the address becomes the fallback. Better still: the open welcome page fills in the school on its own when you visit Canvas, without a reload. **Done 2026-11-11.**
- Examples say byui.instructure.com (welcome text, error message). Change to a generic `yourschool.instructure.com` (the input placeholder already is). Note: Canvas addresses are `.instructure.com`, not `.edu`. **Done 2026-11-11.**
- Short walkthrough on the Settings page, like the main tour: one pop-up per tab (Week, Rules, Classes, Appearance, General, Data).

**Sync between computers, accounts, AI** (thought through 2026-11-11)

- Don't lose your rules and settings: use the browser's own sync (`storage.sync`), not a server of ours. Firefox (signed in to a Firefox account) and Chrome (signed in to the browser) carry it to your other computers. No new permission, no data on our side. Small space (about 100 KB), so settings, rules, class names and colors only; assignments come back from Canvas anyway. Export/Import already covers backups. Good candidate for the next update.
- No server, accounts or analytics of our own: CLAUDE.md says no server, no accounts, no analytics, and it keeps the privacy story simple ("nothing leaves your browser"). Stats already run on your own data.
- Mobile: Firefox for Android runs add-ons but can't replace the new tab page, and Chrome on phones runs none. Not worth it now.
- AI help with assignments: no. It would read coursework (the planner never does), send student data to a third party, cost money per use, and drift toward a homework helper. If AI ever comes back, only for planning (e.g. better time estimates), opt-in, and talked through first.

**Rules**

- Home page notice when there's a new suggested rule (the suggested rules from logged times, Stats → suggested rules): "New rule suggestion: Physics reports take you about 24 min (rule says 45). Review" with a link to Settings → Rules, and one or two lines on how rules work. Once per suggestion, dismissible.
- Revamp the Rules page. Ideas: write rules as a sentence ("In [class], [type] with '[word]' in the title takes [time]"); show which upcoming items each rule matches ("matches 4 items: ...") so you can see it working; show, on each item, which rule set its time (we already track `source`); drop up/down ordering by sorting specific rules above general ones automatically. Problem today (2026-11-11): even I don't know how to add or edit a rule and make it take effect. Either explain it much better or rethink it.
- Suggest a rule from your own edits, not just logged times: few users log times, but they do change estimates. If you change the time on items that match the same pattern (same class + type or title word) about 3 times, suggest a rule ("You set 3 CSE 340 quizzes to 10 min. Make that a rule?").
- "Reset default rules" button: puts back the All-classes defaults (report/essay/exam... 2 h, survey/evaluation 5 m, quiz/reading 20 m) without touching class rules or rules you added. My setup has only 2 All-classes rules; likely because it was set up before the defaults were added (the old keyword rules carried over), so early users probably have the same gap. Check before building.

**Planner page**

- Sync progress bar: "Syncing class 3 of 7" with a bar. Sync already goes one class at a time, so this is cheap. **Done 2026-11-11.**
- Day cards smaller. Options: (a) just shrink them; (b) week summary card above them; (c) make them meters like the forecast. Leaning (a): the forecast already uses bars, and a third style for "hours per day" could confuse.
- "Open Canvas" link (in the sidebar, under Settings). No other quick links (decided 2026-11-11: the planner replacing the new tab page is partly about cutting distractions). **Done 2026-11-11.**

**Grades** (WIP idea)

- Grade per class next to its name in the sidebar (one extra read-only call). Hidden by default (anyone can see a new tab), with a small "Show grades" toggle. Keep it uncluttered.
- How much an assignment affects your grade: from points and assignment group weights (`/courses/:id/assignment_groups`, read-only). E.g. "Worth 4% of your grade" chip, or "a 0 here drops you from 93% to 89%". Start with the simple "% of grade" chip.
- Grade analytics on Stats (wanted, 2026-11-11): grade per class, how on-time/early work lines up with grades, and how upcoming assignments could move your grade. Needs a workshop before building: make it usable, helpful, maybe even fun, without turning Stats into a dashboard. Same "Show grades" toggle.

**Modules / things you don't submit**

- Readings, prep and study modules don't show because they aren't assignments. Canvas has a read-only modules API (`/courses/:id/modules?include[]=items`) with module items and, when the teacher sets requirements, whether you've completed them. Need to check what real BYU-I modules look like: pull a real sample into `test/fixtures/` when we start this.
- Step 1: a Modules tab in the class view (click a class) listing every module and item with links, done ones checked.
- Step 2: "Add to plan" on a module item makes it a task (reuses tasks) with a due day, or a repeating task ("Religion reading before Tuesday class, every week").
- Maybe later: a "show everything" switch that plans module items automatically, if their dates are usable.

**To Add**

- Setting it up so TAs can see what needs to be graded. Idk how that works for BYUI yet though so not necessary right now. 
- Also, do assignments that aren't submittable in Canvas show up? Or is there a way to add them? (Assignments with no submission do show, setting "Include non-submittable". Readings that are only module pages don't: see Modules above.)
- Chrome compatibility if possible. (Later) 
- Show class grades (optional, not necessary; see Grades above). Current score per class in the class view and/or Stats. Needs one more read-only call (`/courses?include[]=total_scores`). Display only: don't reorder the normal schedule by grade (Catch up may be ordered by grade impact, decided 2026-11-11). Maybe: a "late"/"missing" chip from the submission data we already sync.

**Stats ideas** (pick some, not all)

- How early you finish: average days before the due date, overall and by class. The whole point of the planner, so probably the headline number.
- On time vs late: count/percent per class (Canvas `late` flag or submitted after due).
- Hours per week over the semester: small bar chart, maybe with planned vs actual.
- When you submit: time of day (late-night submissions), from `submittedAt`.
- Sticking to the plan: % of items finished on the day they were planned vs moved/pushed.
- Estimate accuracy over time: is "% of estimated time" getting closer to 100%?
- Hardest class: average difficulty and time per item side by side.
		
