// Settings view (#settings). Every change is validated against the last valid
// settings and saved immediately.
import { validateSettings, validateRule, TYPES } from '../storage/schema.js';
import { DEFAULT_SETTINGS, SIZES } from '../storage/defaults.js';
import { buildExport, applyImport, MAX_IMPORT_BYTES } from '../storage/transfer.js';
import { el, select, WEEKDAYS, TYPE_LABELS, minutesLabel, readInt } from './dom.js';
import { ACCENTS, CLASS_COLORS, courseColorKey } from './theme.js';

// Rules being edited, including incomplete ones that aren't saved yet.
let draftRules = null;
let message = null; // { text, bad }

export function resetSettingsDraft() {
  draftRules = null;
  message = null;
}

const toDraft = (r) => ({ ...r, mode: r.inClass ? 'inclass' : r.minutes != null ? 'minutes' : 'size' });
const fromDraft = (d) => ({
  courseId: d.courseId || null,
  type: d.type || null,
  keyword: d.keyword,
  size: d.mode === 'size' ? d.size : null,
  minutes: d.mode === 'minutes' ? d.minutes : null,
  inClass: d.mode === 'inclass',
});

function updateSettings(ctx, patch) {
  const settings = validateSettings({ ...ctx.state.settings, ...patch }, ctx.state.settings);
  return ctx.saveState({ settings });
}

function saveRules(ctx) {
  return updateSettings(ctx, { estimateRules: draftRules.map(fromDraft) });
}

function section(title, intro, ...children) {
  return el('section', { className: 'panel settings' },
    el('h2', {}, title),
    intro ? el('p', { className: 'intro' }, intro) : null,
    ...children);
}

const field = (label, control, hint) =>
  el('label', { className: 'field' }, el('span', {}, label), control, hint ? el('small', {}, hint) : null);

/** Number input that saves on change (blur or Enter). */
function numberInput(key, value, { min, max, step = 1, label }, onSave) {
  return el('input', {
    type: 'number', min, max, step, value, 'data-key': key, 'aria-label': label,
    onchange: (e) => onSave(readInt(e.target)),
  });
}

// --- sections ----------------------------------------------------------------------

function scheduleSection(ctx) {
  const s = ctx.state.settings;
  const dayOptions = WEEKDAYS.map((d, i) => [String(i), d]);
  const order = Array.from({ length: 7 }, (_, i) => (s.weekStartDay + i) % 7);

  const capacityRow = el('div', { className: 'grid7' }, order.map((i) => el('label', { className: 'mini' },
    el('span', {}, WEEKDAYS[i].slice(0, 3)),
    numberInput(`cap-${i}`, s.capacity[i], { min: 0, max: 1440, step: 5, label: `${WEEKDAYS[i]} minutes` }, (v) => {
      const capacity = [...s.capacity];
      capacity[i] = v;
      return updateSettings(ctx, { capacity });
    }),
    el('input', {
      type: 'checkbox', checked: s.blockedWeekdays.includes(i), title: 'Blocked: never schedule work',
      'aria-label': `Block ${WEEKDAYS[i]}`, 'data-key': `block-${i}`,
      onchange: (e) => updateSettings(ctx, {
        blockedWeekdays: e.target.checked ? [...s.blockedWeekdays, i] : s.blockedWeekdays.filter((w) => w !== i),
      }),
    }),
  )));

  const setAll = el('input', { type: 'number', min: 0, max: 1440, step: 5, placeholder: 'minutes', 'aria-label': 'Minutes for every day', 'data-key': 'cap-all' });
  return section('Schedule', 'When your week starts, when you want its work finished, and how much time you have each day.',
    el('div', { className: 'row' },
      field('Week starts on', select(dayOptions, String(s.weekStartDay), {
        'data-key': 'week-start', onchange: (e) => updateSettings(ctx, { weekStartDay: Number(e.target.value) }),
      })),
      field('Target day', select(dayOptions, String(s.targetDay), {
        'data-key': 'target-day', onchange: (e) => updateSettings(ctx, { targetDay: Number(e.target.value) }),
      }), 'Finish the week\'s work by this day.'),
    ),
    el('p', { className: 'label' }, 'Minutes available per day. Check the box to block a day entirely.'),
    capacityRow,
    el('div', { className: 'row' },
      setAll,
      el('button', {
        'data-key': 'cap-all-btn',
        onclick: () => {
          const v = readInt(setAll);
          if (v != null) updateSettings(ctx, { capacity: Array(7).fill(v) });
        },
      }, 'Set all days'),
    ),
    el('p', { className: 'hint' }, 'To change a single date, click its minutes in the planner.'),
  );
}

