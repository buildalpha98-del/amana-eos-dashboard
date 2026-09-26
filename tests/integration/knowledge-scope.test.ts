/**
 * Integration test: the knowledge store's scope SQL, EXECUTED against a real
 * Postgres with pgvector (tsvector-only — no VOYAGE_API_KEY, so the vector
 * leg contributes nothing and every hit comes from the text leg).
 *
 * The unit tests in src/__tests__/lib/knowledge/search.test.ts assert the
 * SQL *text*; this file proves the WHERE actually does what the spec says
 * (docs/superpowers/specs/2026-09-26-amana-ai-second-brain-design.md §3.4):
 *
 *   s.status = 'active'
 *   AND ($2::text[] IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($2::text[]))
 *   AND ($3::text IS NULL OR s.state IS NULL OR s.state = $3)
 *   AND (cardinality(s."audienceRoles") = 0 OR $4 = ANY(s."audienceRoles"))
 *
 * Four sources share one nonsense lexeme: org-wide, scoped to service A,
 * scoped to state NSW, restricted to audienceRoles ["member"] — plus an
 * admin-excluded fifth that must never return. Rows are written through the
 * REAL pipeline (upsertKnowledgeSource → indexSource → to_tsvector), so this
 * also proves the persisted-text / embedded=false stamps on a real DB.
 *
 * Skips cleanly (describe.skipIf) when the database has no `vector`
 * extension — the search SQL casts `$1::vector` and would error without it.
 * Requires the test database from .env.test (see tests/integration/setup.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestService, cleanupTestData } from "@/lib/test-utils";
import { upsertKnowledgeSource, excludeSources } from "@/lib/knowledge/pipeline";
import { searchKnowledge } from "@/lib/knowledge/search";
import type { KnowledgeScope } from "@/lib/knowledge/types";

/** A lexeme no real document carries, so the assertions can't be polluted by leftover rows. */
const WORD = "quokkafence";
const PREFIX = "it-scope:";

