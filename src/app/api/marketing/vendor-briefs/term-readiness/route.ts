import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { briefIncludeFor, toListItem } from "@/lib/vendor-brief/list-item";
import { termStartDate, weeksUntil } from "@/lib/vendor-brief/term-dates";
import { TermReadinessCategory } from "@prisma/client";

const ROLES: ("marketing" | "owner")[] = ["marketing", "owner"];

const ALL_CATEGORIES: TermReadinessCategory[] = [
  TermReadinessCategory.flyers,
  TermReadinessCategory.banners,
  TermReadinessCategory.signage,
  TermReadinessCategory.holiday_programme_materials,
  TermReadinessCategory.enrolment_posters,
  TermReadinessCategory.other_print,
];

const querySchema = z.object({
  termYear: z.coerce.number().int().min(2025).max(2100),
  termNumber: z.coerce.number().int().min(1).max(4),
});

/**
 * GET /api/marketing/vendor-briefs/term-readiness?termYear=2026&termNumber=2
 *
 * Returns the matrix data: list of centres × list of categories, plus any
 * existing brief in each cell. UI renders the 10×6 grid from this.
 */
export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    }
    const { termYear, termNumber } = parsed.data;

    const startsOn = termStartDate(termYear, termNumber);

    const [centres, briefs] = await Promise.all([
      prisma.service.findMany({
        select: { id: true, name: true, state: true },
        orderBy: [{ state: "asc" }, { name: "asc" }],
      }),
      prisma.vendorBrief.findMany({
        where: { termYear, termNumber },
        include: briefIncludeFor,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const now = new Date();
    const matrix = briefs.map((b) => ({
      serviceId: b.serviceId,
      category: b.termReadinessCategory,
      brief: toListItem(b, now),
    }));

    return NextResponse.json({
      term: {
        year: termYear,
        number: termNumber,
        startsOn: startsOn?.toISOString() ?? null,
        weeksUntil: startsOn ? weeksUntil(startsOn, now) : null,
      },
      centres,
      categories: ALL_CATEGORIES,
      matrix,
    });
  },
  { roles: ROLES },
);
