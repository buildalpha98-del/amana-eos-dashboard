/**
 * GET /api/my-portal/contracts
 *
 * Every contract belonging to the signed-in staff member, newest first.
 * Backs the /my-contract page.
 *
 * Why this exists separately from the `activeContract` slice on
 * /api/my-portal: that slice deliberately returns ONE active contract plus
 * superseded/terminated history, which is right for a hub card but leaves
 * a staff member with nothing at all when their only contract is still a
 * draft — the exact "my portal doesn't show my contract" report. Here we
 * read every status and let the UI say which of the three situations the
 * viewer is in:
 *
 *   - signable / readable contracts  → listed
 *   - only drafts                    → `hasPendingDraft`, so the page can
 *                                      say "being prepared" instead of
 *                                      rendering an empty state that reads
 *                                      as "you have no contract"
 *   - nothing at all                 → genuine empty state
 *
 * Draft CONTENTS are never returned. A draft is an admin's unfinished work
 * and routinely has no document yet; all the staff member gets is the fact
 * that one is in progress.
 *
 * Self-scoped by construction — `userId` comes from the session, never the
 * request, so there is no id to tamper with.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (_req, session) => {
  const userId = session!.user.id;

  const [contracts, draftCount] = await Promise.all([
    prisma.employmentContract.findMany({
      where: {
        userId,
        status: { in: ["active", "superseded", "terminated"] },
      },
      select: {
        id: true,
        contractType: true,
        awardLevel: true,
        awardLevelCustom: true,
        classification: true,
        payRate: true,
        hoursPerWeek: true,
        startDate: true,
        endDate: true,
        status: true,
        acknowledgedByStaff: true,
        acknowledgedAt: true,
        // Drives the viewer's render strategy: template-based contracts
        // re-render HTML via /api/contracts/[id]/render, the rest embed
        // the baked PDF.
        templateId: true,
        // Presence only — the client never opens this directly, it goes
        // through /api/contracts/[id]/document so ownership is re-checked
        // server-side on every fetch.
        documentUrl: true,
        createdAt: true,
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.employmentContract.count({
      where: { userId, status: "contract_draft" },
    }),
  ]);

  return NextResponse.json({
    contracts: contracts.map((c) => ({
      ...c,
      // Don't hand the raw blob URL to the client — just whether there's
      // something to open.
      documentUrl: undefined,
      hasDocument: !!c.documentUrl,
    })),
    hasPendingDraft: draftCount > 0,
  });
});
