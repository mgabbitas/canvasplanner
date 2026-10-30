// Canvas assignment JSON -> item (Canvas-owned fields only). Pure.

import { isCanvasUrl } from './school.js';

const DESCRIPTION_MAX = 2000;
const DONE_STATES = ['submitted', 'graded', 'pending_review'];
const NON_SUBMITTABLE = ['none', 'on_paper'];

// First match wins, checked in this order (SPEC section 5).
const TYPE_ORDER = [
  ['quiz', ['online_quiz']],
  ['discussion', ['discussion_topic']],
  ['upload', ['online_upload', 'online_text_entry', 'online_url', 'media_recording']],
  ['external_tool', ['external_tool']],
];

export function collapseWhitespace(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function resolveType(submissionTypes) {
  const types = Array.isArray(submissionTypes) ? submissionTypes : [];
  for (const [type, canvasTypes] of TYPE_ORDER) {
    if (types.some((t) => canvasTypes.includes(t))) return type;
  }
  return 'other';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Rough HTML -> plain text. Output is only ever shown via textContent. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function isoOrNull(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;
}

function canvasUrl(v) {
  return isCanvasUrl(v) ? v : null;
}

export function normalizeAssignment(raw, courseId) {
  const sub = raw.submission ?? {};
  const types = Array.isArray(raw.submission_types) ? raw.submission_types : [];
  const status = typeof sub.workflow_state === 'string' ? sub.workflow_state : null;
  return {
    id: String(raw.id),
    courseId: String(courseId),
    title: collapseWhitespace(raw.name) || '(untitled)',
    type: resolveType(types),
    nonSubmittable: types.length > 0 && types.every((t) => NON_SUBMITTABLE.includes(t)),
    dueAt: isoOrNull(raw.due_at),
    unlockAt: isoOrNull(raw.unlock_at),
    lockAt: isoOrNull(raw.lock_at),
    points: Number.isFinite(raw.points_possible) ? raw.points_possible : null,
    canvasStatus: status,
    canvasDone: DONE_STATES.includes(status) || sub.excused === true,
    submittedAt: isoOrNull(sub.submitted_at),
    descriptionText: htmlToText(raw.description).slice(0, DESCRIPTION_MAX),
    url: canvasUrl(raw.html_url),
  };
}

/** Returns null for courses the spec says to skip (restricted or unnamed). */
export function normalizeCourse(raw) {
  if (!raw || raw.access_restricted_by_date || !collapseWhitespace(raw.name)) return null;
  return { id: String(raw.id), name: collapseWhitespace(raw.name) };
}
