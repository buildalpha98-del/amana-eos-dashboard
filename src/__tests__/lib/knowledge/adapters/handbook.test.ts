import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert } = vi.hoisted(() => ({ upsert: vi.fn(async (_input?: unknown) => ({ sourceId: "s", outcome: "created" })) }));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i) }));

import { syncHandbook } from "@/lib/knowledge/adapters/handbook";

describe("syncHandbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.amanaWayContent.findUnique.mockResolvedValue({ data: { mission: "Custom mission" } });
    prismaMock.amanaHandbookContent.findUnique.mockResolvedValue(null);
  });

  it("upserts the three seeds with stable externalIds and appends overrides", async () => {
    const res = await syncHandbook();
    expect(res.length).toBe(3);
    const ids = upsert.mock.calls.map((c) => (c[0] as { externalId: string }).externalId).sort();
    expect(ids).toEqual(["employee-handbook", "proven-process", "the-amana-way"]);
    const amanaWay = upsert.mock.calls.find((c) => (c[0] as { externalId: string }).externalId === "the-amana-way")![0] as { text: string; category: string; sourceKind: string };
    expect(amanaWay.text).toContain("## Overrides");
    expect(amanaWay.text).toContain("mission: Custom mission");
    expect(amanaWay.category).toBe("guide");
    expect(amanaWay.sourceKind).toBe("handbook");
    // No forced tier — the heuristic column is always inferTier's.
    for (const c of upsert.mock.calls) expect(c[0]).not.toHaveProperty("tier");
  });
});
