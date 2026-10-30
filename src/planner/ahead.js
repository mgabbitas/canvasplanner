// "You're N days ahead". Pure: works on a plan from plan().

const homework = (items) => items.filter((e) => !e.inClass);

/**
 * { days, weekDone }: once today's homework is all done (and something got done this
 * week), how many of the following days (days off skipped) have no homework left,
 * up to the first one that still does. weekDone: nothing left this week at all.
 */
export function daysAhead(p) {
  const today = p.days.find((d) => d.date === p.today);
  const none = { days: 0, weekDone: false };
  if (!today || homework(today.items).length) return none;
  if (!p.doneToday.count && !p.done.length) return none; // nothing done yet: not "ahead", just empty
  let days = 0;
  for (const d of p.days) {
    if (d.date <= p.today || d.blocked) continue;
    if (homework(d.items).length) return { days, weekDone: false };
    days++;
  }
  return { days, weekDone: !homework(p.overflow ?? []).length };
}

/** Between midnight and 4 AM: late enough to suggest bed. */
export const isLateNight = (hour) => hour >= 0 && hour < 4;
