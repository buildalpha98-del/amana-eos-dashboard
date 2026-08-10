/**
 * GET/POST/DELETE /api/services/[id]/fee-assignments
 *
 * Which fee each child is charged at, per room — the link that makes the
 * fees matrix's "Applied to N" a real number rather than a guess.
 *
 * GET has two modes, because the matrix asks two different questions:
 *   • no params        → counts per (sessionType, feeTierId), for the badges
 *   • ?sessionType=&feeTierId= → the children on that one fee, for the panel
 *
 * The counts query is a groupBy rather than N counts, so a room with a
 * dozen fees is one round trip instead of a dozen.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import type { SessionType } from "@prisma/client";

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const assignSchema = z.object({
  childId: z.string().min(1),
  sessionType: z.enum(SESSION_TYPES),
  feeTierId: z.string().min(1),
  /** Denormalised at write time so history survives a rename. */
  feeName: z.string().trim().min(1).max(60),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const params = new URL(req.url).searchParams;
  const sessionType = params.get("sessionType");
  const feeTierId = params.get("feeTierId");
  const unassigned = params.get("unassigned") === "1";

  /**
   * Picker mode: active children at this centre with no fee set for this
   * room yet.
   *
   * Scoped to UNASSIGNED rather than listing everyone, because a child
   * already on a fee for this room can't take a second one — the unique
   * would reject it, and offering the name in the picker would be an
   * invitation to hit that error.
   */
  if (unassigned && sessionType) {
    if (!(SESSION_TYPES as readonly string[]).includes(sessionType)) {
      throw ApiError.badRequest("Unknown room");
    }
    const children = await prisma.child.findMany({
      where: {
        serviceId: id,
        status: "active",
        feeAssignments: { none: { sessionType: sessionType as SessionType } },
      },
      select: { id: true, firstName: true, surname: true },
      orderBy: [{ surname: "asc" }, { firstName: "asc" }],
      take: 500,
    });
    return NextResponse.json({
      children: children.map((c) => ({
        childId: c.id,
        name: `${c.firstName} ${c.surname}`.trim(),
      })),
    });
  }

  // Detail mode: who is actually on this fee.
  if (sessionType && feeTierId) {
    if (!(SESSION_TYPES as readonly string[]).includes(sessionType)) {
      throw ApiError.badRequest("Unknown room");
    }
    const rows = await prisma.childFeeAssignment.findMany({
      where: {
        serviceId: id,
        sessionType: sessionType as SessionType,
        feeTierId,
      },
      select: {
        id: true,
        effectiveFrom: true,
        child: {
          select: { id: true, firstName: true, surname: true, status: true },
        },
      },
      orderBy: [{ child: { surname: "asc" } }, { child: { firstName: "asc" } }],
      take: 500,
    });

    return NextResponse.json({
      children: rows.map((r) => ({
        assignmentId: r.id,
        childId: r.child.id,
        name: `${r.child.firstName} ${r.child.surname}`.trim(),
        status: r.child.status,
        effectiveFrom: r.effectiveFrom,
      })),
    });
  }

  // Count mode: one groupBy for every badge on the page.
  const grouped = await prisma.childFeeAssignment.groupBy({
    by: ["sessionType", "feeTierId"],
    where: { serviceId: id },
    _count: { _all: true },
  });

  return NextResponse.json({
    counts: grouped.map((g) => ({
      sessionType: g.sessionType,
      feeTierId: g.feeTierId,
      count: g._count._all,
    })),
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = assignSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid assignment", parsed.error.flatten());
    }
    const d = parsed.data;

    // The child has to belong to this service. Without the check, a
    // child id from another centre could be assigned a fee here and
    // would then be counted against this centre's matrix.
    const child = await prisma.child.findUnique({
      where: { id: d.childId },
      select: { id: true, serviceId: true },
    });
    if (!child || child.serviceId !== id) {
      throw ApiError.notFound("Child not found at this service");
    }

    // Upsert on (childId, sessionType): moving a child to a different
    // fee for the same room is a change, not a second assignment.
    const saved = await prisma.childFeeAssignment.upsert({
      where: {
        childId_sessionType: {
          childId: d.childId,
          sessionType: d.sessionType as SessionType,
        },
      },
      create: {
        childId: d.childId,
        serviceId: id,
        sessionType: d.sessionType as SessionType,
        feeTierId: d.feeTierId,
        feeName: d.feeName,
        effectiveFrom: d.effectiveFrom
          ? new Date(`${d.effectiveFrom}T00:00:00.000Z`)
          : null,
        createdById: session!.user.id,
      },
      update: {
        feeTierId: d.feeTierId,
        feeName: d.feeName,
        ...(d.effectiveFrom !== undefined
          ? {
              effectiveFrom: d.effectiveFrom
                ? new Date(`${d.effectiveFrom}T00:00:00.000Z`)
                : null,
            }
          : {}),
      },
      select: { id: true, feeTierId: true, feeName: true },
    });

    return NextResponse.json({ assignment: saved }, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const assignmentId = new URL(req.url).searchParams.get("assignmentId");
    if (!assignmentId) throw ApiError.badRequest("assignmentId is required");

    const existing = await prisma.childFeeAssignment.findUnique({
      where: { id: assignmentId },
      select: { serviceId: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Assignment not found");
    }

    // A real delete: this is a current setting, not a record of
    // something that happened. Taking a child off a fee should leave no
    // trace suggesting they're still on it.
    await prisma.childFeeAssignment.delete({ where: { id: assignmentId } });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
