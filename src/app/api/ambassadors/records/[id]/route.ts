import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { assertRecordInScope } from "../../_lib/scope";
import { resolveAttribution } from "@/lib/ambassadors/attribution";
import { recomputeAmbassadorRecord } from "@/lib/ambassadors/recompute";
import { hasCompletedAmbassadorsCourse } from "@/lib/ambassadors/lms-gate";

/**
 * GET   /api/ambassadors/records/[id] — detail: sessions, audit trail,
 *       credited educator's LMS completion status.
 * PATCH /api/ambassadors/records/[id] — Director edits:
 *       - regularSessionsPerWeek (only until director_verified — the tier
 *         is assessed at the end of the window and locked by verification)
 *       - creditedEducatorId (conflict resolution: must be one of the
 *         re-derived candidates, or explicit null = unattributed)
 *       - newChildStatus (resolving an `uncertain` check — attested)
 *
 * Educators (staff) get the read view of their own records only.
 */

async function loadScoped(id: string, session: Parameters<typeof assertRecordInScope>[1]) {
  const record = await prisma.ambassadorEnrolment.findUnique({
    where: { id },
    select: { id: true, serviceId: true, creditedEducatorId: true, status: true },
  });
  if (!record) throw ApiError.notFound("Ambassador record not found");
  const { serviceIds } = await getCentreScope(session);
  assertRecordInScope(record, session, serviceIds);
  return record;
}

export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing record id");
    await loadScoped(id, session);

    const record = await prisma.ambassadorEnrolment.findUnique({
      where: { id },
      include: {
        service: { select: { name: true, code: true } },
        creditedEducator: { select: { id: true, name: true } },
        sessions: { orderBy: { date: "asc" } },
        transitions: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!record) throw ApiError.notFound("Ambassador record not found");

    const lmsCompleted = record.creditedEducatorId
      ? await hasCompletedAmbassadorsCourse(record.creditedEducatorId)
      : null;

    return NextResponse.json({ record, lmsCompleted });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

const patchSchema = z.object({
  regularSessionsPerWeek: z.number().int().min(0).max(10).nullable().optional(),
  /** Conflict resolution / manual credit. null = explicitly unattributed. */
  creditedEducatorId: z.string().min(1).nullable().optional(),
  /** Director attestation of an `uncertain` new-child check. */
  newChildStatus: z.enum(["new_child", "existing_child"]).optional(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing record id");
    const scoped = await loadScoped(id, session);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const body = parsed.data;

    const record = await prisma.ambassadorEnrolment.findUnique({
      where: { id },
      select: {
        status: true,
        refCode: true,
        namedEducatorText: true,
        serviceId: true,
        attributionConflict: true,
        newChildStatus: true,
        newChildDetail: true,
      },
    });
    if (!record) throw ApiError.notFound("Ambassador record not found");

    const data: Record<string, unknown> = {};
    const audit: Record<string, unknown> = {};

    if (body.regularSessionsPerWeek !== undefined) {
      // Spec: the Director can update sessions/week until verification.
      if (record.status !== "logged" && record.status !== "rejected") {
        throw ApiError.badRequest(
          "Sessions per week is locked once a record has been verified.",
        );
      }
      data.regularSessionsPerWeek = body.regularSessionsPerWeek;
      audit.regularSessionsPerWeek = body.regularSessionsPerWeek;
    }

    if (body.creditedEducatorId !== undefined) {
      if (scoped.status !== "logged" && scoped.status !== "rejected") {
        throw ApiError.badRequest(
          "Attribution is locked once a record has been verified.",
        );
      }
      if (body.creditedEducatorId === null) {
        data.creditedEducatorId = null;
        data.attributionConflict = false;
        audit.creditedEducatorId = null;
      } else {
        // The candidate set isn't stored — re-derive it from the persisted
        // signals so a Director can only pick one of the actual candidates.
        const attribution = await resolveAttribution({
          refCode: record.refCode,
          namedEducatorText: record.namedEducatorText,
          serviceId: record.serviceId,
        });
        if (!attribution.candidateIds.includes(body.creditedEducatorId)) {
          throw ApiError.badRequest(
            "That educator isn't one of this record's attribution candidates.",
          );
        }
        data.creditedEducatorId = body.creditedEducatorId;
        data.attributionConflict = false;
        audit.creditedEducatorId = body.creditedEducatorId;
      }
    }

    if (body.newChildStatus !== undefined) {
      if (record.newChildStatus !== "uncertain") {
        throw ApiError.badRequest(
          "Only an uncertain new-child check can be resolved manually.",
        );
      }
      data.newChildStatus = body.newChildStatus;
      data.newChildCheckedAt = new Date();
      data.newChildDetail = `${record.newChildDetail ?? ""}\nResolved as ${
        body.newChildStatus === "new_child" ? "a new child" : "an existing child"
      } by ${session.user.name} on ${new Date().toISOString().slice(0, 10)}.`.trim();
      audit.newChildStatus = body.newChildStatus;
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest("Nothing to update");
    }

    await prisma.ambassadorEnrolment.update({ where: { id }, data });
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_record_updated",
        entityType: "AmbassadorEnrolment",
        entityId: id,
        details: audit as Prisma.InputJsonValue,
      },
    });
    await recomputeAmbassadorRecord(id);

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
