// Shared test helpers. The Canvas fixture is gitignored (it holds grades), so
// fixture-based tests skip when the file isn't present.
import { existsSync, readFileSync } from 'node:fs';

const FIXTURE = new URL('./fixtures/canvas-dump.json', import.meta.url);

export const fixture = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : null;
export const needsFixture = { skip: fixture ? false : 'test/fixtures/canvas-dump.json not present' };

export function findRaw(name) {
  for (const c of fixture) {
    const a = c.assignments.find((x) => x.name === name);
    if (a) return { raw: a, courseId: c.course.id };
  }
  throw new Error(`fixture assignment not found: ${name}`);
}
