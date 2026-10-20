import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { incidentTriggerChanged, triggerTriage } from "@/lib/knox/trigger";
import {
  incidentPatchSchema,
  softDeleteIncidentRecord,
  updateIncidentRecord,
} from "@/lib/incidents/update-incident-record";

// Roles that may edit / delete any incident regardless of who reported it.
// Mirrors the documents-delete pattern (src/app/api/documents/[id]/route.ts):
// only owner + admin override; head_office (State Manager) is intentionally
// NOT in this set so they can't quietly modify reports filed by other staff.
const INCIDENT_ADMIN_ROLES: ReadonlySet<string> = new Set(ADMIN_ROLES);

type RouteCtx = { params: Promise<{ id: string }> };

async function loadIncident(incidentId: string) {
  const ref = await prisma.incidentRecord.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      serviceId: true,
      createdById: true,
      deleted: true,
      // The fields Knox's rules read; compared against the patch below.
      severity: true,
      incidentType: true,
      reportableToAuthority: true,
      seriousIncidentCategory: true,
      ambulanceCalled: true,
      medicalPersonnelContacted: true,
    },
  });
  if (!ref || ref.deleted) {
    throw ApiError.notFound("Incident not found");
  }
  return ref;
}

/**
 * The office anywhere; the centre's Director for any report at their
 * centre (they review and complete what educators log — 2026-10-08);
 * otherwise only the person who wrote it.
 */
function ensureCanModify(
  role: string,
  userId: string,
  reporterId: string | null,
  incidentServiceId?: string | null,
  viewerServiceId?: string | null,
) {
  if (INCIDENT_ADMIN_ROLES.has(role)) return;
  if (role === "member" && incidentServiceId && incidentServiceId === viewerServiceId) return;
  if (reporterId && reporterId === userId) return;
  throw ApiError.forbidden(
    "Only the person who wrote this report, the centre's Coordinator or head office can change it.",
  );
}

// PATCH /api/incidents/[id] — edit your own report (or admin override)
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const ref = await loadIncident(id);
  ensureCanModify(
    session.user.role,
    session.user.id,
    ref.createdById,
    ref.serviceId,
    (session.user as { serviceId?: string | null }).serviceId ?? null,
  );

  const body = await parseJsonBody(req);
  const parsed = incidentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const patch = parsed.data;
  // Educators write the report; sending it to the family is the
  // Director's (or office's) call.
  // …unless they carry the `incidents.share` tick.
  if (patch.shareWithParent !== undefined && session.user.role === "staff") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { permissions: true },
    });
    if (!hasStaffPermission(me?.permissions, "incidents.share")) {
      throw ApiError.forbidden("Your Coordinator shares incident reports with families.");
    }
  }

  const knoxRelevant = incidentTriggerChanged(ref, patch);

  const updated = await updateIncidentRecord(prisma, id, patch, { id: session.user.id });

  // After the write has committed; never throws.
  if (knoxRelevant) {
    await triggerTriage(
      { subjectType: "incident", subjectId: id, serviceId: ref.serviceId, reason: "updated" },
      { immediate: true },
    );
  }

  return NextResponse.json(updated);
});

// DELETE /api/incidents/[id] — soft delete (deleted=true), uploader or admin only
export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const ref = await loadIncident(id);
  ensureCanModify(session.user.role, session.user.id, ref.createdById);

  await softDeleteIncidentRecord(prisma, id);

  return NextResponse.json({ ok: true });
});
