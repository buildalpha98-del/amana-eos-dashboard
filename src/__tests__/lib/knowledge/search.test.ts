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

import { searchKnowledge, formatHitsForPrompt, SOP_HIT_NOTE } from "@/lib/knowledge/search";

// Both text-leg passes contain "plainto_tsquery" (the OR retry is built from
// it), so route on the OR construction rather than the function name.
const OR_TSQUERY = "replace(plainto_tsquery('english', $1)::text, ' & ', ' | ')::tsquery";
const isStrictText = (sql: string) => sql.includes("plainto_tsquery") && !sql.includes(OR_TSQUERY);
const isOrText = (sql: string) => sql.includes(OR_TSQUERY);

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
      if (isStrictText(sql)) return [row("a", { tsRank: 0.9 }), row("b", { tsRank: 0.5 })];
      if (sql.includes("<=>")) return [row("b", { cosineDistance: 0.1 }), row("c", { cosineDistance: 0.3 })];
      return [];
    });
    const hits = await searchKnowledge("rest time", { role: "staff", serviceIds: ["s1"], state: "NSW" }, 8);
    // b appears in both legs → highest fused score
    expect(hits[0].chunkId).toBe("b");
    expect(hits[0].tsRank).toBe(0.5);
    expect(hits[0].cosineDistance).toBe(0.1);
    expect(hits.map((h) => h.chunkId).sort()).toEqual(["a", "b", "c"]);
    // the vector leg receives the embedded query as its $1 vector literal
    const vectorCall = prismaMock.$queryRawUnsafe.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("<=>"),
    );
    expect(vectorCall?.[1]).toBe("[0.1,0.2]");
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
      isStrictText(sql) ? [row("a", { tsRank: 0.4 })] : [],
    );
    const hits = await searchKnowledge("x", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["a"]);
    const sqls = prismaMock.$queryRawUnsafe.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes("<=>"))).toBe(false);
  });

  it("runs the strict AND pass first and issues no OR retry when it finds rows", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      isStrictText(sql) ? [row("a", { tsRank: 0.4 })] : [row("w", { tsRank: 0.2 })],
    );
    const hits = await searchKnowledge("rest time", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["a"]);
    const sqls = prismaMock.$queryRawUnsafe.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls).toHaveLength(1);
    expect(isStrictText(sqls[0])).toBe(true);
    expect(sqls.some(isOrText)).toBe(false);
  });

  it("retries the tsvector leg with the lexemes ORed only when the strict AND pass returns nothing", async () => {
    embedTexts.mockResolvedValue(null);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      isOrText(sql) ? [row("w", { tsRank: 0.2 })] : [],
    );
    const scope = { role: "owner" as const, serviceIds: null, state: null };
    const hits = await searchKnowledge("amana way core values", scope, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["w"]);

    const calls = prismaMock.$queryRawUnsafe.mock.calls;
    expect(calls).toHaveLength(2);
    const [strictSql, ...strictParams] = calls[0];
    const [orSql, ...orParams] = calls[1];
    expect(isStrictText(strictSql)).toBe(true);
    // websearch_to_tsquery ANDs plain words exactly like plainto_tsquery, so
    // the retry must be a genuine OR built from the same normalised lexemes
    expect(orSql).not.toContain("websearch_to_tsquery");
    expect(orSql).toContain(`ts_rank(c."searchVector", ${OR_TSQUERY})`);
    expect(orSql).toContain(`c."searchVector" @@ ${OR_TSQUERY}`);
    // all-stopword (empty) or single-lexeme queries have nothing to widen
    expect(orSql).toContain("numnode(plainto_tsquery('english', $1)) > 1");
    // identical scope WHERE, column list and params so RRF fusion is unchanged
    for (const sql of [strictSql, orSql]) {
      expect(sql).toContain("s.status = 'active'");
      expect(sql).toContain('"serviceId" = ANY($2::text[])');
      expect(sql).toContain("s.state = $3");
      expect(sql).toContain("$4 = ANY(s.\"audienceRoles\")");
      expect(sql).toContain('COALESCE(s."tierOverride", s.tier) AS "tier"');
      expect(sql).toContain('NULL::float8 AS "cosineDistance"');
    }
    expect(orParams).toEqual(strictParams);
    expect(orParams).toEqual(["amana way core values", null, null, "owner"]);
  });

  it("degrades to tsvector-only when the vector leg's DB query rejects", async () => {
    embedTexts.mockResolvedValue([[0.1, 0.2]]);
    prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("<=>")) throw new Error("relation \"vector\" does not exist");
      if (isStrictText(sql)) return [row("a", { tsRank: 0.4 })];
      return [];
    });
    const hits = await searchKnowledge("rest time", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits.map((h) => h.chunkId)).toEqual(["a"]);
  });

  it("returns no hits and makes no DB/embedding call for a blank query", async () => {
    const hits = await searchKnowledge("   ", { role: "owner", serviceIds: null, state: null }, 8);
    expect(hits).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
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

  it("labels every document with its category + tier, and flags an SOP as possibly older than the state policy", () => {
    const text = formatHitsForPrompt([
      { ...row("sop", { title: "OPS-08 Medical Administration", category: "sop", tier: "general" }), fusedScore: 1 } as never,
      { ...row("proc", { title: "QA2 Managing Medical Conditions Procedure", category: "procedure", tier: "safety_critical" }), fusedScore: 0.9 } as never,
    ]);
    expect(SOP_HIT_NOTE).toMatch(/company SOP; may be older than the state policy: prefer a policy\/procedure source/);
    expect(text).toContain(`### OPS-08 Medical Administration (sop, general)${SOP_HIT_NOTE}`);
    expect(text).toContain("### QA2 Managing Medical Conditions Procedure (procedure, safety_critical)\n");
    // The note is SOP-only — exactly one occurrence.
    expect(text.split(SOP_HIT_NOTE)).toHaveLength(2);
  });
});
