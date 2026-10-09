import type { RosterShiftListItem } from "@/hooks/useRosterShifts";
import { getLocalDateParts, serviceDateISO, SERVICE_TZ } from "@/lib/timezone";

export function clockTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-AU", {
    timeZone: SERVICE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Wall-clock minutes relative to the shift's Sydney calendar day. */
function minutesOnDay(value: string | Date, day: string): number {
  const date = new Date(value);
  const parts = getLocalDateParts(date, SERVICE_TZ);
  const dayOffset =
    (Date.parse(serviceDateISO(date)) - Date.parse(day)) / 86_400_000;
  return dayOffset * 1440 + parts.hour * 60 + parts.minute;
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export interface ShiftComparison {
  shift: RosterShiftListItem;
  name: string;
  day: string;
  rosterMinutes: number;
  actualMinutes: number | null;
  difference: number | null;
  flags: string[];
}

export function compareShift(
  shift: RosterShiftListItem,
  now = new Date(),
): ShiftComparison {
  const day = serviceDateISO(shift.date);
  const planned = shift.status !== "unscheduled";
  const start = minutes(shift.shiftStart);
  const end =
    minutes(shift.shiftEnd) + (shift.shiftEnd < shift.shiftStart ? 1440 : 0);
  const rosterMinutes = planned ? Math.max(0, end - start) : 0;
  const actualMinutes =
    shift.actualStart && shift.actualEnd
      ? Math.max(
          0,
          Math.round(
            (Date.parse(shift.actualEnd) - Date.parse(shift.actualStart)) /
              60_000,
          ),
        )
      : null;
  const flags: string[] = [];
  if (shift.status === "draft") flags.push("Draft roster");
  if (!shift.userId) flags.push("Unassigned shift");
  if (!planned && shift.actualStart) flags.push("No rostered shift");
  if (
    planned &&
    shift.actualStart &&
    minutesOnDay(shift.actualStart, day) - start > 5
  )
    flags.push("Late in");
  if (planned && shift.actualEnd && minutesOnDay(shift.actualEnd, day) < end)
    flags.push("Early out");
  if (shift.actualStart && !shift.actualEnd) flags.push("Still clocked in");
  if (
    planned &&
    shift.userId &&
    shift.status !== "draft" &&
    !shift.actualStart &&
    minutesOnDay(now, day) > start + 5
  )
    flags.push("No clock-in");
  if (shift.actualEnd && !shift.actualStart) flags.push("Missing clock-in");
  if (
    shift.actualStart &&
    shift.actualEnd &&
    Date.parse(shift.actualEnd) < Date.parse(shift.actualStart)
  )
    flags.push("Check clock times");
  return {
    shift,
    name: shift.user?.name || shift.staffName,
    day,
    rosterMinutes,
    actualMinutes,
    difference: actualMinutes === null ? null : actualMinutes - rosterMinutes,
    flags,
  };
}

/** Only completed clocks contribute actual hours; open clocks stay visibly pending. */
export function summarisePeople(rows: ShiftComparison[]) {
  const totals = new Map<
    string,
    {
      id: string;
      name: string;
      rosterMinutes: number;
      actualMinutes: number;
      pending: number;
    }
  >();
  for (const row of rows) {
    const id = row.shift.userId ?? `unassigned:${row.shift.id}`;
    const item = totals.get(id) ?? {
      id,
      name: row.name,
      rosterMinutes: 0,
      actualMinutes: 0,
      pending: 0,
    };
    item.rosterMinutes += row.rosterMinutes;
    item.actualMinutes += row.actualMinutes ?? 0;
    if (row.actualMinutes === null) item.pending++;
    totals.set(id, item);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
}