function sizesSection(ctx) {
  const s = ctx.state.settings;
  return section('Sizes and defaults', 'Sizes are shorthand used by type defaults, rules and pull-by-amount.',
    el('div', { className: 'row' },
      SIZES.map((size) => field(`${size} minutes`,
        numberInput(`size-${size}`, s.sizeMinutes[size], { min: 1, max: 1440, label: `${size} minutes` },
          (v) => updateSettings(ctx, { sizeMinutes: { ...s.sizeMinutes, [size]: v } })))),
    ),
    el('div', { className: 'row' },
      field('Instructor-stated time scale (%)',
        numberInput('stated-scale', s.statedScale, { min: 10, max: 300, step: 5, label: 'Stated time scale percent' },
          (v) => updateSettings(ctx, { statedScale: v })),
        'When a description says "should take about 60 minutes", plan that × this %. 70 means you usually take 70% of the stated time.'),
    ),
    el('p', { className: 'label' }, 'Default size by assignment type (used when nothing else matches):'),
    el('div', { className: 'row' },
      TYPES.map((t) => field(TYPE_LABELS[t], select(SIZES.map((z) => [z, `${z} · ${minutesLabel(s.sizeMinutes[z])}`]), s.typeDefaults[t], {
        'data-key': `type-${t}`,
        onchange: (e) => updateSettings(ctx, { typeDefaults: { ...s.typeDefaults, [t]: e.target.value } }),
      }))),
    ),
  );
}

function rulesSection(ctx) {
  const s = ctx.state.settings;
  if (!draftRules) draftRules = s.estimateRules.map(toDraft);
  const courses = Object.entries(ctx.state.courses).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const courseOptions = [['', 'Any class'], ...courses.map(([id, c]) => [id, s.courses[id]?.displayName || c.name])];
  const typeOptions = [['', 'Any type'], ...TYPES.map((t) => [t, TYPE_LABELS[t]])];
  const valueOptions = [
    ...SIZES.map((z) => [z, `${z} · ${minutesLabel(s.sizeMinutes[z])}`]),
    ['minutes', 'Exact minutes'],
    ['inclass', 'In class (0m)'],
  ];

  const edit = (i, patch) => {
    draftRules[i] = { ...draftRules[i], ...patch };
    return saveRules(ctx);
  };
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= draftRules.length) return;
    [draftRules[i], draftRules[j]] = [draftRules[j], draftRules[i]];
    return saveRules(ctx);
  };

  const rows = draftRules.map((d, i) => {
    const incomplete = !validateRule(fromDraft(d));
    return el('li', { className: `rule${incomplete ? ' incomplete' : ''}` },
      select(courseOptions, d.courseId ?? '', { 'aria-label': 'Class', 'data-key': `r${i}-course`, onchange: (e) => edit(i, { courseId: e.target.value || null }) }),
      select(typeOptions, d.type ?? '', { 'aria-label': 'Assignment type', 'data-key': `r${i}-type`, onchange: (e) => edit(i, { type: e.target.value || null }) }),
      el('input', {
        type: 'text', value: d.keyword, placeholder: 'title contains…', maxLength: 100,
        'aria-label': 'Title keyword', 'data-key': `r${i}-kw`,
        onchange: (e) => edit(i, { keyword: e.target.value.trim() }),
      }),
      el('span', { className: 'arrow' }, '→'),
      select(valueOptions, d.mode === 'size' ? d.size ?? 'M' : d.mode, {
        'aria-label': 'Estimate', 'data-key': `r${i}-value`,
        onchange: (e) => {
          const v = e.target.value;
          if (v === 'inclass') return edit(i, { mode: 'inclass' });
          if (v === 'minutes') return edit(i, { mode: 'minutes', minutes: d.minutes ?? s.sizeMinutes[d.size ?? 'M'] });
          return edit(i, { mode: 'size', size: v });
        },
      }),
      d.mode === 'minutes'
        ? numberInput(`r${i}-min`, d.minutes, { min: 1, max: 1440, label: 'Minutes' }, (v) => edit(i, { minutes: v }))
        : null,
      el('span', { className: 'rule-tools' },
        el('button', { 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, 'data-key': `r${i}-up`, onclick: () => move(i, -1) }, '↑'),
        el('button', { 'aria-label': 'Move down', title: 'Move down', disabled: i === draftRules.length - 1, 'data-key': `r${i}-down`, onclick: () => move(i, 1) }, '↓'),
        el('button', {
          'aria-label': 'Delete rule', title: 'Delete', 'data-key': `r${i}-del`,
          onclick: () => { draftRules.splice(i, 1); return saveRules(ctx); },
        }, '✕'),
      ),
      incomplete ? el('small', { className: 'warn-text' }, 'Not saved yet: pick a class, a type or a keyword.') : null,
    );
  });

  return section('Estimate rules', null,
    el('p', { className: 'hint' },
      'First matching rule wins, top to bottom. A rule must match everything it sets. ',
      'Rules that name a class beat instructor-stated times; rules for any class don\'t. ',
      'Put specific rules above general ones (e.g. "Physics + report → 25 min" above "report → L").'),
    el('ol', { className: 'rules' }, rows),
    el('button', {
      'data-key': 'add-rule',
      onclick: () => {
        draftRules.push({ courseId: null, type: null, keyword: '', mode: 'size', size: 'M', minutes: null });
        ctx.render();
      },
    }, '+ Add rule'),
  );
}

