/**
 * Small per-account flags for the parent portal.
 *
 * GET  /api/parent/preferences  → { appInstallCardDismissed }
 * POST /api/parent/preferences  → dismiss the install card
 *
 * Stored on the ParentAccount rather than in localStorage. A family who
 * dismisses "Add Amana to your phone" on their phone shouldn't be shown
 * it again on the tablet — and localStorage is per-device, per-browser,
 * and wiped by anyone who clears their history.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { normaliseEmail } from "@/lib/parent-account";

const bodySchema = z.object({
  /** Passing false un-dismisses it, which is what a "show me again"
   *  affordance would need — cheaper to support now than to add later. */
  appInstallCardDismissed: z.boolean(),
});

export const GET = withParentAuth(async (_req, { parent }) => {
  const account = await prisma.parentAccount.findUnique({
    where: { email: normaliseEmail(parent.email) },
    select: { appInstallCardDismissedAt: true },
  });

  return NextResponse.json({
    appInstallCardDismissed: Boolean(account?.appInstallCardDismissedAt),
  });
});

export const POST = withParentAuth(async (req, { parent }) => {
  const parsed = bodySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }

  const email = normaliseEmail(parent.email);
  const account = await prisma.parentAccount.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!account) throw ApiError.notFound("Account not found");

  await prisma.parentAccount.update({
    where: { id: account.id },
    data: {
      appInstallCardDismissedAt: parsed.data.appInstallCardDismissed
        ? new Date()
        : null,
    },
  });

  return NextResponse.json({
    ok: true,
    appInstallCardDismissed: parsed.data.appInstallCardDismissed,
  });
});
