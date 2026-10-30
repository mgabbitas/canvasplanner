// App shell: sidebar navigation, page header, and the first-run welcome card.
import { dayLabel, minutesLabel, el } from './dom.js';
import { icon, logo, lookIcon } from './icons.js';
import { courseColor } from './theme.js';
import { openTaskForm } from './taskform.js';
import { aheadText } from './notes.js';
import { toLocalDate } from '../planner/dates.js';
import { CANVAS, ACCESS_MESSAGE, isLoginError } from '../sync/canvas.js';
import { app, view, classId, timeAgo, courseName, sync, allowCanvasAccess, changeExtraDays, homework, itemCount, streaks, plural } from './app.js';

const NAV = [
  ['', 'this', 'This week', 'week'],
  ['next', 'next', 'Next week', 'next'],
  ['stats', 'stats', 'Stats', 'stats'],
  ['settings', 'settings', 'Settings', 'settings'],
];

export function setNavOpen(open) {
  app.navOpen = open;
  document.getElementById('app').classList.toggle('nav-open', open);
  document.getElementById('scrim').hidden = !open;
  document.querySelector('[data-key="menu"]')?.setAttribute('aria-expanded', String(open));
}

export function renderSidebar() {
  const v = view();
  const meta = app.state.meta;
  const error = app.syncMessage || meta.lastError;
  const status = app.syncing
    ? el('span', {}, 'Syncing…')
    : error
      ? el('span', { className: 'error' }, error, isLoginError(error) ? [' ', loginLink()] : null,
        error === ACCESS_MESSAGE ? [' ', allowButton()] : null)
      : el('span', {}, meta.lastSyncAt ? `Synced ${timeAgo(meta.lastSyncAt)}` : 'Never synced');

  const courses = Object.keys(app.state.courses)
    .filter((id) => app.state.settings.courses[id]?.include !== false)
    .sort((a, b) => courseName(a).localeCompare(courseName(b)));

  return [
    el('div', { className: 'brand' },
      logo(),
      el('span', {}, 'Canvas Planner'),
      lookIcon(app.look, toLocalDate(Date.now())),
      el('button', { className: 'icon-btn close-nav', 'aria-label': 'Close menu', onclick: () => setNavOpen(false) }, icon('close')),
    ),
    SPLASH[app.holiday] ? el('p', { className: 'splash', 'data-key': 'splash' }, SPLASH[app.holiday]) : null,
    el('nav', { className: 'nav', 'aria-label': 'Views' }, NAV.map(([hash, key, label, ic]) => el('a', {
      href: `#${hash}`, className: `nav-link${v === key ? ' active' : ''}`, 'aria-current': v === key ? 'page' : null,
      'data-key': `nav-${key}`,
      onclick: (e) => { e.preventDefault(); setNavOpen(false); location.hash = hash; },
    }, icon(ic), el('span', {}, label)))),
    courses.length ? el('div', { className: 'side-section' },
      el('h2', {}, 'Classes'),
      el('ul', { className: 'legend' }, courses.map((id) => el('li', {}, el('a', {
        href: `#class/${id}`, className: `legend-link${classId() === id ? ' active' : ''}`,
        'aria-current': classId() === id ? 'page' : null, 'data-key': `class-${id}`,
        title: 'Everything left in this class',
        onclick: (e) => { e.preventDefault(); setNavOpen(false); location.hash = `class/${id}`; },
      },
        el('span', { className: 'dot', style: `--course:${courseColor(id, app.state.settings, app.state.courses)}`, 'aria-hidden': 'true' }),
        el('span', { className: 'legend-name' }, courseName(id))))))) : null,
    el('div', { className: 'side-sync' },
      el('div', { className: 'sync-status' }, status),
      el('button', { onclick: sync, disabled: app.syncing, 'data-key': 'sync' }, icon('sync'), el('span', {}, app.syncing ? 'Syncing…' : 'Sync now')),
    ),
  ];
}

export const loginLink = () => el('a', { href: `${CANVAS}/`, target: '_blank', rel: 'noopener noreferrer' }, 'Open Canvas');
const allowButton = () => el('button', { className: 'link', onclick: allowCanvasAccess, 'data-key': 'allow-access' }, 'Allow access');

/** What to try when Canvas doesn't see the login. Shown on the welcome card. */
const loginHelp = () => el('div', {},
  el('p', {}, 'Things to check:'),
  el('ol', { className: 'help-list' },
    el('li', {}, 'Open Canvas in a normal (not private) window and make sure you see your Dashboard. Then come back and sync.'),
    el('li', {}, 'In the address bar, go to about:addons, click Canvas Planner, open the Permissions tab, and make sure access to byui.instructure.com is turned on.'),
    el('li', {}, 'If you changed Firefox privacy settings to block cookies, add byui.instructure.com as an exception: Settings → Privacy & Security → Cookies and Site Data → Manage Exceptions → Allow.'),
    el('li', {}, 'Still stuck? Send a screenshot of the message above to whoever gave you the add-on.'),
  ),
);

