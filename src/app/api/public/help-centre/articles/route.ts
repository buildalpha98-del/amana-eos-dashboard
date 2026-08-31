import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const querySchema = z.object({
  category: z.string().max(120).optional(),
  search: z.string().max(200).optional(),
  popular: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Public help-centre article listing. Published articles only — body is
 * never included here (fetched per-article by slug), keeping the payload
 * small for search-as-you-type.
 *
 * ?category=<slug>  scope to one category
 * ?search=<term>    case-insensitive match on title or body
 * ?popular=1        order by viewCount (the "most popular articles" strip)
 */
export const GET = withApiHandler(async (req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  const { category, search, popular, limit } = parsed.data;

  const where: Prisma.HelpArticleWhereInput = {
    published: true,
    category: { is: { published: true } },
  };
  if (category) where.category = { is: { published: true, slug: category } };
  if (search?.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: "insensitive" } },
      { body: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  const articles = await prisma.helpArticle.findMany({
    where,
    orderBy: popular
      ? [{ viewCount: "desc" }, { updatedAt: "desc" }]
      : [{ sortOrder: "asc" }, { title: "asc" }],
    take: limit ?? 50,
    select: {
      id: true,
      title: true,
      slug: true,
      updatedAt: true,
      category: { select: { name: true, slug: true } },
    },
  });

  return NextResponse.json({ articles });
});
