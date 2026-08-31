/**
 * POST /api/billing/statements/generate — draft an invoice from a
 * family's actual bookings for a period.
 *
 * THE GAP THIS CLOSES: POST /api/billing/statements requires the caller
 * to supply every line item by hand. Nothing derived them from what a
 * child actually attended, so invoicing a family meant a staff member
 * retyping each session from another screen. That's the billing loop not
 * closing — and it's the reason invoicing still happens in OWNA.
 *
 * Produces a DRAFT. Staff review and issue it; this never sends anything
 * to a family on its own.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { applyFamilyDiscount } from "@/lib/family-discount";
import { logger } from "@/lib/logger";
import { sumDollars, fromCents } from "@/lib/money";
import { requireFromMap, resolveRoomIds } from "@/lib/room-resolver";
import { roomsForService } from "@/lib/room-names";

const bodySchema = z.object({
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  /**
   * Apply the family's recorded discounts to this invoice.
   *
   * OFF by default, deliberately. A discount that applies itself is one
   * nobody chose; the biller decides, per invoice, having seen what it
   * comes to. When false we still REPORT what's available, so the
   * choice is offered rather than buried.
   */
  applyDiscounts: z.boolean().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * No label map. The line description names the ROOM, looked up from
 * the room records — Stage 2 of docs/rooms-migration-plan.md. The three
 * codes this knew meant an extra room's line read "extra1" on the
 * family's statement.
 */