/** Shown instead of the plan until the first successful sync. */
export function renderWelcome() {
  const error = app.syncMessage || app.state.meta.lastError;
  return el('section', { className: 'panel welcome' },
    el('h2', {}, app.syncing ? 'Getting your assignments from Canvas…' : 'Welcome to Canvas Planner'),
    app.syncing
      ? el('p', { className: 'hint' }, 'This takes a few seconds the first time.')
      : el('div', {},
        error ? el('p', { className: 'warn-text' }, error) : null,
        error === ACCESS_MESSAGE
          ? el('p', {}, 'Firefox needs your OK before the add-on can read your assignments from byui.instructure.com.')
          : isLoginError(error)
            ? loginHelp()
            : el('p', {}, 'Sync to bring in your assignments. It uses your existing Canvas login in this browser.'),
        el('div', { className: 'row' },
          error === ACCESS_MESSAGE
            ? el('button', { className: 'primary', onclick: allowCanvasAccess, 'data-key': 'welcome-allow' }, 'Allow access')
            : el('button', { className: 'primary', onclick: sync, 'data-key': 'welcome-sync' }, 'Sync now'),
          isLoginError(error) ? loginLink() : null,
        ),
      ),
  );
}

/** The two streak counters, side by side. `lit` when this week / today already counts. */
function renderStreaks() {
  const { days, weeks } = streaks();
  const counter = (key, n, label, lit, title) => el('span', {
    className: `streak${n ? '' : ' zero'}${lit ? ' lit' : ''}`, 'data-key': key, title,
  }, el('strong', {}, String(n)), el('span', {}, label));
  return el('div', { className: 'streaks', 'aria-label': 'Streaks' },
    counter('streak-weeks', weeks.current, weeks.current === 1 ? 'week on target' : 'weeks on target', weeks.thisWeek === 'hit',
      `Weeks in a row with everything done by the target day. Best: ${plural(weeks.best, 'week')}.`),
    counter('streak-days', days.current, days.current === 1 ? 'day on plan' : 'days on plan', days.today === 'hit',
      `Days in a row where you finished everything planned for the day. Best: ${plural(days.best, 'day')}.`),
  );
}

// A line of fun on the holidays you've let the planner dress up for.
const SPLASH = {
  halloween: "Don't let the deadlines haunt you!",
  thanksgiving: 'Grateful for early finishes!',
  christmasday: 'Merry Christmas! Homework can wait today.',
  july4: 'Independence from last-minute homework!',
};

export function renderHeader(p) {
  const v = view();
  const week = p.week;
  const weekView = v === 'this' || v === 'next';
  const title = v === 'settings' ? 'Settings' : v === 'stats' ? 'Your stats' : v === 'class' ? courseName(classId())
    : `Week of ${dayLabel(week.start, { month: 'long', day: 'numeric' })}`;

  const menuBtn = el('button', {
    className: 'icon-btn menu-btn', 'aria-label': 'Menu', 'aria-expanded': String(app.navOpen), 'data-key': 'menu',
    onclick: () => setNavOpen(!app.navOpen),
  }, icon('menu'));

  let subtitle = null;
  if (v === 'settings') subtitle = el('p', { className: 'subtitle' }, 'Changes save automatically.');
  if (v === 'stats') subtitle = el('p', { className: 'subtitle' }, 'How long your work actually takes, from the times you log.');
  if (v === 'class') subtitle = el('p', { className: 'subtitle' }, 'Everything left in this class. Filter, then set many estimates at once.');
  if (weekView) {
    const today = v === 'this' ? p.days.find((d) => d.date === p.today) : null;
    const parts = [];
    if (today) parts.push(el('strong', {}, `Today: ${itemCount(today.items)} · ${minutesLabel(today.load - today.doneMinutes)}`));
    const { count: doneCount, minutes: doneMinutes } = v === 'this' ? p.doneToday : { count: 0 };
    if (doneCount) {
      parts.push(el('span', { className: 'good-text', 'data-key': 'done-today', title: 'Finished today (logged time where you logged it)' },
        `✓ ${doneCount} done · ${minutesLabel(doneMinutes)}`));
    }
    const work = v === 'this' ? homework(p.days.flatMap((d) => d.items)) : [];
    const dueToday = work.filter((e) => e.dueToday).length;
    const overdue = work.filter((e) => e.overdue).length;
    if (dueToday) parts.push(el('span', { className: 'urgent-text' }, `${dueToday} due today`));
    if (overdue) parts.push(el('span', { className: 'urgent-text' }, `${overdue} overdue`));
    const ahead = v === 'this' ? aheadText() : null;
    if (ahead) parts.push(el('span', { className: 'good-text', 'data-key': 'ahead-text' }, `↑ ${ahead}`));
    if (v === 'next') parts.push(el('span', {}, 'Projected plan'));
    subtitle = el('div', { className: 'subtitle-row' },
      el('p', { className: 'subtitle' }, ...parts.flatMap((x, i) => (i ? [' · ', x] : [x]))),
      el('div', { className: 'target' },
        el('span', { className: 'muted' }, 'Finish by'),
        el('button', {
          disabled: !week.canRemoveDay, 'aria-label': 'Target one day earlier', 'data-key': 'remove-day',
          title: 'Target one day earlier', onclick: () => changeExtraDays(week.start, -1),
        }, '−'),
        el('strong', {}, dayLabel(week.cutoff, { weekday: 'short', month: 'short', day: 'numeric' })),
        el('button', {
          disabled: !week.canAddDay, 'aria-label': 'Give yourself one more day', 'data-key': 'add-day',
          title: 'Give yourself one more day', onclick: () => changeExtraDays(week.start, 1),
        }, '+'),
      ),
    );
  }

  return [
    el('div', { className: 'title-row' }, menuBtn, el('h1', {}, title),
      v === 'this' ? renderStreaks() : null,
      weekView || v === 'class' ? el('button', {
        className: 'add-task', 'data-key': 'add-task',
        onclick: () => openTaskForm({ courseId: v === 'class' ? classId() : null }),
      }, '+ Add task') : null),
    subtitle,
  ];
}
