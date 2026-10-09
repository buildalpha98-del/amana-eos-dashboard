/**
 * Roster helpers for the OWNA-parity features (2026-10-09): who runs a
 * centre's roster, and what a shift costs.
 */
import { prisma } from "@/lib/prisma";

/** The centre's Coordinators, its centre login, and its listed manager. */
export async function centreCoordinatorIds(serviceId: string): Promise<string[]> {
  const [members, service] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: "member", serviceId },
      select: { id: true },
    }),
    prisma.service.findUnique({ where: { id: serviceId }, select: { managerId: true } }),
  ]);
  return [...new Set([...members.map((m) => m.id), ...(service?.managerId ? [service.managerId] : [])])];
}

/** "HH:mm" → minutes past midnight. */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Paid hours for a shift (an overnight end wraps past midnight). */
export function shiftHours(start: string, end: string): number {
  let mins = minutesOf(end) - minutesOf(start);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

/** "Mon 13 Oct, 3:00–6:30pm" for notifications. */
export function shiftLabel(date: Date, start: string, end: string): string {
  const day = date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
  };
  return `${day}, ${fmt(start)}–${fmt(end)}`;
}
