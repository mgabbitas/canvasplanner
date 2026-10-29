// Browser check: serves a copy of the extension with a fake `browser` API loaded with
// your real Canvas fixture, runs it in headless Firefox, clicks through the main
// actions, and prints a pass/fail report. Needs test/fixtures/canvas-dump.json and
// Firefox. Usage: npm run check:ui   (add -- --screenshot to also save screenshots)
process.env.TZ = process.env.TZ || 'America/Denver';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE = join(REPO, 'test/fixtures/canvas-dump.json');
if (!existsSync(FIXTURE)) {
  console.log('Skipped: test/fixtures/canvas-dump.json not present.');
  process.exit(0);
}

const { normalizeAssignment, normalizeCourse } = await import(join(REPO, 'src/sync/normalize.js'));
const { mergeCourse } = await import(join(REPO, 'src/storage/merge.js'));
const { migrate } = await import(join(REPO, 'src/storage/schema.js'));

// The fixture is a Canvas snapshot from this day. Its dates are moved forward by whole
// weeks so it always looks recent (same weekdays); otherwise, as weeks pass, nearly
// everything turns overdue and piles onto today.
const FIXTURE_TAKEN = '2026-09-29';
const DAY_MS = 24 * 60 * 60 * 1000;
const shiftDays = Math.max(0, Math.floor((Date.now() - new Date(`${FIXTURE_TAKEN}T12:00:00`).getTime()) / (7 * DAY_MS)) * 7);

/** Move an ISO timestamp by shiftDays on the local calendar (keeps wall-clock time across DST). */
function shiftIso(iso) {
  if (!iso) return iso;
  const d = new Date(iso);
  d.setDate(d.getDate() + shiftDays);
  return d.toISOString();
}
const shiftDate = (ymd) => shiftIso(`${ymd}T12:00:00`).slice(0, 10);

// Stored state as a sync would leave it, plus a few logged times for Stats.
function buildState() {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  let items = {};
  const courses = {};
  for (const c of fx) {
    const course = normalizeCourse(c.course);
    if (!course) continue;
    courses[course.id] = { name: course.name };
    items = mergeCourse(items, c.course.id, c.assignments.map((a) => normalizeAssignment(a, c.course.id)));
  }
  for (const item of Object.values(items)) {
    for (const k of ['dueAt', 'unlockAt', 'lockAt', 'submittedAt', 'prevDueAt']) item[k] = shiftIso(item[k]);
  }
  Object.keys(items).filter((id) => items[id].canvasDone).slice(0, 8).forEach((id, i) => {
    items[id].log = { minutes: 15 + i * 5, difficulty: (i % 5) + 1, finishedOn: shiftDate(`2026-09-2${i % 9}`) };
  });
  return { ...migrate({ items, courses }), meta: { lastSyncAt: new Date().toISOString(), lastError: null } };
}

