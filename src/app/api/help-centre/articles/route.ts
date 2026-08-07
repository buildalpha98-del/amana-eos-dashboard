import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { HELP_CENTRE_ADMIN_ROLES, uniqueHelpSlug } from "@/lib/help-centre";

const ADMIN = [...HELP_CENTRE_ADMIN_ROLES];

// GET /api/help-centre/articles?categoryId= — all articles (drafts included) for the admin surface
export const GET = withApiAuth(
  async (req) => {
    const categoryId = new URL(req.url).searchParams.get("categoryId");
    const articles = await prisma.helpArticle.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        categoryId: true,
        title: true,
        slug: true,
        body: true,
        sortOrder: true,
        published: true,
        viewCount: true,
        updatedAt: true,
        category: { select: { name: true, slug: true } },
      },
    });
    return NextResponse.json({ articles });
  },
  { roles: ADMIN },
);

const createSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Body is required").max(100_000),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
});

// POST /api/help-centre/articles
export const POST = withApiAuth(
  async (req) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const data = parsed.data;

    const category = await prisma.helpCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) throw ApiError.badRequest("Unknown category");

    const article = await prisma.helpArticle.create({
      data: {
        categoryId: data.categoryId,
        title: data.title.trim(),
        slug: await uniqueHelpSlug("helpArticle", data.title),
        body: data.body,
        sortOrder: data.sortOrder ?? 0,
        published: data.published ?? false,
      },
    });
    return NextResponse.json({ article }, { status: 201 });
  },
  { roles: ADMIN },
);
