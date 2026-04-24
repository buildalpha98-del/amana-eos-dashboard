/**
 * Week boundary helpers (Monday 00:00 → Sunday 23:59:59.999 local time).
 */

export type WeekWindow = {
  /** Inclusive Monday 00:00 local */
  start: Date;
  /** Inclusive Sunday 23:59:59.999 local */
  end: Date;
};

function startOfDayLocal(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function getWeekWindow(reference: Date = new Date()): WeekWindow {
  const ref = startOfDayLocal(reference);
  const dow = ref.getDay(); // 0 = Sun, 1 = Mon, ...
  const daysBackToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - daysBackToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

export function getPreviousWeekWindow(reference: Date = new Date()): WeekWindow {
  const current = getWeekWindow(reference);
  const prevStart = new Date(current.start);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(current.end);
  prevEnd.setDate(prevEnd.getDate() - 7);
  return { start: prevStart, end: prevEnd };
}
