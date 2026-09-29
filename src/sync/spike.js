// M0 spike: can a background script reach Canvas using the browser's login session?
// Logs status and counts only. Never logs cookies, headers, or response bodies.

const CANVAS = 'https://byui.instructure.com';

async function getJson(path) {
  const res = await fetch(CANVAS + path, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  const info = {
    status: res.status,
    contentType: res.headers.get('content-type'),
    redirected: res.redirected,
    hasNextPage: /rel="next"/.test(res.headers.get('link') || ''),
  };
  try {
    return { ...info, data: JSON.parse(text.replace(/^while\(1\);/, '')) };
  } catch {
    return { ...info, data: null }; // Not JSON: almost certainly the login page.
  }
}

async function runSpike() {
  console.log('[spike] starting');
  const granted = await browser.permissions.contains({ origins: [CANVAS + '/*'] });
  console.log('[spike] host permission granted:', granted);

  const courses = await getJson('/api/v1/courses?enrollment_state=active&per_page=50');
  const { data, ...courseInfo } = courses;
  console.log('[spike] courses response:', courseInfo);
  if (!Array.isArray(data)) {
    console.log('[spike] RESULT: FAIL, no JSON course list (not logged in, or cookies not sent)');
    return;
  }
  const named = data.filter((c) => c.name && !c.access_restricted_by_date);
  console.log(`[spike] ${named.length} courses:`, named.map((c) => c.name));

  if (named.length > 0) {
    const first = named[0];
    const a = await getJson(`/api/v1/courses/${first.id}/assignments?include[]=submission&per_page=100`);
    const { data: assignments, ...aInfo } = a;
    console.log(`[spike] assignments for "${first.name}":`, aInfo,
      'count:', Array.isArray(assignments) ? assignments.length : 'not JSON');
  }
  console.log('[spike] RESULT: PASS, background fetch with session cookies works');
}

runSpike().catch((e) => console.error('[spike] error:', e.message));
browser.action.onClicked.addListener(() => {
  runSpike().catch((e) => console.error('[spike] error:', e.message));
});
