import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { search } = vi.hoisted(() => ({
  search: vi.fn(async (..._a: unknown[]) => [{ chunkId: "c", sourceId: "s", chunkIndex: 0, content: "body", heading: null, title: "Doc", category: "policy", tier: "general", externalUrl: null, fusedScore: 1, tsRank: 0.5, cosineDistance: null }]),
}));
vi.mock("@/lib/knowledge/search", () => ({
  searchKnowledge: (...a: unknown[]) => search(...a),
  formatHitsForPrompt: () => "### Doc\n\nbody",
}));
import { ASSISTANT_TOOLS, executeToolCall } from "@/lib/ai-tools";

describe("search_knowledge tool", () => {
  it("is registered under the new name and the old name is gone", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names).toContain("search_knowledge");
    expect(names).not.toContain("search_knowledge_base");
  });

  it("passes the executor's scope to searchKnowledge — never anything from the model input", async () => {
    const scope = { role: "staff", serviceIds: ["s1"], state: "NSW" };
    const out = await executeToolCall("search_knowledge", { query: "rest time", serviceIds: ["HACK"] }, { scope });
    expect(search).toHaveBeenCalledWith("rest time", scope, 8);
    expect(out).toContain("Doc");
  });
});
