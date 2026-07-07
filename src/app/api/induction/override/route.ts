/**
 * POST /api/induction/override — owner/head_office grant a temporary exemption
 * so an un-cleared user can be rostered / clock in for a bounded window (e.g. a
 * single shift during a staffing emergency). Audited via ActivityLog.
 *
 * assertUserCleared honours inductionOverrideUntil while it is in the future —
 * expiry is a plain timestamp comparison, no cron needed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bodySchema = z.object({
  userId: z.string().min(1),
  until: z.string().datetime(),
  reason: z.string().min(3),
});

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    const until = new Date(parsed.data.until);
    if (until.getTime() <= Date.now()) {
      throw ApiError.badRequest("Override window must end in the future.");
    }

    await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { inductionOverrideUntil: until },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "induction.override",
        entityType: "User",
        entityId: parsed.data.userId,
        details: { until: parsed.data.until, reason: parsed.data.reason },
      },
    });

    return NextResponse.json({ ok: true, overrideUntil: until });
  },
  { roles: ["owner", "head_office"] },
);