async function hasVectorExtension(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'vector'`,
  );
  return (rows[0]?.n ?? 0) > 0;
}

// Top-level await: the extension check has to happen at collection time for
// describe.skipIf. A connection failure throws here on purpose — a broken
// test database must fail loudly, not read as "skipped".
const vectorAvailable = await hasVectorExtension();

describe.skipIf(!vectorAvailable)("knowledge scope SQL (real pgvector database, tsvector-only)", () => {
  let serviceA: string;
  let serviceB: string;
  const ids: Record<"org" | "svcA" | "nsw" | "member" | "excluded", string> = {
    org: "", svcA: "", nsw: "", member: "", excluded: "",
  };
  let savedVoyageKey: string | undefined;

  beforeAll(async () => {
    // tsvector-only on purpose: without a key embedTexts returns null, the
    // vector leg yields [], and indexSource stamps embedded=false.
    savedVoyageKey = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;

    await cleanupTestData();
    await prisma.knowledgeSource.deleteMany({ where: { externalId: { startsWith: PREFIX } } });

    serviceA = (await createTestService({ state: "NSW" })).id;
    serviceB = (await createTestService({ state: "VIC" })).id;

    // Distinct titles → distinct dedupe keys, so supersession never touches
    // these rows. No state/version tokens in the titles (parseFilenameMeta
    // would otherwise derive them).
    const seed = async (
      key: keyof typeof ids,
      input: Partial<Parameters<typeof upsertKnowledgeSource>[0]> & { title: string },
    ) => {
      const r = await upsertKnowledgeSource({
        sourceKind: "manual",
        externalId: `${PREFIX}${key}`,
        category: "guide",
        text: `# ${input.title}\n\nThe ${WORD} rule applies here. Nothing else does.`,
        ...input,
      });
      expect(r.outcome, `${key} seed`).toBe("created");
      ids[key] = r.sourceId;
    };
    await seed("org", { title: "Scope Test Alpha Guide" });
    await seed("svcA", { title: "Scope Test Bravo Guide", serviceId: serviceA });
    await seed("nsw", { title: "Scope Test Charlie Guide", state: "New South Wales" });
    await seed("member", { title: "Scope Test Delta Guide", sourceKind: "help_article", audienceRoles: ["member"] });
    await seed("excluded", { title: "Scope Test Echo Guide" });
    expect(await excludeSources({ id: ids.excluded }, "admin")).toBe(1);
  });

  afterAll(async () => {
    await prisma.knowledgeSource.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
    await cleanupTestData();
    if (savedVoyageKey === undefined) delete process.env.VOYAGE_API_KEY;
    else process.env.VOYAGE_API_KEY = savedVoyageKey;
    await prisma.$disconnect();
  });

  const sourcesFor = async (scope: KnowledgeScope) => {
    const hits = await searchKnowledge(WORD, scope, 20);
    // Every hit came from the text leg: tsRank set, no cosine distance.
    for (const h of hits) {
      expect(h.tsRank).not.toBeNull();
      expect(h.cosineDistance).toBeNull();
    }
    return new Set(hits.map((h) => h.sourceId));
  };

  it("the pipeline persisted the text and stamped a tsvector-only index (indexedAt set, embedded=false, no error)", async () => {
    const rows = await prisma.knowledgeSource.findMany({
      where: { externalId: { startsWith: PREFIX } },
      select: { externalId: true, text: true, indexedAt: true, embedded: true, indexError: true, state: true, status: true, _count: { select: { chunks: true } } },
    });
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.text, r.externalId).toContain(WORD);
      expect(r.indexedAt, r.externalId).toBeInstanceOf(Date);
      expect(r.embedded, r.externalId).toBe(false);
      expect(r.indexError, r.externalId).toBeNull();
      expect(r._count.chunks, r.externalId).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.externalId === `${PREFIX}nsw`)?.state).toBe("NSW"); // canonicalised
    expect(rows.find((r) => r.externalId === `${PREFIX}excluded`)?.status).toBe("excluded");
  });

  it("owner (null scope): every org-wide, centre and state row — but NOT a role-restricted one, and never the excluded row", async () => {
    // Spec §3.4: `audienceRoles = '{}' OR $role = ANY(audienceRoles)` — an
    // empty list means every role; a non-empty list admits ONLY the listed
    // roles, owner included. A member-only help article is a member-only
    // help article whoever is asking.
    const got = await sourcesFor({ role: "owner", serviceIds: null, state: null });
    expect(got).toEqual(new Set([ids.org, ids.svcA, ids.nsw]));
    expect(got.has(ids.member)).toBe(false);
    expect(got.has(ids.excluded)).toBe(false);
  });

  it("staff at centre A in NSW: org-wide + centre A + NSW, not the member-only row", async () => {
    const got = await sourcesFor({ role: "staff", serviceIds: [serviceA], state: "NSW" });
    expect(got).toEqual(new Set([ids.org, ids.svcA, ids.nsw]));
  });

  it("staff at centre B in VIC: org-wide only", async () => {
    const got = await sourcesFor({ role: "staff", serviceIds: [serviceB], state: "VIC" });
    expect(got).toEqual(new Set([ids.org]));
  });

  it("member at centre A in NSW: all four (the member-only row included)", async () => {
    const got = await sourcesFor({ role: "member", serviceIds: [serviceA], state: "NSW" });
    expect(got).toEqual(new Set([ids.org, ids.svcA, ids.nsw, ids.member]));
  });

  it("a staff member with no centre ([]) sees org-wide rows only, and the excluded row returns for nobody", async () => {
    const noCentre = await sourcesFor({ role: "staff", serviceIds: [], state: null });
    expect(noCentre).toEqual(new Set([ids.org, ids.nsw])); // null state = no state filter
    for (const scope of [
      { role: "owner", serviceIds: null, state: null },
      { role: "member", serviceIds: [serviceA], state: "NSW" },
    ] satisfies KnowledgeScope[]) {
      expect((await sourcesFor(scope)).has(ids.excluded)).toBe(false);
    }
  });
});
