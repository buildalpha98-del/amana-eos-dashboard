import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async (_input?: unknown) => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async (..._args: unknown[]) => 0),
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
import { syncHelpArticles } from "@/lib/knowledge/adapters/help-article";

describe("syncHelpArticles", () => {
  beforeEach(() => vi.clearAllMocks());
  it("indexes published articles only, carrying audienceRoles and a /help link", async () => {
    prismaMock.knowledgeBaseArticle.findMany.mockResolvedValue([
      { id: "a1", title: "Roster basics", body: "# Roster\n…", slug: "roster-basics", audienceRoles: ["staff"], category: "operations" },
    ]);
    await syncHelpArticles();
    expect(prismaMock.knowledgeBaseArticle.findMany.mock.calls[0][0].where).toEqual({ published: true });
    const input = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({
      sourceKind: "help_article", externalId: "a1", category: "guide",
      audienceRoles: ["staff"], externalUrl: "/help", tier: "general",
    });
    // unpublished/deleted articles are adapter-excluded (re-activated by upsert if republished)
    expect(exclude).toHaveBeenCalledWith(
      { sourceKind: "help_article", externalId: { notIn: ["a1"] } },
      "adapter",
    );
  });
});
