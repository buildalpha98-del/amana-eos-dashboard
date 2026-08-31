/**
 * Term autopilot pack — the pre-briefed creative requests the weekly
 * `/api/cron/term-autopilot` cron creates per active service ahead of each
 * school term (Marketing Hub Phase 5).
 *
 * Idempotency: every generated request's `purpose` ENDS with
 * `\n[auto:term-pack:<year>-T<term>]`. The marker is checked PER SERVICE
 * inside the creation loop, so a run that crashes after 3 of 20 services
 * resumes the remaining 17 on the next weekly run instead of a global
 * marker locking them out forever. (Index-less `contains` scan is fine —
 * low-hundreds-row table, weekly cadence.)
 */
import type { CreativeRequestType, Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_CHECKLISTS,
  defaultDueDate,
} from "@/lib/creative-request/constants";
import {
  createWithNumberRetry,
  generateRequestNumber,
} from "@/lib/creative-request/request-number";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TermPackItem {
  type: CreativeRequestType;
  /** Intended in-market lead time (weeks before term start) — echoed in the
   *  brief so the fulfiller knows the target; due dates are computed from
   *  termStart (see the clamp in `createTermPackForService`). */
  weeksBefore: number;
  title: (term: number, year: number, serviceName: string) => string;
  purpose: (term: number, year: number) => string;
}

/** v1 pack — one of each per active service, every term. */
export const TERM_PACK: TermPackItem[] = [
  {
    type: "poster",
    weeksBefore: 4,
    title: (term, _year, serviceName) => `Term ${term} welcome poster — ${serviceName}`,
    purpose: (term, year) =>
      `Welcome-back poster for the centre entrance/window ahead of Term ${term} ${year}. ` +
      `Warm "welcome back" messaging, term start date and centre contact details. ` +
      `Aim to have it displayed ~4 weeks before term starts.\n` +
      `Auto-created by term autopilot.`,
  },
  {
    type: "flyer",
    weeksBefore: 4,
    title: (term, _year, serviceName) => `Term ${term} program flyer — ${serviceName}`,
    purpose: (term, year) =>
      `Program flyer for Term ${term} ${year} — activities, session times and booking info ` +
      `for parents, handed out at pickup and via the front desk. ` +
      `Aim to have it in-market ~4 weeks before term starts.\n` +
      `Auto-created by term autopilot.`,
  },
  {
    type: "social_tile",
    weeksBefore: 3,
    title: (term, _year, serviceName) => `Term ${term} countdown tiles — ${serviceName}`,
    purpose: (term, year) =>
      `Countdown tile set for socials ahead of Term ${term} ${year} ` +
      `("X sleeps to go", "we're back!"). Square exports for the usual channels. ` +
      `Aim to start posting ~3 weeks before term starts.\n` +
      `Auto-created by term autopilot.`,
  },
  {
    type: "email_header",
    weeksBefore: 3,
    title: (term, _year, serviceName) => `Term ${term} newsletter headers — ${serviceName}`,
    purpose: (term, year) =>
      `Header banners for Term ${term} ${year} parent newsletters/emails, on-brand and ` +
      `term-themed. Aim to have them ready ~3 weeks before term starts.\n` +
      `Auto-created by term autopilot.`,
  },
];

/** Idempotency marker appended (with a leading newline) to every generated purpose. */
export function termPackMarker(year: number, term: number): string {
  return `[auto:term-pack:${year}-T${term}]`;
}

export interface CreateTermPackArgs {
  year: number;
  term: number;
  /** Term start date — drives the due-date target (termStart - 7d). */
  termStart: Date;
  service: { id: string; name: string };
  requestedById: string;
}

/**
 * Create the 4-request pack for ONE service. Returns the number of requests
 * created (0 when the service already carries this term's marker).
 *
 * Creates are SEQUENTIAL — request numbers are count-based, so parallel
 * creates would mint duplicates and burn createWithNumberRetry's attempts.
 */
export async function createTermPackForService(
  db: Db,
  { year, term, termStart, service, requestedById }: CreateTermPackArgs,
): Promise<number> {
  const marker = termPackMarker(year, term);

  // Per-service idempotency: skip only THIS service if it already has the pack.
  const existing = await db.creativeRequest.count({
    where: { serviceId: service.id, purpose: { contains: marker } },
  });
  if (existing > 0) return 0;

  const now = new Date();
  let created = 0;

  for (const item of TERM_PACK) {
    // Due-date clamp: target a week before term start (assets need to be
    // in-market by day one), but never earlier than today + the type's normal
    // turnaround — a pack minted close to term start must not demand e.g. a
    // poster in less than its 5-business-day turnaround. In short:
    //   dueDate = max(termStart - 7d, defaultDueDate(type, today))
    const target = new Date(termStart.getTime() - 7 * DAY_MS);
    const floor = defaultDueDate(item.type, now);
    const dueDate = target >= floor ? target : floor;

    await createWithNumberRetry(
      (requestNumber) =>
        db.creativeRequest.create({
          data: {
            requestNumber,
            title: item.title(term, year, service.name),
            type: item.type,
            purpose: `${item.purpose(term, year)}\n${marker}`,
            serviceId: service.id,
            requestedById,
            dueDate,
            checklist: DEFAULT_CHECKLISTS[item.type].map((label) => ({
              label,
              done: false,
            })),
          },
        }),
      () => generateRequestNumber(db, now.getFullYear()),
    );
    created++;
  }

  return created;
}

/**
 * ONE digest notification per active marketing user (never per-request
 * fan-out — 20 services x 4 requests would be spam). Swallows errors like
 * the other creative-request notifiers: the requests are already committed.
 */
export async function notifyTermPackCreated(
  db: Db,
  { count, term, year }: { count: number; term: number; year: number },
): Promise<void> {
  try {
    const marketers = await db.user.findMany({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    if (marketers.length === 0) return;
    await db.userNotification.createMany({
      data: marketers.map((u) => ({
        userId: u.id,
        type: NOTIFICATION_TYPES.TERM_PACK_CREATED,
        title: `Term ${term} ${year} request pack created`,
        body: `${count} pre-briefed creative requests are ready in the queue.`,
        link: "/requests",
      })),
    });
  } catch (err) {
    logger.error("term-pack digest notification failed", { err, term, year });
  }
}
