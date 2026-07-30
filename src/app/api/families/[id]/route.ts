/**
 * DELETE /api/families/:id — remove a parent ACCOUNT.
 *
 * 2026-07-30, per Daniel: "for the test account that I made, I wanna be
 * able to delete it and then re-invite the account just so I can keep
 * testing it."
 *
 * SCOPE, deliberately narrow: this deletes the login account and its
 * in-progress draft (cascade). It does NOT touch EnrolmentSubmission or
 * Child records — those are the actual enrolment history and, for a real
 * family, deleting them would destroy records we're required to keep.
 * Removing the account frees the email so it can sign up again, which is
 * exactly the re-test loop.
 *
 * Owner-only, and logged before the delete so the audit trail survives.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!account) throw ApiError.notFound("Parent account not found");

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete",
        entityType: "ParentAccount",
        entityId: id,
        details: {
          email: account.email,
          wasVerified: Boolean(account.emailVerifiedAt),
          note: "Login account + draft removed. Enrolment submissions and child records retained.",
        },
      },
    });

    // Cascade removes ParentEmailVerification rows and the EnrolmentDraft.
    await prisma.parentAccount.delete({ where: { id } });

    return NextResponse.json({ ok: true, email: account.email });
  },
  { roles: ["owner"] },
);
