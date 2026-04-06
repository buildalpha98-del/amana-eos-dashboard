import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/cleanup-tokens
 * Daily cron: deletes expired parent auth tokens older than 24 hours.
 * Schedule: daily at 2pm UTC (midnight AEST) — "0 14 * * *"
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [magicLinkResult, authTokenResult] = await Promise.all([
    prisma.parentMagicLink.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    }),
    prisma.parentAuthToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    }),
  ]);

  const total = magicLinkResult.count + authTokenResult.count;

  logger.info("Token cleanup completed", {
    magicLinksDeleted: magicLinkResult.count,
    authTokensDeleted: authTokenResult.count,
    total,
  });

  return NextResponse.json({
    success: true,
    deleted: total,
    magicLinks: magicLinkResult.count,
    authTokens: authTokenResult.count,
  });
});
