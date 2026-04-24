import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getWeekWindow } from "@/lib/cockpit/week";

const prioritiesSchema = z.object({
  nextWeekTop3: z.string().max(4000).nullable(),
});

/**
 * POST /api/marketing/cockpit/priorities
 *
 * Sets or updates this week's top-3 priorities for Akram directly from the
 * cockpit. If no draft report exists for the week yet, one is created.
 */
export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = prioritiesSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid priorities payload", parsed.error.flatten());
    }

    const { start, end } = getWeekWindow();

    const existing = await prisma.weeklyMarketingReport.findUnique({
      where: { weekStart: start },
    });

    if (existing && existing.status === "sent") {
      throw ApiError.conflict("This week's report has already been sent — cannot edit priorities");
    }

    const report = existing
      ? await prisma.weeklyMarketingReport.update({
          where: { id: existing.id },
          data: { nextWeekTop3: parsed.data.nextWeekTop3 },
        })
      : await prisma.weeklyMarketingReport.create({
          data: {
            weekStart: start,
            weekEnd: end,
            status: "draft",
            kpiSnapshot: {},
            nextWeekTop3: parsed.data.nextWeekTop3,
            draftedById: session.user.id,
            draftedAt: new Date(),
          },
        });

    return NextResponse.json({ report });
  },
  { roles: ["marketing", "owner"] },
);
