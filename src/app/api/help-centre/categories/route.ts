import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { HELP_CENTRE_ADMIN_ROLES, uniqueHelpSlug } from "@/lib/help-centre";

const ADMIN = [...HELP_CENTRE_ADMIN_ROLES];

// GET /api/help-centre/categories — all categories (drafts included) for the admin surface
export const GET = withApiAuth(
  async () => {
    const categories = await prisma.helpCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { articles: true } } },
    });
    return NextResponse.json({
      categories: categories.map(({ _count, ...c }) => ({ ...c, articleCount: _count.articles })),
    });
  },
  { roles: ADMIN },
);

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(1000).optional(),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
});

// POST /api/help-centre/categories
export const POST = withApiAuth(
  async (req) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const data = parsed.data;

    const category = await prisma.helpCategory.create({
      data: {
        name: data.name.trim(),
        slug: await uniqueHelpSlug("helpCategory", data.name),
        description: data.description?.trim() ?? "",
        icon: data.icon?.trim() || "book-open",
        sortOrder: data.sortOrder ?? 0,
        published: data.published ?? false,
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  },
  { roles: ADMIN },
);
