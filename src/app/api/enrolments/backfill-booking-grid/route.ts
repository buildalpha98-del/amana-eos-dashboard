/**
 * POST /api/enrolments/backfill-booking-grid
 *
 * Repair enrolments submitted through the parent portal before the
 * booking grid was translated into the shape the dashboard reads.
 *
 * Until PR #254 the portal's submit route wrote the family's session
 * choices only under `bookingPrefs.sessions` — the grid's own vocabulary
 * (riseAndShine / amanaAfternoons / holidayQuest). Every reader wants
 * `sessionTypes` plus `days` keyed by SESSION TYPE, so the answer was
 * invisible: blank on the enrolment pack, "Not set" on the centre's
 * children list, and ZERO bookings generated on approval. Fixing the
 * route stopped it happening again; it did nothing for the families who
 * had already submitted.
 *
 * DRY RUN BY DEFAULT, like backfill-service beside it. The proposals say
 * exactly what each child would get, because "the roll changed overnight
 * and nobody knows why" is its own kind of failure.
 *
 * Nothing here guesses. A blob with no grid answer, or one a human has
 * already corrected, is left alone and never reported as repairable.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { backfillBookingGrid } from "@/lib/booking-grid";
import { generateBookings } from "@/lib/booking-generator";
import { stampRequiredRoomIds } from "@/lib/room-resolver";

const bodySchema = z.object({
  /** Write the repairs. Omitted = report only. */
  apply: z.boolean().default(false),
  /** Limit an apply to specific children, so staff can accept some. */
  childIds: z.array(z.string().min(1)).optional(),
});

export interface BookingGridProposal {
  childId: string;
  childName: string;
  enrolmentId: string | null;
  enrolmentStatus: string | null;
  serviceId: string | null;
  bookingType: string | null;
  /** What the family actually picked, in the grid's own words. */
  sessions: Record<string, string[]>;
  /** What they'd get: the canonical shape every reader wants. */
  sessionTypes: string[];
  days: Record<string, string[]>;
  /**
   * Whether repairing this child also regenerates their bookings. False
   * for a casual booking or one with no weekday pattern — the pack and
   * the children list still gain the session, the roll doesn't change.
   */
  generatesBookings: boolean;
}

