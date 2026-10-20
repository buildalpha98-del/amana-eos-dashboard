import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { PendingActionGone, PendingActionHidden, dismissPendingAction } from "@/lib/knox/actions";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { KNOX_ROLES, parseOptionalJsonBody } from "../../../_lib";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

/** POST /api/knox/actions/[id]/dismiss  body: { reason?: string (max 500) } */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = bodySchema.safeParse(await parseOptionalJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const { serviceIds } = await getCentreScope(session);
    try {
      await dismissPendingAction(prisma, id, { id: session.user.id, serviceIds }, parsed.data.reason || undefined);
    } catch (err) {
      if (err instanceof PendingActionHidden) throw ApiError.notFound(err.message);
      if (err instanceof PendingActionGone) throw new ApiError(410, err.message);
      throw err;
    }
    return NextResponse.json({ ok: true });
  },
  { roles: KNOX_ROLES },
);
