/**
 * Compose the dynamic subline under the Home v2 greeting.
 *
 * State- and time-aware — first matching rule wins, so order matters.
 * Keep this pure (no Date.now() / new Date() inside) so tests are deterministic.
 */

export interface GreetingChild {
  firstName: string;
  /** Present if the child has an attendance record for today. */
  attendanceToday?: {
    signedInAt: string | null;
    signedOutAt: string | null;
  };
}

export interface GreetingBooking {
  /** YYYY-MM-DD */
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: string; // "confirmed" | "requested" | ...
}

export interface GreetingInput {
  children: GreetingChild[];
  bookings: GreetingBooking[];
  now: Date;
}

function toLocalDateString(d: Date): string {
  // Local YYYY-MM-DD — avoids UTC drift that ISO would cause
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNames(children: GreetingChild[]): string {
  const names = children.map((c) => c.firstName).filter(Boolean);
  if (names.length === 0) return "Everyone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function formatTime12h(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase()
    .replace(" ", "");
}

export function getGreetingSubline(input: GreetingInput): string {
  const { children, bookings, now } = input;
  const today = toLocalDateString(now);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const hhmm = hour * 60 + minute; // minutes since midnight
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday

  // 1. Weekend
  if (day === 0 || day === 6) {
    return "No bookings today — see you Monday.";
  }

  const bookingsToday = bookings.filter((b) => b.date === today);
  const hasVacationCareToday = bookingsToday.some(
    (b) => b.sessionType === "vc" && b.status === "confirmed",
  );

  // 2. VC (vacation care) day
  if (hasVacationCareToday) {
    return `Vacation care day — ${formatNames(children)} in for the day.`;
  }

  const signedInKids = children.filter(
    (c) => c.attendanceToday?.signedInAt && !c.attendanceToday.signedOutAt,
  );
  const signedOutKids = children.filter(
    (c) => c.attendanceToday?.signedInAt && c.attendanceToday.signedOutAt,
  );
  const allSignedOut =
    children.length > 0 &&
    signedInKids.length === 0 &&
    signedOutKids.length === children.length;

  // 3. Any kid currently in care
  if (signedInKids.length > 0) {
    return `${formatNames(signedInKids)} in good hands today.`;
  }

  // 4. Booked but not yet signed in, past expected session start
  //    (only applies after ~7am — BSC start window)
  const bookedTodayNotSignedIn = children.filter((c) => {
    if (c.attendanceToday?.signedInAt) return false;
    return bookingsToday.some(
      (b) => b.status === "confirmed" || b.status === "requested",
    );
  });
  if (hhmm >= 7 * 60 && bookedTodayNotSignedIn.length > 0 && signedOutKids.length === 0) {
    return `${formatNames(bookedTodayNotSignedIn)} haven't signed in yet — should be there soon.`;
  }

  // 5. All kids signed out for the day
  if (allSignedOut) {
    const lastOut = signedOutKids
      .map((c) => c.attendanceToday?.signedOutAt)
      .filter((t): t is string => !!t)
      .sort()
      .at(-1);
    const timeStr = lastOut ? formatTime12h(lastOut) : "earlier";
    return `Everyone's home safe — signed out at ${timeStr}.`;
  }

  // 6. Weekday early morning — before BSC opens
  if (hhmm < 7 * 60) {
    return "Early start — BSC opens at 7:00.";
  }

  // 7. Between BSC end (~9am) and school pickup (~3pm) — kids are at school
  if (hhmm >= 9 * 60 && hhmm < 15 * 60) {
    return "School's still in — pickup at 3:15.";
  }

  // 8. Weekday evening after ASC closes (~6:30pm)
  if (hhmm >= 18 * 60 + 30) {
    return "Day's wrapped — see you tomorrow.";
  }

  // 9. Fallback
  return "Here's today at a glance.";
}
