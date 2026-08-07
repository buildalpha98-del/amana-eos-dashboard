/**
 * PATCH — record that families were told, that the public health unit
 * was told, or when the person may return.
 *
 * The notifier comes from the SESSION. "Families were notified" is a
 * claim someone is making on the record, and it should carry their name
 * rather than one supplied in the payload.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

const patchSchema = z
  .object({
    notifyFamilies: z.boolean().optional(),
    notifyAuthority: z.boolean().optional(),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    actionTaken: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, recordId } = (await context!.params!) as {
      id: string;
      recordId: string;
    };
    assertServiceAccess(session as never, id);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const existing = await prisma.illnessRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        serviceId: true,
        onsetDate: true,
        familiesNotifiedAt: true,
      },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Record not found");
    }

    const back = d.returnDate ? new Date(`${d.returnDate}T00:00:00.000Z`) : null;
    if (back && back < existing.onsetDate) {
      throw ApiError.badRequest("Return date can't be before onset");
    }

    const updated = await prisma.illnessRecord.update({
      where: { id: recordId },
      data: {
        // First notification stands: the date families were actually
        // told is the one that answers the question later.
        ...(d.notifyFamilies === true && !existing.familiesNotifiedAt
          ? { familiesNotifiedAt: new Date(), notifiedById: session!.user.id }
          : {}),
        ...(d.notifyAuthority === true ? { authorityNotifiedAt: new Date() } : {}),
        ...(back ? { returnDate: back } : {}),
        ...(d.actionTaken !== undefined ? { actionTaken: d.actionTaken } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
