import { prisma } from "@/lib/prisma";
import { WhatsAppNonPostReason } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeekBounds {
  start: Date;
  end: Date;
  weekNumber: number;
  year: number;
}

export interface TwoWeekConcern {
  serviceId: string;
  serviceName: string;
  coordinatorName: string | null;
  coordinatorUserId: string | null;
  lastWeekPosted: number;
  thisWeekPosted: number;
  reason: "two_consecutive_below_floor";
}

export interface ResolvedCoordinator {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export const COORDINATOR_WEEKLY_TARGET = 5;
export const COORDINATOR_WEEKLY_FLOOR = 4;

export const NETWORK_TARGETS = {
  engagement: { target: 3, floor: 2 },
  announcements: { target: 2, floor: 2 },
} as const;

export const NETWORK_WIDE_COORD_TARGET = 50;
export const NETWORK_WIDE_COORD_FLOOR = 35;

const LEAVE_LIKE_REASONS = new Set<WhatsAppNonPostReason>([
  WhatsAppNonPostReason.coordinator_on_leave,
  WhatsAppNonPostReason.school_closure,
  WhatsAppNonPostReason.public_holiday,
]);

export function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

export function getWeekBounds(now: Date = new Date()): WeekBounds {
  const d = startOfDayUTC(now);
  const dayOfWeek = d.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = new Date(d.getTime() - daysSinceMonday * DAY_MS);
  const end = new Date(start.getTime() + 7 * DAY_MS - 1);

  const jan1 = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((start.getTime() - jan1.getTime()) / DAY_MS) + 1;
  const weekNumber = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);

  return { start, end, weekNumber, year: start.getUTCFullYear() };
}

export function getWeekdaysInWeek(weekStart: Date): Date[] {
  const start = startOfDayUTC(weekStart);
  return [0, 1, 2, 3, 4].map((i) => new Date(start.getTime() + i * DAY_MS));
}

export function getYesterdayCheckDate(now: Date = new Date()): Date {
  const today = startOfDayUTC(now);
  const day = today.getUTCDay();
  if (day === 1) return new Date(today.getTime() - 3 * DAY_MS);
  if (day === 0) return new Date(today.getTime() - 2 * DAY_MS);
  if (day === 6) return new Date(today.getTime() - 1 * DAY_MS);
  return new Date(today.getTime() - DAY_MS);
}

export function formatIsoDate(date: Date): string {
  return startOfDayUTC(date).toISOString().slice(0, 10);
}

export function dayLabel(date: Date): "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return labels[date.getUTCDay()];
}

interface WeekTallyOpts {
  serviceId: string;
  weekStart: Date;
}

interface WeekTally {
  posted: number;
  notPosted: number;
  notChecked: number;
  excluded: number;
}

export async function tallyServiceWeek(opts: WeekTallyOpts): Promise<WeekTally> {
  const days = getWeekdaysInWeek(opts.weekStart);
  const records = await prisma.whatsAppCoordinatorPost.findMany({
    where: {
      serviceId: opts.serviceId,
      postedDate: { gte: days[0], lte: days[days.length - 1] },
    },
    select: { postedDate: true, posted: true, notPostingReason: true },
  });

  const byDate = new Map<string, { posted: boolean; reason: WhatsAppNonPostReason | null }>();
  for (const r of records) {
    byDate.set(formatIsoDate(r.postedDate), { posted: r.posted, reason: r.notPostingReason });
  }

  const tally: WeekTally = { posted: 0, notPosted: 0, notChecked: 0, excluded: 0 };
  for (const day of days) {
    const r = byDate.get(formatIsoDate(day));
    if (!r) {
      tally.notChecked++;
      continue;
    }
    if (r.posted) {
      tally.posted++;
    } else if (r.reason && LEAVE_LIKE_REASONS.has(r.reason)) {
      tally.excluded++;
    } else {
      tally.notPosted++;
    }
  }
  return tally;
}

export async function detectTwoWeekConcerns(
  opts: { now?: Date } = {},
): Promise<TwoWeekConcern[]> {
  const now = opts.now ?? new Date();
  const thisWeek = getWeekBounds(now);
  const lastWeek = getWeekBounds(new Date(thisWeek.start.getTime() - DAY_MS));

  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const concerns: TwoWeekConcern[] = [];
  for (const svc of services) {
    const [thisTally, lastTally] = await Promise.all([
      tallyServiceWeek({ serviceId: svc.id, weekStart: thisWeek.start }),
      tallyServiceWeek({ serviceId: svc.id, weekStart: lastWeek.start }),
    ]);

    if (
      thisTally.posted < COORDINATOR_WEEKLY_FLOOR &&
      lastTally.posted < COORDINATOR_WEEKLY_FLOOR
    ) {
      const coord = await resolveCoordinatorForService(svc.id);
      concerns.push({
        serviceId: svc.id,
        serviceName: svc.name,
        coordinatorName: coord?.name ?? null,
        coordinatorUserId: coord?.id ?? null,
        lastWeekPosted: lastTally.posted,
        thisWeekPosted: thisTally.posted,
        reason: "two_consecutive_below_floor",
      });
    }
  }
  return concerns;
}

export async function resolveCoordinatorForService(
  serviceId: string,
): Promise<ResolvedCoordinator | null> {
  const user = await prisma.user.findFirst({
    where: { serviceId, role: "coordinator", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true },
  });
  return user ?? null;
}

export function normalisePhoneForWaMe(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d]/g, "");
  if (cleaned.length === 0) return null;
  if (cleaned.startsWith("0")) return `61${cleaned.slice(1)}`;
  return cleaned;
}

export function buildWaMeLink(phone: string | null | undefined, message: string): string | null {
  const normalised = normalisePhoneForWaMe(phone);
  if (!normalised) return null;
  return `https://wa.me/${normalised}?text=${encodeURIComponent(message)}`;
}

export function buildFlagMessage(opts: {
  context: "one_off" | "two_week_pattern";
  coordinatorName: string | null;
  centreName: string;
  day?: string;
}): string {
  const name = opts.coordinatorName ?? "there";
  if (opts.context === "two_week_pattern") {
    return `Hey ${name}, hope you're going well. I've been keeping an eye on the parents' group posts and noticed it's been a quieter couple of weeks for ${opts.centreName}. Totally understand things get busy — what support would help? Happy to jump on a quick call or share some plug-and-play content if that makes it easier.`;
  }
  const day = opts.day ?? "recently";
  return `Hey ${name}, hope you're well! Just noticed there wasn't a post in the ${opts.centreName} parents' group on ${day}. All good — just checking in to see if there's anything you need to make daily posts easier? Happy to share templates or content ideas if helpful.`;
}
