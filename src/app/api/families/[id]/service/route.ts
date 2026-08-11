/**
 * POST /api/families/[id]/service
 *
 * Move a whole family to a service — the children, the enrolment records
 * and the billing contacts together.
 *
 * A ParentAccount has no service column, and that's deliberate: the
 * family's centre IS wherever their children sit, and a second copy of
 * that fact would go stale the first time one child transferred. So
 * "which service is this family at?" is answered by the children, and
 * moving the family means moving them.
 *
 * The reason this exists alongside the per-enrolment assign route is that
 * staff work from the family, not the submission. A family with two
 * enrolments (a sibling added later) would otherwise need the same job
 * done twice, and doing it once leaves a half-moved household — children
 * at the new centre, billing contacts at the old one.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { generateBookings } from "@/lib/booking-generator";
import { stampRequiredRoomIds } from "@/lib/room-resolver";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  serviceId: z.string().min(1),
  /** Limit to specific children. Omitted = the whole family. */
  childIds: z.array(z.string().min(1)).optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { serviceId, childIds } = parsed.data;

    const [account, service] = await Promise.all([
      prisma.parentAccount.findUnique({
        where: { id },
        select: { id: true, email: true, familyName: true },
      }),
      prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, name: true, status: true },
      }),
    ]);
    if (!account) throw ApiError.notFound("Family not found");
    if (!service) throw ApiError.notFound("Service not found");
    if (service.status !== "active") {
      throw ApiError.badRequest(`${service.name} isn't an active service.`);
    }

    // There is no foreign key between ParentAccount and
    // EnrolmentSubmission — they're joined on email.
    // Fetched then filtered in JS, matching the family page: the parent
    // email lives in a JSON blob and isn't reliably normalised, so a
    // Prisma JSON path filter is case-sensitive and quietly misses rows.
    const candidates = await prisma.enrolmentSubmission.findMany({
      select: {
        id: true,
        status: true,
        serviceId: true,
        primaryParent: true,
        secondaryParent: true,
        childRecords: {
          select: { id: true, status: true, serviceId: true, bookingPrefs: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const enrolments = candidates.filter((e) => {
      const p = e.primaryParent as Record<string, unknown> | null;
      return (
        p &&
        typeof p.email === "string" &&
        p.email.toLowerCase().trim() === account.email
      );
    });

    if (enrolments.length === 0) {
      throw ApiError.badRequest(
        "This family has no enrolment yet, so there are no children to place.",
      );
    }

    const allChildren = enrolments.flatMap((e) =>
      e.childRecords
        .filter((c) => c.status !== "withdrawn")
        .map((c) => ({ ...c, enrolmentId: e.id })),
    );
    const targets = childIds
      ? allChildren.filter((c) => childIds.includes(c.id))
      : allChildren;

    if (targets.length === 0) {
      throw ApiError.badRequest("Select at least one child to move.");
    }
    if (childIds && targets.length !== childIds.length) {
      throw ApiError.badRequest(
        "Some of those children don't belong to this family.",
      );
    }

    const movedEnrolmentIds = new Set(targets.map((c) => c.enrolmentId));
    let bookingsCreated = 0;

    await prisma.$transaction(async (tx) => {
      await tx.child.updateMany({
        where: { id: { in: targets.map((c) => c.id) } },
        data: { serviceId },
      });

      for (const enrolment of enrolments) {
        if (!movedEnrolmentIds.has(enrolment.id)) continue;

        // Stamp the submission only when none of its children are left
        // anywhere else — with a split family that field can't be right.
        const stayingElsewhere = enrolment.childRecords.some(
          (c) =>
            c.status !== "withdrawn" &&
            !targets.some((t) => t.id === c.id) &&
            c.serviceId !== serviceId,
        );
        if (!stayingElsewhere) {
          await tx.enrolmentSubmission.update({
            where: { id: enrolment.id },
            data: { serviceId },
          });
        }

        // Billing contacts at the destination. Moving children without
        // these leaves a family on the roll that can't be invoiced.
        await upsertContactsFromSubmission(tx, {
          id: enrolment.id,
          serviceId,
          primaryParent: enrolment.primaryParent,
          secondaryParent: enrolment.secondaryParent,
        });

        // Bookings are generated at approval and skipped for a child with
        // no service, so a confirmed enrolment placed late has none.
        if (enrolment.status === "processed") {
          for (const child of targets.filter(
            (t) => t.enrolmentId === enrolment.id,
          )) {
            const rows = generateBookings(child.id, serviceId, child.bookingPrefs);
            if (rows.length > 0) {
              const res = await tx.booking.createMany({
                // Stage 1 dual key — see room-resolver.ts.
                data: await stampRequiredRoomIds(rows),
                skipDuplicates: true,
              });
              bookingsCreated += res.count;
            }
          }
        }
      }
    });

    logger.info("Family moved to service", {
      familyId: id,
      familyName: account.familyName,
      serviceId,
      serviceName: service.name,
      children: targets.length,
      bookingsCreated,
      userId: session?.user?.id,
    });

    return NextResponse.json({
      ok: true,
      serviceId,
      serviceName: service.name,
      childrenMoved: targets.length,
      bookingsCreated,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
