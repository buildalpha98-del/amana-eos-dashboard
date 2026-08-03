/**
 * POST /api/enrolments/backfill-service
 *
 * Run the school→service matcher over enrolments that never got a
 * service, and optionally apply the confident results.
 *
 * Enrolments submitted before service resolution existed — and any whose
 * school name the matcher refused to guess at — have children on no roll,
 * in no ratio count, and on no invoice. Assigning them one at a time
 * through the detail panel works but doesn't scale to a backlog.
 *
 * DRY RUN BY DEFAULT. The matcher deliberately refuses ambiguous names,
 * and a wrong match puts a child at a centre they don't attend, so the
 * proposals are meant to be read before they're applied. `apply: true`
 * only ever writes the rows it reported as confident.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { matchSchoolToService } from "@/lib/school-service-match";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { generateBookings } from "@/lib/booking-generator";

const bodySchema = z.object({
  /** Write the matches. Omitted = report only. */
  apply: z.boolean().default(false),
  /**
   * Limit an apply to specific children. Lets staff accept some
   * proposals and leave the rest, rather than all-or-nothing.
   */
  childIds: z.array(z.string().min(1)).optional(),
});

export interface BackfillProposal {
  enrolmentId: string;
  childId: string;
  childName: string;
  familyName: string | null;
  schoolName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  /** Why it can't be matched, when serviceId is null. */
  reason: "matched" | "ambiguous" | "no_match" | "no_school";
  enrolmentStatus: string;
}

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { apply, childIds } = parsed.data;

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    });

    // Children are the unit of work, not enrolments — siblings can attend
    // different campuses, and only one of them may be placeable.
    const orphans = await prisma.child.findMany({
      where: {
        serviceId: null,
        status: { not: "withdrawn" },
        enrolmentId: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        schoolName: true,
        bookingPrefs: true,
        enrolmentId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const enrolmentIds = [
      ...new Set(orphans.map((c) => c.enrolmentId!).filter(Boolean)),
    ];
    const enrolments = await prisma.enrolmentSubmission.findMany({
      where: { id: { in: enrolmentIds } },
      select: {
        id: true,
        status: true,
        serviceId: true,
        primaryParent: true,
        secondaryParent: true,
      },
    });
    const byId = new Map(enrolments.map((e) => [e.id, e]));

    const proposals: BackfillProposal[] = orphans.map((c) => {
      const enrolment = byId.get(c.enrolmentId!);
      const parent = enrolment?.primaryParent as
        | { surname?: string }
        | null
        | undefined;
      const m = matchSchoolToService(c.schoolName, services);
      const reason: BackfillProposal["reason"] = !c.schoolName?.trim()
        ? "no_school"
        : m.serviceId
          ? "matched"
          : m.ambiguous
            ? "ambiguous"
            : "no_match";
      return {
        enrolmentId: c.enrolmentId!,
        childId: c.id,
        childName: `${c.firstName} ${c.surname}`.trim(),
        familyName: parent?.surname ?? null,
        schoolName: c.schoolName,
        serviceId: m.serviceId,
        serviceName: m.serviceName,
        reason,
        enrolmentStatus: enrolment?.status ?? "unknown",
      };
    });

    const matched = proposals.filter(
      (p) =>
        p.reason === "matched" &&
        (!childIds || childIds.includes(p.childId)),
    );

    if (!apply) {
      return NextResponse.json({
        dryRun: true,
        proposals,
        summary: countBy(proposals),
      });
    }

    let assigned = 0;
    let bookingsCreated = 0;

    for (const p of matched) {
      const child = orphans.find((c) => c.id === p.childId)!;
      const enrolment = byId.get(p.enrolmentId)!;

      await prisma.$transaction(async (tx) => {
        await tx.child.update({
          where: { id: p.childId },
          data: { serviceId: p.serviceId! },
        });

        // Same rule as the single-enrolment assign: only stamp the
        // submission when every one of its children lands on that
        // service, otherwise it misrepresents the siblings elsewhere.
        const remaining = await tx.child.count({
          where: {
            enrolmentId: p.enrolmentId,
            status: { not: "withdrawn" },
            serviceId: { not: p.serviceId! },
          },
        });
        if (remaining === 0 && !enrolment.serviceId) {
          await tx.enrolmentSubmission.update({
            where: { id: p.enrolmentId },
            data: { serviceId: p.serviceId! },
          });
        }

        // Billing contacts, or the family is on the roll and un-invoiceable.
        await upsertContactsFromSubmission(tx, {
          id: p.enrolmentId,
          serviceId: p.serviceId!,
          primaryParent: enrolment.primaryParent,
          secondaryParent: enrolment.secondaryParent,
        });

        // Approval generates bookings but skips children with no service,
        // so an already-confirmed enrolment has none.
        if (enrolment.status === "processed") {
          const rows = generateBookings(
            p.childId,
            p.serviceId!,
            child.bookingPrefs,
          );
          if (rows.length > 0) {
            const res = await tx.booking.createMany({
              data: rows,
              skipDuplicates: true,
            });
            bookingsCreated += res.count;
          }
        }
      });

      assigned += 1;
    }

    logger.info("Enrolment service backfill applied", {
      considered: proposals.length,
      assigned,
      bookingsCreated,
      userId: session?.user?.id,
    });

    return NextResponse.json({
      dryRun: false,
      assigned,
      bookingsCreated,
      // Everything the matcher wouldn't touch — these need a human.
      remaining: proposals.filter((p) => p.reason !== "matched"),
      summary: countBy(proposals),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

function countBy(proposals: BackfillProposal[]) {
  return {
    total: proposals.length,
    matched: proposals.filter((p) => p.reason === "matched").length,
    ambiguous: proposals.filter((p) => p.reason === "ambiguous").length,
    noMatch: proposals.filter((p) => p.reason === "no_match").length,
    noSchool: proposals.filter((p) => p.reason === "no_school").length,
  };
}