const work = mkdtempSync(join(tmpdir(), 'canvasplanner-ui-'));
const site = join(work, 'site');
cpSync(join(REPO, 'src'), join(site, 'src'), { recursive: true });
writeFileSync(join(site, 'data.json'), JSON.stringify(buildState()));
for (const f of ['stub.js', 'clickthrough.js']) cpSync(new URL(f, import.meta.url), join(site, 'src/ui', f));
const page = readFileSync(join(site, 'src/ui/planner.html'), 'utf8').replace(
  '<script type="module" src="planner.js"></script>',
  '<script src="stub.js"></script><script type="module" src="planner.js"></script><script type="module" src="clickthrough.js"></script>',
);
writeFileSync(join(site, 'src/ui/check.html'), page);
// For screenshots of the task form: open it as soon as the page has rendered.
writeFileSync(join(site, 'src/ui/shot-taskform.js'), `const t = setInterval(() => {
  const b = document.querySelector('[data-key="add-task"]');
  if (!b) return;
  clearInterval(t);
  b.click();
  const f = document.querySelector('dialog.task-dialog');
  f.querySelector('[data-key="task-title"]').value = 'Study for the midterm';
  f.querySelector('textarea').value = 'Chapters 4-6, practice problems';
}, 20);`);
writeFileSync(join(site, 'src/ui/taskform-shot.html'), page.replace('<script type="module" src="clickthrough.js"></script>', '<script type="module" src="shot-taskform.js"></script>'));
cpSync(new URL('popupcheck.js', import.meta.url), join(site, 'src/popup/popupcheck.js'));
writeFileSync(join(site, 'src/popup/popup-shot.html'), readFileSync(join(site, 'src/popup/popup.html'), 'utf8').replace(
  '<script type="module" src="popup.js"></script>',
  '<script src="../ui/stub.js"></script><script type="module" src="popup.js"></script>',
));
writeFileSync(join(site, 'src/popup/check.html'), readFileSync(join(site, 'src/popup/popup.html'), 'utf8').replace(
  '<script type="module" src="popup.js"></script>',
  '<script src="../ui/stub.js"></script><script type="module" src="popup.js"></script><script type="module" src="popupcheck.js"></script>',
));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let onReport;
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end('ok');
    onReport?.(JSON.parse(body));
    return;
  }
  const path = normalize(join(site, decodeURIComponent(req.url.split('?')[0].split('#')[0])));
  if (!path.startsWith(site)) { res.statusCode = 403; res.end(); return; }
  try {
    res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.end(readFileSync(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/src/ui/check.html`;
const popupBase = `http://127.0.0.1:${server.address().port}/src/popup/check.html`;

function firefox(args) {
  const profile = mkdtempSync(join(work, 'profile-'));
  return spawn('firefox', ['--headless', '--no-remote', '--profile', profile, ...args], { stdio: 'ignore' });
}

async function clickThrough(url) {
  const report = new Promise((resolve) => { onReport = resolve; });
  const ff = firefox([url]);
  const timeout = new Promise((r) => setTimeout(() => r({ steps: ['FAIL no report within 90 s'], errors: [] }), 90_000));
  const result = await Promise.race([report, timeout]);
  ff.kill();
  return result;
}

let failed = 0;
for (const [label, url] of [['Real data', `${base}?test`], ['First run (empty)', `${base}?test&empty`], ['Toolbar popup', popupBase]]) {
  const { steps, errors } = await clickThrough(url);
  const fails = steps.filter((s) => s.startsWith('FAIL'));
  failed += fails.length + errors.length;
  console.log(`${label}: ${steps.length - fails.length}/${steps.length} passed${errors.length ? `, ${errors.length} errors` : ''}`);
  for (const s of fails) console.log(`  ${s}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
}

if (process.argv.includes('--screenshot')) {
  for (const [name, hash, size, query] of [['this', '', '1400,1000'], ['next', 'next', '1400,1000'], ['stats', 'stats', '1400,1700'], ['settings', 'settings/rules', '1400,1000'], ['settings-week', 'settings/week', '1400,1000'], ['settings-data', 'settings/data', '1400,1000'], ['settings-classes', 'settings/classes', '1400,1000'], ['narrow', '', '700,1000'],
    ['loginerror', '', '1400,1000', '?loginerror'], ['noaccess', '', '1400,1000', '?noaccess'],
    ['appearance', 'settings/appearance', '1400,1000'], ['fall', '', '1400,1000', '?look=fall'],
    ['christmas-dark', '', '1400,1000', '?look=christmas&mode=dark'], ['custom-dark', 'settings/appearance', '1400,1000', '?look=custom&mode=dark'],
    ['halloween', '', '1400,1000', '?date=2026-10-31&holiday'], ['july4-dark', '', '1400,1000', '?preview=july4&mode=dark'],
    ['christmasday', '', '1400,1000', '?preview=christmasday&mode=light'],
    ['ocean', '', '1400,1000', '?look=ocean'], ['ocean-dark', '', '1400,1000', '?look=ocean&mode=dark'],
    ['sunset', '', '1400,1000', '?look=sunset'], ['forest', '', '1400,1000', '?look=forest'], ['lavender-dark', '', '1400,1000', '?look=lavender&mode=dark'], ['patriotic', '', '1400,1000', '?look=patriotic']]) {
    const file = join(REPO, 'web-ext-artifacts', `ui-${name}.png`);
    await new Promise((r) => firefox(['--screenshot', file, '--window-size', size, `${base}${query ?? ''}#${hash}`]).on('exit', r));
    console.log(`Screenshot: ${file}`);
  }
  const formShot = join(REPO, 'web-ext-artifacts', 'ui-taskform.png');
  await new Promise((r) => firefox(['--screenshot', formShot, '--window-size', '1400,1000',
    `http://127.0.0.1:${server.address().port}/src/ui/taskform-shot.html`]).on('exit', r));
  console.log(`Screenshot: ${formShot}`);
  const popupShot = join(REPO, 'web-ext-artifacts', 'ui-popup.png');
  await new Promise((r) => firefox(['--screenshot', popupShot, '--window-size', '368,560',
    `http://127.0.0.1:${server.address().port}/src/popup/popup-shot.html`]).on('exit', r));
  console.log(`Screenshot: ${popupShot}`);
}

server.close();
rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
