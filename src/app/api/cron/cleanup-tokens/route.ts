import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/cleanup-tokens
 *
 * Daily cron: deletes expired parent auth tokens older than 24 hours,
 * and clears the personal data out of enrolment drafts that have been
 * submitted.
 *
 * Schedule: daily at 2pm UTC (midnight AEST) — "0 14 * * *"
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("cleanup-tokens", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    /**
     * Submitted drafts keep a full copy of the enrolment — Medicare
     * numbers, CRNs, medical conditions, the doctor's details — after
     * that same data has been written to `EnrolmentSubmission`. Nothing
     * reads it once `submittedAt` is set: the GET returns the flag and
     * the PUT refuses to write. It is a duplicate of the most sensitive
     * data in the system, kept forever for no reason.
     *
     * Thirty days rather than immediately, so staff comparing a
     * submission against what the parent typed still can for a month.
     */
    const draftCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [magicLinkResult, authTokenResult, verificationResult, draftResult] =
      await Promise.all([
        prisma.parentMagicLink.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        }),
        prisma.parentAuthToken.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        }),
        // Same shape as the two above — hashed, 24h TTL — and simply
        // never swept, so they accumulated until the account was deleted.
        prisma.parentEmailVerification.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        }),
        /*
         * The ROW stays. `submittedAt` is what stops a parent
         * re-submitting, so deleting it would quietly unlock a second
         * enrolment. Only the payload goes.
         */
        prisma.enrolmentDraft.updateMany({
          where: {
            submittedAt: { not: null, lt: draftCutoff },
            NOT: { data: { equals: {} } },
          },
          data: { data: {} },
        }),
      ]);

    const total =
      magicLinkResult.count + authTokenResult.count + verificationResult.count;

    logger.info("Token cleanup completed", {
      magicLinksDeleted: magicLinkResult.count,
      authTokensDeleted: authTokenResult.count,
      verificationsDeleted: verificationResult.count,
      draftsCleared: draftResult.count,
      total,
    });

    await guard.complete({
      magicLinksDeleted: magicLinkResult.count,
      authTokensDeleted: authTokenResult.count,
      verificationsDeleted: verificationResult.count,
      draftsCleared: draftResult.count,
      total,
    });

    return NextResponse.json({
      success: true,
      deleted: total,
      magicLinks: magicLinkResult.count,
      authTokens: authTokenResult.count,
      emailVerifications: verificationResult.count,
      draftsCleared: draftResult.count,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
