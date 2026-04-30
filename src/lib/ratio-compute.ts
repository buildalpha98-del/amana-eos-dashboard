import { prisma } from "@/lib/prisma";

export type SessionTypeKey = "bsc" | "asc" | "vc";

export interface RatioLive {
  serviceId: string;
  sessionType: SessionTypeKey;
  educatorCount: number;
  educatorIds: string[];
  childCount: number;
  ratioText: string; // "1:10"
  belowRatio: boolean;
  /** Minimum ratio this service uses (e.g. "1:15" — federal default). */
  minRatio: string;
  notes: string;
  capturedAt: Date;
}

const FEDERAL_DEFAULT_MIN_RATIO = "1:15";

/**
 * Pull the per-session minimum ratio from Service.ratioSettings Json, falling
 * back to the federal OSHC default (1 educator : 15 children).
 */
export function resolveMinRatio(
  settings: unknown,
  sessionType: SessionTypeKey,
): string {
  if (
    settings &&
    typeof settings === "object" &&
    settings !== null &&
    sessionType in (settings as Record<string, unknown>)
  ) {
    const entry = (settings as Record<string, { ratio?: string }>)[sessionType];
    if (entry && typeof entry.ratio === "string" && /^\d+:\d+$/.test(entry.ratio)) {
      return entry.ratio;
    }
  }
  return FEDERAL_DEFAULT_MIN_RATIO;
}

/** Parse "1:15" → { staff: 1, children: 15 }. */
function parseRatio(s: string): { staff: number; children: number } {
  const [staff, children] = s.split(":").map((n) => Number(n));
  if (!staff || !children || staff <= 0 || children <= 0) {
    return { staff: 1, children: 15 };
  }
  return { staff, children };
}

/**
 * `"HH:mm"` comparison works lexicographically when zero-padded.
 */
function hhmmNow(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function dayStartLocal(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Compute the live ratio across all three session types for one service.
 *
 * Approximation used (documented in spec):
 *   - rostered-now = RosterShift rows where date=today AND shiftStart ≤ HH:mm(now) AND shiftEnd > HH:mm(now)
 *   - in-care      = AttendanceRecord rows where serviceId=X AND date=today AND signInTime NOT NULL AND signOutTime NULL
 *
 * True "staff signed in now" is queued behind a follow-on StaffAttendance model.
 * The `notes` field on each snapshot flags that it used the approximation.
 */
export async function computeLiveRatios(
  serviceId: string,
  now: Date = new Date(),
): Promise<RatioLive[]> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, ratioSettings: true },
  });
  if (!service) return [];

  const dayStart = dayStartLocal(now);
  const hhmm = hhmmNow(now);

  const [shifts, attendance] = await Promise.all([
    prisma.rosterShift.findMany({
      where: {
        serviceId,
        date: dayStart,
      },
      select: {
        userId: true,
        staffName: true,
        sessionType: true,
        shiftStart: true,
        shiftEnd: true,
      },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        serviceId,
        date: dayStart,
        signInTime: { not: null },
        signOutTime: null,
      },
      select: { id: true, sessionType: true },
    }),
  ]);

  const nowOnShift = shifts.filter(
    (s) => s.shiftStart <= hhmm && s.shiftEnd > hhmm,
  );

  const sessions: SessionTypeKey[] = ["bsc", "asc", "vc"];

  return sessions.map<RatioLive>((st) => {
    const educatorShiftRows = nowOnShift.filter((s) => s.sessionType === st);
    // De-dup educators by userId when present; fall back to staffName.
    const seen = new Set<string>();
    const educatorIds: string[] = [];
    for (const row of educatorShiftRows) {
      const key = row.userId ?? `name:${row.staffName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (row.userId) educatorIds.push(row.userId);
    }
    const educatorCount = seen.size;

    const childCount = attendance.filter((a) => a.sessionType === st).length;

    const minRatio = resolveMinRatio(service.ratioSettings, st);
    const { staff, children } = parseRatio(minRatio);
    // The policy is `staff : children` — so actual children-per-staff must
    // not exceed `children / staff`. Convert educatorCount to "equivalent
    // staff slots" = educatorCount (each counts as one slot).
    const allowedChildren = (children / staff) * educatorCount;
    const belowRatio = childCount > allowedChildren;

    const ratioText =
      educatorCount === 0
        ? `0:${childCount}`
        : `${educatorCount}:${childCount}`;

    return {
      serviceId,
      sessionType: st,
      educatorCount,
      educatorIds,
      childCount,
      ratioText,
      belowRatio,
      minRatio,
      notes: "approx:rostered-now*in-care-now",
      capturedAt: now,
    };
  });
}
