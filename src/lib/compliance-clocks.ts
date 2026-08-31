/**
 * The 24-hour clocks the National Law runs on.
 *
 * Three separate obligations, all measured the same way and all easy to
 * miss because nothing in the dashboard used to count them:
 *
 *   • Reg 86 — tell the family within 24 hours of becoming aware of an
 *     incident, injury, trauma or illness.
 *   • Reg 176(2)(a) — tell the Regulatory Authority within 24 hours of
 *     becoming aware of a SERIOUS incident (Reg 12's closed list).
 *   • s.174(2)(b) / Reg 176(2)(b) — tell the Regulatory Authority within
 *     24 hours of a complaint ALLEGING a serious incident or a breach of
 *     the Law.
 *
 * Every one of them runs from when the service BECAME AWARE, not from
 * when the thing happened. A parent who mentions a playground fall three
 * days later starts the clock on the day they mention it. Getting that
 * backwards makes a service look non-compliant when it isn't — or, worse,
 * compliant when it isn't.
 *
 * The deadline is stamped at write time rather than computed on read, so
 * an overdue notification stays overdue in the register even if someone
 * later corrects the awareness date. That's deliberate: the register is
 * evidence, and evidence that rewrites itself is not evidence.
 */

export const NOTIFICATION_WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Reg 12's closed list of serious incidents, which is what decides
 * whether the 24-hour regulator clock applies at all.
 *
 * Held as data rather than free text because "was this a serious
 * incident" is a question with a defined answer, and a service that
 * types its own category can't be swept for outstanding notifications.
 */
export const SERIOUS_INCIDENT_CATEGORIES = [
  {
    value: "death",
    label: "Death of a child",
  },
  {
    value: "serious_injury",
    label: "Serious injury or trauma requiring urgent medical attention",
  },
  {
    value: "serious_illness",
    label: "Illness requiring urgent medical attention",
  },
  {
    value: "missing_child",
    label: "Child missing or unaccounted for",
  },
  {
    value: "unauthorised_removal",
    label: "Child taken from the service in breach of the regulations",
  },
  {
    value: "locked_in_or_out",
    label: "Child locked in or locked out of the service",
  },
] as const;

export type SeriousIncidentCategory =
  (typeof SERIOUS_INCIDENT_CATEGORIES)[number]["value"];

export function isSeriousIncidentCategory(
  value: string | null | undefined,
): value is SeriousIncidentCategory {
  if (!value) return false;
  return SERIOUS_INCIDENT_CATEGORIES.some((c) => c.value === value);
}

/**
 * The deadline, 24 hours after becoming aware.
 *
 * Null in, null out — an unknown awareness date has no deadline, and
 * inventing one from `now` would silently start a clock the service
 * never agreed to.
 */
export function notificationDueAt(
  becameAwareAt: Date | string | null | undefined,
): Date | null {
  if (!becameAwareAt) return null;
  const aware =
    becameAwareAt instanceof Date ? becameAwareAt : new Date(becameAwareAt);
  if (Number.isNaN(aware.getTime())) return null;
  return new Date(aware.getTime() + NOTIFICATION_WINDOW_HOURS * HOUR_MS);
}

export type ClockState =
  /** No deadline set — nothing to measure. */
  | "not_applicable"
  /** Notified, and in time. */
  | "met"
  /** Notified, but after the deadline. */
  | "late"
  /** Not yet notified, deadline still ahead. */
  | "due"
  /** Not yet notified, deadline passed. */
  | "overdue";

export interface ClockStatus {
  state: ClockState;
  dueAt: Date | null;
  /**
   * Hours remaining (positive) or hours late (negative). Null when there
   * is no deadline. Rounded to whole hours — the register is read by
   * people, and "7 hours" is more useful than "6.83".
   */
  hoursRemaining: number | null;
}

/**
 * Where a notification stands.
 *
 * `notifiedAt` decides between the met/late pair and the due/overdue
 * pair, so a late notification is never reported as simply "done" — a
 * register that hides lateness is worse than no register, because it
 * removes the prompt to explain it.
 */
export function clockStatus(
  dueAt: Date | string | null | undefined,
  notifiedAt: Date | string | null | undefined,
  now: Date = new Date(),
): ClockStatus {
  const due = dueAt ? new Date(dueAt) : null;
  if (!due || Number.isNaN(due.getTime())) {
    return { state: "not_applicable", dueAt: null, hoursRemaining: null };
  }

  const notified = notifiedAt ? new Date(notifiedAt) : null;
  const validNotified =
    notified && !Number.isNaN(notified.getTime()) ? notified : null;

  if (validNotified) {
    const late = validNotified.getTime() > due.getTime();
    return {
      state: late ? "late" : "met",
      dueAt: due,
      hoursRemaining: Math.round(
        (due.getTime() - validNotified.getTime()) / HOUR_MS,
      ),
    };
  }

  const remainingMs = due.getTime() - now.getTime();
  return {
    state: remainingMs >= 0 ? "due" : "overdue",
    dueAt: due,
    hoursRemaining: Math.round(remainingMs / HOUR_MS),
  };
}

/** Plain English for the register, in the voice someone would say it. */
export function describeClock(status: ClockStatus): string {
  switch (status.state) {
    case "not_applicable":
      return "No deadline recorded";
    case "met":
      return "Notified in time";
    case "late": {
      const late = Math.abs(status.hoursRemaining ?? 0);
      return `Notified ${formatHours(late)} late`;
    }
    case "due": {
      const left = status.hoursRemaining ?? 0;
      return left === 0 ? "Due within the hour" : `${formatHours(left)} left`;
    }
    case "overdue": {
      const over = Math.abs(status.hoursRemaining ?? 0);
      return `Overdue by ${formatHours(over)}`;
    }
  }
}

/** "3 hours" / "2 days" — days once it's past 48, which reads better. */
function formatHours(hours: number): string {
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Does this incident need the Regulatory Authority told?
 *
 * A category from Reg 12's list is the trigger. `reportableToAuthority`
 * is kept as a manual override for the cases a category doesn't cover —
 * a service can always decide to notify — but it can never turn a listed
 * serious incident OFF, because that is not a judgement call.
 */
export function requiresRegulatorNotification(incident: {
  seriousIncidentCategory?: string | null;
  reportableToAuthority?: boolean | null;
}): boolean {
  if (isSeriousIncidentCategory(incident.seriousIncidentCategory)) return true;
  return Boolean(incident.reportableToAuthority);
}
