// Grades fixture: paste into the browser console on a logged-in Canvas tab
// (e.g. https://byui.instructure.com). Read-only: GET requests to your own Canvas only,
// using your existing login. Downloads canvas-grades.json; move it to
// test/fixtures/canvas-grades.json (gitignored: it holds your grades, never commit it).
//
// Per active course: the course (weights on/off, current score) and its assignment
// groups (name, weight, drop rules). Assignments themselves are already in
// canvas-dump.json, matched by assignment_group_id.
(async () => {
  const get = async (path) => {
    const out = [];
    let url = `${location.origin}/api/v1/${path}`;
    while (url) {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${res.status} on ${url}`);
      const body = await res.json();
      if (!Array.isArray(body)) return body;
      out.push(...body);
      url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('Link') ?? '')?.[1] ?? null;
    }
    return out;
  };
  const courses = await get('courses?enrollment_state=active&include[]=total_scores&include[]=current_grading_period_scores&per_page=100');
  const dump = [];
  for (const c of courses) {
    if (!c.id || c.access_restricted_by_date) continue;
    const course = await get(`courses/${c.id}?include[]=total_scores`);
    const groups = await get(`courses/${c.id}/assignment_groups?per_page=100`);
    dump.push({
      course: {
        id: course.id, name: course.name, course_code: course.course_code,
        apply_assignment_group_weights: course.apply_assignment_group_weights,
        hide_final_grades: course.hide_final_grades,
        enrollments: (c.enrollments ?? []).filter((e) => e.type === 'student').map((e) => ({
          type: e.type, computed_current_score: e.computed_current_score, computed_final_score: e.computed_final_score,
          computed_current_grade: e.computed_current_grade, computed_final_grade: e.computed_final_grade,
          current_period_computed_current_score: e.current_period_computed_current_score,
          has_grading_periods: e.has_grading_periods,
        })),
      },
      assignment_groups: groups.map((g) => ({ id: g.id, name: g.name, position: g.position, group_weight: g.group_weight, rules: g.rules })),
    });
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'canvas-grades.json' });
  a.click();
  console.log(`canvas-grades.json: ${dump.length} courses`);
})().catch((e) => console.error('Grades fixture failed:', e));
