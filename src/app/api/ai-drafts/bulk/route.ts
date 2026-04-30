import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const bulkSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
  ids: z
    .array(z.string().min(1))
    .min(1, "At least one id required")
    .max(20, "Max 20 drafts per batch"),
});

/**
 * POST /api/ai-drafts/bulk
 *
 * Bulk approve or dismiss AI-generated drafts. The `status: "ready"` filter in
 * the `updateMany` where-clause prevents re-flipping drafts that have already
 * been processed (e.g. by the single PATCH route) — a safe retry semantic for
 * admin triage. Unlike the single PATCH, bulk approve does NOT cascade to
 * source-task completion; bulk is an admin "these are fine, stop bothering me"
 * signal rather than a commitment to mark the underlying tasks done.
 *
 * Only owner / head_office / admin roles may access.
 */
export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0].message,
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { action, ids } = parsed.data;
    const newStatus = action === "approve" ? "accepted" : "dismissed";

    const result = await prisma.aiTaskDraft.updateMany({
      where: { id: { in: ids }, status: "ready" }, // only triage drafts still in review
      data: {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    return NextResponse.json({ updated: result.count });
  },
  { roles: ["owner", "head_office", "admin"] },
);
