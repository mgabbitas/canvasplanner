// Settings view (#settings). Every change is validated against the last valid
// settings and saved immediately.
import { validateSettings, validateRule, TYPES } from '../storage/schema.js';
import { DEFAULT_SETTINGS, TIME_PRESETS } from '../storage/defaults.js';
import { buildExport, applyImport, MAX_IMPORT_BYTES } from '../storage/transfer.js';
import { el, select, WEEKDAYS, TYPE_LABELS, minutesLabel, readInt } from './dom.js';
import { ACCENTS, CLASS_COLORS, courseColorKey, courseColor } from './theme.js';
import { showToast } from './toast.js';

// Rules being edited, including new and incomplete ones that aren't saved yet.
let draftRules = null;
let message = null; // { text, bad }
let rulesClass = ''; // class shown on the Rules tab ('' = All classes)
const openAdvanced = new Set(); // tabs whose Advanced section is open
const customTypes = new Set(); // type defaults showing the custom-minutes box

export function resetSettingsDraft() {
  draftRules = null;
  message = null;
}

const toDraft = (r) => ({ ...r, mode: r.inClass ? 'inclass' : 'minutes' });
const fromDraft = (d) => ({
  courseId: d.courseId || null,
  type: d.type || null,
  keyword: d.keyword,
  minutes: d.mode === 'minutes' ? d.minutes : null,
  inClass: d.mode === 'inclass',
});

function updateSettings(ctx, patch) {
  const settings = validateSettings({ ...ctx.state.settings, ...patch }, ctx.state.settings);
  return ctx.saveState({ settings });
}

// A just-added rule stays out of the saved list until you change something in it.
function saveRules(ctx) {
  return updateSettings(ctx, { estimateRules: draftRules.filter((d) => !d.fresh).map(fromDraft) });
}

const courseLabel = (ctx, id) => ctx.state.settings.courses[id]?.displayName || ctx.state.courses[id]?.name || `Class ${id}`;

/** "Physics + Quiz + "report" → 25m", for the undo message. */
function ruleText(d, ctx) {
  const course = d.courseId ? courseLabel(ctx, d.courseId) : null;
  const when = [course, d.type ? TYPE_LABELS[d.type] : null, d.keyword ? `"${d.keyword}"` : null].filter(Boolean);
  const value = d.mode === 'inclass' ? 'in class' : minutesLabel(d.minutes ?? 0);
  return `${when.join(' + ') || 'new rule'} → ${value}`;
}

/** Delete a rule, with Undo that puts it back in the same place. */
function deleteRule(ctx, i) {
  const [removed] = draftRules.splice(i, 1);
  saveRules(ctx);
  if (removed.fresh) return ctx.render();
  const t = showToast({
    message: `Deleted rule: ${ruleText(removed, ctx)}`,
    actions: [{
      label: 'Undo',
      onclick: () => {
        t.close();
        if (!draftRules) draftRules = ctx.state.settings.estimateRules.map(toDraft);
        draftRules.splice(Math.min(i, draftRules.length), 0, removed);
        saveRules(ctx);
      },
    }],
  });
}

function section(title, intro, ...children) {
  return el('section', { className: 'panel settings' },
    el('h2', {}, title),
    intro ? el('p', { className: 'intro' }, intro) : null,
    ...children);
}