interface Repair {
  child: {
    id: string;
    firstName: string;
    surname: string;
    serviceId: string | null;
    bookingPrefs: Prisma.JsonValue;
    enrolmentId: string | null;
  };
  fixed: Record<string, unknown>;
}

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { apply, childIds } = parsed.data;

    // `bookingPrefs` is a Json column and the thing that marks a row as
    // broken lives inside it, so the filtering is done in JS. Withdrawn
    // children are left out: repairing a roll they've left helps nobody.
    const candidates = await prisma.child.findMany({
      where: { status: { not: "withdrawn" }, enrolmentId: { not: null } },
      select: {
        id: true,
        firstName: true,
        surname: true,
        serviceId: true,
        bookingPrefs: true,
        enrolmentId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const repairs: Repair[] = [];
    for (const child of candidates) {
      const fixed = backfillBookingGrid(child.bookingPrefs);
      if (fixed) repairs.push({ child, fixed });
    }

    const enrolmentIds = [
      ...new Set(repairs.map((r) => r.child.enrolmentId).filter(Boolean)),
    ] as string[];
    const enrolments = await prisma.enrolmentSubmission.findMany({
      where: { id: { in: enrolmentIds } },
      select: { id: true, status: true, children: true },
    });
    const enrolmentById = new Map(enrolments.map((e) => [e.id, e]));

    const proposals: BookingGridProposal[] = repairs.map(({ child, fixed }) => {
      const enrolment = child.enrolmentId
        ? enrolmentById.get(child.enrolmentId)
        : undefined;
      const days = fixed.days as Record<string, string[]>;
      const bookingType =
        typeof fixed.bookingType === "string" ? fixed.bookingType : null;
      return {
        childId: child.id,
        childName: `${child.firstName} ${child.surname}`.trim(),
        enrolmentId: child.enrolmentId,
        enrolmentStatus: enrolment?.status ?? null,
        serviceId: child.serviceId,
        bookingType,
        sessions: (fixed.sessions ?? {}) as Record<string, string[]>,
        sessionTypes: fixed.sessionTypes as string[],
        days,
        generatesBookings:
          bookingType === "permanent" &&
          Boolean(child.serviceId) &&
          Object.values(days).some((d) => d.length > 0),
      };
    });

    if (!apply) {
      return NextResponse.json({
        dryRun: true,
        proposals,
        summary: summarise(proposals),
      });
    }

    const selected = childIds
      ? repairs.filter((r) => childIds.includes(r.child.id))
      : repairs;

    let childrenRepaired = 0;
    let submissionsRepaired = 0;
    let bookingsCreated = 0;

    // Group by enrolment: the submission's own `children` blob is what
    // the enrolment PDF prints, and it holds every sibling at once.
    const byEnrolment = new Map<string, Repair[]>();
    for (const r of selected) {
      const key = r.child.enrolmentId;
      if (!key) continue;
      byEnrolment.set(key, [...(byEnrolment.get(key) ?? []), r]);
    }

    for (const [enrolmentId, group] of byEnrolment) {
      const enrolment = enrolmentById.get(enrolmentId);

      await prisma.$transaction(async (tx) => {
        for (const { child, fixed } of group) {
          await tx.child.update({
            where: { id: child.id },
            data: { bookingPrefs: fixed as Prisma.InputJsonValue },
          });
          childrenRepaired += 1;
        }

        // The submission blob is a SEPARATE copy of the same answer, and
        // it's the one staff print. Repairing only the Child row would
        // leave the pack still saying nothing.
        const blob = repairSubmissionChildren(enrolment?.children);
        if (blob) {
          await tx.enrolmentSubmission.update({
            where: { id: enrolmentId },
            data: { children: blob as Prisma.InputJsonValue },
          });
          submissionsRepaired += 1;
        }

        // Approval generates bookings from bookingPrefs. These families
        // were approved with a blob that produced none, so the roll has
        // been empty ever since — this is the part they'd notice.
        if (enrolment?.status === "processed") {
          for (const { child, fixed } of group) {
            if (!child.serviceId) continue;
            const rows = generateBookings(child.id, child.serviceId, fixed);
            if (rows.length === 0) continue;
            const res = await tx.booking.createMany({
              // Stage 1 dual key — see room-resolver.ts.
              data: await stampRequiredRoomIds(rows),
              skipDuplicates: true,
            });
            bookingsCreated += res.count;
          }
        }
      });
    }

    logger.info("Booking-grid backfill applied", {
      considered: proposals.length,
      childrenRepaired,
      submissionsRepaired,
      bookingsCreated,
      userId: session?.user?.id,
    });

    return NextResponse.json({
      dryRun: false,
      childrenRepaired,
      submissionsRepaired,
      bookingsCreated,
      summary: summarise(proposals),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/**
 * The submission's `children` array with every repairable entry fixed.
 *
 * Returns null when nothing changed, so an unchanged submission isn't
 * rewritten. Reads defensively: this is a Json column, and a malformed
 * one must not cost the Child rows their repair.
 */
function repairSubmissionChildren(children: unknown): unknown[] | null {
  if (!Array.isArray(children)) return null;

  let changed = false;
  const next = children.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const row = entry as Record<string, unknown>;
    const fixed = backfillBookingGrid(row.bookingPrefs);
    if (!fixed) return entry;
    changed = true;
    return { ...row, bookingPrefs: fixed };
  });

  return changed ? next : null;
}

function summarise(proposals: BookingGridProposal[]) {
  return {
    total: proposals.length,
    generatingBookings: proposals.filter((p) => p.generatesBookings).length,
    approved: proposals.filter((p) => p.enrolmentStatus === "processed").length,
    awaitingService: proposals.filter((p) => !p.serviceId).length,
  };
}
