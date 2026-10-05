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
  Object.keys(items).filter((id) => items[id].canvasDone).slice(0, 8).forEach((id, i) => {
    items[id].log = { minutes: 15 + i * 5, difficulty: (i % 5) + 1, finishedOn: `2026-09-2${i % 9}` };
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

function firefox(args) {
  const profile = mkdtempSync(join(work, 'profile-'));
  return spawn('firefox', ['--headless', '--no-remote', '--profile', profile, ...args], { stdio: 'ignore' });
}

async function clickThrough(query) {
  const report = new Promise((resolve) => { onReport = resolve; });
  const ff = firefox([`${base}?test${query ? `&${query}` : ''}`]);
  const timeout = new Promise((r) => setTimeout(() => r({ steps: ['FAIL no report within 90 s'], errors: [] }), 90_000));
  const result = await Promise.race([report, timeout]);
  ff.kill();
  return result;
}

let failed = 0;
for (const [label, query] of [['Real data', ''], ['First run (empty)', 'empty']]) {
  const { steps, errors } = await clickThrough(query);
  const fails = steps.filter((s) => s.startsWith('FAIL'));
  failed += fails.length + errors.length;
  console.log(`${label}: ${steps.length - fails.length}/${steps.length} passed${errors.length ? `, ${errors.length} errors` : ''}`);
  for (const s of fails) console.log(`  ${s}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
}

if (process.argv.includes('--screenshot')) {
  for (const [name, hash, size] of [['this', '', '1400,1000'], ['next', 'next', '1400,1000'], ['stats', 'stats', '1400,1000'], ['settings', 'settings/estimates', '1400,1000'], ['narrow', '', '700,1000']]) {
    const file = join(REPO, 'web-ext-artifacts', `ui-${name}.png`);
    await new Promise((r) => firefox(['--screenshot', file, '--window-size', size, `${base}#${hash}`]).on('exit', r));
    console.log(`Screenshot: ${file}`);
  }
}

server.close();
rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
