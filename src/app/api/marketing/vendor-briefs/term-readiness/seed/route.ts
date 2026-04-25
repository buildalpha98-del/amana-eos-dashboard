import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  createBriefWithNumberRetry,
  generateBriefNumber,
} from "@/lib/vendor-brief/brief-number";
import { termStartDate } from "@/lib/vendor-brief/term-dates";
import {
  TermReadinessCategory,
  VendorBriefType,
  type Service,
} from "@prisma/client";

const ROLES: ("marketing" | "owner" | "head_office" | "admin")[] = ["marketing", "owner", "head_office", "admin"];

const ALL_CATEGORIES: TermReadinessCategory[] = [
  TermReadinessCategory.flyers,
  TermReadinessCategory.banners,
  TermReadinessCategory.signage,
  TermReadinessCategory.holiday_programme_materials,
  TermReadinessCategory.enrolment_posters,
  TermReadinessCategory.other_print,
];

const CATEGORY_LABELS: Record<TermReadinessCategory, string> = {
  flyers: "Flyers",
  banners: "Banners",
  signage: "Signage",
  holiday_programme_materials: "Holiday programme materials",
  enrolment_posters: "Enrolment posters",
  other_print: "Other print",
};

const CATEGORY_TO_BRIEF_TYPE: Record<TermReadinessCategory, VendorBriefType> = {
  flyers: VendorBriefType.print_collateral,
  banners: VendorBriefType.signage,
  signage: VendorBriefType.signage,
  holiday_programme_materials: VendorBriefType.print_collateral,
  enrolment_posters: VendorBriefType.print_collateral,
  other_print: VendorBriefType.print_collateral,
};

const bodySchema = z.object({
  termYear: z.number().int().min(2025).max(2100),
  termNumber: z.number().int().min(1).max(4),
  categories: z.array(z.nativeEnum(TermReadinessCategory)).optional(),
  centreIds: z.array(z.string()).optional(),
});

/**
 * POST /api/marketing/vendor-briefs/term-readiness/seed
 *
 * For the requested term + (categories × centres) matrix, creates a draft
 * VendorBrief in any cell that doesn't already have one. Idempotent —
 * running twice never duplicates.
 *
 * Defaults: all 6 categories × all 10 centres = up to 60 drafts in one
 * click.
 */
export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid seed payload", parsed.error.flatten());
    }
    const { termYear, termNumber } = parsed.data;
    const categories = parsed.data.categories ?? ALL_CATEGORIES;

    const centresWhere: { id?: { in: string[] } } = {};
    if (parsed.data.centreIds && parsed.data.centreIds.length > 0) {
      centresWhere.id = { in: parsed.data.centreIds };
    }

    const [centres, existing, defaultJinan] = await Promise.all([
      prisma.service.findMany({
        where: centresWhere,
        select: { id: true, name: true, state: true },
        orderBy: [{ state: "asc" }, { name: "asc" }],
      }),
      prisma.vendorBrief.findMany({
        where: {
          termYear,
          termNumber,
          termReadinessCategory: { in: categories },
        },
        select: { serviceId: true, termReadinessCategory: true },
      }),
      prisma.vendorContact.findFirst({
        where: { active: true, role: { contains: "Operations" } },
        select: { id: true },
      }),
    ]);

    const existingKeys = new Set(
      existing
        .filter((e) => e.serviceId && e.termReadinessCategory)
        .map((e) => `${e.serviceId}:${e.termReadinessCategory}`),
    );

    const startsOn = termStartDate(termYear, termNumber);
    const created: string[] = [];

    // Sequential creates so generateBriefNumber stays correct. For a one-shot
    // 60-row burst this is acceptable; the per-create count() call is cheap.
    for (const centre of centres as Service[]) {
      for (const category of categories) {
        const key = `${centre.id}:${category}`;
        if (existingKeys.has(key)) continue;

        const title = `${centre.name} — ${CATEGORY_LABELS[category]} (Term ${termNumber} ${termYear})`;
        const brief = await createBriefWithNumberRetry(
          (briefNumber) =>
            prisma.vendorBrief.create({
              data: {
                briefNumber,
                title,
                type: CATEGORY_TO_BRIEF_TYPE[category],
                status: "draft",
                ownerId: session.user.id,
                serviceId: centre.id,
                vendorContactId: defaultJinan?.id ?? null,
                termYear,
                termNumber,
                termReadinessCategory: category,
                targetTermStart: startsOn,
              },
              select: { id: true },
            }),
          () => generateBriefNumber(prisma, termYear),
        );
        created.push(brief.id);
      }
    }

    return NextResponse.json({
      created: created.length,
      skipped:
        centres.length * categories.length - created.length,
      ids: created,
    });
  },
  { roles: ROLES },
);