function coursesSection(ctx) {
  const s = ctx.state.settings;
  const courses = Object.entries(ctx.state.courses).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const setCourse = (id, patch) => {
    const current = s.courses[id] ?? { include: true, displayName: '', color: null };
    return updateSettings(ctx, { courses: { ...s.courses, [id]: { ...current, ...patch } } });
  };
  return section('Classes', 'Uncheck a class to leave it out of planning, give it a shorter name, or pick its color.',
    courses.length
      ? el('ul', { className: 'courses' }, courses.map(([id, c]) => el('li', {},
        swatches(`color-${id}`, `Color for ${c.name}`, Object.keys(CLASS_COLORS),
          courseColorKey(id, s, ctx.state.courses), (k) => CLASS_COLORS[k], (color) => setCourse(id, { color }), true),
        el('input', {
          type: 'checkbox', checked: s.courses[id]?.include !== false, 'aria-label': `Include ${c.name}`,
          'data-key': `inc-${id}`, onchange: (e) => setCourse(id, { include: e.target.checked }),
        }),
        el('input', {
          type: 'text', value: s.courses[id]?.displayName ?? '', placeholder: c.name, maxLength: 100,
          'aria-label': `Display name for ${c.name}`, 'data-key': `name-${id}`,
          onchange: (e) => setCourse(id, { displayName: e.target.value.trim() }),
        }),
      )))
      : el('p', { className: 'hint' }, 'Sync once to list your classes.'),
  );
}

/** A row of color swatch radio buttons. */
function swatches(key, label, keys, value, colorOf, onPick, compact = false) {
  return el('div', { className: `swatches${compact ? ' compact' : ''}`, role: 'radiogroup', 'aria-label': label },
    keys.map((k) => el('button', {
      role: 'radio', 'aria-checked': String(k === value), 'aria-label': k, title: k,
      className: `swatch${k === value ? ' on' : ''}`, style: `--swatch:${colorOf(k)}`,
      tabIndex: k === value ? 0 : -1, 'data-key': `${key}-${k}`,
      onclick: () => onPick(k),
      onkeydown: (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        onPick(keys[(keys.indexOf(value) + step + keys.length) % keys.length]);
      },
    })));
}

// Accent swatch colors (light-mode values; the page itself uses theme-aware ones).
const ACCENT_SWATCH = {
  blue: '#2563c9', teal: '#0f766e', purple: '#7c3aed', green: '#166c34', orange: '#b03b0b', pink: '#be185d',
};

