import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

export const incidentPatchSchema = z.object({
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

export type IncidentPatch = z.infer<typeof incidentPatchSchema>;

/**
 * The ONE write path for an incident edit. The PATCH route and Knox's
 * approve path both call this, so a change made by either goes through the
 * same field mapping and the same server-side stamps (who/when for the
 * parent notification and for sharing with the family).
 *
 * Auth, centre scope and the `incidents.share` permission stay with the
 * caller — this only writes.
 */
export async function updateIncidentRecord(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  patch: IncidentPatch,
  actor: { id: string },
) {
  return db.incidentRecord.update({
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
              ? actor.id
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
          ? { sharedWithParentAt: new Date(), sharedById: actor.id }
          : { sharedWithParentAt: null, sharedById: null }
        : {}),
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Soft delete (deleted=true). Lives beside the edit helper so no route
 * writes an incident row directly; the caller has already checked that the
 * actor may delete it.
 */
export async function softDeleteIncidentRecord(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
) {
  await db.incidentRecord.update({
    where: { id },
    data: { deleted: true },
  });
}
