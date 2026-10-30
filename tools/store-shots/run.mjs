// Store screenshots: the real page with a made-up semester (no real classes or
// assignments), captured in headless Firefox at 1280x800 for addons.mozilla.org and the
// Chrome Web Store. Usage: npm run shots:store  -> web-ext-artifacts/store/
process.env.TZ = process.env.TZ || 'America/Denver';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(REPO, 'web-ext-artifacts/store');
const { normalizeAssignment } = await import(join(REPO, 'src/sync/normalize.js'));
const { mergeCourse } = await import(join(REPO, 'src/storage/merge.js'));
const { migrate } = await import(join(REPO, 'src/storage/schema.js'));
const { addDays } = await import(join(REPO, 'src/planner/dates.js'));

// A Monday the screenshots pretend is today (the stub shifts Date.now to its noon).
const TODAY = '2026-11-02';
const HOST = 'example.instructure.com';

const COURSES = {
  9101: 'BIO 101: Principles of Biology',
  9102: 'MATH 221: Statistics',
  9103: 'ENG 150: Writing and Reasoning',
  9104: 'HIST 201: United States History',
  9105: 'CS 124: Intro to Programming',
};

// Each week: [course, title (N = week number), Canvas submission type, weekday due (0 = Mon), points].
const WEEKLY = [
  [9101, 'Reading quiz: Chapter N', 'online_quiz', 1, 10],
  [9101, 'Lab N report', 'online_upload', 4, 25],
  [9102, 'Problem set N', 'online_upload', 2, 20],
  [9102, 'Quiz N', 'online_quiz', 4, 15],
  [9103, 'Discussion: week N prompt', 'discussion_topic', 3, 10],
  [9104, 'Primary source response N', 'online_upload', 3, 20],
  [9105, 'Prepare: lesson N', 'online_quiz', 0, 5],
  [9105, 'Programming assignment N', 'online_upload', 5, 40],
];
const EXTRA = [
  // [course, title, type, week offset, weekday, points]
  [9103, 'Essay 2: argument draft', 'online_upload', 0, 4, 50],
  [9104, 'Midterm exam', 'online_quiz', 1, 3, 100],
];

let nextId = 70000;
function raw(courseId, title, type, date, points, done) {
  const [y, m, d] = date.split('-').map(Number);
  const due = new Date(y, m - 1, d, 23, 59);
  // Finished work went in by Tuesday of its week (or on its due day, if sooner).
  const tuesday = new Date(y, m - 1, d - ((due.getDay() + 6) % 7) + 1, 18, 0);
  const submitted = new Date(Math.min(due, tuesday));
  const id = nextId++;
  return {
    id, name: title, submission_types: [type], points_possible: points,
    due_at: due.toISOString(), unlock_at: null, lock_at: null,
    html_url: `https://${HOST}/courses/${courseId}/assignments/${id}`,
    description: '',
    submission: done ? { workflow_state: 'submitted', submitted_at: submitted.toISOString() } : { workflow_state: 'unsubmitted' },
  };
}

function buildState() {
  const byCourse = {};
  const add = (c, ...args) => (byCourse[c] ??= []).push(raw(c, ...args));
  for (let week = -3; week <= 1; week++) {
    const monday = addDays(TODAY, week * 7);
    for (const [c, title, type, day, pts] of WEEKLY) add(c, title.replace('N', String(week + 9)), type, addDays(monday, day), pts, week < 0);
  }
  for (const [c, title, type, week, day, pts] of EXTRA) add(c, title, type, addDays(TODAY, week * 7 + day), pts, false);

  let items = {};
  for (const [c, list] of Object.entries(byCourse)) items = mergeCourse(items, c, list.map((a) => normalizeAssignment(a, c)));

  // Logged times on finished work, so Stats has something to show.
  const minutesFor = { quiz: [15, 20, 25], upload: [40, 55, 70, 35], discussion: [30, 25], external_tool: [90, 110, 75] };
  let n = 0;
  for (const item of Object.values(items)) {
    if (!item.canvasDone) continue;
    const opts = minutesFor[item.type] ?? [30];
    item.log = { minutes: opts[n % opts.length], difficulty: 1 + (n * 3) % 5, finishedOn: item.submittedAt.slice(0, 10) };
    n++;
  }
  // Two of today's items already checked off.
  for (const item of Object.values(items).filter((i) => !i.canvasDone && i.dueAt.slice(0, 10) <= addDays(TODAY, 1)).slice(0, 2)) {
    item.manualDone = true;
    item.doneOn = TODAY;
  }
  const dayLog = {};
  for (let i = 1; i <= 16; i++) dayLog[addDays(TODAY, -i)] = { left: [] };

  const courses = Object.fromEntries(Object.entries(COURSES).map(([id, name]) => [id, { name }]));
  return {
    ...migrate({
      items, courses, dayLog, canvas: { host: HOST }, onboarding: { seenVersion: '9.0.0', toured: true },
      // Enough time Monday to Wednesday that the week fits; no theme offers.
      settings: { capacity: [60, 180, 180, 180, 120, 120, 60], seasonOffers: false },
    }),
    meta: { lastSyncAt: new Date(`${TODAY}T11:40:00`).toISOString(), lastError: null },
  };
}

