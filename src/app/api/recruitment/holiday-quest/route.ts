/**
 * POST /api/recruitment/holiday-quest — creates the five regional summer
 * Holiday Quest ads (src/lib/recruitment/holiday-quest-ads.ts) as DRAFTS:
 * open, but not on the public careers page until someone ticks "Show on
 * public careers page". Skips any whose title already exists, so pressing it
 * twice can't duplicate them.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { HOLIDAY_QUEST_ADS, HOLIDAY_QUEST_WORK_PERIOD } from "@/lib/recruitment/holiday-quest-ads";

export const POST = withApiAuth(
  async () => {
    const existing = await prisma.recruitmentVacancy.findMany({
      where: { deleted: false, title: { in: HOLIDAY_QUEST_ADS.map((a) => a.title) } },
      select: { title: true },
    });
    const have = new Set(existing.map((e) => e.title));
    const toCreate = HOLIDAY_QUEST_ADS.filter((a) => !have.has(a.title));
    for (const a of toCreate) {
      await prisma.recruitmentVacancy.create({
        data: {
          role: "educator",
          employmentType: "casual",
          region: a.region,
          state: a.state,
          title: a.title,
          payRate: a.payRate,
          workPeriod: HOLIDAY_QUEST_WORK_PERIOD,
          qualificationRequired: a.qualificationRequired,
          notes: a.notes,
          status: "open",
          postedChannels: [],
        },
      });
    }
    return NextResponse.json({ created: toCreate.length, skipped: HOLIDAY_QUEST_ADS.length - toCreate.length }, { status: 201 });
  },
  { feature: "recruitment.edit" },
);
