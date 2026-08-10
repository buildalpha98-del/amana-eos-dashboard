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

  // ── Reg 87(2): the entries the record is actually required to hold ──
  childId: z.string().nullable().optional(),
  childAge: z.number().int().min(0).max(25).nullable().optional(),
  circumstances: z.string().nullable().optional(),
  firstAidGiven: z.boolean().optional(),
  firstAidBy: z.string().nullable().optional(),
  firstAidDetails: z.string().nullable().optional(),
  medicalPersonnelContacted: z.string().nullable().optional(),
  ambulanceCalled: z.boolean().optional(),
  witnesses: z.string().nullable().optional(),
  recordedSignature: z.string().max(120).nullable().optional(),

  // ── Reg 86: telling the family ──
  parentNotifiedAt: z.string().nullable().optional(),
  parentNotifiedName: z.string().nullable().optional(),
  /** phone | in_person | email | sms | portal | attempted_no_answer. */
  parentNotifiedMethod: z.string().nullable().optional(),

  // ── Reg 176: telling the Regulatory Authority ──
  seriousIncidentCategory: z.string().nullable().optional(),
  becameAwareAt: z.string().nullable().optional(),
  reportedToAuthorityAt: z.string().nullable().optional(),
  authorityReference: z.string().max(120).nullable().optional(),

  /**
   * Publish the written record to the family's portal, or withdraw it.
   * Sent as a boolean rather than a timestamp so the server stamps WHEN
   * and WHO — a client-supplied share time could be back-dated to look
   * like Reg 86 was met.
   */
  shareWithParent: z.boolean().optional(),
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

      // ── Reg 87(2) entries ──
      ...(patch.childId !== undefined ? { childId: patch.childId } : {}),
      ...(patch.childAge !== undefined ? { childAge: patch.childAge } : {}),
      ...(patch.circumstances !== undefined
        ? { circumstances: patch.circumstances }
        : {}),
      ...(patch.firstAidGiven !== undefined
        ? { firstAidGiven: patch.firstAidGiven }
        : {}),
      ...(patch.firstAidBy !== undefined ? { firstAidBy: patch.firstAidBy } : {}),
      ...(patch.firstAidDetails !== undefined
        ? { firstAidDetails: patch.firstAidDetails }
        : {}),
      ...(patch.medicalPersonnelContacted !== undefined
        ? { medicalPersonnelContacted: patch.medicalPersonnelContacted }
        : {}),
      ...(patch.ambulanceCalled !== undefined
        ? { ambulanceCalled: patch.ambulanceCalled }
        : {}),
      ...(patch.witnesses !== undefined ? { witnesses: patch.witnesses } : {}),
      ...(patch.recordedSignature !== undefined
        ? { recordedSignature: patch.recordedSignature }
        : {}),

      // ── Reg 86 ──
      ...(patch.parentNotifiedAt !== undefined
        ? {
            parentNotifiedAt: patch.parentNotifiedAt
              ? new Date(patch.parentNotifiedAt)
              : null,
            // Keep the legacy boolean in step so nothing reading it
            // disagrees with the timestamp beside it.
            parentNotified: Boolean(patch.parentNotifiedAt),
            parentNotifiedById: patch.parentNotifiedAt
              ? session.user.id
              : null,
          }
        : {}),
      ...(patch.parentNotifiedName !== undefined
        ? { parentNotifiedName: patch.parentNotifiedName }
        : {}),
      ...(patch.parentNotifiedMethod !== undefined
        ? { parentNotifiedMethod: patch.parentNotifiedMethod }
        : {}),

      // ── Reg 176 ──
      ...(patch.seriousIncidentCategory !== undefined
        ? { seriousIncidentCategory: patch.seriousIncidentCategory }
        : {}),
      ...(patch.becameAwareAt !== undefined
        ? {
            becameAwareAt: patch.becameAwareAt
              ? new Date(patch.becameAwareAt)
              : null,
          }
        : {}),
      ...(patch.reportedToAuthorityAt !== undefined
        ? {
            reportedToAuthorityAt: patch.reportedToAuthorityAt
              ? new Date(patch.reportedToAuthorityAt)
              : null,
          }
        : {}),
      ...(patch.authorityReference !== undefined
        ? { authorityReference: patch.authorityReference }
        : {}),

      /**
       * Sharing stamps the server's clock and the sharer, so a
       * back-dated share can't be used to claim Reg 86 was met.
       * Withdrawing clears the stamp but deliberately KEEPS any
       * acknowledgement already given — that a family saw it is a fact
       * about the past, not a setting.
       */
      ...(patch.shareWithParent !== undefined
        ? patch.shareWithParent
          ? { sharedWithParentAt: new Date(), sharedById: session.user.id }
          : { sharedWithParentAt: null, sharedById: null }
        : {}),
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
