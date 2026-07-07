import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/cron/induction-grace
 *
 * Daily cron (6 AM AEST) — expires lapsed induction grace windows.
 *
 * A backfilled starter gets a grace window (`inductionGraceUntil`) during which
 * the induction gate and locked-mode stay dormant. Once that window passes and
 * they're still `in_training`, clear the grace date so the gate + locked-mode
 * now bite. Status stays `in_training` — this only removes the temporary
 * reprieve.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("induction-grace", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // Users whose grace window has lapsed while still in training.
    const { count: graceExpired } = await prisma.user.updateMany({
      where: {
        inductionStatus: "in_training",
        inductionGraceUntil: { lt: now },
      },
      data: { inductionGraceUntil: null },
    });

    await guard.complete({ graceExpired });

    return NextResponse.json({
      message: "Induction grace sweep complete",
      graceExpired,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
