import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Published KnowledgeBaseArticle rows (staff /help). Articles have no CRUD —
 * triggered by the seed route and backfill. The /help page has no per-article
 * deep link today, so externalUrl is the page itself.
 */
export async function syncHelpArticles(): Promise<UpsertResult[]> {
  const articles = await prisma.knowledgeBaseArticle.findMany({
    where: { published: true },
    select: { id: true, title: true, body: true, slug: true, audienceRoles: true, category: true },
  });
  const results: UpsertResult[] = [];
  for (const a of articles) {
    results.push(
      await upsertKnowledgeSource({
        sourceKind: "help_article",
        externalId: a.id,
        title: a.title,
        category: "guide",
        text: `# ${a.title}\n\n${a.body}`,
        externalUrl: "/help",
        audienceRoles: a.audienceRoles,
      }),
    );
  }
  await excludeSources(
    { sourceKind: "help_article", externalId: { notIn: articles.map((a) => a.id) } },
    "adapter",
  );
  return results;
}
