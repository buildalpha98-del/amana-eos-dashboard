/**
 * PATCH — sign a visitor out.
 *
 * The only mutation available. A visitor register is a contemporaneous
 * record of who was in the building; editing the arrival time or the
 * name after the fact is exactly what makes one worthless as evidence.
 *
 * Signing out twice keeps the FIRST time, because that's when they
 * actually left.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

const patchSchema = z.object({
  signOut: z.literal(true),
  /** Optional — for a visitor whose departure is recorded after the fact. */
  signedOutAt: z.string().datetime().optional(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, visitorId } = (await context!.params!) as {
      id: string;
      visitorId: string;
    };
    assertServiceAccess(session as never, id);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const existing = await prisma.serviceVisitor.findUnique({
      where: { id: visitorId },
      select: { id: true, serviceId: true, signedInAt: true, signedOutAt: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Visitor not found");
    }
    if (existing.signedOutAt) {
      return NextResponse.json({ ok: true, alreadySignedOut: true });
    }

    const when = parsed.data.signedOutAt
      ? new Date(parsed.data.signedOutAt)
      : new Date();
    // Leaving before you arrived is a typo, and a register that accepts
    // one can't be read back with a straight face.
    if (when < existing.signedInAt) {
      throw ApiError.badRequest("Sign-out can't be before sign-in");
    }

    const updated = await prisma.serviceVisitor.update({
      where: { id: visitorId },
      data: { signedOutAt: when },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
