import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
// GET /api/knowledge-base — list published articles
export const GET = withApiAuth(async (req, session) => {
try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const userRole = session!.user.role as string;

    const articles = await prisma.knowledgeBaseArticle.findMany({
      where: {
        published: true,
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { body: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });

    // Filter by audience roles — empty audienceRoles means visible to all
    const filtered = articles.filter(
      (a) => a.audienceRoles.length === 0 || a.audienceRoles.includes(userRole),
    );

    return NextResponse.json({ articles: filtered });
  } catch (err) {
    logger.error("Knowledge Base GET", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