function appearanceSection(ctx) {
  const s = ctx.state.settings;
  const radios = (key, label, options, value) => el('div', { className: 'seg', role: 'group', 'aria-label': label },
    options.map(([k, text]) => el('button', {
      'aria-pressed': String(value === k), className: value === k ? 'on' : '', 'data-key': `${key}-${k}`,
      onclick: () => updateSettings(ctx, { [key]: k }),
    }, text)));
  return section('Appearance', null,
    field('Theme', radios('theme', 'Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme)),
    field('Accent color', swatches('accent', 'Accent color', Object.keys(ACCENTS), s.accent,
      (k) => ACCENT_SWATCH[k], (accent) => updateSettings(ctx, { accent }))),
    el('p', { className: 'hint' }, 'Class colors are set in the Classes tab.'),
  );
}

function behaviorSection(ctx) {
  const s = ctx.state.settings;
  const toggle = (key, label, hint) => el('label', { className: 'check' },
    el('input', { type: 'checkbox', checked: s[key], 'data-key': key, onchange: (e) => updateSettings(ctx, { [key]: e.target.checked }) }),
    el('span', {}, label), hint ? el('small', {}, hint) : null);
  return section('Sync and behavior', null,
    toggle('openOnCanvasVisit', 'Open the planner when I visit Canvas',
      'The first Canvas visit in each browser session opens the planner and syncs. Visiting Canvas also syncs quietly in the background whenever your data is stale.'),
    field('Auto-sync when data is older than (minutes)',
      numberInput('auto-sync', s.autoSyncMinutes, { min: 15, max: 10080, label: 'Auto-sync minutes' },
        (v) => updateSettings(ctx, { autoSyncMinutes: v })), 'Minimum 15.'),
    toggle('includeNonSubmittable', 'Plan items that can\'t be submitted online', 'e.g. "no submission" or "on paper" assignments.'),
    toggle('gatePullOnCompletion', 'Only allow pulling next week\'s work once this week\'s own work is done'),
    field('Most unfinished pulled work allowed in this week (minutes)',
      numberInput('pull-cap', s.pullCapMinutes, { min: 15, max: 2400, step: 15, label: 'Pull limit minutes' },
        (v) => updateSettings(ctx, { pullCapMinutes: v })),
      'Finish pulled items to make room for more. 180 = 3 hours.'),
  );
}

function dataSection(ctx) {
  const say = (text, bad = false) => { message = { text, bad }; ctx.render(); };

  const exportData = () => {
    const data = buildExport(ctx.state, new Date().toISOString());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `canvas-planner-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('Exported.');
  };

  const importInput = el('input', {
    type: 'file', accept: '.json,application/json', className: 'visually-hidden', 'aria-label': 'Import file',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) return say('That file is too large to be an export.', true);
      let next;
      try {
        next = applyImport(ctx.state, JSON.parse(await file.text()));
      } catch (err) {
        return say(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, true);
      }
      if (!confirm('Replace your settings, item minutes, done checks and dismissed items with the ones in this file?')) return;
      draftRules = null;
      await ctx.saveState(next);
      say('Imported.');
    },
  });

  return section('Data', null,
    el('div', { className: 'row' },
      el('button', { onclick: exportData, 'data-key': 'export' }, 'Export'),
      el('button', { onclick: () => importInput.click(), 'data-key': 'import' }, 'Import…'),
      importInput,
      el('button', {
        'data-key': 'reset',
        onclick: () => {
          if (!confirm('Reset all settings to defaults? Your done checks and item minutes are kept.')) return;
          draftRules = null;
          ctx.saveState({ settings: validateSettings(DEFAULT_SETTINGS) });
          say('Settings reset to defaults.');
        },
      }, 'Reset to defaults'),
      el('button', {
        className: 'danger', 'data-key': 'clear',
        onclick: async () => {
          if (!confirm('Delete ALL stored data (settings, items, done checks)? This can\'t be undone. Export first if you want a backup.')) return;
          await browser.storage.local.clear();
          resetSettingsDraft();
          ctx.afterClear();
        },
      }, 'Clear all data'),
    ),
    el('p', { className: 'hint' }, 'Export saves settings and your per-item changes (minutes, checks, dismissals) to a file. It contains no Canvas content.'),
    message ? el('p', { className: message.bad ? 'warn-text' : 'hint', role: 'status' }, message.text) : null,
  );
}

const TABS = [
  ['schedule', 'Schedule', [scheduleSection]],
  ['estimates', 'Estimates', [rulesSection, sizesSection]],
  ['classes', 'Classes', [coursesSection]],
  ['appearance', 'Appearance', [appearanceSection]],
  ['behavior', 'Sync & behavior', [behaviorSection]],
  ['data', 'Data', [dataSection]],
];

export function renderSettings(ctx) {
  const current = TABS.find(([key]) => key === ctx.tab) ?? TABS[0];
  const nav = el('nav', { className: 'tabs subtabs', 'aria-label': 'Settings sections' },
    TABS.map(([key, label]) => el('a', {
      href: `#settings/${key}`, className: `tab${key === current[0] ? ' active' : ''}`,
      'aria-current': key === current[0] ? 'page' : null, 'data-key': `stab-${key}`,
    }, label)));
  return [nav, ...current[2].map((render) => render(ctx))];
}
