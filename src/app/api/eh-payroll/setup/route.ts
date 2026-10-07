/**
 * POST /api/eh-payroll/setup { userId, resend? } — admin "Set up in
 * Employment Hero" on the staff profile. Links the person to their
 * existing EH record by email, or creates them in EH and sends EH's Self
 * Setup email (src/lib/eh-onboarding.ts). `resend: true` re-sends that
 * email to someone already linked. Replaces copying EH ids by hand.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { EhPayrollError } from "@/lib/eh-payroll";
import { setUpInEmploymentHero } from "@/lib/eh-onboarding";

const bodySchema = z.object({
  userId: z.string().min(1),
  resend: z.boolean().optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await setUpInEmploymentHero(parsed.data.userId, {
        actorId: session!.user.id,
        resendIfLinked: parsed.data.resend === true,
      });
      if (result.status === "not_configured") throw new ApiError(503, result.message);
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof EhPayrollError) {
        throw new ApiError(502, `Employment Hero said no (HTTP ${err.status}) — try again, or link them by EH id instead.`);
      }
      throw err;
    }
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 20, windowMs: 60_000 } },
);