/** Calendar dates, parsed as UTC — these are days, not instants. */
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { contactId, serviceId, periodStart, periodEnd, dueDate, applyDiscounts } =
      parsed.data;

    const start = day(periodStart);
    const end = day(periodEnd);
    if (end < start) {
      throw ApiError.badRequest("The period end can't be before the start.");
    }

    const contact = await prisma.centreContact.findUnique({
      where: { id: contactId },
      select: { id: true, email: true, serviceId: true },
    });
    if (!contact) throw ApiError.notFound("Family not found");

    // The family's children AT THIS SERVICE. A family with a child at
    // another centre must not have that child's sessions land on this
    // centre's invoice.
    const children = await prisma.child.findMany({
      where: {
        serviceId,
        enrolment: { primaryParent: { path: ["email"], equals: contact.email } },
      },
      select: { id: true, firstName: true, surname: true },
    });

    if (children.length === 0) {
      throw ApiError.badRequest(
        "No children found for this family at this service.",
      );
    }
    const childIds = children.map((c) => c.id);
    const nameById = new Map(children.map((c) => [c.id, c.firstName]));

    const bookings = await prisma.booking.findMany({
      where: {
        childId: { in: childIds },
        serviceId,
        date: { gte: start, lte: end },
        // Only sessions that actually stand. A requested-but-never-approved
        // or cancelled booking is not a charge.
        status: "confirmed",
      },
      select: {
        id: true,
        childId: true,
        date: true,
        sessionType: true,
        fee: true,
        ccsApplied: true,
        gapFee: true,
      },
      orderBy: [{ date: "asc" }],
    });

    if (bookings.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: "no_bookings",
        message: "No confirmed sessions in that period.",
      });
    }

    /**
     * DOUBLE-BILLING GUARD.
     *
     * A session already on a live invoice must never be billed again.
     * Matched on child + date + sessionType, which is exactly the
     * uniqueness Booking itself enforces. Void statements are excluded —
     * voiding is how staff undo an invoice, so those sessions are
     * legitimately re-billable.
     */
    const alreadyBilled = await prisma.statementLineItem.findMany({
      where: {
        childId: { in: childIds },
        date: { gte: start, lte: end },
        statement: { status: { not: "void" } },
      },
      select: { childId: true, date: true, sessionType: true },
    });
    const billedKey = new Set(
      alreadyBilled.map(
        (l) => `${l.childId}|${l.date.toISOString().slice(0, 10)}|${l.sessionType}`,
      ),
    );

    /**
     * Room names for the line descriptions, keyed by the slot the
     * booking still carries. One query for the centre, cached — see
     * room-names.ts. A room the enum never knew about has no slot to
     * key on, which is why this is a stopgap until Stage 4 drops
     * `sessionType` from the booking itself.
     */
    const roomLabels = new Map(
      (await roomsForService(serviceId))
        .filter((r) => r.legacyKey !== null)
        .map((r) => [r.legacyKey!, r.name]),
    );

    const fresh = bookings.filter(
      (b) =>
        !billedKey.has(
          `${b.childId}|${b.date.toISOString().slice(0, 10)}|${b.sessionType}`,
        ),
    );
    const skipped = bookings.length - fresh.length;

    if (fresh.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: "all_billed",
        message: `All ${bookings.length} sessions in that period are already on an invoice.`,
      });
    }

    const lineItems = fresh.map((b) => {
      const gross = b.fee ?? 0;
      const ccs = b.ccsApplied ?? 0;
      // Trust a stored gap when present; otherwise derive it. Deriving in
      // cents so a float subtraction can't leave 0.009999 behind.
      const gap =
        b.gapFee ?? fromCents(sumDollars([gross]) - sumDollars([ccs]));
      return {
        childId: b.childId,
        date: b.date,
        sessionType: b.sessionType,
        description: `${nameById.get(b.childId) ?? "Child"} — ${
          roomLabels.get(b.sessionType) ?? b.sessionType
        } ${b.date.toISOString().slice(0, 10)}`,
        grossFee: gross,
        ccsHours: 0,
        ccsRate: 0,
        ccsAmount: ccs,
        gapAmount: gap,
      };
    });

    // ── Discounts ────────────────────────────────────────────────────
    // Sibling, staff, hardship. Read for every line because a discount
    // can be scoped to one child or one room, and a fortnight's invoice
    // covers several of both.
    const discountRules = await prisma.familyDiscount.findMany({
      where: {
        contactId,
        serviceId,
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      select: {
        id: true,
        childId: true,
        sessionType: true,
        kind: true,
        value: true,
        reason: true,
        startDate: true,
        endDate: true,
      },
    });

    /** What each line would be discounted by, and under what name. */
    const discountFor = (l: (typeof lineItems)[number]) => {
      const forThisChild = discountRules.filter(
        (r) => r.childId === null || r.childId === l.childId,
      );
      if (forThisChild.length === 0) return null;
      const outcome = applyFamilyDiscount(
        Math.round(l.gapAmount * 100),
        forThisChild,
        l.sessionType,
        l.date,
      );
      return outcome.applied
        ? { cents: outcome.discountCents, reason: outcome.applied.reason }
        : null;
    };

    const discountable = lineItems
      .map((l) => ({ line: l, discount: discountFor(l) }))
      .filter((x) => x.discount !== null);
    const availableDiscountCents = discountable.reduce(
      (sum, x) => sum + (x.discount?.cents ?? 0),
      0,
    );

    // A discount is its own LINE, not a quietly smaller fee: a family
    // reading the invoice should see the full price and what came off.
    const discountLines =
      applyDiscounts && discountable.length > 0
        ? discountable.map(({ line, discount }) => ({
            childId: line.childId,
            date: line.date,
            sessionType: line.sessionType,
            description: `${nameById.get(line.childId) ?? "Child"} — ${
              discount!.reason
            }`,
            grossFee: 0,
            ccsHours: 0,
            ccsRate: 0,
            ccsAmount: 0,
            gapAmount: -fromCents(discount!.cents),
          }))
        : [];

    const allLines = [...lineItems, ...discountLines];

    /**
     * Stage 1 dual key. A line item reaches a service only through its
     * statement, so the rooms resolve against that one service.
     */
    const lineRoomIds = await resolveRoomIds(
      serviceId,
      allLines.map((l) => l.sessionType),
    );
    const linesWithRooms = allLines.map((l) => ({
      ...l,
      roomId: requireFromMap(lineRoomIds, l.sessionType),
    }));

    // Totals in cents, then back — summing floats across a fortnight of
    // sessions drifts, and this figure is what a family is asked to pay.
    const totalFeesCents = sumDollars(allLines.map((l) => l.grossFee));
    const totalCcsCents = sumDollars(allLines.map((l) => l.ccsAmount));
    const gapCents = sumDollars(allLines.map((l) => l.gapAmount));

    const statement = await prisma.statement.create({
      data: {
        contactId,
        serviceId,
        periodStart: start,
        periodEnd: end,
        totalFees: fromCents(totalFeesCents),
        totalCcs: fromCents(totalCcsCents),
        gapFee: fromCents(gapCents),
        amountPaid: 0,
        balance: fromCents(gapCents),
        // Draft, always. Staff review before a family sees anything.
        status: "draft",
        ...(dueDate ? { dueDate: day(dueDate) } : {}),
        lineItems: { create: linesWithRooms },
      },
      include: { lineItems: true },
    });

    logger.info("Statement generated from bookings", {
      userId: session?.user?.id,
      statementId: statement.id,
      contactId,
      serviceId,
      sessions: fresh.length,
      skippedAlreadyBilled: skipped,
    });

    return NextResponse.json({
      ok: true,
      statement,
      sessionsBilled: fresh.length,
      skippedAlreadyBilled: skipped,
      // Whether or not it was applied, say what's on file. An unapplied
      // discount that nobody was told about is the same as not having
      // recorded one.
      discountsApplied: applyDiscounts === true && discountLines.length > 0,
      availableDiscount: fromCents(availableDiscountCents),
      discountReasons: [
        ...new Set(discountable.map((x) => x.discount!.reason)),
      ],
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
