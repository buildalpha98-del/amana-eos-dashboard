import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

// Roles that may edit / delete any incident regardless of who reported it.
// Mirrors the documents-delete pattern (src/app/api/documents/[id]/route.ts):
// only owner + admin override; head_office (State Manager) is intentionally
// NOT in this set so they can't quietly modify reports filed by other staff.
const INCIDENT_ADMIN_ROLES = new Set(["owner", "admin"]);

const patchSchema = z.object({
  childName: z.string().nullable().optional(),
  incidentType: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  timeOfDay: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  actionTaken: z.string().nullable().optional(),
  parentNotified: z.boolean().optional(),
  reportableToAuthority: z.boolean().optional(),
  followUpRequired: z.boolean().optional(),
  followUpCompleted: z.boolean().optional(),
  incidentDate: z.string().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

async function loadIncident(incidentId: string) {
  const ref = await prisma.incidentRecord.findUnique({
    where: { id: incidentId },
    select: { id: true, serviceId: true, createdById: true, deleted: true },
  });
  if (!ref || ref.deleted) {
    throw ApiError.notFound("Incident not found");
  }
  return ref;
}

function ensureCanModify(
  role: string,
  userId: string,
  reporterId: string | null,
) {
  if (INCIDENT_ADMIN_ROLES.has(role)) return;
  if (reporterId && reporterId === userId) return;
  throw ApiError.forbidden(
    "Only the original reporter or an owner/admin can modify this incident.",
  );
}

// PATCH /api/incidents/[id] — edit your own report (or admin override)
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const ref = await loadIncident(id);
  ensureCanModify(session.user.role, session.user.id, ref.createdById);

  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const updated = await prisma.incidentRecord.update({
    where: { id },
    data: {
      ...(patch.childName !== undefined ? { childName: patch.childName } : {}),
      ...(patch.incidentType ? { incidentType: patch.incidentType } : {}),
      ...(patch.severity ? { severity: patch.severity } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.timeOfDay !== undefined ? { timeOfDay: patch.timeOfDay } : {}),
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.actionTaken !== undefined ? { actionTaken: patch.actionTaken } : {}),
      ...(patch.parentNotified !== undefined ? { parentNotified: patch.parentNotified } : {}),
      ...(patch.reportableToAuthority !== undefined
        ? { reportableToAuthority: patch.reportableToAuthority }
        : {}),
      ...(patch.followUpRequired !== undefined
        ? { followUpRequired: patch.followUpRequired }
        : {}),
      ...(patch.followUpCompleted !== undefined
        ? { followUpCompleted: patch.followUpCompleted }
        : {}),
      ...(patch.incidentDate ? { incidentDate: new Date(patch.incidentDate) } : {}),
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
});

// DELETE /api/incidents/[id] — soft delete (deleted=true), uploader or admin only
export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const ref = await loadIncident(id);
  ensureCanModify(session.user.role, session.user.id, ref.createdById);

  await prisma.incidentRecord.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ ok: true });
});
