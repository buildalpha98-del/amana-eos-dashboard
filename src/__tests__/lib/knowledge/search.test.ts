import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const { embedTexts } = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({
  embedTexts,
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}));

import { searchKnowledge, formatHitsForPrompt } from "@/lib/knowledge/search";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  chunkId: id, sourceId: `s-${id}`, chunkIndex: 0, content: `body ${id}`, heading: null,
  title: `Doc ${id}`, category: "policy", tier: "general", externalUrl: null,
  tsRank: null, cosineDistance: null, ...extra,
});

describe("searchKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fuses tsvector + vector legs with RRF and carries both relevance signals", async () => {
    embedTexts.mockResolvedValue([[0.1, 0.2]]);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("plainto_tsquery")) return [row("a", { tsRank: 0.9 }), row("b", { tsRank: 0.5 })];
      if (sql.includes("<=>")) return [row("b", { cosineDistance: 0.1 }), row("c", { cosineDistance: 0.3 })];
      return [];
    });
    const hits = await searchKnowledge("rest time", { role: "staff", serviceIds: ["s1"], state: "NSW" }, 8);
    // b appears in both legs → highest fused score
    expect(hits[0].chunkId).toBe("b");
    expect(hits[0].tsRank).toBe(0.5);
    expect(hits[0].cosineDistance).toBe(0.1);
    expect(hits.map((h) => h.chunkId).sort()).toEqual(["a", "b", "c"]);
  });

  it("passes scope as SQL params, casting arrays, and never interpolates them", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    await searchKnowledge("x", { role: "staff", serviceIds: ["s1", "s2"], state: "VIC" }, 8);
    const [sql, ...params] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('"serviceId" = ANY($2::text[])');
    expect(sql).toContain("s.state = $3");
    expect(sql).toContain("$4 = ANY(s.\"audienceRoles\")");
    expect(sql).toContain("s.status = 'active'");
    expect(params[1]).toEqual(["s1", "s2"]);
    expect(params[2]).toBe("VIC");
    expect(params[3]).toBe("staff");
  });

  it("unscoped (null) serviceIds/state are passed as null so the IS NULL branch applies", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    await searchKnowledge("x", { role: "owner", serviceIds: null, state: null }, 8);
    const [, , ids, st] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(ids).toBeNull();
    expect(st).toBeNull();
  });

  it("falls back to tsvector-only when embeddings return null (no vector query issued)", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      sql.includes("plainto_tsquery") ? [row("a", { tsRank: 0.4 })] : [],
    );
    const hits = await searchKnowledge("x", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["a"]);
    const sqls = prismaMock.$queryRawUnsafe.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes("<=>"))).toBe(false);
  });

  it("retries the tsvector leg with websearch_to_tsquery when plainto returns nothing", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      sql.includes("websearch_to_tsquery") ? [row("w", { tsRank: 0.2 })] : [],
    );
    const hits = await searchKnowledge("posting to families", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["w"]);
  });
});

describe("formatHitsForPrompt", () => {
  it("groups by document with title, heading and OpenUrl", () => {
    const text = formatHitsForPrompt([
      { ...row("a", { externalUrl: "https://x/a.pdf", heading: "Steps" }), fusedScore: 1 } as never,
    ]);
    expect(text).toContain("Doc a");
    expect(text).toContain("OpenUrl: https://x/a.pdf");
    expect(text).toContain("Steps");
  });
});