/** Collapsed "Advanced" area at the bottom of a tab; stays open across re-renders. */
function advanced(key, ...children) {
  return el('details', {
    className: 'advanced', open: openAdvanced.has(key), 'data-key': `adv-${key}`,
    ontoggle: (e) => (e.target.open ? openAdvanced.add(key) : openAdvanced.delete(key)),
  }, el('summary', {}, 'Advanced'), ...children);
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

/**
 * Time picker: preset times, "Custom…" (shows a minutes box) and optional extra
 * choices such as "In class" (`extra` is the chosen one). onPick(value, typed) gets a
 * preset's minutes, 'custom', an extra key, or typed minutes with typed = true.
 */
function timePicker(key, label, { minutes, extra = null, custom = false, extras = [] }, onPick) {
  const isPreset = TIME_PRESETS.includes(minutes);
  const showCustom = minutes != null && (custom || !isPreset);
  const current = extra ?? (showCustom ? 'custom' : String(minutes));
  const options = [
    ...TIME_PRESETS.map((m) => [String(m), minutesLabel(m)]),
    ['custom', 'Custom…'],
    ...extras,
  ];
  return el('span', { className: 'time-pick' },
    select(options, current, {
      'aria-label': label, 'data-key': key,
      onchange: (e) => onPick(e.target.value),
    }),
    showCustom && !extra
      ? numberInput(`${key}-min`, minutes, { min: 1, max: 1440, label: `${label}, minutes` }, (v) => onPick(v, true))
      : null,
    showCustom && !extra ? el('span', { className: 'unit' }, 'min') : null,
  );
}

// --- sections ----------------------------------------------------------------------

const MAX_SLIDER = 8 * 60;
const hoursLabel = (minutes) => (minutes ? minutesLabel(minutes) : '0h');

function weekSection(ctx) {
  const s = ctx.state.settings;
  const dayOptions = WEEKDAYS.map((d, i) => [String(i), d]);
  const order = Array.from({ length: 7 }, (_, i) => (s.weekStartDay + i) % 7);
  const setCapacity = (i, v) => {
    const capacity = [...s.capacity];
    capacity[i] = v;
    return updateSettings(ctx, { capacity });
  };

  const cards = el('div', { className: 'daycards' }, order.map((i) => {
    const off = s.blockedWeekdays.includes(i);
    const target = s.targetDay === i;
    const hours = el('output', { className: 'daycard-hours', 'aria-hidden': 'true' }, off ? 'Day off' : hoursLabel(s.capacity[i]));
    return el('div', { className: `daycard${off ? ' off' : ''}${target ? ' target' : ''}`, 'data-key': `day-${i}` },
      el('div', { className: 'daycard-head' },
        el('strong', {}, WEEKDAYS[i])),
      hours,
      el('input', {
        type: 'range', min: 0, max: MAX_SLIDER, step: 15, value: Math.min(s.capacity[i], MAX_SLIDER),
        disabled: off, 'aria-label': `${WEEKDAYS[i]}: time for homework`, 'aria-valuetext': hoursLabel(s.capacity[i]),
        'data-key': `cap-${i}`,
        oninput: (e) => { hours.textContent = hoursLabel(Number(e.target.value)); },
        onchange: (e) => setCapacity(i, Number(e.target.value)),
      }),
      el('label', { className: 'daycard-opt' },
        el('input', {
          type: 'checkbox', checked: off, 'data-key': `block-${i}`,
          onchange: (e) => updateSettings(ctx, {
            blockedWeekdays: e.target.checked ? [...s.blockedWeekdays, i] : s.blockedWeekdays.filter((w) => w !== i),
          }),
        }),
        el('span', {}, 'Day off')),
      el('label', { className: 'daycard-opt' },
        el('input', {
          type: 'radio', name: 'target-day', checked: target, 'data-key': `target-${i}`,
          onchange: () => updateSettings(ctx, { targetDay: i }),
        }),
        el('span', {}, 'Finish by')),
    );
  }));

  const allHours = Array.from({ length: 17 }, (_, k) => k * 30);
  const setAll = select(allHours.map((m) => [String(m), hoursLabel(m)]), '120', { 'aria-label': 'Time for every day', 'data-key': 'cap-all' });

  return section('Week', 'Set how much homework time you have each day, which days are off, and the day you want the week\'s work finished by.',
    el('div', { className: 'row' },
      field('Week starts on', select(dayOptions, String(s.weekStartDay), {
        'data-key': 'week-start', onchange: (e) => updateSettings(ctx, { weekStartDay: Number(e.target.value) }),
      })),
      el('div', { className: 'field set-all' },
        el('span', {}, 'Set every day to'),
        el('div', { className: 'inline' }, setAll,
          el('button', {
            'data-key': 'cap-all-btn',
            onclick: () => updateSettings(ctx, { capacity: Array(7).fill(Number(setAll.value)) }),
          }, 'Apply'))),
    ),
    cards,
    advanced('week',
      el('p', { className: 'label' }, 'Exact minutes per day (for days over 8 hours, or odd amounts)'),
      el('div', { className: 'grid7' }, order.map((i) => el('label', { className: 'mini' },
        el('span', {}, WEEKDAYS[i].slice(0, 3)),
        numberInput(`capmin-${i}`, s.capacity[i], { min: 0, max: 1440, step: 5, label: `${WEEKDAYS[i]} minutes` }, (v) => setCapacity(i, v))))),
      el('p', { className: 'hint' }, 'To change a single date (a busy Tuesday, a free Saturday), click its time in the planner.'),
    ),
  );
}

function rulesSection(ctx) {
  const s = ctx.state.settings;
  if (!draftRules) draftRules = s.estimateRules.map(toDraft);
  const courses = Object.keys(ctx.state.courses).sort((a, b) => courseLabel(ctx, a).localeCompare(courseLabel(ctx, b)));
  if (rulesClass && !courses.includes(rulesClass)) rulesClass = '';
  const inGroup = (d) => (d.courseId || '') === rulesClass;
  const count = (id) => draftRules.filter((d) => (d.courseId || '') === id && !d.fresh).length;
  const ruleCount = (n) => (n ? ` (${n} rule${n === 1 ? '' : 's'})` : '');

  const picker = el('label', { className: 'field rules-picker' }, el('span', {}, 'Show rules for'), select(
    [['', `All classes${ruleCount(count(''))}`], ...courses.map((id) => [id, `${courseLabel(ctx, id)}${ruleCount(count(id))}`])],
    rulesClass, { 'data-key': 'rules-class', onchange: (e) => { rulesClass = e.target.value; ctx.render(); } },
  ));

  const edit = (i, patch) => {
    draftRules[i] = { ...draftRules[i], ...patch, fresh: false };
    return saveRules(ctx);
  };
  // Move within this group only: order matters only among the same class's rules.
  const group = draftRules.map((d, i) => (inGroup(d) ? i : -1)).filter((i) => i >= 0);
  const move = (pos, delta) => {
    const i = group[pos];
    const j = group[pos + delta];
    if (j == null) return;
    [draftRules[i], draftRules[j]] = [draftRules[j], draftRules[i]];
    return saveRules(ctx);
  };
  const typeOptions = [['', 'Any type'], ...TYPES.map((t) => [t, TYPE_LABELS[t]])];

  const rows = group.map((i, pos) => {
    const d = draftRules[i];
    const incomplete = d.fresh || !validateRule(fromDraft(d));
    const pick = (v, typed) => {
      if (v === 'inclass') return edit(i, { mode: 'inclass' });
      if (v === 'custom') return edit(i, { mode: 'minutes', custom: true, minutes: d.minutes ?? 30 });
      return edit(i, { mode: 'minutes', custom: Boolean(typed), minutes: Number(v) });
    };
    return el('li', { className: `rule${incomplete ? ' incomplete' : ''}` },
      el('span', { className: 'rule-when' },
        select(typeOptions, d.type ?? '', { 'aria-label': 'Assignment type', 'data-key': `r${i}-type`, onchange: (e) => edit(i, { type: e.target.value || null }) }),
        el('input', {
          type: 'text', value: d.keyword, placeholder: 'title contains…', maxLength: 100,
          'aria-label': 'Title keyword', 'data-key': `r${i}-kw`,
          onchange: (e) => edit(i, { keyword: e.target.value.trim() }),
        })),
      el('span', { className: 'arrow', 'aria-hidden': 'true' }, '→'),
      timePicker(`r${i}-value`, 'Time', {
        minutes: d.mode === 'inclass' ? null : d.minutes, extra: d.mode === 'inclass' ? 'inclass' : null, custom: d.custom,
        extras: [['inclass', 'In class (0m)']],
      }, pick),
      el('span', { className: 'rule-tools' },
        el('button', { 'aria-label': 'Move up', title: 'Move up', disabled: pos === 0, 'data-key': `r${i}-up`, onclick: () => move(pos, -1) }, '↑'),
        el('button', { 'aria-label': 'Move down', title: 'Move down', disabled: pos === group.length - 1, 'data-key': `r${i}-down`, onclick: () => move(pos, 1) }, '↓'),
        el('button', { 'aria-label': 'Delete rule', title: 'Delete', 'data-key': `r${i}-del`, onclick: () => deleteRule(ctx, i) }, '✕'),
      ),
      incomplete
        ? el('small', { className: 'warn-text' }, rulesClass
          ? 'Not saved yet: pick a type, a keyword or a time. With neither type nor keyword, it applies to everything in this class.'
          : 'Not saved yet: pick a type or a title keyword.')
        : null,
    );
  });

  const name = rulesClass ? courseLabel(ctx, rulesClass) : 'All classes';
  const card = el('div', {
    className: 'rule-card', style: rulesClass ? `--course:${courseColor(rulesClass, s, ctx.state.courses)}` : null,
  },
    el('h3', {}, rulesClass ? el('span', { className: 'dot', 'aria-hidden': 'true' }) : null, name),
    el('p', { className: 'hint' }, rulesClass
      ? `These come first for ${name}, ahead of instructor-stated times and All-classes rules. Top to bottom, the first match wins.`
      : 'Used for every class when the class has no matching rule of its own. A time stated in the description ("should take about 30 minutes") beats these. Top to bottom, the first match wins.'),
    rows.length ? el('ol', { className: 'rules' }, rows) : el('p', { className: 'hint' }, 'No rules yet.'),
    el('button', {
      'data-key': 'add-rule',
      onclick: () => {
        draftRules.push({ courseId: rulesClass || null, type: null, keyword: '', mode: 'minutes', minutes: 30, fresh: true });
        ctx.render();
      },
    }, '+ Add rule'),
  );

  return section('Rules', 'How long things take. Rules match on assignment type and words in the title.',
    picker,
    card,
    rulesClass ? null : typeDefaultsBlock(ctx),
    advanced('rules',
      field('Instructor-stated time scale (%)',
        numberInput('stated-scale', s.statedScale, { min: 10, max: 300, step: 5, label: 'Stated time scale percent' },
          (v) => updateSettings(ctx, { statedScale: v })),
        'When a description says "should take about 60 minutes", plan that × this %. 70 means you usually take 70% of the stated time.'),
    ),
  );
}

function typeDefaultsBlock(ctx) {
  const s = ctx.state.settings;
  return el('div', { className: 'type-defaults' },
    el('h3', {}, 'When no rule matches'),
    el('p', { className: 'hint' }, 'The time each kind of assignment gets by default.'),
    el('div', { className: 'type-grid' }, TYPES.map((t) => {
      const pick = (v, typed) => {
        if (v === 'custom') { customTypes.add(t); return ctx.render(); }
        if (!typed) customTypes.delete(t);
        return updateSettings(ctx, { typeDefaults: { ...s.typeDefaults, [t]: Number(v) } });
      };
      return el('div', { className: 'field' }, el('span', {}, TYPE_LABELS[t]),
        timePicker(`type-${t}`, `${TYPE_LABELS[t]} default time`, { minutes: s.typeDefaults[t], custom: customTypes.has(t) }, pick));
    })),
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
        el('input', {
          type: 'checkbox', checked: s.courses[id]?.include !== false, 'aria-label': `Plan ${c.name}`, title: 'Plan this class',
          'data-key': `inc-${id}`, onchange: (e) => setCourse(id, { include: e.target.checked }),
        }),
        el('input', {
          type: 'text', value: s.courses[id]?.displayName ?? '', placeholder: c.name, maxLength: 100,
          'aria-label': `Display name for ${c.name}`, 'data-key': `name-${id}`,
          onchange: (e) => setCourse(id, { displayName: e.target.value.trim() }),
        }),
        swatches(`color-${id}`, `Color for ${c.name}`, Object.keys(CLASS_COLORS),
          courseColorKey(id, s, ctx.state.courses), (k) => CLASS_COLORS[k], (color) => setCourse(id, { color }), true),
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

function generalSection(ctx) {
  const s = ctx.state.settings;
  const toggle = (key, label, hint) => el('label', { className: 'check' },
    el('input', { type: 'checkbox', checked: s[key], 'data-key': key, onchange: (e) => updateSettings(ctx, { [key]: e.target.checked }) }),
    el('span', {}, label), hint ? el('small', {}, hint) : null);
  return section('General', null,
    toggle('openOnCanvasVisit', 'Open the planner when I visit Canvas',
      'The first Canvas visit in each browser session opens the planner and syncs. Visiting Canvas also syncs quietly whenever your data is stale.'),
    toggle('includeNonSubmittable', 'Plan items that can\'t be submitted online', 'e.g. "no submission" or "on paper" assignments.'),
    advanced('general',
      field('Auto-sync when data is older than (minutes)',
        numberInput('auto-sync', s.autoSyncMinutes, { min: 15, max: 10080, label: 'Auto-sync minutes' },
          (v) => updateSettings(ctx, { autoSyncMinutes: v })), 'Minimum 15.'),
      toggle('gatePullOnCompletion', 'Only allow pulling next week\'s work once this week\'s own work is done'),
      field('Most unfinished pulled work allowed in this week (minutes)',
        numberInput('pull-cap', s.pullCapMinutes, { min: 15, max: 2400, step: 5, label: 'Pull limit minutes' },
          (v) => updateSettings(ctx, { pullCapMinutes: v })),
        'Finish pulled items to make room for more. 180 = 3 hours.'),
    ),
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
      if (!confirm('Replace your settings, item minutes, done checks, dismissed items and streak history with the ones in this file?')) return;
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
    ),
    el('p', { className: 'hint' }, 'Export saves settings and your per-item changes (minutes, checks, dismissals) and streak history to a file. It contains no Canvas content.'),
    message ? el('p', { className: message.bad ? 'warn-text' : 'hint', role: 'status' }, message.text) : null,
    el('div', { className: 'danger-zone' },
      el('h3', {}, 'Danger zone'),
      el('div', { className: 'danger-row' },
        el('div', {}, el('strong', {}, 'Reset settings'), el('small', {}, 'Settings go back to defaults. Done checks, item times and history are kept.')),
        el('button', {
          className: 'warn', 'data-key': 'reset',
          onclick: () => {
            if (!confirm('Reset all settings to defaults? Your done checks and item minutes are kept.')) return;
            draftRules = null;
            ctx.saveState({ settings: validateSettings(DEFAULT_SETTINGS) });
            say('Settings reset to defaults.');
          },
        }, 'Reset settings')),
      el('div', { className: 'danger-row' },
        el('div', {}, el('strong', {}, 'Clear all data'), el('small', {}, 'Deletes everything: settings, items, checks and history. Export first if you want a backup.')),
        el('button', {
          className: 'danger', 'data-key': 'clear',
          onclick: async () => {
            if (!confirm('Delete ALL stored data (settings, items, done checks)? This can\'t be undone. Export first if you want a backup.')) return;
            await browser.storage.local.clear();
            resetSettingsDraft();
            ctx.afterClear();
          },
        }, 'Clear all data')),
    ),
  );
}

const TABS = [
  ['week', 'Week', [weekSection]],
  ['rules', 'Rules', [rulesSection]],
  ['classes', 'Classes', [coursesSection]],
  ['appearance', 'Appearance', [appearanceSection]],
  ['general', 'General', [generalSection]],
  ['data', 'Data', [dataSection]],
];
// Tab names before 1.2, so old links still land on the right tab.
const OLD_TABS = { schedule: 'week', estimates: 'rules', behavior: 'general' };

export function renderSettings(ctx) {
  const tab = OLD_TABS[ctx.tab] ?? ctx.tab;
  const current = TABS.find(([key]) => key === tab) ?? TABS[0];
  const nav = el('nav', { className: 'tabs subtabs', 'aria-label': 'Settings sections' },
    TABS.map(([key, label]) => el('a', {
      href: `#settings/${key}`, className: `tab${key === current[0] ? ' active' : ''}`,
      'aria-current': key === current[0] ? 'page' : null, 'data-key': `stab-${key}`,
    }, label)));
  return [nav, ...current[2].map((render) => render(ctx))];
}
