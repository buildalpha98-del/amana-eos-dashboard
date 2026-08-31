/**
 * PATCH one headcount — counter-sign it, or add what the drill exposed.
 *
 * No DELETE and no editing the counts. A headcount is a statement about
 * a moment that has passed: if the number was wrong, the honest fix is a
 * fresh count with a note, not a quiet rewrite of the old one.
 *
 * Sign-off is taken from the SESSION and refuses self-sign-off, for the
 * same reason the risk assessment review does — a countersignature the
 * counter can apply to their own count proves nothing.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

/** Who can counter-sign — a coordinator or above. */
const SIGNER_ROLES = new Set(["owner", "head_office", "admin", "member"]);

const patchSchema = z
  .object({
    signOff: z.boolean().optional(),
    issuesIdentified: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, headcountId } = (await context!.params!) as {
      id: string;
      headcountId: string;
    };
    assertServiceAccess(session as never, id);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const existing = await prisma.serviceHeadcount.findUnique({
      where: { id: headcountId },
      select: { id: true, serviceId: true, conductedById: true, signedOffAt: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Headcount not found");
    }

    if (d.signOff === true) {
      if (!SIGNER_ROLES.has(session!.user.role)) {
        throw ApiError.forbidden(
          "Only a coordinator or above can counter-sign a headcount",
        );
      }
      if (existing.conductedById === session!.user.id) {
        throw ApiError.forbidden(
          "A headcount needs a second person to counter-sign it",
        );
      }
      if (existing.signedOffAt) {
        // Already signed: the first signature is the one that counts.
        return NextResponse.json({ ok: true, alreadySigned: true });
      }
    }

    const updated = await prisma.serviceHeadcount.update({
      where: { id: headcountId },
      data: {
        ...(d.signOff === true
          ? { signedOffAt: new Date(), signedOffById: session!.user.id }
          : {}),
        ...(d.issuesIdentified !== undefined
          ? { issuesIdentified: d.issuesIdentified }
          : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
