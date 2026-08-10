import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

/**
 * GET/POST /api/parent/children/[id]/incidents
 *
 * The family's copy of an incident report, and their acknowledgement of
 * it. Before this there were ZERO incident endpoints in the parent API:
 * Reg 86 requires the family be notified within 24 hours, and the only
 * record of that was a boolean an educator ticked.
 *
 * Two rules make this safe to expose:
 *
 *  1. Only records a human has explicitly SHARED are visible. The
 *     `sharedWithParentAt` gate is separate from `parentNotifiedAt` on
 *     purpose — notifying a parent is a phone call at the time,
 *     publishing the written record is a later, considered act. A
 *     behaviour incident naming another child must never auto-publish.
 *  2. The fields returned are a strict allow-list. `witnesses` and
 *     `medicalPersonnelContacted` can name other people's children and
 *     staff, so they stay internal; the family gets what happened to
 *     THEIR child and what was done about it.
 */

const ackSchema = z.object({
  incidentId: z.string().min(1),
  /** Typed-name signature, same convention as ParentFormSignature. */
  signedName: z.string().trim().min(1).max(120),
});

/** Confirm this parent may see this child at all. */
async function assertChildAccess(
  childId: string,
  enrolmentIds: string[],
): Promise<void> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }
}

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");
  await assertChildAccess(childId, ctx.parent.enrolmentIds);

  const incidents = await prisma.incidentRecord.findMany({
    where: {
      childId,
      deleted: false,
      // The gate. Nothing reaches a family until someone shares it.
      sharedWithParentAt: { not: null },
    },
    orderBy: { incidentDate: "desc" },
    take: 50,
    // Allow-list, not `include`. See the note above — witnesses and
    // medical personnel can name other families' children.
    select: {
      id: true,
      incidentDate: true,
      incidentType: true,
      location: true,
      description: true,
      circumstances: true,
      actionTaken: true,
      firstAidGiven: true,
      firstAidDetails: true,
      ambulanceCalled: true,
      parentNotifiedAt: true,
      parentNotifiedMethod: true,
      sharedWithParentAt: true,
      parentAcknowledgedAt: true,
      parentAcknowledgedName: true,
      service: { select: { name: true } },
    },
  });

  return NextResponse.json({ incidents });
});

/**
 * Acknowledge a report.
 *
 * First acknowledgement wins and is never overwritten — a second parent
 * opening the same report must not replace the first one's signature,
 * because the record is evidence of who confirmed they'd seen it and
 * when. Re-acknowledging is a no-op that returns the existing signature
 * rather than an error; the family did nothing wrong.
 */
export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");
  await assertChildAccess(childId, ctx.parent.enrolmentIds);

  const parsed = ackSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Please type your name to acknowledge");
  }

  const incident = await prisma.incidentRecord.findUnique({
    where: { id: parsed.data.incidentId },
    select: {
      id: true,
      childId: true,
      deleted: true,
      sharedWithParentAt: true,
      parentAcknowledgedAt: true,
      parentAcknowledgedName: true,
    },
  });

  // Same 404 for "not this child's" and "not shared" — whether a report
  // exists that hasn't been shared is not the family's to infer.
  if (
    !incident ||
    incident.deleted ||
    incident.childId !== childId ||
    !incident.sharedWithParentAt
  ) {
    throw ApiError.notFound("Report not found");
  }

  if (incident.parentAcknowledgedAt) {
    return NextResponse.json({
      acknowledged: true,
      acknowledgedAt: incident.parentAcknowledgedAt,
      acknowledgedName: incident.parentAcknowledgedName,
      alreadyAcknowledged: true,
    });
  }

  const updated = await prisma.incidentRecord.update({
    where: { id: incident.id },
    data: {
      parentAcknowledgedAt: new Date(),
      parentAcknowledgedName: parsed.data.signedName,
      parentAcknowledgedEmail: ctx.parent.email,
    },
    select: { parentAcknowledgedAt: true, parentAcknowledgedName: true },
  });

  return NextResponse.json({
    acknowledged: true,
    acknowledgedAt: updated.parentAcknowledgedAt,
    acknowledgedName: updated.parentAcknowledgedName,
    alreadyAcknowledged: false,
  });
});
