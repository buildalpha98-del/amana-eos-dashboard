import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const reviewSchema = z.object({
  wins: z.string().optional().nullable(),
  blockers: z.string().optional().nullable(),
  nextWeekTop3: z.string().optional().nullable(),
  draftBody: z.string().optional().nullable(),
});

/**
 * POST /api/marketing/cockpit/weekly-report/[id]/review
 *
 * Marks a draft WeeklyMarketingReport as reviewed and saves Akram's
 * narrative edits. Only marketing / owner can review.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const raw = await parseJsonBody(req);
    const parsed = reviewSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid review payload", parsed.error.flatten());
    }

    const existing = await prisma.weeklyMarketingReport.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Weekly report not found");
    if (existing.status === "sent") {
      throw ApiError.conflict("Report already sent — cannot edit");
    }

    const updated = await prisma.weeklyMarketingReport.update({
      where: { id },
      data: {
        ...parsed.data,
        status: "reviewed",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ report: updated });
  },
  { roles: ["marketing", "owner"] },
);