// --- serve the page with the fake browser API ---------------------------------------

const work = mkdtempSync(join(tmpdir(), 'canvasplanner-shots-'));
const site = join(work, 'site');
cpSync(join(REPO, 'src'), join(site, 'src'), { recursive: true });
writeFileSync(join(site, 'data.json'), JSON.stringify(buildState()));
cpSync(join(REPO, 'tools/ui-check/stub.js'), join(site, 'src/ui/stub.js'));
const withStub = (file, entry, stub) => writeFileSync(join(site, file.replace(/[^/]+$/, 'shot.html')),
  readFileSync(join(site, file), 'utf8').replace(`<script type="module" src="${entry}"></script>`,
    `<script src="${stub}"></script><script type="module" src="${entry}"></script>`));
withStub('src/ui/planner.html', 'planner.js', 'stub.js');
withStub('src/popup/popup.html', 'popup.js', '../ui/stub.js');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = normalize(join(site, decodeURIComponent(req.url.split('?')[0].split('#')[0])));
  if (!path.startsWith(site)) { res.statusCode = 403; res.end(); return; }
  try {
    res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.end(readFileSync(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

function shot(file, url, size) {
  const profile = mkdtempSync(join(work, 'profile-'));
  return new Promise((r) => spawn('firefox', ['--headless', '--no-remote', '--profile', profile,
    '--screenshot', file, '--window-size', size, url], { stdio: 'ignore' }).on('exit', r));
}

mkdirSync(OUT, { recursive: true });
const q = `?date=${TODAY}`;
const SHOTS = [
  ['1-this-week', `/src/ui/shot.html${q}&mode=light#`],
  ['2-next-week', `/src/ui/shot.html${q}&mode=light#next`],
  ['3-stats', `/src/ui/shot.html${q}&mode=light#stats`],
  ['4-settings-week', `/src/ui/shot.html${q}&mode=light#settings/week`],
  ['5-dark-ocean', `/src/ui/shot.html${q}&look=ocean&mode=dark#`],
];
for (const [name, path] of SHOTS) {
  await shot(join(OUT, `${name}.png`), origin + path, '1280,800');
  console.log(`web-ext-artifacts/store/${name}.png`);
}
// The toolbar popup, centered on a 1280x800 backdrop.
const popup = join(work, 'popup.png');
await shot(popup, `${origin}/src/popup/shot.html${q}&mode=light`, '340,430');
execFileSync('magick', ['-size', '1280x800', 'gradient:#eaf1fb-#c9daf3',
  '(', popup, '-bordercolor', '#d0d7e2', '-border', '1', '(', '+clone', '-background', '#1e3a6b', '-shadow', '35x14+0+8', ')',
  '+swap', '-background', 'none', '-layers', 'merge', ')', '-gravity', 'center', '-compose', 'over', '-composite', join(OUT, '6-popup.png')]);
console.log('web-ext-artifacts/store/6-popup.png');

server.close();
rmSync(work, { recursive: true, force: true });

// Chrome Web Store promo tile (440x280).
execFileSync('rsvg-convert', ['-w', '440', '-h', '280', join(REPO, 'tools/store-shots/promo-tile.svg'), '-o', join(OUT, 'promo-tile-440x280.png')]);
console.log('web-ext-artifacts/store/promo-tile-440x280.png');
