# Amana AI — Slice 1: Content + Safety — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "index whatever is in `Document`" knowledge base with an opt-in `KnowledgeSource` store fed by named adapters, scoped in SQL, populated with the handbook, help articles, policies, centre facts, regulator references and the full SharePoint policy/procedure/SOP library — and close the two leaks (unscoped `/api/knowledge/ask`, financials in every role's system prompt).

**Architecture:** New `src/lib/knowledge/` package: `normalize` (title/filename/state/tier parsing), `pipeline` (upsert → chunk → embed → tsvector), `scope` (session → `{ serviceIds, state, role }` via `getCentreScope`), `search` (tsvector ⊕ pgvector, reciprocal-rank fusion, scope enforced in `WHERE`), and one adapter per source kind. The old `Document`-backed store is retired with an explicit route list; the assistant's `search_knowledge` tool reads the new store. Slice 1 does **not** add answer modes, citations UI or educator tools — those are slices 2 and 3.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22 + PostgreSQL (Neon) with `pgvector`, Voyage AI `voyage-3` embeddings (raw `fetch`, no SDK), Zod 4, Vitest 4, `unpdf`/`mammoth` (existing extractors).

**Spec:** `docs/superpowers/specs/2026-09-26-amana-ai-second-brain-design.md` (§3.1–3.4, §3.2 retirement list, §5.1, §6, §7 slice 1, §8).

**Deviations from spec (deliberate, spec updated to match):** (1) §7 — the spec places RRF fusion, `buildKnowledgeScope` and the tier heuristic in slice 2. This plan builds all three in slice 1 because SQL-enforced scope *is* the "no longer dangerous" outcome — importing centre-specific and state-specific documents without scope would be a regression. Spec §7 is updated to match. Answer modes, citations UI and the admin "test a question" view remain slice 2. (2) §6 — the console shows the latest sync run's counts and the SharePoint conflict/unmapped lists (`LastSyncPanel`), but the full per-item report and "test a question" are slice 2. (3) §3.2 — `/api/settings/ai-knowledge/seed` runs the handbook adapter only; the full backfill is `/sync { adapter: "backfill" }`.

**Branch:** work on `feat/amana-ai-slice-1` off `origin/main` (the spec branch `feat/amana-ai-second-brain-spec` merges separately). Confirm `git remote -v` shows `buildalpha98-del/amana-eos-dashboard` before any commit.

**Conventions that apply everywhere in this plan** (from CLAUDE.md — do not deviate):
- Routes: `withApiAuth(handler, { roles })`, `parseJsonBody`, `ApiError.*`, Zod on every write body. Never raw `try/catch` returning `{ error }`.
- Logging: `logger` from `@/lib/logger`, never `console.*`.
- Tests: `src/__tests__/`, `prismaMock` from `helpers/prisma-mock`, `mockSession` from `helpers/auth-mock`, `createRequest` from `helpers/request`, `_clearUserActiveCache()` in `beforeEach`, `mockImplementation` with input routing (never `mockResolvedValueOnce` chains).
- Run tests with `npx vitest run <path>`; the full suite is `npm test`; build is `npm run build`; lint is `npm run lint`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

**Create**
- `prisma/migrations/20260927000000_knowledge_store/migration.sql` — pgvector extension, four tables, indexes, `AiUsage.userId` nullable.
- `src/lib/knowledge/types.ts` — shared types.
- `src/lib/knowledge/normalize.ts` — `normalizeTitle`, `parseFilenameMeta`, `canonicalState`, `inferTier`, `hashContent`.
- `src/lib/embeddings.ts` — Voyage client (`embedTexts`, `isEmbeddingsConfigured`).
- `src/lib/knowledge/pipeline.ts` — `upsertKnowledgeSource`, `indexSource`, `applySupersession`.
- `src/lib/knowledge/scope.ts` — `buildKnowledgeScope(session)`.
- `src/lib/knowledge/search.ts` — `searchKnowledge`, `formatHitsForPrompt`.
- `src/lib/knowledge/adapters/{handbook,help-article,policy-upload,centre-facts,regulator,manual,backfill,sharepoint-export}.ts`.
- `src/lib/knowledge/regulator-sources.ts` — curated URL list.
- `src/app/api/settings/ai-knowledge/sync/route.ts` — run an adapter → `KnowledgeSyncRun`.
- `src/app/api/settings/ai-knowledge/[id]/reindex/route.ts`.
- `src/app/api/cron/knowledge-regulator-refresh/route.ts`.
- `scripts/import-sharepoint-knowledge.ts` — local-export importer.
- `scripts/export-sharepoint-knowledge/README.md` — how the export directory is produced.
- `src/__tests__/fixtures/knowledge-export/**` — seven-file fixture tree (six import cases + one skip case).
- `src/__tests__/lib/knowledge/*.test.ts`, `src/__tests__/api/ai-knowledge-*.test.ts`, `src/__tests__/api/ai-usage.test.ts`, `src/__tests__/lib/knowledge-guard.test.ts`.

**Modify**
- `prisma/schema.prisma` — new enums/models; `AiUsage.userId String?`; `Service.knowledgeSources` relation.
- `src/lib/service-content-shared.ts` — `staffNotes` field.
- `src/__tests__/helpers/prisma-mock.ts` — no change needed (pipeline uses `$queryRawUnsafe`, which the mock supports).
- `src/lib/document-indexer.ts` — delete `indexDocument`, `indexTextContent`, `searchChunks`, `formatChunksForPrompt`; keep `extractText`, `extractTextFromBuffer`, `chunkText`.
- `src/lib/reference-hosts.ts` (new, Task 15) + `src/__tests__/lib/reference-hosts.test.ts` — host allow-list leaf module (moved out of `ai-tools.ts`, NHMRC/ASCIA added).
- `src/lib/ai-tools.ts` — allow-list imported from `reference-hosts` (Task 15); `search_knowledge_base` → `search_knowledge`; executor takes scope (Task 18).
- `src/app/api/assistant/chat/route.ts` — role-gate `buildDashboardContext()`; pass scope to the tool executor.
- `src/app/api/settings/ai-knowledge/{route,upload,register,[id],seed}/route.ts` — re-point at `KnowledgeSource`.
- `src/app/(dashboard)/settings/ai-knowledge/page.tsx` — new entry shape; Sync replaces Reindex/Dedupe/Backfill.
- `src/app/api/documents/{route,bulk/route,[id]/route}.ts` — remove `indexDocument` (the audits document route only mentions the indexer in a comment — no change).
- `src/app/api/policies/route.ts`, `src/app/api/policies/[id]/versions/route.ts` — call `policy_upload` adapter.
- `src/app/api/services/[id]/content/route.ts` — call `centre_facts` adapter.
- `src/app/api/amana-handbook/content/route.ts`, `src/app/api/amana-way/content/route.ts` — call `handbook` adapter.
- `src/app/api/knowledge-base/seed/route.ts` — call `help_article` adapter.
- `src/app/api/lms/courses/route.ts` (create), `src/app/api/lms/courses/[id]/route.ts` (PATCH + soft DELETE), `src/app/api/lms/courses/publish-readiness/route.ts` (bulk publish), `src/app/api/lms/courses/[id]/modules/route.ts`, `src/app/api/lms/modules/[moduleId]/route.ts` — call `lms_module` adapter.
- `src/app/api/policies/[id]/route.ts` — title/category PATCH re-syncs the current version.
- `src/components/settings/ai-knowledge/{KnowledgeSourceRow,EntryModal,LastSyncPanel}.tsx` — extracted from the console page (new).
- `src/app/api/ai/usage/route.ts` — null-user "System" bucket.
- `vercel.json` — monthly regulator cron.
- `.github/workflows/test.yml` — pgvector-enabled Postgres image + `CREATE EXTENSION` before `db push` (both jobs).
- `src/app/api/parent/centres/route.ts` — strip `staffNotes` from the parent payload.
- `.env.example`, `.gitignore`, `CLAUDE.md`.
- `src/__tests__/api/documents.test.ts` — drop the indexer mock.

**Delete**
- `src/app/api/knowledge/{ask,index,reindex,status}/route.ts`
- `src/app/api/settings/ai-knowledge/{reindex,backfill,dedupe}/route.ts`
- `src/__tests__/api/knowledge.test.ts`
- `src/__tests__/lib/document-indexer.test.ts` (rewritten as `document-extract.test.ts` keeping only the extractor cases)

---

## Chunk 1: Schema, migration, embeddings

### Task 1: Branch + env scaffolding

**Files:**
- Modify: `.env.example`, `.gitignore`

- [ ] **Step 1: Create the branch**

```bash
cd ~/Developer/amana-eos-dashboard && git remote -v | head -1 && git fetch origin && git checkout -b feat/amana-ai-slice-1 origin/main
```
Expected: remote is `buildalpha98-del/amana-eos-dashboard`; branch created.

- [ ] **Step 2: Add env + ignore entries**

Append to `.env.example` (after the `DEEPGRAM_WEBHOOK_SECRET=` block):

```
# Voyage AI embeddings for the Amana AI knowledge store (src/lib/embeddings.ts).
# Unset = tsvector-only search; indexing still works, vector column stays null.
VOYAGE_API_KEY=
```

Append to `.gitignore`:

```
# Amana AI — local SharePoint export (full policy text; never commit)
knowledge-export/
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore && git commit -m "chore(knowledge): env + ignore entries for the knowledge store

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Make `AiUsage.userId` nullable**

In `model AiUsage`, change:
```prisma
  userId       String
  user         User     @relation("AiUsageLogs", fields: [userId], references: [id], onDelete: Cascade)
```
to:
```prisma
  // Nullable since 2026-09-27: cron/script embedding runs (section
  // "knowledge-index") have no acting user. The usage dashboard buckets
  // null under "System".
  userId       String?
  user         User?    @relation("AiUsageLogs", fields: [userId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Append the knowledge models at the end of the file**

```prisma
// ─── Amana AI knowledge store (2026-09-27) ───────────────────────────
// Opt-in by adapter: nothing enters KnowledgeSource except through a
// named adapter in src/lib/knowledge/adapters. There is deliberately no
// relation to Document — the HR file cabinet (contracts, certs) must
// never be indexable. See docs/superpowers/specs/2026-09-26-amana-ai-second-brain-design.md §3.1.

enum KnowledgeSourceKind {
  sharepoint
  policy_upload
  help_article
  handbook
  lms_module
  centre_facts
  regulator
  manual
}

enum KnowledgeCategory {
  policy
  procedure
  sop
  guide
  reference
  centre
}

enum KnowledgeTier {
  safety_critical
  general
}

enum KnowledgeStatus {
  active
  superseded
  excluded
}

model KnowledgeSource {
  id              String              @id @default(cuid())
  title           String
  /// lowercased, "V<n>"/"NSW"/"VIC"/"OSHC" tokens and punctuation stripped — the dedupe key with state + serviceId
  normalizedTitle String
  sourceKind      KnowledgeSourceKind
  category        KnowledgeCategory
  tier            KnowledgeTier       @default(general)
  /// admin override wins over the import heuristic
  tierOverride    KnowledgeTier?
  qualityArea     Int?
  serviceId       String?
  service         Service?            @relation("ServiceKnowledgeSources", fields: [serviceId], references: [id], onDelete: Cascade)
  /// canonical abbreviation ("NSW", "VIC") or null = all states
  state           String?
  /// help_article only; [] = every role
  audienceRoles   String[]            @default([])
  version         Int?
  /// SharePoint item id | PolicyDocumentVersion.id | article id | `service:<id>` | URL | manual id
  externalId      String
  externalUrl     String?
  contentHash     String
  status          KnowledgeStatus     @default(active)
  /// who set status=excluded: "adapter" (origin unpublished/archived — the adapter
  /// re-activates it when the origin comes back) or "admin" (console decision —
  /// never auto-reverted). null when active/superseded.
  excludedBy      String?
  supersededById  String?
  indexedAt       DateTime?
  indexError      String?
  chunks          KnowledgeChunk[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([sourceKind, externalId])
  @@index([status, tier])
  @@index([serviceId])
  @@index([normalizedTitle, state, serviceId])
}

model KnowledgeChunk {
  id           String                       @id @default(cuid())
  sourceId     String
  source       KnowledgeSource              @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  chunkIndex   Int
  heading      String?
  content      String                       @db.Text
  tokenCount   Int
  searchVector Unsupported("tsvector")?
  /// vector(1024) in SQL. Declared without the typmod here because Prisma
  /// introspects pgvector columns as bare `vector` and would otherwise keep
  /// proposing a spurious SET DATA TYPE on every `migrate diff`.
  embedding    Unsupported("vector")?
  createdAt    DateTime                     @default(now())

  @@unique([sourceId, chunkIndex])
}

model KnowledgeSyncRun {
  id          String    @id @default(cuid())
  adapter     String
  startedById String?
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  cursor      String?
  counts      Json
  details     Json
  error       String?

  @@index([adapter, startedAt])
}

model AssistantTurn {
  id           String   @id @default(cuid())
  userId       String
  serviceId    String?
  mode         String
  message      String   @db.Text
  chunkIds     String[]
  toolCalls    Json
  inputTokens  Int
  outputTokens Int
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
  @@index([createdAt])
}
```

- [ ] **Step 3: Add the back-relation on `Service`**

Inside `model Service`, next to the other relation lists (e.g. after `statements  Statement[]  @relation("ServiceStatements")`), add:
```prisma
  knowledgeSources KnowledgeSource[] @relation("ServiceKnowledgeSources")
```

- [ ] **Step 4: Validate**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma && git commit -m "feat(knowledge): KnowledgeSource/Chunk/SyncRun + AssistantTurn models; AiUsage.userId nullable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Migration (hand-written — pgvector + indexes)

**Files:**
- Create: `prisma/migrations/20260927000000_knowledge_store/migration.sql`

`prisma migrate dev` cannot emit `CREATE EXTENSION` or the HNSW index, so the migration is written by hand. Three environments need pgvector and each gets it differently:

| Env | How |
|---|---|
| Local Homebrew `postgresql@17` (`amana_eos_dev`, schema via `db push`, no migration history) | `brew install pgvector` once; `CREATE EXTENSION` by hand; then `npm run db:push` |
| CI (`postgres:16-alpine`, `db push`) | switch both jobs to `pgvector/pgvector:pg16` + a `CREATE EXTENSION` step |
| Neon (prod + preview deploys, `migrate deploy`) | the migration's `CREATE EXTENSION IF NOT EXISTS vector` |

**A branch push triggers a preview deploy that runs `migrate deploy` against the shared prod Neon DB** (memory: `reference_local-db-and-worktrees`). So `CREATE EXTENSION vector` hits production on the FIRST push of this branch — do Step 4 (Neon branch check) before pushing anything.

- [ ] **Step 1: Write the migration**

```sql
-- Amana AI knowledge store (spec §3.1). Hand-written: Prisma cannot emit
-- CREATE EXTENSION or an HNSW index. searchVector is set explicitly by the
-- pipeline (UPDATE … to_tsvector) — there is no trigger, matching DocumentChunk.

CREATE EXTENSION IF NOT EXISTS vector;

-- AiUsage.userId nullable (cron/script embedding runs have no user).
-- The FK (AiUsage_userId_fkey) is unaffected by dropping NOT NULL.
ALTER TABLE "AiUsage" ALTER COLUMN "userId" DROP NOT NULL;

-- Enums
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('sharepoint','policy_upload','help_article','handbook','lms_module','centre_facts','regulator','manual');
CREATE TYPE "KnowledgeCategory"   AS ENUM ('policy','procedure','sop','guide','reference','centre');
CREATE TYPE "KnowledgeTier"       AS ENUM ('safety_critical','general');
CREATE TYPE "KnowledgeStatus"     AS ENUM ('active','superseded','excluded');

-- KnowledgeSource
CREATE TABLE "KnowledgeSource" (
  "id"              TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "sourceKind"      "KnowledgeSourceKind" NOT NULL,
  "category"        "KnowledgeCategory" NOT NULL,
  "tier"            "KnowledgeTier" NOT NULL DEFAULT 'general',
  "tierOverride"    "KnowledgeTier",
  "qualityArea"     INTEGER,
  "serviceId"       TEXT,
  "state"           TEXT,
  "audienceRoles"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "version"         INTEGER,
  "externalId"      TEXT NOT NULL,
  "externalUrl"     TEXT,
  "contentHash"     TEXT NOT NULL,
  "status"          "KnowledgeStatus" NOT NULL DEFAULT 'active',
  "excludedBy"      TEXT,
  "supersededById"  TEXT,
  "indexedAt"       TIMESTAMP(3),
  "indexError"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeSource_sourceKind_externalId_key" ON "KnowledgeSource"("sourceKind","externalId");
CREATE INDEX "KnowledgeSource_status_tier_idx" ON "KnowledgeSource"("status","tier");
CREATE INDEX "KnowledgeSource_serviceId_idx" ON "KnowledgeSource"("serviceId");
CREATE INDEX "KnowledgeSource_normalizedTitle_state_serviceId_idx" ON "KnowledgeSource"("normalizedTitle","state","serviceId");
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KnowledgeChunk
CREATE TABLE "KnowledgeChunk" (
  "id"           TEXT NOT NULL,
  "sourceId"     TEXT NOT NULL,
  "chunkIndex"   INTEGER NOT NULL,
  "heading"      TEXT,
  "content"      TEXT NOT NULL,
  "tokenCount"   INTEGER NOT NULL,
  "searchVector" tsvector,
  "embedding"    vector(1024),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeChunk_sourceId_chunkIndex_key" ON "KnowledgeChunk"("sourceId","chunkIndex");
CREATE INDEX "KnowledgeChunk_searchVector_idx" ON "KnowledgeChunk" USING GIN ("searchVector");
CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KnowledgeSyncRun
CREATE TABLE "KnowledgeSyncRun" (
  "id"          TEXT NOT NULL,
  "adapter"     TEXT NOT NULL,
  "startedById" TEXT,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),
  "cursor"      TEXT,
  "counts"      JSONB NOT NULL,
  "details"     JSONB NOT NULL,
  "error"       TEXT,
  CONSTRAINT "KnowledgeSyncRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeSyncRun_adapter_startedAt_idx" ON "KnowledgeSyncRun"("adapter","startedAt");

-- AssistantTurn (written from slice 2; created now so the schema is complete)
CREATE TABLE "AssistantTurn" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "serviceId"    TEXT,
  "mode"         TEXT NOT NULL,
  "message"      TEXT NOT NULL,
  "chunkIds"     TEXT[],
  "toolCalls"    JSONB NOT NULL,
  "inputTokens"  INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantTurn_userId_createdAt_idx" ON "AssistantTurn"("userId","createdAt");
CREATE INDEX "AssistantTurn_createdAt_idx" ON "AssistantTurn"("createdAt");
```

- [ ] **Step 2: Local pgvector + schema push (the local DB has no migration history — never `migrate deploy` here; CI documents the P3005 that causes)**

```bash
brew install pgvector
export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')"
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname='vector';"
npm run db:push
npx prisma generate
```
Expected: `brew` links pgvector against `postgresql@17` (if it builds against a different postgres, `brew install pgvector --build-from-source` with `postgresql@17` first on PATH); `extversion` ≥ `0.5.0` (HNSW needs it); `db push` reports the four new tables; `✔ Generated Prisma Client`. `db push` does NOT create the HNSW index (Prisma can't express it) — the local DB runs without it, which only affects speed.

- [ ] **Step 3: Exercise the hand-written SQL on a scratch DB with real migration history**

```bash
createdb amana_eos_migtest
DATABASE_URL="postgresql://localhost:5432/amana_eos_migtest" npx prisma migrate deploy
DATABASE_URL="postgresql://localhost:5432/amana_eos_migtest" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code; echo "diff exit: $?"
dropdb amana_eos_migtest
```
Expected: every migration from `0_init` applies cleanly including this one; diff exit `0`, or a diff that mentions ONLY the `embedding`/`searchVector` columns (Prisma's `Unsupported` noise) — anything else is a real drift to fix. If an UNRELATED historical migration fails on the fresh DB (CI has never replayed history — it uses `db push`), don't fix history here: `DATABASE_URL=<scratch> npx prisma db push` then `npx prisma db execute --file prisma/migrations/20260927000000_knowledge_store/migration.sql --url <scratch>` exercises just this migration, then run the diff. Afterwards, run `npx prisma db pull --print | grep -A1 embedding` and make the schema's `Unsupported("…")` string match what introspection reports — that is the zero-noise choice.

- [ ] **Step 4: Verify pgvector on a Neon branch BEFORE the first push (one-off, do not skip)**

Create a Neon branch from prod in the Neon console (or `neonctl branches create --name pgvector-check`), then:
```bash
psql "$NEON_BRANCH_URL" -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname='vector';"
```
Expected: `extversion` ≥ `0.5.0`. Record it in the PR description. Delete the branch afterwards.

- [ ] **Step 5: CI — pgvector image + extension step (both jobs)**

In `.github/workflows/test.yml`, at lines 96 and 147 change `image: postgres:16-alpine` → `image: pgvector/pgvector:pg16`. Immediately before each `npx prisma db push --skip-generate` (lines 129 and 190) add:
```yaml
      - name: Enable pgvector
        run: echo 'CREATE EXTENSION IF NOT EXISTS vector;' | npx prisma db execute --stdin --url "$DATABASE_URL"
```
Expected after push: both CI jobs' `db push` succeed with the `vector` column.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/20260927000000_knowledge_store .github/workflows/test.yml && git commit -m "feat(knowledge): migration — pgvector, KnowledgeSource/Chunk/SyncRun, AssistantTurn, AiUsage.userId nullable; CI pgvector image

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: `Service.content.staffNotes`

**Files:**
- Modify: `src/lib/service-content-shared.ts`, `src/app/api/parent/centres/route.ts`, `src/components/services/ServiceContentTab.tsx`
- Test: `src/__tests__/lib/service-content-shared.test.ts` (EXISTS — append, do not overwrite)

`staffNotes` holds gate/alarm codes. `GET /api/parent/centres` returns the whole `mergeServiceContent()` object to every family (`route.ts:227`, `:257`), so adding the field to the schema without stripping it there publishes those codes. The strip is a pure helper so it is unit-testable and reusable.

- [ ] **Step 1: Append this `describe` block to the END of the existing test file** (its imports already include `serviceContentSchema`, `mergeServiceContent`, `SERVICE_CONTENT_DEFAULTS`; add `toParentContent` to that import list)

```ts
describe("service content staffNotes", () => {
  it("defaults staffNotes to empty and accepts up to 4000 chars", () => {
    expect(SERVICE_CONTENT_DEFAULTS.staffNotes).toBe("");
    const ok = serviceContentSchema.safeParse({
      ...SERVICE_CONTENT_DEFAULTS,
      staffNotes: "Gate code 1234. Evacuation point: oval.",
    });
    expect(ok.success).toBe(true);
    const tooLong = serviceContentSchema.safeParse({
      ...SERVICE_CONTENT_DEFAULTS,
      staffNotes: "x".repeat(4001),
    });
    expect(tooLong.success).toBe(false);
  });

  it("mergeServiceContent falls back to '' for a non-string staffNotes", () => {
    expect(mergeServiceContent({ staffNotes: 42 }).staffNotes).toBe("");
  });

  it("toParentContent strips staffNotes and nothing else", () => {
    const merged = mergeServiceContent({ ...SERVICE_CONTENT_DEFAULTS, about: "Hi", staffNotes: "Gate 1234" });
    const parent = toParentContent(merged);
    expect("staffNotes" in parent).toBe(false);
    expect(parent.about).toBe("Hi");
    expect(Object.keys(parent).sort()).toEqual(
      Object.keys(SERVICE_CONTENT_DEFAULTS).filter((k) => k !== "staffNotes").sort(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/service-content-shared.test.ts`
Expected: FAIL — `TypeError: toParentContent is not a function` (and `staffNotes` undefined).

- [ ] **Step 3: Implement**

In `serviceContentSchema`, after `sharepointUrl: z.string().max(2_048),` add:
```ts
  /**
   * 2026-09-27: staff-only operational notes for this centre — gate/alarm
   * codes, evacuation point, school office contact, key people. Indexed
   * into the Amana AI knowledge store scoped to THIS service (adapter
   * `centre_facts`); never shown to parents. Coordinator-editable via the
   * same PATCH as the rest of the content tab.
   */
  staffNotes: z.string().max(4_000).default(""),
```
(`.default("")` so a Content tab loaded before this deploy doesn't 400 with "Required" on its next save — the PATCH route parses the whole object.) In `SERVICE_CONTENT_DEFAULTS` add `staffNotes: "",`. In `mergeServiceContent`'s returned object add `staffNotes: str("staffNotes"),` (it uses the `str()` helper for every string field — follow the existing pattern for `sharepointUrl`). Then add, after `mergeServiceContent`:
```ts
export type ParentServiceContent = Omit<ServiceContent, "staffNotes">;

/**
 * The parent-portal view of a centre's content. `staffNotes` (gate/alarm
 * codes, evacuation points) is staff-only and is removed HERE, not by
 * convention at the call site. Any future staff-only field joins this omit.
 */
export function toParentContent(content: ServiceContent): ParentServiceContent {
  const { staffNotes: _staffOnly, ...parent } = content;
  void _staffOnly;
  return parent;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/service-content-shared.test.ts`
Expected: PASS (all existing tests + 3 new).

- [ ] **Step 5: Strip it from the parent payload**

In `src/app/api/parent/centres/route.ts` import `toParentContent` from `@/lib/service-content-shared` and change line ~257 from `content: contentByService.get(s.id)!,` to `content: toParentContent(contentByService.get(s.id)!),`. Run `npx vitest run src/__tests__/api/parent-centres-rooms.test.ts` — Expected: PASS (the existing test's assertions don't reference `staffNotes`).

- [ ] **Step 6: Surface the field in the Content tab editor**

In `src/components/services/ServiceContentTab.tsx`, directly after the `<Section title="Quick links">…</Section>` block (the one holding the `sharepointUrl` input, ~line 262–290), add:
```tsx
      {/* 2026-09-27: staff-only operational notes. Indexed into the Amana AI
          knowledge store scoped to THIS centre (centre_facts adapter) and
          stripped from the parent portal by toParentContent(). */}
      <Section title="Staff-only notes">
        <Field label="Gate/alarm codes, evacuation point, school office contact, key people">
          <Textarea
            value={content.staffNotes}
            onChange={(v) => setContent((c) => ({ ...c, staffNotes: v }))}
            disabled={!canEdit}
            rows={4}
            placeholder="e.g. Gate code 1234 (changes each term). Evacuation point: oval. School office: 03 9000 0000. Nominated supervisor: Sara K."
          />
          <span className="text-2xs text-muted mt-1 block">
            Indexed for Amana AI so staff can ask "what's the gate code at Doveton?". Never shown to parents.
          </span>
        </Field>
      </Section>
```
`Section`, `Field` and `Textarea` are the file's existing local components (`Textarea` takes `onChange(value: string)` — see line 377). `content` is `useState<ServiceContent>(SERVICE_CONTENT_DEFAULTS)`, so it compiles once the schema has the field.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint src/components/services/ServiceContentTab.tsx src/app/api/parent/centres/route.ts src/lib/service-content-shared.ts` — Expected: 0 errors.

```bash
git add src/lib/service-content-shared.ts src/__tests__/lib/service-content-shared.test.ts src/components/services/ServiceContentTab.tsx src/app/api/parent/centres/route.ts && git commit -m "feat(services): staffNotes on service content — centre facts for Amana AI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: `src/lib/knowledge/types.ts` + `normalize.ts`

**Files:**
- Create: `src/lib/knowledge/types.ts`, `src/lib/knowledge/normalize.ts`
- Test: `src/__tests__/lib/knowledge/normalize.test.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/knowledge/types.ts
import type {
  KnowledgeCategory,
  KnowledgeSourceKind,
  KnowledgeTier,
} from "@prisma/client";

/** What every adapter hands to upsertKnowledgeSource(). */
export interface KnowledgeSourceInput {
  sourceKind: KnowledgeSourceKind;
  externalId: string;
  title: string;
  category: KnowledgeCategory;
  /** Full text to chunk. Markdown headings (#/##/###) become chunk boundaries. */
  text: string;
  externalUrl?: string | null;
  serviceId?: string | null;
  /** Free-form; canonicalised to an abbreviation by the pipeline. */
  state?: string | null;
  qualityArea?: number | null;
  version?: number | null;
  audienceRoles?: string[];
  /** Explicit tier from the adapter; otherwise inferTier() decides. */
  tier?: KnowledgeTier;
}

export type UpsertOutcome = "created" | "updated" | "unchanged" | "error";

export interface UpsertResult {
  sourceId: string;
  outcome: UpsertOutcome;
  error?: string;
}

export interface KnowledgeScope {
  role: string;
  /** null = unscoped (owner/admin/EOS); [] = no centre */
  serviceIds: string[] | null;
  /** canonical abbreviation or null = no state filter */
  state: string | null;
}

export interface KnowledgeHit {
  chunkId: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  heading: string | null;
  title: string;
  category: KnowledgeCategory;
  tier: KnowledgeTier;
  externalUrl: string | null;
  /** RRF score — ordering only, never a relevance threshold */
  fusedScore: number;
  /** cosine distance from the vector leg (0 = identical); null if not retrieved by it */
  cosineDistance: number | null;
  /** ts_rank from the tsvector leg; null if not retrieved by it */
  tsRank: number | null;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/__tests__/lib/knowledge/normalize.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  parseFilenameMeta,
  canonicalState,
  inferTier,
  hashContent,
} from "@/lib/knowledge/normalize";

describe("normalizeTitle", () => {
  it("strips version, state, OSHC and extension so duplicates collide", () => {
    expect(normalizeTitle("QA2 Rest Time Procedure OSHC V2.docx")).toBe(
      "qa2 rest time procedure",
    );
    expect(normalizeTitle("QA2 Rest Time Procedure OSHC V3.docx")).toBe(
      "qa2 rest time procedure",
    );
    expect(normalizeTitle("QA2 Bushfire Policy NSW OSHC V11.docx")).toBe(
      "qa2 bushfire policy",
    );
  });
  it("collapses punctuation and whitespace", () => {
    expect(normalizeTitle("  QA7 — Dealing with Complaints  Policy ")).toBe(
      "qa7 dealing with complaints policy",
    );
  });
});

describe("parseFilenameMeta", () => {
  it("reads QA, version and state from a policy filename", () => {
    expect(parseFilenameMeta("QA2 Bushfire Policy NSW OSHC V11.docx")).toEqual({
      qualityArea: 2,
      version: 11,
      state: "NSW",
      category: "policy",
    });
  });
  it("reads procedure/sop categories and leaves unknowns null", () => {
    expect(parseFilenameMeta("QA5 Behaviour Guidance Procedure OSHC V4.docx").category).toBe("procedure");
    expect(parseFilenameMeta("OPS-10 Emergency Evacuation Procedures.docx")).toEqual({
      qualityArea: null,
      version: null,
      state: null,
      category: "procedure",
    });
    expect(parseFilenameMeta("Weekly Menu Template.docx").category).toBe("guide");
  });
});

describe("canonicalState", () => {
  it("maps full names and abbreviations case-insensitively", () => {
    expect(canonicalState("New South Wales")).toBe("NSW");
    expect(canonicalState("nsw")).toBe("NSW");
    expect(canonicalState("Victoria")).toBe("VIC");
    expect(canonicalState("")).toBeNull();
    expect(canonicalState(null)).toBeNull();
    expect(canonicalState("Narnia")).toBeNull();
  });
});

describe("inferTier", () => {
  it("is safety_critical for QA2 and for safety keywords in the title", () => {
    expect(inferTier({ qualityArea: 2, title: "QA2 Rest Time Policy" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: null, title: "Child Protection Policy" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: null, title: "OPS-10 Emergency Evacuation Procedures" })).toBe("safety_critical");
    expect(inferTier({ qualityArea: 7, title: "Governance Policy" })).toBe("general");
    expect(inferTier({ qualityArea: null, title: "Weekly Menu Template" })).toBe("general");
  });
});

describe("hashContent", () => {
  it("is stable and ignores trailing whitespace differences", () => {
    expect(hashContent("abc\n")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    expect(hashContent("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/knowledge/normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `normalize.ts`**

```ts
// src/lib/knowledge/normalize.ts
import { createHash } from "node:crypto";
import type { KnowledgeCategory, KnowledgeTier } from "@prisma/client";
import { AUSTRALIAN_STATES } from "@/lib/service-scope";

/**
 * Dedupe key for a document title. Strips the tokens that vary between
 * copies of the SAME document — version ("V11"), state ("NSW"), the
 * ubiquitous "OSHC" suffix and the file extension — so
 * "QA2 Rest Time Procedure OSHC V2.docx" and "... V3.docx" collide.
 * State is stripped here because it is a SEPARATE column in the key
 * (normalizedTitle, state, serviceId) — see spec §5.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\bV\s?\d+(?:\.\d+)?\b/gi, " ")
    // Standalone state tokens anywhere in the title. Also eats a bare
    // "SA"/"WA"/"NT"/"ACT" that isn't a state ("…National ACT…") — accepted:
    // the key only needs to be STABLE across copies of the same document.
    .replace(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/g, " ")
    .replace(/\bOSHC\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface FilenameMeta {
  qualityArea: number | null;
  version: number | null;
  state: string | null;
  category: KnowledgeCategory;
}

/** Category from the filename; adapters may override (e.g. the SOP tree). */
export function parseFilenameMeta(filename: string): FilenameMeta {
  const qa = filename.match(/\bQA\s?([1-7])\b/i);
  const v = filename.match(/\bV\s?(\d+)(?:\.\d+)?\b/i);
  const st = filename.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/);
  const lower = filename.toLowerCase();
  let category: KnowledgeCategory = "guide";
  if (/\bpolic(y|ies)\b/.test(lower)) category = "policy";
  else if (/\bprocedures?\b/.test(lower)) category = "procedure";
  return {
    qualityArea: qa ? Number(qa[1]) : null,
    version: v ? Number(v[1]) : null,
    state: st ? st[1] : null,
    category,
  };
}

/** "New South Wales" | "nsw" → "NSW"; unknown/blank → null. */
export function canonicalState(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = AUSTRALIAN_STATES.find(
    (s) => s.value.toLowerCase() === lower || s.label.toLowerCase() === lower,
  );
  return hit ? hit.value : null;
}

/**
 * Spec §3.5 heuristic. QA2 (Children's Health & Safety) is always
 * safety-critical; otherwise the title decides. Admin `tierOverride`
 * beats this at query time.
 */
const SAFETY_TITLE = /child\s*protection|safeguard|medication|medical\s*condition|incident|injur|emergency|evacuat|lockdown|bushfire|safe\s*arrival|collection|missing\s*child|anaphylaxis|allerg|asthma|epilep|diabet|first\s*aid|infectious|illness|water\s*safety|sun\s*safe|excursion|transport/i;

export function inferTier(input: {
  qualityArea: number | null;
  title: string;
}): KnowledgeTier {
  if (input.qualityArea === 2) return "safety_critical";
  return SAFETY_TITLE.test(input.title) ? "safety_critical" : "general";
}

/** sha256 of the trimmed text — the "did it change" check. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/knowledge/normalize.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge src/__tests__/lib/knowledge && git commit -m "feat(knowledge): types + normalize (title key, filename meta, state, tier, hash)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `src/lib/embeddings.ts` (Voyage, raw fetch)

**Files:**
- Create: `src/lib/embeddings.ts`
- Test: `src/__tests__/lib/embeddings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("embeddings", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VOYAGE_API_KEY;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("reports unconfigured and returns null without a key", async () => {
    const { embedTexts, isEmbeddingsConfigured } = await import("@/lib/embeddings");
    expect(isEmbeddingsConfigured()).toBe(false);
    expect(await embedTexts(["hello"])).toBeNull();
  });

  it("batches at 128 and preserves order", async () => {
    process.env.VOYAGE_API_KEY = "test";
    const calls: number[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { input: string[] };
      calls.push(body.input.length);
      return new Response(
        JSON.stringify({
          data: body.input.map((_t, i) => ({ index: i, embedding: [i] })),
          usage: { total_tokens: body.input.length },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    const out = await embedTexts(Array.from({ length: 200 }, (_, i) => `t${i}`));
    expect(calls).toEqual([128, 72]);
    expect(out?.length).toBe(200);
    expect(out?.[129]).toEqual([1]); // second batch, index 1
  });

  it("returns null (not throw) after retries on a 5xx", async () => {
    process.env.VOYAGE_API_KEY = "test";
    global.fetch = vi.fn(async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    const { embedTexts } = await import("@/lib/embeddings");
    expect(await embedTexts(["x"], { retries: 1, retryDelayMs: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/embeddings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/embeddings.ts
/**
 * Voyage AI embeddings for the Amana AI knowledge store.
 *
 * Deliberately a raw fetch — one endpoint, one model, no SDK to keep
 * in step. `embedTexts` NEVER throws: an outage returns null and the
 * caller falls back to tsvector-only search (spec §3.4 step 1) or
 * leaves `embedding` null for later re-index.
 *
 * Model: voyage-3 (1024-dim) — the column is vector(1024); changing the
 * model means a migration + full re-embed.
 */
import { logger } from "@/lib/logger";

export const EMBEDDING_MODEL = "voyage-3";
export const EMBEDDING_DIMENSIONS = 1024;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 128;

export function isEmbeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export interface EmbedOptions {
  /** "document" when indexing, "query" when searching (Voyage asymmetric hint). */
  inputType?: "document" | "query";
  retries?: number;
  retryDelayMs?: number;
}

export interface EmbedUsage {
  totalTokens: number;
}

let lastUsage: EmbedUsage = { totalTokens: 0 };
/** Tokens consumed by the most recent embedTexts() call — for AiUsage logging. */
export function getLastEmbedUsage(): EmbedUsage {
  return lastUsage;
}

export async function embedTexts(
  texts: string[],
  opts: EmbedOptions = {},
): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  if (texts.length === 0) return [];
  const retries = opts.retries ?? 2;
  const delay = opts.retryDelayMs ?? 500;
  const out: number[][] = [];
  let tokens = 0;

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: batch,
            input_type: opts.inputType ?? "document",
          }),
        });
        if (!res.ok) throw new Error(`Voyage ${res.status}`);
        const json = (await res.json()) as {
          data: { index: number; embedding: number[] }[];
          usage?: { total_tokens?: number };
        };
        const ordered = [...json.data].sort((a, b) => a.index - b.index);
        for (const d of ordered) out.push(d.embedding);
        tokens += json.usage?.total_tokens ?? 0;
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          logger.error("Embeddings: batch failed after retries", {
            batchStart: start,
            err: err instanceof Error ? err.message : String(err),
          });
          lastUsage = { totalTokens: tokens };
          return null;
        }
        await new Promise((r) => setTimeout(r, delay * attempt));
      }
    }
  }
  lastUsage = { totalTokens: tokens };
  return out;
}

/** Postgres vector literal: "[0.1,0.2,…]" — used with `$1::vector`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/embeddings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeddings.ts src/__tests__/lib/embeddings.test.ts && git commit -m "feat(knowledge): Voyage embeddings client (batched, retrying, never throws)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**End of Chunk 1.** Schema, migration and the embeddings client exist; nothing reads or writes the store yet.

---

## Chunk 2: Pipeline, scope, search

### Task 7: `src/lib/knowledge/pipeline.ts`

**Files:**
- Create: `src/lib/knowledge/pipeline.ts`
- Test: `src/__tests__/lib/knowledge/pipeline.test.ts`

The pipeline is the ONLY writer of `KnowledgeSource`/`KnowledgeChunk`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/knowledge/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/embeddings", () => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2])),
  isEmbeddingsConfigured: vi.fn(() => true),
  getLastEmbedUsage: vi.fn(() => ({ totalTokens: 10 })),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
  EMBEDDING_MODEL: "voyage-3",
}));

import { upsertKnowledgeSource, applySupersession } from "@/lib/knowledge/pipeline";
import { hashContent } from "@/lib/knowledge/normalize";

const baseInput = {
  sourceKind: "sharepoint" as const,
  externalId: "sp-1",
  title: "QA2 Rest Time Procedure OSHC V3.docx",
  category: "procedure" as const,
  text: "# Rest time\n\nChildren rest after lunch.",
  state: "New South Wales",
};

describe("upsertKnowledgeSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeSource.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "src-1", ...data }));
    prismaMock.knowledgeSource.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "src-1", ...data }));
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.knowledgeChunk.createMany.mockResolvedValue({ count: 1 });
    prismaMock.knowledgeChunk.findMany.mockResolvedValue([{ id: "c-1", chunkIndex: 0 }]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    prismaMock.aiUsage.create.mockResolvedValue({});
  });

  it("creates a source with derived fields and indexes it", async () => {
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("created");
    const data = prismaMock.knowledgeSource.create.mock.calls[0][0].data;
    expect(data.normalizedTitle).toBe("qa2 rest time procedure");
    expect(data.state).toBe("NSW");
    expect(data.qualityArea).toBe(2);
    expect(data.version).toBe(3);
    expect(data.tier).toBe("safety_critical");
    expect(data.contentHash).toBe(hashContent(baseInput.text));
    expect(prismaMock.knowledgeChunk.createMany).toHaveBeenCalled();
    // tsvector + embedding writes
    const sql = prismaMock.$queryRawUnsafe.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes("to_tsvector"))).toBe(true);
    expect(sql.some((s: string) => s.includes("::vector"))).toBe(true);
  });

  it("is unchanged (no re-chunk, no re-embed) when the hash matches", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1",
      contentHash: hashContent(baseInput.text),
      status: "active",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("unchanged");
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
  });

  it("records indexError and returns 'error' when chunking yields nothing", async () => {
    const res = await upsertKnowledgeSource({ ...baseInput, text: "   " });
    expect(res.outcome).toBe("error");
    const upd = prismaMock.knowledgeSource.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { indexError?: string } }).data.indexError,
    );
    expect(upd).toBeTruthy();
  });

  it("honours an explicit tier from the adapter", async () => {
    await upsertKnowledgeSource({ ...baseInput, tier: "general" });
    expect(prismaMock.knowledgeSource.create.mock.calls[0][0].data.tier).toBe("general");
  });

  it("re-activates an adapter-excluded source when its origin comes back (unchanged hash)", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1", contentHash: hashContent(baseInput.text), status: "excluded", excludedBy: "adapter",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toMatchObject({
      where: { id: "src-1" }, data: { status: "active", excludedBy: null },
    });
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
  });

  it("never re-activates an admin-excluded source", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1", contentHash: "stale", status: "excluded", excludedBy: "admin",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    const data = prismaMock.knowledgeSource.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.excludedBy).toBeUndefined();
  });
});

describe("excludeSources", () => {
  it("adapter exclude touches active rows only (never an admin-excluded row)", async () => {
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 2 });
    const { excludeSources } = await import("@/lib/knowledge/pipeline");
    await excludeSources({ sourceKind: "lms_module", externalId: { in: ["a", "b"] } }, "adapter");
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { sourceKind: "lms_module", externalId: { in: ["a", "b"] }, status: "active" },
      data: { status: "excluded", excludedBy: "adapter" },
    });
  });
  it("admin exclude may override an adapter exclusion but never a superseded row", async () => {
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    const { excludeSources } = await import("@/lib/knowledge/pipeline");
    await excludeSources({ id: "x" }, "admin");
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "x", status: { not: "superseded" } },
      data: { status: "excluded", excludedBy: "admin" },
    });
  });
});

describe("applySupersession", () => {
  it("keeps the highest version active within (normalizedTitle,state,serviceId) and marks the rest superseded", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "v2", version: 2, status: "active", sourceKind: "sharepoint" },
      { id: "v3", version: 3, status: "active", sourceKind: "sharepoint" },
      { id: "vnull", version: null, status: "active", sourceKind: "sharepoint" },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 2 });
    const winner = await applySupersession({ normalizedTitle: "x", state: null, serviceId: null });
    expect(winner).toBe("v3");
    const call = prismaMock.knowledgeSource.updateMany.mock.calls[0][0];
    expect(call.where.id.in.sort()).toEqual(["v2", "vnull"]);
    expect(call.data).toEqual({ status: "superseded", supersededById: "v3" });
  });

  it("policy_upload always wins over sharepoint regardless of version", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "sp", version: 9, status: "active", sourceKind: "sharepoint" },
      { id: "pdf", version: 1, status: "active", sourceKind: "policy_upload" },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    expect(await applySupersession({ normalizedTitle: "x", state: null, serviceId: null })).toBe("pdf");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/knowledge/pipeline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/pipeline.ts
/**
 * The ONLY writer of KnowledgeSource / KnowledgeChunk.
 *
 *   upsertKnowledgeSource(input)
 *     → find by (sourceKind, externalId)
 *     → hash unchanged? "unchanged" (no re-chunk, no re-embed)
 *     → create/update the source row with derived fields
 *     → indexSource(): chunk → embed → replace chunks in a transaction,
 *       set searchVector via to_tsvector (explicit UPDATE, no trigger)
 *       and embedding via $1::vector. Both UPDATEs go through
 *       $queryRawUnsafe (as document-indexer did) — the test prisma mock
 *       supports $queryRawUnsafe but not $executeRawUnsafe.
 *     → applySupersession() for the source's dedupe key
 *
 * Nothing here reads Document/DocumentChunk — guard-tested.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { chunkText } from "@/lib/document-indexer";
import {
  embedTexts,
  getLastEmbedUsage,
  toVectorLiteral,
  EMBEDDING_MODEL,
} from "@/lib/embeddings";
import {
  canonicalState,
  hashContent,
  inferTier,
  normalizeTitle,
  parseFilenameMeta,
} from "./normalize";
import type { KnowledgeSourceInput, UpsertResult } from "./types";

/** Manual precedence: an official PDF beats imported text of the same title. */
const KIND_PRIORITY: Record<string, number> = {
  policy_upload: 3,
  manual: 2,
  sharepoint: 1,
};

export async function upsertKnowledgeSource(
  input: KnowledgeSourceInput,
): Promise<UpsertResult> {
  const meta = parseFilenameMeta(input.title);
  const qualityArea = input.qualityArea ?? meta.qualityArea;
  const version = input.version ?? meta.version;
  const state = canonicalState(input.state ?? meta.state);
  const normalizedTitle = normalizeTitle(input.title);
  const tier = input.tier ?? inferTier({ qualityArea, title: input.title });
  const contentHash = hashContent(input.text);

  const existing = await prisma.knowledgeSource.findUnique({
    where: {
      sourceKind_externalId: {
        sourceKind: input.sourceKind,
        externalId: input.externalId,
      },
    },
    select: { id: true, contentHash: true, status: true, excludedBy: true },
  });

  // An adapter-excluded row whose origin has come back (republished course,
  // unarchived policy) is re-activated. Admin exclusions are never reverted.
  const reactivate = existing?.status === "excluded" && existing.excludedBy === "adapter";

  if (existing && existing.contentHash === contentHash) {
    if (!reactivate) return { sourceId: existing.id, outcome: "unchanged" };
    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: { status: "active", excludedBy: null },
    });
    await applySupersession({ normalizedTitle, state, serviceId: input.serviceId ?? null });
    return { sourceId: existing.id, outcome: "updated" };
  }

  const data = {
    title: input.title,
    normalizedTitle,
    sourceKind: input.sourceKind,
    category: input.category,
    tier,
    qualityArea,
    serviceId: input.serviceId ?? null,
    state,
    audienceRoles: input.audienceRoles ?? [],
    version,
    externalId: input.externalId,
    externalUrl: input.externalUrl ?? null,
    contentHash,
    ...(reactivate ? { status: "active" as const, excludedBy: null } : {}),
  };

  const row = existing
    ? await prisma.knowledgeSource.update({ where: { id: existing.id }, data })
    : await prisma.knowledgeSource.create({ data });

  const indexed = await indexSource(row.id, input.text);
  if (!indexed.ok) {
    return { sourceId: row.id, outcome: "error", error: indexed.error };
  }

  await applySupersession({
    normalizedTitle,
    state,
    serviceId: input.serviceId ?? null,
  });

  return { sourceId: row.id, outcome: existing ? "updated" : "created" };
}

export async function indexSource(
  sourceId: string,
  text: string,
): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: "No text content extracted", indexedAt: null },
    });
    return { ok: false, error: "No text content extracted" };
  }

  const vectors = await embedTexts(chunks.map((c) => c.content));

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.knowledgeChunk.deleteMany({ where: { sourceId } });
      await tx.knowledgeChunk.createMany({
        data: chunks.map((c) => ({
          sourceId,
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          content: c.content,
          tokenCount: c.tokenCount,
        })),
      });
      await tx.$queryRawUnsafe(
        `UPDATE "KnowledgeChunk" SET "searchVector" = to_tsvector('english', content) WHERE "sourceId" = $1`,
        sourceId,
      );
      if (vectors) {
        const rows: { id: string; chunkIndex: number }[] =
          await tx.knowledgeChunk.findMany({
            where: { sourceId },
            select: { id: true, chunkIndex: true },
          });
        for (const r of rows) {
          const vec = vectors[r.chunkIndex];
          if (!vec) continue;
          // One round trip per chunk. Fine at ~20 chunks/doc; if it ever
          // matters, a single UPDATE … FROM unnest($1::text[], $2::vector[]).
          await tx.$queryRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            toVectorLiteral(vec),
            r.id,
          );
        }
      }
      await tx.knowledgeSource.update({
        where: { id: sourceId },
        data: { indexedAt: new Date(), indexError: vectors ? null : "Embeddings unavailable — tsvector only" },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Knowledge: index failed", { sourceId, err: message });
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: message },
    });
    return { ok: false, error: message };
  }

  if (vectors) {
    const usage = getLastEmbedUsage();
    prisma.aiUsage
      .create({
        data: {
          userId: null,
          templateSlug: null,
          model: EMBEDDING_MODEL,
          inputTokens: usage.totalTokens,
          outputTokens: 0,
          durationMs: 0,
          section: "knowledge-index",
          metadata: { sourceId, chunks: chunks.length },
        },
      })
      .catch((err: unknown) => logger.warn("Knowledge: usage log failed", { err }));
  }

  return { ok: true, chunks: chunks.length };
}

/**
 * The ONLY way to set status=excluded. `by` records who, so adapters can
 * undo their own. An adapter exclude touches ACTIVE rows only — it must
 * never overwrite an admin's `excludedBy: "admin"` (that row would later
 * look adapter-owned and get silently re-activated).
 */
export async function excludeSources(
  where: Prisma.KnowledgeSourceWhereInput,
  by: "adapter" | "admin",
): Promise<number> {
  const r = await prisma.knowledgeSource.updateMany({
    where: { ...where, status: by === "adapter" ? "active" : { not: "superseded" } },
    data: { status: "excluded", excludedBy: by },
  });
  return r.count;
}

/**
 * Within one dedupe key, exactly one source is `active`:
 * (Keyed on the NEW title. A renamed source leaves its old group
 * unrevisited — a stale `superseded` row can remain the group's only
 * member. Follow-up: on title change, re-run for the old key too.)
 *   1. highest KIND_PRIORITY (policy_upload > manual > sharepoint > others)
 *   2. then highest version (null = 0)
 *   3. then most recently updated
 * Everything else → superseded with supersededById. `excluded` rows are
 * never touched. Returns the winner's id (or null if the key is empty).
 */
export async function applySupersession(key: {
  normalizedTitle: string;
  state: string | null;
  serviceId: string | null;
}): Promise<string | null> {
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      normalizedTitle: key.normalizedTitle,
      state: key.state,
      serviceId: key.serviceId,
      status: { in: ["active", "superseded"] },
    },
    select: { id: true, version: true, sourceKind: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const pk = (KIND_PRIORITY[b.sourceKind] ?? 0) - (KIND_PRIORITY[a.sourceKind] ?? 0);
    if (pk !== 0) return pk;
    return (b.version ?? 0) - (a.version ?? 0);
  });
  const winner = sorted[0];
  const losers = sorted.slice(1).map((r) => r.id);

  if (losers.length > 0) {
    await prisma.knowledgeSource.updateMany({
      where: { id: { in: losers } },
      data: { status: "superseded", supersededById: winner.id },
    });
  }
  if (winner.status !== "active") {
    await prisma.knowledgeSource.update({
      where: { id: winner.id },
      data: { status: "active", supersededById: null },
    });
  }
  return winner.id;
}
```

Note on the test for `applySupersession` with the "unchanged status" case: the mocks return `status: "active"` so the final `update` is not called; that matches the assertions.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/knowledge/pipeline.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Make `GET /api/ai/usage` tolerate the null-user rows this pipeline now writes**

`src/app/api/ai/usage/route.ts:51–52` does `r.user.id` / `r.user.name` and would throw on the first `knowledge-index` row. Change the accumulation to:
```ts
    // Two "no acting user" conventions coexist: knowledge-index rows write a
    // real null userId; src/lib/ai-task-agent.ts:194 writes the sentinel
    // string "system". Both must land in the ONE System bucket.
    const uid = !r.user || r.user.id === "system" ? "system" : r.user.id;
    const name = uid === "system" ? "System" : r.user!.name;
    if (!byUser[uid]) byUser[uid] = { name, calls: 0, inputTokens: 0, outputTokens: 0 };
```
and any other `r.user.` read to `r.user?.`. Add a two-line test now in `src/__tests__/api/ai-usage.test.ts` (the full file is written in Task 23 — create it here with just the "buckets null-user rows under System" case from Task 23 Step 4, and Task 23 then adds nothing new to it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge/pipeline.ts src/__tests__/lib/knowledge/pipeline.test.ts src/app/api/ai/usage/route.ts src/__tests__/api/ai-usage.test.ts && git commit -m "feat(knowledge): upsert/index pipeline + supersession (only writer of the store)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: `src/lib/knowledge/scope.ts`

**Files:**
- Create: `src/lib/knowledge/scope.ts`
- Test: `src/__tests__/lib/knowledge/scope.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/knowledge/scope.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const getCentreScope = vi.fn();
vi.mock("@/lib/centre-scope", () => ({ getCentreScope: (s: unknown) => getCentreScope(s) }));

import { buildKnowledgeScope } from "@/lib/knowledge/scope";

const session = (user: Record<string, unknown>) => ({ user, expires: "" }) as never;

describe("buildKnowledgeScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findUnique.mockResolvedValue({ state: "New South Wales" });
    prismaMock.user.findUnique.mockResolvedValue({ state: "VIC" });
  });

  it("owner → unscoped, no state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: null });
    expect(await buildKnowledgeScope(session({ id: "u", role: "owner" }))).toEqual({
      role: "owner", serviceIds: null, state: null,
    });
  });

  it("head_office → getCentreScope ids + User.state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: ["s1", "s2"] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "head_office" }))).toEqual({
      role: "head_office", serviceIds: ["s1", "s2"], state: "VIC",
    });
  });

  it("staff → getCentreScope ids + primary Service.state canonicalised", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: ["s1"] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "staff", serviceId: "s1" }))).toEqual({
      role: "staff", serviceIds: ["s1"], state: "NSW",
    });
  });

  it("staff with no primary service → [] and null state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: [] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "staff", serviceId: null }))).toEqual({
      role: "staff", serviceIds: [], state: null,
    });
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/knowledge/scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/scope.ts
/**
 * Session → KnowledgeScope. The ONLY way scope enters a knowledge query.
 *
 * serviceIds: getCentreScope() — null for owner/admin/EOS (unscoped),
 *   head_office = their state's centres + memberships, member/staff =
 *   primary + manager-of + memberships. NOT serviceScopeFilter(), which is
 *   deliberately primary-only.
 * state: head_office → User.state; member/staff → primary Service.state;
 *   owner/admin → null (no state filter). Canonicalised so SQL equality works.
 */
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getCentreScope } from "@/lib/centre-scope";
import { canonicalState } from "./normalize";
import type { KnowledgeScope } from "./types";

const NO_STATE_ROLES = new Set(["owner", "admin", "eos", "eos_viewer", "eos_implementer"]);

export async function buildKnowledgeScope(session: Session): Promise<KnowledgeScope> {
  const role = String(session.user.role);
  const userId = String(session.user.id);
  const { serviceIds } = await getCentreScope(session);

  let state: string | null = null;
  if (!NO_STATE_ROLES.has(role)) {
    if (role === "head_office") {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { state: true } });
      state = canonicalState(u?.state);
    } else {
      const primary = session.user.serviceId ?? null; // typed on Session["user"] in src/types/index.ts
      if (primary) {
        const s = await prisma.service.findUnique({ where: { id: primary }, select: { state: true } });
        state = canonicalState(s?.state);
      }
    }
  }
  return { role, serviceIds, state };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/knowledge/scope.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/scope.ts src/__tests__/lib/knowledge/scope.test.ts && git commit -m "feat(knowledge): buildKnowledgeScope via getCentreScope + canonical state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: `src/lib/knowledge/search.ts`

**Files:**
- Create: `src/lib/knowledge/search.ts`
- Test: `src/__tests__/lib/knowledge/search.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/knowledge/search.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const embedTexts = vi.fn();
vi.mock("@/lib/embeddings", () => ({
  embedTexts: (...a: unknown[]) => embedTexts(...a),
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/knowledge/search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/search.ts
/**
 * Hybrid retrieval over KnowledgeChunk ⋈ KnowledgeSource (spec §3.4).
 *
 * Two legs run in parallel — tsvector (exact terminology: "Reg 168",
 * "WWCC") and pgvector cosine (meaning: "kid threw up" → Illness
 * Management) — merged by reciprocal-rank fusion. Scope is a SQL WHERE
 * built from KnowledgeScope; the model never sees these parameters.
 *
 * Scope SQL (NULL-safe: `= ANY(NULL)` matches nothing, so each filter is
 * guarded by an IS NULL branch; array params are cast `::text[]` because
 * Postgres cannot infer the type of a null array parameter):
 *   s.status = 'active'
 *   AND ($2::text[] IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($2::text[]))
 *   AND ($3::text IS NULL OR s.state IS NULL OR s.state = $3)
 *   AND (cardinality(s."audienceRoles") = 0 OR $4 = ANY(s."audienceRoles"))
 *
 * fusedScore orders results; cosineDistance / tsRank are the relevance
 * signals — slice 2's answer-mode thresholds use those, never the RRF.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { embedTexts, toVectorLiteral } from "@/lib/embeddings";
import type { KnowledgeHit, KnowledgeScope } from "./types";

const RRF_K = 60;
const VECTOR_CANDIDATES = 20;

type Row = Omit<KnowledgeHit, "fusedScore">;

const SELECT = `
  SELECT
    c.id            AS "chunkId",
    c."sourceId"    AS "sourceId",
    c."chunkIndex"  AS "chunkIndex",
    c.content       AS "content",
    c.heading       AS "heading",
    s.title         AS "title",
    s.category      AS "category",
    COALESCE(s."tierOverride", s.tier) AS "tier",
    s."externalUrl" AS "externalUrl"`;

const SCOPE_WHERE = `
    s.status = 'active'
    AND ($2::text[] IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($2::text[]))
    AND ($3::text IS NULL OR s.state IS NULL OR s.state = $3)
    AND (cardinality(s."audienceRoles") = 0 OR $4 = ANY(s."audienceRoles"))`;

function tsQuery(fn: "plainto_tsquery" | "websearch_to_tsquery", limit: number): string {
  return `${SELECT},
    ts_rank(c."searchVector", ${fn}('english', $1)) AS "tsRank",
    NULL::float8 AS "cosineDistance"
  FROM "KnowledgeChunk" c
  JOIN "KnowledgeSource" s ON s.id = c."sourceId"
  WHERE c."searchVector" @@ ${fn}('english', $1)
    AND ${SCOPE_WHERE}
  ORDER BY "tsRank" DESC
  LIMIT ${limit}`;
}

const VECTOR_QUERY = `${SELECT},
    NULL::float8 AS "tsRank",
    (c.embedding <=> $1::vector) AS "cosineDistance"
  FROM "KnowledgeChunk" c
  JOIN "KnowledgeSource" s ON s.id = c."sourceId"
  WHERE c.embedding IS NOT NULL
    AND ${SCOPE_WHERE}
  ORDER BY c.embedding <=> $1::vector
  LIMIT ${VECTOR_CANDIDATES}`;

export async function searchKnowledge(
  query: string,
  scope: KnowledgeScope,
  limit = 8,
): Promise<KnowledgeHit[]> {
  const params = [scope.serviceIds, scope.state, scope.role] as const;

  const textLeg = (async (): Promise<Row[]> => {
    const strict = await prisma.$queryRawUnsafe<Row[]>(
      tsQuery("plainto_tsquery", VECTOR_CANDIDATES), query, ...params,
    );
    if (strict.length > 0) return strict;
    return prisma.$queryRawUnsafe<Row[]>(
      tsQuery("websearch_to_tsquery", VECTOR_CANDIDATES), query, ...params,
    );
  })();

  const vectorLeg = (async (): Promise<Row[]> => {
    let vec: number[][] | null = null;
    try {
      vec = await embedTexts([query], { inputType: "query" });
    } catch (err) {
      logger.warn("Knowledge: query embedding threw", { err });
    }
    if (!vec || !vec[0]) return [];
    return prisma.$queryRawUnsafe<Row[]>(VECTOR_QUERY, toVectorLiteral(vec[0]), ...params);
  })();

  const [textRows, vectorRows] = await Promise.all([textLeg, vectorLeg]);

  const fused = new Map<string, KnowledgeHit>();
  const add = (rows: Row[], key: "tsRank" | "cosineDistance") => {
    rows.forEach((r, i) => {
      const prev = fused.get(r.chunkId);
      const inc = 1 / (RRF_K + i + 1);
      if (prev) {
        prev.fusedScore += inc;
        if (prev[key] == null) prev[key] = r[key];
      } else {
        fused.set(r.chunkId, { ...r, fusedScore: inc });
      }
    });
  };
  add(textRows, "tsRank");
  add(vectorRows, "cosineDistance");

  return [...fused.values()]
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, limit);
}

/** Tool-result text: one block per document, chunks in order, OpenUrl for citations. */
export function formatHitsForPrompt(hits: KnowledgeHit[]): string {
  const byDoc = new Map<string, KnowledgeHit[]>();
  for (const h of hits) {
    const list = byDoc.get(h.sourceId) ?? [];
    list.push(h);
    byDoc.set(h.sourceId, list);
  }
  const parts: string[] = [];
  for (const [, list] of byDoc) {
    const first = list[0];
    const head = [`### ${first.title} (${first.category}, ${first.tier})`];
    if (first.externalUrl) head.push(`OpenUrl: ${first.externalUrl}`);
    const body = [...list]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((c) => (c.heading ? `**${c.heading}**\n${c.content}` : c.content))
      .join("\n\n");
    parts.push(`${head.join("\n")}\n\n${body}`);
  }
  return parts.join("\n\n---\n\n");
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/knowledge/search.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the whole knowledge suite + lint**

Run: `npx vitest run src/__tests__/lib/knowledge src/__tests__/lib/embeddings.test.ts && npx eslint src/lib/knowledge src/lib/embeddings.ts`
Expected: all pass; 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge/search.ts src/__tests__/lib/knowledge/search.test.ts && git commit -m "feat(knowledge): hybrid tsvector+pgvector search with SQL-enforced scope and RRF

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**End of Chunk 2.** At this point nothing user-facing has changed; the store exists, empty, with a tested writer and reader.

---

## Chunk 3: Adapters

### Task 10: Adapter — `handbook`

**Files:**
- Create: `src/lib/knowledge/adapters/handbook.ts`
- Test: `src/__tests__/lib/knowledge/adapters/handbook.test.ts`

The three `KNOWLEDGE_SEEDS` (Amana Way, Employee Handbook, Proven Process) are the baseline text; the `AmanaWayContent` / `AmanaHandbookContent` singleton override maps (`data: Record<string,string>`) are appended as an "Overrides" section so admin edits are searchable.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/knowledge/adapters/handbook.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
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
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/handbook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/adapters/handbook.ts
import { prisma } from "@/lib/prisma";
import { KNOWLEDGE_SEEDS } from "@/lib/ai-knowledge-seeds";
import { upsertKnowledgeSource } from "../pipeline";
import type { UpsertResult } from "../types";

const SINGLETON_ID = "singleton";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function overridesSection(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" && (v as string).trim(),
  );
  if (entries.length === 0) return "";
  return `\n\n## Overrides\n\n${entries.map(([k, v]) => `${k}: ${String(v).trim()}`).join("\n")}\n`;
}

/**
 * Index the three seeded handbooks plus any admin override map. Called
 * from the two content PATCH routes and from the backfill adapter.
 * Overrides are APPENDED (not substituted), so a superseded seed sentence
 * remains searchable alongside the admin's replacement — acceptable for
 * slice 1; a keyed substitution needs the panels' section map.
 */
export async function syncHandbook(): Promise<UpsertResult[]> {
  const [way, handbook] = await Promise.all([
    prisma.amanaWayContent.findUnique({ where: { id: SINGLETON_ID }, select: { data: true } }),
    prisma.amanaHandbookContent.findUnique({ where: { id: SINGLETON_ID }, select: { data: true } }),
  ]);
  const overrides: Record<string, string> = {
    "the-amana-way": overridesSection(way?.data),
    "employee-handbook": overridesSection(handbook?.data),
  };
  const results: UpsertResult[] = [];
  for (const seed of KNOWLEDGE_SEEDS) {
    const id = slug(seed.title);
    results.push(
      await upsertKnowledgeSource({
        sourceKind: "handbook",
        externalId: id,
        title: seed.title,
        category: "guide",
        tier: "general",
        text: seed.body + (overrides[id] ?? ""),
        externalUrl: id === "employee-handbook" ? "/handbook" : id === "the-amana-way" ? "/amana-way" : null,
      }),
    );
  }
  return results;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/handbook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/adapters/handbook.ts src/__tests__/lib/knowledge/adapters/handbook.test.ts && git commit -m "feat(knowledge): handbook adapter (seeds + override maps)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 11: Adapter — `help_article`

**Files:**
- Create: `src/lib/knowledge/adapters/help-article.ts`
- Test: `src/__tests__/lib/knowledge/adapters/help-article.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
const exclude = vi.fn(async () => 0);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/help-article.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/adapters/help-article.ts
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
        tier: "general",
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/help-article.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/adapters/help-article.ts src/__tests__/lib/knowledge/adapters/help-article.test.ts && git commit -m "feat(knowledge): help_article adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: Adapter — `policy_upload`

**Files:**
- Create: `src/lib/knowledge/adapters/policy-upload.ts`
- Test: `src/__tests__/lib/knowledge/adapters/policy-upload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
const exclude = vi.fn(async () => 0);
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
vi.mock("@/lib/document-indexer", () => ({ extractTextFromBuffer: vi.fn(async () => "# Policy\n\nText") }));
import { syncPolicyVersion, excludePolicySources } from "@/lib/knowledge/adapters/policy-upload";

describe("policy_upload adapter", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch;
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v1", versionNumber: 4, fileUrl: "https://blob/x.pdf",
      document: { id: "d1", title: "QA2 Medical Conditions Policy", category: "policy", isArchived: false },
    });
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => { global.fetch = realFetch; });

  it("extracts the PDF and upserts with version + /policies link", async () => {
    await syncPolicyVersion("v1");
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "policy_upload", externalId: "v1", version: 4, category: "policy",
      externalUrl: "/policies/d1", title: "QA2 Medical Conditions Policy", text: "# Policy\n\nText",
    });
  });

  it("does nothing for an archived policy and returns null", async () => {
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v1", versionNumber: 1, fileUrl: "u", document: { id: "d1", title: "T", category: "other", isArchived: true },
    });
    expect(await syncPolicyVersion("v1")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("excludePolicySources adapter-excludes every version source of the policy", async () => {
    prismaMock.policyDocumentVersion.findMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
    await excludePolicySources("d1");
    expect(exclude).toHaveBeenCalledWith(
      { sourceKind: "policy_upload", externalId: { in: ["v1", "v2"] } },
      "adapter",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/policy-upload.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/adapters/policy-upload.ts
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractTextFromBuffer } from "@/lib/document-indexer";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Official PDFs from /policies. One source per PolicyDocumentVersion;
 * supersession (pipeline) keeps the highest versionNumber active and —
 * because policy_upload outranks sharepoint — retires the imported text
 * of the same title. PolicyDocument has no state, so only the state-null
 * SharePoint variant is superseded (spec §3.3).
 */
export async function syncPolicyVersion(versionId: string): Promise<UpsertResult | null> {
  const v = await prisma.policyDocumentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true, versionNumber: true, fileUrl: true,
      document: { select: { id: true, title: true, category: true, isArchived: true } },
    },
  });
  if (!v || v.document.isArchived) return null;

  const res = await fetch(v.fileUrl);
  if (!res.ok) {
    logger.error("Knowledge: policy PDF download failed", { versionId, status: res.status });
    return { sourceId: "", outcome: "error", error: `download ${res.status}` };
  }
  const text = await extractTextFromBuffer(Buffer.from(await res.arrayBuffer()), "application/pdf");

  return upsertKnowledgeSource({
    sourceKind: "policy_upload",
    externalId: v.id,
    title: v.document.title,
    category: v.document.category === "procedure" ? "procedure" : v.document.category === "policy" ? "policy" : "guide",
    text,
    version: v.versionNumber,
    externalUrl: `/policies/${v.document.id}`,
  });
}

/** Archived policy → every version's source adapter-excluded; un-archiving re-syncs the current version, which re-activates it. */
export async function excludePolicySources(documentId: string): Promise<void> {
  const versions = await prisma.policyDocumentVersion.findMany({
    where: { documentId }, select: { id: true },
  });
  await excludeSources(
    { sourceKind: "policy_upload", externalId: { in: versions.map((x) => x.id) } },
    "adapter",
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/policy-upload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/adapters/policy-upload.ts src/__tests__/lib/knowledge/adapters/policy-upload.test.ts && git commit -m "feat(knowledge): policy_upload adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Adapter — `centre_facts`

**Files:**
- Create: `src/lib/knowledge/adapters/centre-facts.ts`
- Test: `src/__tests__/lib/knowledge/adapters/centre-facts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i) }));
import { syncCentreFacts, renderCentreFacts } from "@/lib/knowledge/adapters/centre-facts";

const service = {
  id: "svc1", name: "Amana OSHC Doveton", address: "1 School Rd", phone: "0400 000 000", state: "Victoria",
  manager: { name: "Sara K", phone: "0411 111 111" }, // phone present in the row, must NOT be rendered
  content: {
    contacts: [{ role: "School office", name: "Reception", phone: "03 9000 0000", email: "" }],
    dailyRoutine: "BSC 6:45–9:00", foodProvider: "Halal Kitchen", locationWithinSchool: "Hall B",
    meetingPoints: "Oval", parentOnboarding: "", staffNotes: "Gate code 1234",
    about: "PARENT COPY", tagline: "", heroImage: "", enrolmentThankYou: "PARENT COPY",
  },
};

describe("centre_facts adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); prismaMock.service.findUnique.mockResolvedValue(service); });

  it("renders staff-facing fields only", () => {
    const md = renderCentreFacts(service as never);
    expect(md).toContain("# Amana OSHC Doveton");
    expect(md).toContain("Gate code 1234");
    expect(md).toContain("Sara K");
    expect(md).not.toContain("0411 111 111"); // manager's personal mobile is never indexed
    expect(md).toContain("Halal Kitchen");
    expect(md).not.toContain("PARENT COPY");
  });

  it("upserts scoped to the service with its canonical state", async () => {
    await syncCentreFacts("svc1");
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "centre_facts", externalId: "service:svc1", serviceId: "svc1",
      category: "centre", tier: "general", state: "Victoria", externalUrl: "/services/svc1?tab=overview&sub=about",
    });
  });

  it("no-ops for a missing service", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    expect(await syncCentreFacts("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/centre-facts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/adapters/centre-facts.ts
import { prisma } from "@/lib/prisma";
import { mergeServiceContent } from "@/lib/service-content-shared";
import { upsertKnowledgeSource } from "../pipeline";
import type { UpsertResult } from "../types";

interface ServiceForFacts {
  id: string; name: string; address: string | null; phone: string | null; state: string | null;
  manager: { name: string | null } | null;
  content: unknown;
}

/** Staff-facing fields only — parent copy (about, tagline, enrolmentThankYou, heroImage) is never indexed. */
export function renderCentreFacts(s: ServiceForFacts): string {
  const c = mergeServiceContent(s.content);
  const lines: string[] = [`# ${s.name}`, ""];
  const add = (h: string, v: string | null | undefined) => {
    if (v && v.trim()) lines.push(`## ${h}`, "", v.trim(), "");
  };
  add("Address", s.address);
  add("Centre phone", s.phone);
  // Name only — User.phone is a personal mobile; the numbers a centre publishes live in `contacts`.
  add("Coordinator / manager", s.manager?.name ?? null);
  if (c.contacts.length) {
    lines.push("## Key contacts", "");
    for (const k of c.contacts) {
      const bits = [k.role, k.name, k.phone, k.email].filter(Boolean);
      if (bits.length) lines.push(`- ${bits.join(" — ")}`);
    }
    lines.push("");
  }
  add("Location within the school", c.locationWithinSchool);
  add("Meeting / evacuation points", c.meetingPoints);
  add("Daily routine", c.dailyRoutine);
  add("Food provider", c.foodProvider);
  add("Parent onboarding (how we onboard families)", c.parentOnboarding);
  add("Staff-only notes", c.staffNotes);
  return lines.join("\n");
}

export async function syncCentreFacts(serviceId: string): Promise<UpsertResult | null> {
  const s = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true, name: true, address: true, phone: true, state: true, content: true,
      manager: { select: { name: true } },
    },
  });
  if (!s) return null;
  return upsertKnowledgeSource({
    sourceKind: "centre_facts",
    externalId: `service:${s.id}`,
    title: `${s.name} — centre facts`,
    category: "centre",
    tier: "general",
    text: renderCentreFacts(s),
    serviceId: s.id,
    state: s.state,
    externalUrl: `/services/${s.id}?tab=overview&sub=about`, // where ServiceContentTab mounts (page.tsx ~571)
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/centre-facts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/adapters/centre-facts.ts src/__tests__/lib/knowledge/adapters/centre-facts.test.ts && git commit -m "feat(knowledge): centre_facts adapter (service-scoped fact sheet)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: Adapter — `lms_module`

**Files:**
- Create: `src/lib/knowledge/adapters/lms-module.ts`
- Test: `src/__tests__/lib/knowledge/adapters/lms-module.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
const exclude = vi.fn(async () => 0);
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
import { syncLmsCourse, syncLmsModule } from "@/lib/knowledge/adapters/lms-module";

describe("lms_module adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("published course → indexes document modules only; quiz modules never; stale module sources excluded", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c1", title: "Child Protection", status: "published", deleted: false, serviceId: null,
      modules: [
        { id: "m1", title: "Reading", type: "document", content: "# Intro\n…" },
        { id: "m2", title: "Quiz", type: "quiz", content: "answers" },
        { id: "m3", title: "Empty", type: "document", content: null },
      ],
    });
    await syncLmsCourse("c1");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "lms_module", externalId: "c1:m1", title: "Child Protection — Reading", category: "guide",
      externalUrl: "/my-training", serviceId: null,
    });
    // everything under this course that was NOT just indexed (quiz, empty, and any DELETED module) → adapter-excluded
    expect(exclude).toHaveBeenCalledWith(
      { sourceKind: "lms_module", externalId: { startsWith: "c1:", notIn: ["c1:m1"] } },
      "adapter",
    );
  });

  it("draft/archived/deleted course → every module source under it is adapter-excluded", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c1", title: "X", status: "draft", deleted: false, serviceId: "svc1",
      modules: [{ id: "m1", title: "R", type: "document", content: "t" }],
    });
    await syncLmsCourse("c1");
    expect(upsert).not.toHaveBeenCalled();
    expect(exclude).toHaveBeenCalledWith({ sourceKind: "lms_module", externalId: { startsWith: "c1:" } }, "adapter");
  });

  it("centre-specific course → sources scoped to that service", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c2", title: "Doveton Induction", status: "published", deleted: false, serviceId: "svc1",
      modules: [{ id: "m1", title: "Site", type: "document", content: "t" }],
    });
    await syncLmsCourse("c2");
    expect(upsert.mock.calls[0][0]).toMatchObject({ externalId: "c2:m1", serviceId: "svc1" });
  });

  it("syncLmsModule resolves the course and delegates", async () => {
    prismaMock.lMSModule.findUnique.mockResolvedValue({ courseId: "c1" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({ id: "c1", title: "X", status: "published", deleted: false, serviceId: null, modules: [] });
    await syncLmsModule("m9");
    expect(prismaMock.lMSCourse.findUnique).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/lms-module.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/adapters/lms-module.ts
import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Reading (`document`) modules of PUBLISHED courses. Quiz content is
 * never indexed — it holds the answers. Any other course status
 * adapter-excludes the course's sources; republishing re-activates them
 * via upsert. Triggers: course PATCH (status transitions) and module
 * create/update/delete (spec §3.3).
 *
 * externalId is `<courseId>:<moduleId>` so "everything under this course"
 * is a prefix query — that is how a DELETED module (no longer in
 * course.modules) still gets excluded on the post-delete sync.
 */
export async function syncLmsCourse(courseId: string): Promise<UpsertResult[]> {
  const course = await prisma.lMSCourse.findUnique({
    where: { id: courseId },
    select: {
      id: true, title: true, status: true, deleted: true, serviceId: true,
      modules: { select: { id: true, title: true, type: true, content: true } },
    },
  });
  if (!course) return [];
  const prefix = `${course.id}:`;

  if (course.status !== "published" || course.deleted) {
    await excludeSources({ sourceKind: "lms_module", externalId: { startsWith: prefix } }, "adapter");
    return [];
  }

  const results: UpsertResult[] = [];
  const indexed: string[] = [];
  for (const m of course.modules) {
    if (m.type !== "document" || !m.content?.trim()) continue;
    const externalId = `${prefix}${m.id}`;
    indexed.push(externalId);
    results.push(
      await upsertKnowledgeSource({
        sourceKind: "lms_module",
        externalId,
        title: `${course.title} — ${m.title}`,
        category: "guide",
        tier: "general",
        text: `# ${course.title} — ${m.title}\n\n${m.content}`,
        externalUrl: "/my-training",
        serviceId: course.serviceId ?? null,
      }),
    );
  }
  await excludeSources(
    { sourceKind: "lms_module", externalId: { startsWith: prefix, notIn: indexed } },
    "adapter",
  );
  return results;
}

export async function syncLmsModule(moduleId: string): Promise<UpsertResult[]> {
  const m = await prisma.lMSModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!m) return [];
  return syncLmsCourse(m.courseId);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/lms-module.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/adapters/lms-module.ts src/__tests__/lib/knowledge/adapters/lms-module.test.ts && git commit -m "feat(knowledge): lms_module adapter (published reading modules only)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: Adapter — `regulator` + curated source list + `reference-hosts` leaf module

**Files:**
- Create: `src/lib/reference-hosts.ts`, `src/lib/knowledge/regulator-sources.ts`, `src/lib/knowledge/adapters/regulator.ts`
- Modify: `src/lib/ai-tools.ts` (import the allow-list from the leaf module instead of defining it)
- Test: `src/__tests__/lib/reference-hosts.test.ts`, `src/__tests__/lib/knowledge/adapters/regulator.test.ts`

The host allow-list moves out of `ai-tools.ts` into a dependency-free leaf so the adapter (and its unit test) never loads `ai-tools` → `@/lib/prisma`. Two hosts are added for the two most safety-relevant references the spec lists (NHMRC *Staying Healthy*, ASCIA action plans).

- [ ] **Step 0: Leaf module + test**

```ts
// src/lib/reference-hosts.ts
/**
 * Public hosts the assistant may fetch or index. Shared by the
 * fetch_oshc_reference tool and the regulator knowledge adapter — one
 * trust boundary. Adding a host here is a deliberate decision.
 */
export const ALLOWED_REFERENCE_HOSTS: ReadonlySet<string> = new Set([
  "acecqa.gov.au", "www.acecqa.gov.au", "nqaits.acecqa.gov.au",
  "education.gov.au", "www.education.gov.au",
  "education.nsw.gov.au", "www.education.nsw.gov.au",
  "education.vic.gov.au", "www.education.vic.gov.au",
  "safeworkaustralia.gov.au", "www.safeworkaustralia.gov.au",
  "fairwork.gov.au", "www.fairwork.gov.au",
  "fwc.gov.au", "www.fwc.gov.au",
  "legislation.gov.au", "www.legislation.gov.au",
  "ochre.nsw.gov.au", "www.ochre.nsw.gov.au",
  "esafety.gov.au", "www.esafety.gov.au",
  // 2026-09-27: the two safety references spec §3.3 names
  "nhmrc.gov.au", "www.nhmrc.gov.au",
  "allergy.org.au", "www.allergy.org.au",
]);

export function isAllowedReferenceHost(url: string): boolean {
  try {
    return ALLOWED_REFERENCE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
```
Copy the existing entries from `ALLOWED_HOSTS` in `src/lib/ai-tools.ts:397–418` verbatim (the list above is from the tool description — reconcile against the code; the code is authoritative) and ADD the four NHMRC/ASCIA entries. Then in `ai-tools.ts` delete the `ALLOWED_HOSTS` set, `import { ALLOWED_REFERENCE_HOSTS, isAllowedReferenceHost } from "@/lib/reference-hosts";`, replace the inline `ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())` check in `fetchOshcReference` with `isAllowedReferenceHost(url)`, and update the error's `allowedHosts` listing to read from `ALLOWED_REFERENCE_HOSTS`. Also append "nhmrc.gov.au, allergy.org.au" to the tool description's "Allowed hosts:" sentence.

```ts
// src/__tests__/lib/reference-hosts.test.ts
import { describe, it, expect } from "vitest";
import { isAllowedReferenceHost, ALLOWED_REFERENCE_HOSTS } from "@/lib/reference-hosts";
describe("reference hosts", () => {
  it("accepts allow-listed hosts case-insensitively and rejects everything else", () => {
    expect(isAllowedReferenceHost("https://www.acecqa.gov.au/x")).toBe(true);
    expect(isAllowedReferenceHost("https://WWW.NHMRC.GOV.AU/x")).toBe(true);
    expect(isAllowedReferenceHost("https://evil.example/x")).toBe(false);
    expect(isAllowedReferenceHost("not a url")).toBe(false);
    expect(ALLOWED_REFERENCE_HOSTS.has("allergy.org.au")).toBe(true);
  });
});
```
Run: `npx vitest run src/__tests__/lib/reference-hosts.test.ts` — Expected: PASS. (Task 18 adds the first `ai-tools` test.)

- [ ] **Step 1: Write the source list**

```ts
// src/lib/knowledge/regulator-sources.ts
/**
 * Public reference text the bot may cite. Every URL must be on a host in
 * src/lib/reference-hosts.ts (same trust boundary as fetch_oshc_reference).
 * Add a row = add a source; the monthly cron re-fetches and re-indexes
 * only when the content hash changes.
 */
import type { KnowledgeTier } from "@prisma/client";

export interface RegulatorSource {
  id: string;
  title: string;
  url: string;
  tier: KnowledgeTier;
}

export const REGULATOR_SOURCES: RegulatorSource[] = [
  { id: "acecqa-nqs", title: "ACECQA — National Quality Standard", url: "https://www.acecqa.gov.au/nqf/national-quality-standard", tier: "general" },
  { id: "acecqa-law-regs", title: "ACECQA — National Law and Regulations", url: "https://www.acecqa.gov.au/nqf/national-law-regulations", tier: "general" },
  { id: "acecqa-mtop", title: "ACECQA — My Time, Our Place V2.0 (framework)", url: "https://www.acecqa.gov.au/nqf/national-law-regulations/approved-learning-frameworks", tier: "general" },
  { id: "acecqa-ratios", title: "ACECQA — Educator to child ratios", url: "https://www.acecqa.gov.au/nqf/educator-to-child-ratios", tier: "safety_critical" },
  { id: "acecqa-quals", title: "ACECQA — Qualifications for OSHC educators", url: "https://www.acecqa.gov.au/qualifications/requirements/children-over-preschool-age", tier: "general" },
  { id: "acecqa-incident", title: "ACECQA — Serious incidents and notifications", url: "https://www.acecqa.gov.au/resources/applications/notifications", tier: "safety_critical" },
  { id: "nsw-regulator", title: "NSW Department of Education — Early childhood regulatory authority", url: "https://www.education.nsw.gov.au/early-childhood-education", tier: "general" },
  { id: "vic-regulator", title: "Victorian Department of Education — Quality Assessment and Regulation", url: "https://www.education.vic.gov.au/childhood/providers/regulation/Pages/default.aspx", tier: "general" },
  { id: "fairwork-childrens-award", title: "Fair Work — Children's Services Award summary", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000120-summary", tier: "general" },
  { id: "safework-first-aid", title: "Safe Work Australia — First aid in the workplace", url: "https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/first-aid", tier: "safety_critical" },
  { id: "nhmrc-staying-healthy", title: "NHMRC — Staying Healthy: preventing infectious diseases in early childhood (exclusion periods)", url: "https://www.nhmrc.gov.au/about-us/publications/staying-healthy-preventing-infectious-diseases-early-childhood-education-and-care-services", tier: "safety_critical" },
  { id: "ascia-action-plans", title: "ASCIA — Action plans for anaphylaxis and allergic reactions", url: "https://www.allergy.org.au/hp/anaphylaxis/ascia-action-plan-for-anaphylaxis", tier: "safety_critical" },
];
```

`id` is the stable key (`externalId`); editing a URL keeps the same source. If a URL 404s at import time, the run report records it and the source is skipped — do not guess a replacement; leave it for the admin.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const upsert = vi.fn(async () => ({ sourceId: "s", outcome: "created" }));
const exclude = vi.fn(async () => 0);
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
vi.mock("@/lib/document-indexer", () => ({ extractTextFromBuffer: vi.fn(async (b: Buffer) => b.toString("utf8")) }));
vi.mock("@/lib/knowledge/regulator-sources", () => ({
  REGULATOR_SOURCES: [
    { id: "ok", title: "OK page", url: "https://www.acecqa.gov.au/ok", tier: "general" },
    { id: "gone", title: "Gone", url: "https://www.acecqa.gov.au/gone", tier: "general" },
    { id: "bad-host", title: "Bad", url: "https://evil.example/x", tier: "general" },
  ],
}));
import { syncRegulator } from "@/lib/knowledge/adapters/regulator";

describe("regulator adapter", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async (url: string) =>
      String(url).endsWith("/gone")
        ? new Response("", { status: 404 })
        : new Response("<html><head><style>x{}</style><script>bad()</script></head><body><h1>Hi</h1> <p>there</p></body></html>", {
            status: 200, headers: { "content-type": "text/html; charset=utf-8" },
          }),
    ) as unknown as typeof fetch;
  });
  afterEach(() => { global.fetch = realFetch; });

  it("indexes reachable allow-listed pages (tags stripped), keys by id, reports failures, refuses foreign hosts, excludes unlisted ids", async () => {
    const report = await syncRegulator();
    expect(upsert).toHaveBeenCalledTimes(1);
    const input = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(input).toMatchObject({ sourceKind: "regulator", externalId: "ok", externalUrl: "https://www.acecqa.gov.au/ok", category: "reference" });
    expect(String(input.text)).not.toMatch(/<[a-z]/);
    expect(String(input.text)).not.toContain("bad()");
    expect(String(input.text)).toContain("Hi");
    expect(report.errors).toEqual([
      { id: "gone", error: "HTTP 404" },
      { id: "bad-host", error: "host not allowed" },
    ]);
    expect(exclude).toHaveBeenCalledWith({ sourceKind: "regulator", externalId: { notIn: ["ok", "gone", "bad-host"] } }, "adapter");
    const init = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/regulator.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
// src/lib/knowledge/adapters/regulator.ts
import { logger } from "@/lib/logger";
import { extractTextFromBuffer } from "@/lib/document-indexer";
import { isAllowedReferenceHost } from "@/lib/reference-hosts";
import { REGULATOR_SOURCES } from "../regulator-sources";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

export interface RegulatorReport {
  results: UpsertResult[];
  errors: { id: string; error: string }[];
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024; // PDFs of the National Regs guide are ~2 MB

/** HTML → text. Nav chrome survives (acceptable for slice 1); scripts/styles do not. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Fetch + index each curated public page/PDF. Never throws; failures land
 * in the report. Same trust boundary as fetch_oshc_reference: allow-listed
 * hosts only, no cross-host redirects, bounded size and time. Sources whose
 * id is no longer in the list are adapter-excluded.
 */
export async function syncRegulator(): Promise<RegulatorReport> {
  const report: RegulatorReport = { results: [], errors: [] };
  for (const src of REGULATOR_SOURCES) {
    try {
      if (!isAllowedReferenceHost(src.url)) throw new Error("host not allowed");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        // redirect: "error" keeps the SSRF property (no cross-host hops) at the
        // cost of treating a 301 (http→https, trailing slash, a site move) as a
        // failure. Those land in the run report; fix the URL in the list rather
        // than following redirects. Slice 2 may add a follow-once-if-allow-listed loop.
        res = await fetch(src.url, {
          headers: { "User-Agent": "AmanaOSHC-KnowledgeBot/1.0" },
          redirect: "error",
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new Error(`too large (${buf.byteLength} bytes)`);
      const mime = (res.headers.get("content-type") ?? "text/html").split(";")[0].trim();
      const text =
        mime === "application/pdf"
          ? await extractTextFromBuffer(buf, mime)
          : stripHtml(await extractTextFromBuffer(buf, "text/html"));
      report.results.push(
        await upsertKnowledgeSource({
          sourceKind: "regulator",
          externalId: src.id,
          title: src.title,
          category: "reference",
          tier: src.tier,
          text,
          externalUrl: src.url,
        }),
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn("Knowledge: regulator source failed", { id: src.id, error });
      report.errors.push({ id: src.id, error });
    }
  }
  await excludeSources(
    { sourceKind: "regulator", externalId: { notIn: REGULATOR_SOURCES.map((s) => s.id) } },
    "adapter",
  );
  return report;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/regulator.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reference-hosts.ts src/lib/ai-tools.ts src/lib/knowledge/regulator-sources.ts src/lib/knowledge/adapters/regulator.ts src/__tests__/lib/reference-hosts.test.ts src/__tests__/lib/knowledge/adapters/regulator.test.ts && git commit -m "feat(knowledge): regulator adapter, curated sources, reference-hosts leaf module

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**End of Chunk 3.** Every DB-backed origin has an adapter; nothing calls them yet.

---

## Chunk 4: Sync runs, triggers, tool, admin routes, retirement

### Task 16: Adapter — `manual` + `backfill` + `runAdapter` (sync runs)

**Files:**
- Create: `src/lib/knowledge/adapters/manual.ts`, `src/lib/knowledge/adapters/backfill.ts`, `src/lib/knowledge/sync.ts`
- Test: `src/__tests__/lib/knowledge/sync.test.ts`

- [ ] **Step 1: Write `manual.ts`**

```ts
// src/lib/knowledge/adapters/manual.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource, indexSource } from "../pipeline";
import type { KnowledgeCategory, KnowledgeTier } from "@prisma/client";
import type { UpsertResult } from "../types";

export interface ManualSourceInput {
  title: string;
  text: string;
  category?: KnowledgeCategory;
  tier?: KnowledgeTier;
  serviceId?: string | null;
  state?: string | null;
  /** Blob URL for uploaded files; null for pasted text */
  externalUrl?: string | null;
}

/** Admin paste/upload from /settings/ai-knowledge. externalId is minted here. */
export async function createManualSource(input: ManualSourceInput): Promise<UpsertResult> {
  return upsertKnowledgeSource({
    sourceKind: "manual",
    externalId: `manual:${randomUUID()}`,
    title: input.title,
    category: input.category ?? "guide",
    tier: input.tier,
    text: input.text,
    serviceId: input.serviceId ?? null,
    state: input.state ?? null,
    externalUrl: input.externalUrl ?? null,
  });
}

/** Inline edit of a pasted entry: re-chunk + re-embed under the same externalId. */
export async function updateManualSource(
  id: string,
  patch: { title?: string; text?: string },
): Promise<void> {
  if (patch.title !== undefined) {
    await prisma.knowledgeSource.update({ where: { id }, data: { title: patch.title } });
  }
  if (patch.text !== undefined) {
    await indexSource(id, patch.text);
  }
}
```

- [ ] **Step 2: Write `backfill.ts`**

```ts
// src/lib/knowledge/adapters/backfill.ts
import { prisma } from "@/lib/prisma";
import { syncHandbook } from "./handbook";
import { syncHelpArticles } from "./help-article";
import { syncCentreFacts } from "./centre-facts";
import { syncLmsCourse } from "./lms-module";
import { syncPolicyVersion } from "./policy-upload";
import type { UpsertResult } from "../types";

export interface BackfillReport {
  handbook: UpsertResult[];
  helpArticles: UpsertResult[];
  centreFacts: UpsertResult[];
  lmsCourses: UpsertResult[];
  policies: UpsertResult[];
}

/** Everything that has a DB source of truth. Idempotent — unchanged hashes are no-ops. */
export async function runBackfill(): Promise<BackfillReport> {
  const report: BackfillReport = { handbook: [], helpArticles: [], centreFacts: [], lmsCourses: [], policies: [] };
  report.handbook = await syncHandbook();
  report.helpArticles = await syncHelpArticles();

  const services = await prisma.service.findMany({ where: { status: "active" }, select: { id: true } });
  for (const s of services) {
    const r = await syncCentreFacts(s.id);
    if (r) report.centreFacts.push(r);
  }

  const courses = await prisma.lMSCourse.findMany({ where: { status: "published", deleted: false }, select: { id: true } });
  for (const c of courses) report.lmsCourses.push(...(await syncLmsCourse(c.id)));

  const policies = await prisma.policyDocument.findMany({
    where: { isArchived: false, currentVersionId: { not: null } },
    select: { currentVersionId: true },
  });
  for (const p of policies) {
    const r = await syncPolicyVersion(p.currentVersionId!);
    if (r) report.policies.push(r);
  }
  return report;
}
```

- [ ] **Step 3: Write the failing test for `sync.ts`**

```ts
// src/__tests__/lib/knowledge/sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/knowledge/adapters/backfill", () => ({
  runBackfill: vi.fn(async () => ({ handbook: [{ outcome: "created" }], helpArticles: [{ outcome: "unchanged" }], centreFacts: [], lmsCourses: [], policies: [{ outcome: "error", error: "x" }] })),
}));
vi.mock("@/lib/knowledge/adapters/regulator", () => ({
  syncRegulator: vi.fn(async () => ({ results: [{ outcome: "created" }], errors: [{ id: "gone", error: "HTTP 404" }] })),
}));
import { runAdapter } from "@/lib/knowledge/sync";

describe("runAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgeSyncRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
    prismaMock.knowledgeSyncRun.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
  });

  it("records a KnowledgeSyncRun with outcome counts for backfill", async () => {
    const run = await runAdapter("backfill", "user-1");
    expect(prismaMock.knowledgeSyncRun.create.mock.calls[0][0].data).toMatchObject({ adapter: "backfill", startedById: "user-1" });
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 1, errors: 1 });
    expect(final.finishedAt).toBeInstanceOf(Date);
    expect(run.id).toBe("run1");
  });

  it("records regulator fetch errors in details", async () => {
    await runAdapter("regulator", null);
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 0, errors: 1 });
    expect(final.details).toMatchObject({ fetchErrors: [{ id: "gone", error: "HTTP 404" }] });
  });

  it("rejects an unknown adapter", async () => {
    await expect(runAdapter("sharepoint" as never, null)).rejects.toThrow(/not runnable/);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/knowledge/sync.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement `sync.ts`**

```ts
// src/lib/knowledge/sync.ts
/**
 * Run a server-side adapter under a KnowledgeSyncRun row. The SharePoint
 * adapter is NOT runnable here in slice 1 (local export only — spec §5.1);
 * slice 2b adds it once Graph app-only access exists.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runBackfill } from "./adapters/backfill";
import { syncRegulator } from "./adapters/regulator";
import type { UpsertResult } from "./types";

export const RUNNABLE_ADAPTERS = ["backfill", "regulator"] as const;
export type RunnableAdapter = (typeof RUNNABLE_ADAPTERS)[number];

// `type`, not `interface`: Prisma's InputJsonValue rejects named interfaces
// (no implicit index signature) — see parent/enrolment-draft/submit/route.ts:320.
export type SyncCounts = { created: number; updated: number; unchanged: number; errors: number };

export function countOutcomes(results: UpsertResult[]): SyncCounts {
  const c: SyncCounts = { created: 0, updated: 0, unchanged: 0, errors: 0 };
  for (const r of results) {
    if (r.outcome === "error") c.errors++;
    else c[r.outcome]++;
  }
  return c;
}

export async function runAdapter(adapter: RunnableAdapter, startedById: string | null) {
  if (!RUNNABLE_ADAPTERS.includes(adapter)) {
    throw new Error(`Adapter "${adapter}" is not runnable from the server`);
  }
  const run = await prisma.knowledgeSyncRun.create({
    data: { adapter, startedById, counts: {}, details: {} },
  });
  try {
    let counts: SyncCounts;
    let details: Record<string, unknown>;
    if (adapter === "backfill") {
      const r = await runBackfill();
      const all = [...r.handbook, ...r.helpArticles, ...r.centreFacts, ...r.lmsCourses, ...r.policies];
      counts = countOutcomes(all);
      details = {
        perAdapter: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, countOutcomes(v)])),
        errors: all.filter((x) => x.outcome === "error").map((x) => ({ sourceId: x.sourceId, error: x.error })),
      };
    } else {
      const r = await syncRegulator();
      counts = countOutcomes(r.results);
      counts.errors += r.errors.length;
      details = { fetchErrors: r.errors };
    }
    return prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        counts: counts as Prisma.InputJsonValue,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Knowledge: adapter run failed", { adapter, runId: run.id, err: message });
    return prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: message, counts: {}, details: {} },
    });
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/__tests__/lib/knowledge/sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/knowledge/adapters/manual.ts src/lib/knowledge/adapters/backfill.ts src/lib/knowledge/sync.ts src/__tests__/lib/knowledge/sync.test.ts && git commit -m "feat(knowledge): manual + backfill adapters and runAdapter (KnowledgeSyncRun)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 17: Wire the triggers (swallow-and-log, after the primary write)

**Files:**
- Create: `src/lib/knowledge/hooks.ts` (+ `src/__tests__/lib/knowledge/hooks.test.ts`)
- Modify: `src/app/api/policies/route.ts`, `src/app/api/policies/[id]/route.ts`, `src/app/api/policies/[id]/versions/route.ts`, `src/app/api/policies/[id]/archive/route.ts`, `src/app/api/services/[id]/content/route.ts`, `src/app/api/amana-handbook/content/route.ts`, `src/app/api/amana-way/content/route.ts`, `src/app/api/knowledge-base/seed/route.ts`, `src/app/api/lms/courses/route.ts`, `src/app/api/lms/courses/[id]/route.ts`, `src/app/api/lms/courses/publish-readiness/route.ts`, `src/app/api/lms/courses/[id]/modules/route.ts`, `src/app/api/lms/modules/[moduleId]/route.ts`

Every hook has the same shape — fire after the primary write succeeds, never block or fail the request, and survive the response being sent. On Vercel a bare `void promise` can be frozen once the response streams out; Next 16's `after()` (from `next/server`) schedules the work post-response and keeps the function alive for it. Put the helper in `src/lib/knowledge/hooks.ts` so every route uses one line:

```ts
// src/lib/knowledge/hooks.ts
import { after } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Run a knowledge adapter after the response is sent. Swallow-and-log:
 * a knowledge sync must never fail or slow the user's write.
 */
export function syncAfterResponse(label: string, run: () => Promise<unknown>): void {
  after(async () => {
    try {
      await run();
    } catch (err) {
      logger.warn("Knowledge: sync failed", { adapter: label, err });
    }
  });
}
```
Route usage: `syncAfterResponse("policy_upload", () => syncPolicyVersion(versionId));`. Tests for the routes mock `@/lib/knowledge/hooks` (`syncAfterResponse: vi.fn()`) — and one unit test for `hooks.ts` mocks `next/server`'s `after` to invoke the callback immediately and asserts a rejected `run` is logged, not thrown. (If `after` proves unavailable in the test environment even when mocked, fall back to `void run().catch(...)` inside the helper with a comment — but try `after` first; it is the documented Next 16 API.)

Existing route tests must keep passing; add `vi.mock("@/lib/knowledge/adapters/<name>", () => ({ syncX: vi.fn(), … }))` to every route test that now (transitively) imports an adapter. Find them with a RECURSIVE grep — `grep -rl "policies/route\|policies/\[id\]\|content/route\|knowledge-base/seed\|lms/courses\|lms/modules" src/__tests__/api` — which today yields at least: `src/__tests__/api/policy-documents.test.ts`, `src/__tests__/api/amana-way-content.test.ts`, `src/__tests__/api/lms/courses.test.ts`, `src/__tests__/api/lms/progress-quiz-gate.test.ts`.

- [ ] **Step 1: Policies create + version + archive + title edit**

In `src/app/api/policies/route.ts` `POST`: `const result = await prisma.$transaction(…)` (line ~128) — inside the callback the row is called `linked` (lines 149–155, `include: { currentVersion: true }`), but OUTSIDE it is `result`. After the `activityLog.create` that follows the transaction: `if (result.currentVersion) syncAfterResponse("policy_upload", () => syncPolicyVersion(result.currentVersion!.id))` (bind `const versionId = result.currentVersion?.id` first to avoid the `!`).
In `src/app/api/policies/[id]/versions/route.ts` after `activityLog.create`: `syncAfterResponse("policy_upload", () => syncPolicyVersion(result.id))` (`result` is the created `PolicyDocumentVersion`).
In `src/app/api/policies/[id]/archive/route.ts`: add `currentVersionId: true` to the existing `findUnique` select; after the update: if `parsed.data.isArchived` → `syncAfterResponse("policy_upload", () => excludePolicySources(id))`; else → `if (existing.currentVersionId) syncAfterResponse("policy_upload", () => syncPolicyVersion(existing.currentVersionId!))` (`currentVersionId` is `String?`; the guard makes the `!` safe — or bind it to a const first).
In `src/app/api/policies/[id]/route.ts` `PATCH` (title/category edit, line ~76): select `currentVersionId` and after the update `if (currentVersionId) syncAfterResponse("policy_upload", () => syncPolicyVersion(currentVersionId))` — otherwise the source title goes stale until the next version upload.

- [ ] **Step 2: Service content**

In `src/app/api/services/[id]/content/route.ts` `PATCH`, after `activityLog.create`: `syncAfterResponse("centre_facts", () => syncCentreFacts(serviceId))`.

- [ ] **Step 3: Handbook + Amana Way**

In both content routes' `PATCH`, after `activityLog.create`: `syncAfterResponse("handbook", () => syncHandbook())`.

- [ ] **Step 4: Help articles**

In `src/app/api/knowledge-base/seed/route.ts` after `createMany`: `syncAfterResponse("help_article", () => syncHelpArticles())`.

- [ ] **Step 5: LMS — every course-status and module write path**

`src/app/api/lms/courses/route.ts` `POST` (create, may carry inline modules and `status: "published"`): after `prisma.lMSCourse.create` → `syncAfterResponse("lms_module", () => syncLmsCourse(course.id))`.
`src/app/api/lms/courses/[id]/route.ts` `PATCH`: after `prisma.lMSCourse.update`, `syncAfterResponse("lms_module", () => syncLmsCourse(id))` — fires on every PATCH, covering `status` transitions both ways. `DELETE` (soft delete, `data: { deleted: true }` at ~line 150): after the update, `syncAfterResponse("lms_module", () => syncLmsCourse(id))` — the adapter sees `deleted` and excludes the course's sources (backfill queries `deleted: false`, so nothing else would ever revisit it).
`src/app/api/lms/courses/publish-readiness/route.ts` `POST` (bulk publish via `publishCourses`, ~line 112): after a successful publish, `syncAfterResponse("lms_module", async () => { for (const courseId of courseIds) await syncLmsCourse(courseId); })` — this IS the "transition to published" spec §3.3(b) names.
`src/app/api/lms/courses/[id]/modules/route.ts` `POST` (the param is bound as `const { id: courseId }`): after `lMSModule.create`, `syncAfterResponse("lms_module", () => syncLmsCourse(courseId))`.
`src/app/api/lms/modules/[moduleId]/route.ts` `PATCH`: after update, `syncAfterResponse("lms_module", () => syncLmsModule(moduleId))`; `DELETE`: read `courseId` before deleting (`findUnique({ select: { courseId } })`), then after delete `syncAfterResponse("lms_module", () => syncLmsCourse(courseId))` — the adapter keys sources by `<courseId>:<moduleId>` and excludes everything under the course prefix that it didn't just index, so the deleted module's source is excluded without needing its id.

- [ ] **Step 6: Run the affected route tests**

Run: `npx vitest run src/__tests__/api/policy-documents.test.ts src/__tests__/api/amana-way-content.test.ts src/__tests__/api/lms/ 2>&1 | tail -20`, then the full `npx vitest run src/__tests__/api`.
Expected: PASS. Any failure is a missing adapter mock in that test file — add it, don't change the route.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/policies src/app/api/services/\[id\]/content src/app/api/amana-handbook src/app/api/amana-way src/app/api/knowledge-base src/app/api/lms src/__tests__/api && git commit -m "feat(knowledge): fire adapters from policy/service-content/handbook/help/LMS writes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 18: `search_knowledge` tool + scoped executor + chat-route leak fix

**Files:**
- Modify: `src/lib/ai-tools.ts`, `src/app/api/assistant/chat/route.ts`
- Test: `src/__tests__/lib/ai-tools-search.test.ts`, `src/__tests__/api/assistant-chat-scope.test.ts`

- [ ] **Step 1: Write the failing tool test**

```ts
// src/__tests__/lib/ai-tools-search.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const search = vi.fn(async () => [{ chunkId: "c", sourceId: "s", chunkIndex: 0, content: "body", heading: null, title: "Doc", category: "policy", tier: "general", externalUrl: null, fusedScore: 1, tsRank: 0.5, cosineDistance: null }]);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/lib/ai-tools-search.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modify `ai-tools.ts`**

1. Replace the `search_knowledge_base` tool definition (lines ~131–156) with:
```ts
  {
    name: "search_knowledge",
    description:
      "Search the Amana OSHC knowledge store — the FIRST tool for any 'how do I…', 'what's our policy on…', 'what's the procedure for…' question. " +
      "It holds: ALL QA1–QA7 policies and procedures, the company-wide SOPs, the Amana Way, the Employee Handbook, the Proven Process, staff help articles, published training modules, this user's centre fact sheet, and curated regulator references (NQS, National Regs, ratios, Fair Work award). " +
      "Search is hybrid (keyword + meaning) — describe the situation in plain words; if the first result set looks off, retry once with OSHC terminology (e.g. 'illness management', 'safe arrival', 'behaviour guidance').",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The user's question or situation, 3–20 words." },
      },
      required: ["query"],
    },
  },
```
2. Change the executor signature and the case:
```ts
export interface ToolContext {
  scope: KnowledgeScope;
}

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
```
and
```ts
      case "search_knowledge": {
        const { searchKnowledge, formatHitsForPrompt } = await import("@/lib/knowledge/search");
        const hits = await searchKnowledge(String(input.query ?? ""), ctx.scope, 8);
        if (hits.length === 0) {
          return JSON.stringify({
            message: "No matching documents found for this query.",
            suggestion: "Retry once with OSHC terminology; if still nothing, say the library doesn't cover it.",
          });
        }
        return formatHitsForPrompt(hits);
      }
```
with `import type { KnowledgeScope } from "@/lib/knowledge/types";` at the top. Remove the `@/lib/document-indexer` import.
3. (Host allow-list already moved to `src/lib/reference-hosts.ts` in Task 15 — nothing to do here.)
4. `prisma/seed.ts` does not mention `search_knowledge_base` (verified). The only other reference is a comment in `src/app/(dashboard)/settings/ai-knowledge/page.tsx:359`, which Task 21 removes with the auto-reindex effect.

- [ ] **Step 4: Write the failing chat-route test**

```ts
// src/__tests__/api/assistant-chat-scope.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
const buildDashboardContext = vi.fn(async () => "FINANCIALS-SECRET");
vi.mock("@/lib/ai-context", () => ({ buildDashboardContext: () => buildDashboardContext() }));
vi.mock("@/lib/knowledge/scope", () => ({ buildKnowledgeScope: vi.fn(async () => ({ role: "staff", serviceIds: ["s1"], state: null })) }));
const captured: { system?: string }[] = [];
vi.mock("@/lib/ai", () => ({
  getAI: () => ({
    messages: {
      stream: (args: { system: string }) => {
        captured.push(args);
        return {
          on: () => {},
          finalMessage: async () => ({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" }),
        };
      },
    },
  }),
}));

import { POST } from "@/app/api/assistant/chat/route";

async function drain(res: Response) { await res.text(); }

describe("assistant chat — role gating", () => {
  beforeEach(() => { _clearUserActiveCache(); captured.length = 0; vi.clearAllMocks(); prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" }); });

  it("staff never receive the dashboard financial context", async () => {
    mockSession({ id: "u1", name: "Ed", role: "staff", serviceId: "s1" });
    const res = await POST(createRequest("POST", "/api/assistant/chat", { body: { messages: [{ role: "user", content: "hello" }] } }));
    await drain(res);
    expect(buildDashboardContext).not.toHaveBeenCalled();
    expect(captured[0]?.system).not.toContain("FINANCIALS-SECRET");
  });

  it("owner still receives it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" });
    mockSession({ id: "u2", name: "Own", role: "owner" });
    const res = await POST(createRequest("POST", "/api/assistant/chat", { body: { messages: [{ role: "user", content: "hello" }] } }));
    await drain(res);
    expect(captured[0]?.system).toContain("FINANCIALS-SECRET");
  });
});
```

`withApiAuth` resolves the active check via `prisma.user.findUnique({ select: { active: true } })` (`src/lib/server-auth.ts:52`), so the `prismaMock.user.findUnique` mock above is the right one.

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/__tests__/api/assistant-chat-scope.test.ts`
Expected: FAIL — staff test sees the secret.

- [ ] **Step 6: Modify `chat/route.ts`**

1. Imports: add `import { buildKnowledgeScope } from "@/lib/knowledge/scope";`.
2. Replace `const dashboardContext = await buildDashboardContext();` with:
```ts
  // 2026-09-27: financial/pipeline context is admin-only (spec §1 item 4).
  // Every role used to get current-month revenue by centre in its prompt.
  const dashboardContext = isAdmin ? await buildDashboardContext() : "";
  const scope = await buildKnowledgeScope(session!);
```
3. In the system prompt array, make the trailing dashboard block conditional:
```ts
    ...(dashboardContext
      ? ["", "## Dashboard overview (high-level — use tools for specifics)", dashboardContext]
      : []),
```
4. Update the tool-gate filter: `t.name === "search_knowledge" || t.name === "fetch_oshc_reference"`.
5. Pass the context: `executeToolCall(toolBlock.name, toolBlock.input as Record<string, unknown>, { scope })`.
6. In the "## How you answer questions" prose: replace "call search_knowledge_base" / "search_knowledge_base" with `search_knowledge`; replace the "run AT LEAST two more searches … 3+ searches" paragraph with: *"Search is hybrid (keyword + meaning). If the first result set is off-topic, retry ONCE with OSHC terminology. After that, say plainly the library doesn't cover it."*

- [ ] **Step 7: Run both tests + existing assistant tests**

Run: `npx vitest run src/__tests__/lib/ai-tools-search.test.ts src/__tests__/api/assistant-chat-scope.test.ts src/__tests__/api/assistant* src/__tests__/lib/ai-tools*`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai-tools.ts src/app/api/assistant/chat/route.ts src/__tests__ && git commit -m "feat(assistant): search_knowledge over the new store; scope from session; admin-only dashboard context

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 19: Re-point the admin routes at `KnowledgeSource`

**Files:**
- Modify: `src/app/api/settings/ai-knowledge/route.ts`, `…/[id]/route.ts`, `…/register/route.ts`, `…/upload/route.ts`, `…/seed/route.ts`
- Create: `src/app/api/settings/ai-knowledge/sync/route.ts`, `src/app/api/settings/ai-knowledge/[id]/reindex/route.ts`
- Delete: `src/app/api/settings/ai-knowledge/{reindex,backfill,dedupe}/route.ts`
- Test: `src/__tests__/api/ai-knowledge-admin.test.ts`

Response shape for the console (all list/detail responses):
```ts
interface KnowledgeEntry {
  id: string; title: string; sourceKind: KnowledgeSourceKind; category: KnowledgeCategory;
  tier: KnowledgeTier; tierOverride: KnowledgeTier | null; qualityArea: number | null;
  serviceId: string | null; serviceName: string | null; state: string | null; version: number | null;
  status: KnowledgeStatus; excludedBy: "adapter" | "admin" | null; externalUrl: string | null;
  indexedAt: string | null; indexError: string | null;
  chunkCount: number; createdAt: string; updatedAt: string;
}
```

- [ ] **Step 1: Write the failing route tests**

```ts
// src/__tests__/api/ai-knowledge-admin.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
const createManual = vi.fn(async () => ({ sourceId: "k1", outcome: "created" }));
const updateManual = vi.fn();
vi.mock("@/lib/knowledge/adapters/manual", () => ({ createManualSource: (i: unknown) => createManual(i), updateManualSource: (...a: unknown[]) => updateManual(...a) }));
const runAdapter = vi.fn(async () => ({ id: "run1", counts: { created: 1 } }));
vi.mock("@/lib/knowledge/sync", () => ({ runAdapter: (...a: unknown[]) => runAdapter(...a), RUNNABLE_ADAPTERS: ["backfill", "regulator"] }));
vi.mock("@/lib/knowledge/pipeline", () => ({ indexSource: vi.fn(async () => ({ ok: true, chunks: 2 })) }));
vi.mock("@/lib/storage", () => ({ deleteFile: vi.fn() }));

import { GET, POST } from "@/app/api/settings/ai-knowledge/route";
import { PATCH, DELETE } from "@/app/api/settings/ai-knowledge/[id]/route";
import { POST as SYNC, GET as SYNC_RUNS } from "@/app/api/settings/ai-knowledge/sync/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/settings/ai-knowledge", () => {
  beforeEach(() => { _clearUserActiveCache(); vi.clearAllMocks(); prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" }); });

  it("401 without session", async () => {
    mockNoSession();
    expect((await GET(createRequest("GET", "/api/settings/ai-knowledge"))).status).toBe(401);
  });

  it("403 for staff", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" });
    mockSession({ id: "u", name: "S", role: "staff" });
    expect((await GET(createRequest("GET", "/api/settings/ai-knowledge"))).status).toBe(403);
  });

  it("GET lists KnowledgeSource rows with chunk counts and service name", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findMany.mockResolvedValue([{
      id: "k1", title: "T", sourceKind: "manual", category: "guide", tier: "general", tierOverride: null, qualityArea: null,
      serviceId: "s1", service: { name: "Doveton" }, state: null, version: null, status: "active", externalUrl: null,
      indexedAt: null, indexError: null, createdAt: new Date(), updatedAt: new Date(), _count: { chunks: 3 },
    }]);
    const res = await GET(createRequest("GET", "/api/settings/ai-knowledge"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entries[0]).toMatchObject({ id: "k1", chunkCount: 3, serviceName: "Doveton" });
    expect(prismaMock.knowledgeSource.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it("POST validates and creates a manual source", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    expect((await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "" } }))).status).toBe(400);
    const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Roll call", body: "# Roll call\n…", category: "sop", tier: "safety_critical" } }));
    expect(res.status).toBe(201);
    expect(createManual.mock.calls[0][0]).toMatchObject({ title: "Roll call", text: "# Roll call\n…", category: "sop", tier: "safety_critical" });
  });

  it("PATCH updates title/body for manual, tierOverride/status for any kind; 404 unknown", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", sourceKind: "sharepoint", externalUrl: null });
    prismaMock.knowledgeSource.update.mockResolvedValue({});
    expect((await PATCH(createRequest("PATCH", "/x", { body: { body: "new" } }), ctx("k1"))).status).toBe(400); // not manual
    expect((await PATCH(createRequest("PATCH", "/x", { body: { tierOverride: "safety_critical", status: "excluded" } }), ctx("k1"))).status).toBe(200);
    expect(prismaMock.knowledgeSource.update.mock.calls[0][0].data).toEqual({ tierOverride: "safety_critical", status: "excluded", excludedBy: "admin" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    expect((await PATCH(createRequest("PATCH", "/x", { body: { title: "t" } }), ctx("nope"))).status).toBe(404);
  });

  it("DELETE removes a manual source (and its blob) but refuses adapter-owned sources", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", sourceKind: "manual", externalUrl: "https://blob/x.pdf" });
    prismaMock.knowledgeSource.delete.mockResolvedValue({});
    expect((await DELETE(createRequest("DELETE", "/x"), ctx("k1"))).status).toBe(200);
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k2", sourceKind: "policy_upload", externalUrl: null });
    expect((await DELETE(createRequest("DELETE", "/x"), ctx("k2"))).status).toBe(400);
  });

  it("POST /sync runs a runnable adapter and rejects others", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    expect((await SYNC(createRequest("POST", "/x", { body: { adapter: "sharepoint" } }))).status).toBe(400);
    const res = await SYNC(createRequest("POST", "/x", { body: { adapter: "backfill" } }));
    expect(res.status).toBe(200);
    expect(runAdapter).toHaveBeenCalledWith("backfill", "u");
  });

  it("GET /sync returns the latest run per adapter", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSyncRun.findMany.mockResolvedValue([
      { id: "r3", adapter: "sharepoint", startedAt: new Date(3), finishedAt: new Date(3), counts: { imported: 5 }, details: { conflicts: [] }, error: null },
      { id: "r2", adapter: "backfill", startedAt: new Date(2), finishedAt: new Date(2), counts: {}, details: {}, error: null },
      { id: "r1", adapter: "sharepoint", startedAt: new Date(1), finishedAt: new Date(1), counts: {}, details: {}, error: null },
    ]);
    const json = await (await SYNC_RUNS(createRequest("GET", "/x"))).json();
    expect(json.runs.map((r: { id: string }) => r.id)).toEqual(["r3", "r2"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/api/ai-knowledge-admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the root route**

```ts
// src/app/api/settings/ai-knowledge/route.ts
/**
 * GET  — list every KnowledgeSource (the console's source table)
 * POST — create a pasted-text `manual` source
 * Auth: owner/head_office/admin. Reads/writes KnowledgeSource only — never Document.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { createManualSource } from "@/lib/knowledge/adapters/manual";
import { logger } from "@/lib/logger";

const MAX_BODY_BYTES = 500_000;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  category: z.enum(["policy", "procedure", "sop", "guide", "reference", "centre"]).default("guide"),
  tier: z.enum(["safety_critical", "general"]).optional(),
  serviceId: z.string().min(1).nullable().optional(),
  state: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]).nullable().optional(),
});

export const ENTRY_SELECT = {
  id: true, title: true, sourceKind: true, category: true, tier: true, tierOverride: true, qualityArea: true,
  serviceId: true, service: { select: { name: true } }, state: true, version: true, status: true, excludedBy: true, externalUrl: true,
  indexedAt: true, indexError: true, createdAt: true, updatedAt: true, _count: { select: { chunks: true } },
} as const;

export function toEntry(row: {
  service: { name: string } | null; _count: { chunks: number };
  [k: string]: unknown;
}) {
  const { service, _count, ...rest } = row;
  return { ...rest, serviceName: service?.name ?? null, chunkCount: _count.chunks };
}

export const GET = withApiAuth(
  async () => {
    const rows = await prisma.knowledgeSource.findMany({
      select: ENTRY_SELECT,
      orderBy: [{ status: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ entries: rows.map(toEntry) });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
    const { title, body, category, tier, serviceId, state } = parsed.data;
    if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
      throw ApiError.badRequest(`Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`);
    }
    const result = await createManualSource({ title: title.trim(), text: body, category, tier, serviceId, state });
    logger.info("AI knowledge: manual source created", { sourceId: result.sourceId, actorId: session!.user.id });
    return NextResponse.json({ id: result.sourceId, outcome: result.outcome }, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
```

- [ ] **Step 4: Rewrite `[id]/route.ts`**

```ts
// src/app/api/settings/ai-knowledge/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { updateManualSource } from "@/lib/knowledge/adapters/manual";
import { deleteFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { ENTRY_SELECT, toEntry } from "../route";

const MAX_BODY_BYTES = 500_000;
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  tierOverride: z.enum(["safety_critical", "general"]).nullable().optional(),
  status: z.enum(["active", "excluded"]).optional(),
});
interface RouteContext { params: Promise<{ id: string }> }

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const row = await prisma.knowledgeSource.findUnique({
      where: { id },
      select: { ...ENTRY_SELECT, chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
    });
    if (!row) throw ApiError.notFound("Knowledge source not found");
    const { chunks, ...rest } = row;
    return NextResponse.json({ ...toEntry(rest), body: chunks.map((c) => c.content).join("\n\n") });
  },
  { roles: [...ADMIN_ROLES] },
);

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.knowledgeSource.findUnique({ where: { id }, select: { id: true, sourceKind: true, externalUrl: true } });
    if (!existing) throw ApiError.notFound("Knowledge source not found");
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
    const { title, body, tierOverride, status } = parsed.data;

    if (body !== undefined || title !== undefined) {
      if (existing.sourceKind !== "manual") {
        throw ApiError.badRequest("Only pasted/uploaded entries can be edited here — adapter-owned sources change at their origin.");
      }
      if (body !== undefined && existing.externalUrl) {
        throw ApiError.badRequest("Body of an uploaded file can't be edited inline. Delete and re-upload to change the content.");
      }
      if (body !== undefined && Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
        throw ApiError.badRequest(`Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`);
      }
      await updateManualSource(id, { title: title?.trim(), text: body });
    }
    const data: { tierOverride?: "safety_critical" | "general" | null; status?: "active" | "excluded"; excludedBy?: "admin" | null } = {};
    if (tierOverride !== undefined) data.tierOverride = tierOverride;
    if (status !== undefined) {
      data.status = status;
      data.excludedBy = status === "excluded" ? "admin" : null; // admin decisions are never auto-reverted by adapters
    }
    if (Object.keys(data).length) await prisma.knowledgeSource.update({ where: { id }, data });
    logger.info("AI knowledge: source updated", { id, keys: Object.keys(parsed.data) });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.knowledgeSource.findUnique({ where: { id }, select: { id: true, sourceKind: true, externalUrl: true } });
    if (!existing) throw ApiError.notFound("Knowledge source not found");
    if (existing.sourceKind !== "manual") {
      throw ApiError.badRequest("Adapter-owned sources can't be deleted — exclude them instead.");
    }
    if (existing.externalUrl) {
      try { await deleteFile(existing.externalUrl); } catch (err) {
        logger.warn("AI knowledge: blob delete failed", { id, err: err instanceof Error ? err.message : String(err) });
      }
    }
    await prisma.knowledgeSource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);
```

- [ ] **Step 5: Add `sync` and `[id]/reindex` routes**

```ts
// src/app/api/settings/ai-knowledge/sync/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { runAdapter, RUNNABLE_ADAPTERS } from "@/lib/knowledge/sync";

export const maxDuration = 300;
const schema = z.object({ adapter: z.enum(RUNNABLE_ADAPTERS) });

/** Latest run per adapter (incl. the script-written `sharepoint` runs) — feeds LastSyncPanel. */
export const GET = withApiAuth(
  async () => {
    const runs = await prisma.knowledgeSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, adapter: true, startedAt: true, finishedAt: true, counts: true, details: true, error: true },
    });
    const latestByAdapter = new Map<string, (typeof runs)[number]>();
    for (const r of runs) if (!latestByAdapter.has(r.adapter)) latestByAdapter.set(r.adapter, r);
    return NextResponse.json({ runs: [...latestByAdapter.values()] });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("adapter must be one of: " + RUNNABLE_ADAPTERS.join(", "));
    const run = await runAdapter(parsed.data.adapter, session!.user.id);
    return NextResponse.json(run);
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 5, windowMs: 60_000 } },
);
```

```ts
// src/app/api/settings/ai-knowledge/[id]/reindex/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { indexSource } from "@/lib/knowledge/pipeline";

interface RouteContext { params: Promise<{ id: string }> }
export const maxDuration = 120;

/** Re-chunk + re-embed from the stored chunk text (e.g. after enabling embeddings). */
export const POST = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const row = await prisma.knowledgeSource.findUnique({
      where: { id }, select: { id: true, chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
    });
    if (!row) throw ApiError.notFound("Knowledge source not found");
    const result = await indexSource(id, row.chunks.map((c) => c.content).join("\n\n"));
    return NextResponse.json(result);
  },
  { roles: [...ADMIN_ROLES] },
);
```

- [ ] **Step 6: Re-point `register` and `upload`**

`register/route.ts`: replace the `prisma.document.*` + `indexDocument` body with: `extractText(blobUrl, mimeType)` (from `@/lib/document-indexer`) → `createManualSource({ title, text, externalUrl: blobUrl, category: inferCategory(fileName, title) })` where `inferCategory` maps the existing `inferDocumentCategory` result (`policy`→`policy`, `procedure`→`procedure`, `guide`→`guide`, else `guide`). Return `{ id, outcome }`. Dedupe by `externalUrl`: `findFirst({ where: { sourceKind: "manual", externalUrl: blobUrl } })` → if found, `indexSource(found.id, text)` instead of creating.
`upload/route.ts`: in `onUploadCompleted`, replace `prisma.document.create` + `indexDocument` with the same `extractText` → `createManualSource` call; in `processZipUpload`, per extracted entry call `createManualSource({ title: entryName, text, externalUrl: null })` (zip entries have no blob URL of their own — record the zip's `blob.url` on the first entry only is wrong; leave `externalUrl: null`).

- [ ] **Step 7: Re-point `seed`**

Replace the body with `const results = await syncHandbook(); return NextResponse.json({ results });` — it is now the handbook backfill trigger. Keep `roles`.

- [ ] **Step 8: Delete the replaced routes**

```bash
git rm -r src/app/api/settings/ai-knowledge/reindex src/app/api/settings/ai-knowledge/backfill src/app/api/settings/ai-knowledge/dedupe
```

- [ ] **Step 9: Run the admin tests + lint**

Run: `npx vitest run src/__tests__/api/ai-knowledge-admin.test.ts && npx eslint src/app/api/settings/ai-knowledge`
Expected: PASS (8 tests); 0 errors.

- [ ] **Step 10: Commit**

```bash
git add -A src/app/api/settings/ai-knowledge src/__tests__/api/ai-knowledge-admin.test.ts && git commit -m "feat(knowledge): admin routes over KnowledgeSource; sync + reindex; drop reindex/backfill/dedupe

The console page still calls the deleted routes until Task 21 rewrites it (same PR).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 20: Retire the old store

**Files:**
- Delete: `src/app/api/knowledge/{ask,index,reindex,status}/route.ts`, `src/__tests__/api/knowledge.test.ts`
- Modify: `src/lib/document-indexer.ts`, `src/app/api/documents/{route,bulk/route,[id]/route}.ts`, `src/__tests__/api/documents.test.ts`, `src/__tests__/lib/document-indexer.test.ts`

- [ ] **Step 1: Delete the routes and their test**

```bash
git rm -r src/app/api/knowledge src/__tests__/api/knowledge.test.ts
```

- [ ] **Step 2: Remove `indexDocument` from the documents routes**

In each of the three files delete the `import { indexDocument } …` line and the `indexDocument(document.id).catch(…)` block (`documents/route.ts:178`, `documents/bulk/route.ts:194`, `documents/[id]/route.ts:58`). In `src/__tests__/api/documents.test.ts` delete the `vi.mock("@/lib/document-indexer", …)` block (lines 21–23).

- [ ] **Step 3: Strip `document-indexer.ts`**

Delete `indexDocument`, `indexTextContent`, `searchChunks`, `formatChunksForPrompt`, the `SearchChunkRow`/`SearchResult` interfaces, and the `prisma` import if nothing else uses it. Keep `extractText`, `extractTextFromBuffer`, `chunkText`, `DocumentChunkData`, the polyfill and MIME helpers. Update the file's header comment: *"Text extraction + heading-aware chunking. Storage lives in src/lib/knowledge/pipeline.ts (2026-09-27)."*

- [ ] **Step 4: Trim the indexer test**

Rename `src/__tests__/lib/document-indexer.test.ts` → `src/__tests__/lib/document-extract.test.ts`; delete every `describe` that exercised `indexDocument`/`indexTextContent`/`searchChunks`; keep `extractText`/`chunkText` cases.

- [ ] **Step 5: Type-check + full unit suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 0 type errors; all tests pass. Any remaining reference to a deleted symbol shows up here — fix the caller, don't resurrect the symbol.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(knowledge): retire the Document-backed store — delete /api/knowledge/*, indexDocument, searchChunks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**End of Chunk 4.** The store now fills itself from every DB-backed origin, the assistant reads it with session scope, financials are admin-only, and no route can index a `Document`.

---

## Chunk 5: Console UI, SharePoint export/import, cron

### Task 21: Knowledge console over the new shape

**Files:**
- Modify: `src/app/(dashboard)/settings/ai-knowledge/page.tsx` (list + toolbar + filters only after this task)
- Create: `src/components/settings/ai-knowledge/KnowledgeSourceRow.tsx`, `src/components/settings/ai-knowledge/EntryModal.tsx`, `src/components/settings/ai-knowledge/LastSyncPanel.tsx`, `src/components/settings/ai-knowledge/types.ts`

The page is 944 lines and would pass 1,100 with the new row controls, so the row and the modal move out. `EntryModal` moves VERBATIM (then gets the two new fields); the row is new. Use `tsc --noEmit` as the guide for anything this task's list misses — every reference to the old `Document` shape must go.

- [ ] **Step 1: Shared types** (`src/components/settings/ai-knowledge/types.ts`)

```tsx
export type SourceKind = "sharepoint" | "policy_upload" | "help_article" | "handbook" | "lms_module" | "centre_facts" | "regulator" | "manual";
export type Category = "policy" | "procedure" | "sop" | "guide" | "reference" | "centre";
export type Tier = "safety_critical" | "general";
export type Status = "active" | "superseded" | "excluded";

export interface KnowledgeEntrySummary {
  id: string;
  title: string;
  sourceKind: SourceKind;
  category: Category;
  tier: Tier;
  tierOverride: Tier | null;
  qualityArea: number | null;
  serviceId: string | null;
  serviceName: string | null;
  state: string | null;
  version: number | null;
  status: Status;
  excludedBy: "adapter" | "admin" | null;
  externalUrl: string | null;
  indexedAt: string | null;
  indexError: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryDetail extends KnowledgeEntrySummary {
  body: string;
}

/** Only `manual` rows are editable/deletable in the console; everything else changes at its origin. */
export const isManual = (e: { sourceKind: SourceKind }) => e.sourceKind === "manual";
/** Uploaded files carry a Blob URL; pasted text does not. */
export const isFile = (e: { sourceKind: SourceKind; externalUrl: string | null }) => isManual(e) && Boolean(e.externalUrl);

export const KIND_LABEL: Record<SourceKind, string> = {
  sharepoint: "SharePoint", policy_upload: "Policy PDF", help_article: "Help article", handbook: "Handbook",
  lms_module: "Training module", centre_facts: "Centre facts", regulator: "Regulator", manual: "Manual",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export interface SyncRunSummary {
  id: string;
  adapter: string;
  startedAt: string;
  finishedAt: string | null;
  counts: Record<string, number>;
  details: {
    conflicts?: { normalizedTitle: string; state: string | null; version: number | null; paths: string[] }[];
    unmapped?: { path: string; centreFolder: string }[];
    errors?: { path?: string; sourceId?: string; error: string }[];
    fetchErrors?: { id: string; error: string }[];
  };
  error: string | null;
}
```

Delete the two old interfaces at `page.tsx:39–70` and the page's own `formatDate` (now exported from `types.ts`) and `import` these instead. Replace every `e.kind === "file"` with `isFile(e)`, `existing?.kind === "file"` with `existing && isFile(existing)`, `e.fileUrl` with `e.externalUrl`; remove `e.fileName`/`existing.fileName` (modal copy at ~856/876 uses the title instead), `e.description` (~650 — drop the preview line), `e.indexed` (366, 402, 630 → `e.indexedAt !== null`), `e._count.chunks` (403, 662–663 → `e.chunkCount`).

- [ ] **Step 2: Remove the old mutations and the auto-reindex effect**

Delete `reindexMut`, `dedupeMut`, `backfillMut` (~lines 270–350) and the `useEffect` at ~358–375 that auto-fires `/api/settings/ai-knowledge/reindex` (that route is gone; re-index is now a per-row action). Prune imports that become unused (`useEffect`, and any of `CheckCircle2`/`AlertTriangle`/`Sparkles` if nothing else uses them — `npm run lint` warns on unused imports; leave the step at 0 *errors*).

Replace them with one Sync mutation and keep Upload + Seed:

```tsx
  const sync = useMutation({
    mutationFn: (adapter: "backfill" | "regulator") =>
      mutateApi<SyncRunSummary>("/api/settings/ai-knowledge/sync", { method: "POST", body: { adapter } }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
      qc.invalidateQueries({ queryKey: ["ai-knowledge-sync-runs"] });
      const c = run.counts ?? {};
      toast({
        description: run.error
          ? `Sync failed: ${run.error}`
          : `Sync done — ${c.created ?? 0} new, ${c.updated ?? 0} updated, ${c.unchanged ?? 0} unchanged, ${c.errors ?? 0} errors.`,
        ...(run.error ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Sync failed" });
    },
  });
```

`seedMut` (~247–267) currently counts `results` by `status: "created" | "skipped"`; the seed route now returns `{ results: { sourceId, outcome, error? }[] }` — count by `outcome` and word the toast `"${created} indexed, ${unchanged} unchanged, ${errors} failed"`. Relabel its button **"Re-index handbooks"**.

Toolbar buttons (`import { Button } from "@/components/ui/Button"` — the file currently hand-rolls `<button>`s; use `Button` for the three actions, `variant="secondary"`):
- **Sync from dashboard** → `sync.mutate("backfill")`, `title="Re-index handbooks, help articles, centre facts, published training modules and current policy PDFs"`.
- **Refresh regulator refs** → `sync.mutate("regulator")`.
- **Upload** (existing behaviour).
All `disabled={sync.isPending}` where relevant.

- [ ] **Step 3: `KnowledgeSourceRow`** (`src/components/settings/ai-knowledge/KnowledgeSourceRow.tsx`)

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, RefreshCw, Trash2, EyeOff, Eye } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { formatDate, isManual, KIND_LABEL, type KnowledgeEntrySummary, type Tier } from "./types";

const tierClass = (t: Tier) =>
  t === "safety_critical"
    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
    : "bg-surface text-muted";

interface Props {
  entry: KnowledgeEntrySummary;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function KnowledgeSourceRow({ entry: e, onEdit, onDelete }: Props) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
  const onError = (err: Error) => toast({ variant: "destructive", description: err.message || "Something went wrong" });

  const patch = useMutation({
    mutationFn: (body: { tierOverride?: Tier | null; status?: "active" | "excluded" }) =>
      mutateApi(`/api/settings/ai-knowledge/${e.id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
    onError,
  });
  const reindex = useMutation({
    mutationFn: () => mutateApi<{ ok: boolean; chunks?: number; error?: string }>(`/api/settings/ai-knowledge/${e.id}/reindex`, { method: "POST" }),
    onSuccess: (r) => { invalidate(); toast({ description: r.ok ? `Re-indexed (${r.chunks} chunks)` : `Re-index failed: ${r.error}` }); },
    onError,
  });

  const effectiveTier = e.tierOverride ?? e.tier;
  const dim = e.status !== "active" ? "opacity-60" : "";
  const editable = isManual(e);

  return (
    <li
      className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border ${dim} ${editable ? "cursor-pointer hover:bg-surface" : ""}`}
      onClick={editable ? () => onEdit(e.id) : undefined}
    >
      <div className="flex-1 min-w-[16rem]">
        <div className="flex items-center gap-2">
          {e.externalUrl ? (
            <a href={e.externalUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline" onClick={(ev) => ev.stopPropagation()}>
              {e.title} <ExternalLink className="inline h-3 w-3 text-muted" />
            </a>
          ) : (
            <span className="font-medium text-foreground">{e.title}</span>
          )}
          <span className="text-2xs px-1.5 py-0.5 rounded bg-surface text-muted">{KIND_LABEL[e.sourceKind]}</span>
          <span className="text-2xs text-muted">{e.category}</span>
          {e.qualityArea && <span className="text-2xs text-muted">QA{e.qualityArea}</span>}
          {e.version && <span className="text-2xs text-muted">V{e.version}</span>}
        </div>
        <div className="flex items-center gap-2 text-2xs text-muted mt-0.5">
          <span>{e.serviceName ?? "Org-wide"}</span>
          <span>·</span>
          <span>{e.state ?? "All states"}</span>
          <span>·</span>
          <span>{e.chunkCount} chunks</span>
          <span>·</span>
          <span>Indexed {formatDate(e.indexedAt)}</span>
          {e.indexError && <span className="text-red-700 dark:text-red-300">{e.indexError}</span>}
        </div>
      </div>

      <span className={`text-2xs px-1.5 py-0.5 rounded ${tierClass(effectiveTier)}`}>
        {effectiveTier === "safety_critical" ? "Safety-critical" : "General"}{e.tierOverride ? " (override)" : ""}
      </span>
      {e.status !== "active" && (
        <span className="text-2xs px-1.5 py-0.5 rounded bg-surface text-muted">
          {e.status === "superseded"
            ? "Superseded"
            : e.excludedBy === "admin"
              ? "Excluded (admin)"
              : e.sourceKind === "sharepoint"
                ? "Excluded (unmapped centre)"
                : "Excluded (origin unpublished)"}
        </span>
      )}

      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
        <select
          aria-label="Tier override"
          className="text-2xs rounded border border-border bg-card px-1 py-0.5"
          value={e.tierOverride ?? "auto"}
          onChange={(ev) => patch.mutate({ tierOverride: ev.target.value === "auto" ? null : (ev.target.value as Tier) })}
          disabled={patch.isPending}
        >
          <option value="auto">Auto ({e.tier === "safety_critical" ? "safety" : "general"})</option>
          <option value="safety_critical">Safety-critical</option>
          <option value="general">General</option>
        </select>
        {e.status !== "superseded" && (
          <button
            type="button"
            aria-label={e.status === "excluded" ? "Restore" : "Exclude"}
            title={e.status === "excluded" ? "Restore to search" : "Exclude from search"}
            className="p-1 rounded hover:bg-surface text-muted"
            onClick={() => patch.mutate({ status: e.status === "excluded" ? "active" : "excluded" })}
            disabled={patch.isPending}
          >
            {e.status === "excluded" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
        <button type="button" aria-label="Re-index" title="Re-chunk and re-embed" className="p-1 rounded hover:bg-surface text-muted" onClick={() => reindex.mutate()} disabled={reindex.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`} />
        </button>
        {editable && (
          <>
            <button type="button" aria-label="Edit" className="p-1 rounded hover:bg-surface text-muted" onClick={() => onEdit(e.id)}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Delete" className="p-1 rounded hover:bg-surface text-red-700 dark:text-red-300" onClick={() => onDelete(e.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
```

(`text-destructive` is NOT a token in this repo — `globals.css` has no `--color-destructive`; the page already uses `text-red-700 dark:text-red-300` for errors, so the row and panel do too.)

Add a page-level delete mutation (the only existing delete lives inside the modal and closes over its own id):
```tsx
  const del = useMutation({
    mutationFn: (id: string) => mutateApi(`/api/settings/ai-knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-knowledge"] }); toast({ description: "Entry deleted" }); },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message || "Delete failed" }),
  });
  const confirmDelete = (id: string) => {
    if (window.confirm("Delete this knowledge entry? The bot will no longer be able to cite it.")) del.mutate(id);
  };
```
The list in `page.tsx` becomes `<ul>{filtered.map((e) => <KnowledgeSourceRow key={e.id} entry={e} onEdit={(id) => setEditing({ mode: "edit", id })} onDelete={confirmDelete} />)}</ul>` — remove the old `<li>` block (~605–690) entirely. The modal keeps its own Delete (same route); both invalidate `["ai-knowledge"]`.

- [ ] **Step 4: `EntryModal`** — move the existing modal component (`page.tsx` ~740–900, the one holding `existing`, `save`, the title input and body textarea) verbatim into `src/components/settings/ai-knowledge/EntryModal.tsx` with `"use client"`, importing `KnowledgeEntryDetail`/`isFile` from `./types`. Then:
- Add `category` (`<select>` over `Category`, default `guide`) and `tier` (`<select>`: Auto / Safety-critical / General; Auto sends nothing) to the create form. Create body: `{ title, body, category, tier? }`.
- In `save`, when `mode === "edit"` and `existing && isFile(existing)`, send `{ title }` only — the route 400s on `body` for a file entry. Otherwise send `{ title, body }`.
- The body textarea stays `readOnly`/`disabled` for file entries (existing behaviour, now keyed on `isFile`).

- [ ] **Step 5: `LastSyncPanel`** (`src/components/settings/ai-knowledge/LastSyncPanel.tsx`)

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { SyncRunSummary } from "./types";

const LABEL: Record<string, string> = { backfill: "Dashboard sync", regulator: "Regulator refresh", sharepoint: "SharePoint import" };

export function LastSyncPanel() {
  const { data } = useQuery<{ runs: SyncRunSummary[] }>({
    queryKey: ["ai-knowledge-sync-runs"],
    queryFn: () => fetchApi("/api/settings/ai-knowledge/sync"),
    retry: 2,
    staleTime: 30_000,
  });
  const runs = data?.runs ?? [];
  if (runs.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-3 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Last sync</h2>
      {runs.map((r) => {
        const conflicts = r.details?.conflicts ?? [];
        const unmapped = r.details?.unmapped ?? [];
        return (
          <div key={r.id} className="text-xs">
            <div className="flex flex-wrap gap-x-3 text-muted">
              <span className="text-foreground font-medium">{LABEL[r.adapter] ?? r.adapter}</span>
              <span>{new Date(r.startedAt).toLocaleString("en-AU")}</span>
              {Object.entries(r.counts ?? {}).map(([k, v]) => <span key={k}>{k} {v}</span>)}
              {r.error && <span className="text-red-700 dark:text-red-300">{r.error}</span>}
            </div>
            {conflicts.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-amber-800 dark:text-amber-200">{conflicts.length} conflicts — fix in SharePoint</summary>
                <ul className="mt-1 space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.normalizedTitle}</span>{c.state ? ` (${c.state})` : ""}{c.version ? ` V${c.version}` : ""}
                      <ul className="ml-3 text-muted">{c.paths.map((p) => <li key={p}>{p}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {unmapped.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-amber-800 dark:text-amber-200">{unmapped.length} unmapped centre folders (excluded)</summary>
                <ul className="mt-1 text-muted">{unmapped.map((u) => <li key={u.path}>{u.centreFolder} — {u.path}</li>)}</ul>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

Render `<LastSyncPanel />` under the toolbar in `page.tsx`.

- [ ] **Step 6: Filters + search**

The page has NO search box today. Above the list add: a text `<input placeholder="Search title or centre…">` bound to `const [q, setQ] = useState("")`, and three `<select>`s (kind / tier / status), all client-side:
```tsx
  const filtered = entries.filter((e) =>
    (statusFilter === "all" || e.status === statusFilter) &&
    (kindFilter === "all" || e.sourceKind === kindFilter) &&
    (tierFilter === "all" || (e.tierOverride ?? e.tier) === tierFilter) &&
    (!q.trim() || `${e.title} ${e.serviceName ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
```
Default `statusFilter = "active"`, others `"all"`. `filtered` feeds the rows and the "Library size" stat block.

- [ ] **Step 7: Verify in the browser**

`npm run dev`, open `/settings/ai-knowledge` as an owner. **Sync from dashboard** → toast with counts, `LastSyncPanel` shows the run. Rows show kind chips. Paste a test entry with tier Safety-critical → amber chip; open it (row click) → modal with body. Change a tier override on a SharePoint/handbook row → chip shows "(override)"; row click on that row does nothing (not editable). Exclude → row dims and disappears under the default filter; status filter "excluded" → visible with "Excluded (admin)"; Restore. Browser console: no errors.

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint "src/app/(dashboard)/settings/ai-knowledge" src/components/settings/ai-knowledge` — Expected: 0 type errors, 0 lint errors (warnings acceptable).

```bash
git add "src/app/(dashboard)/settings/ai-knowledge/page.tsx" src/components/settings/ai-knowledge && git commit -m "feat(knowledge): console over KnowledgeSource — row/modal/last-sync components, sync, override, exclude, reindex

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 22: SharePoint local-export importer

**Files:**
- Create: `src/lib/knowledge/adapters/sharepoint-export.ts`, `scripts/import-sharepoint-knowledge.ts`, `scripts/export-sharepoint-knowledge/README.md`
- Create fixtures: `src/__tests__/fixtures/knowledge-export/…` (seven files, below — six real cases + one audit-folder skip case)
- Test: `src/__tests__/lib/knowledge/adapters/sharepoint-export.test.ts`

**Export file format** (one `.md` per SharePoint document, path mirrors SharePoint):

```
---
id: 01KJARKPZIKJUMSP2DTFALRIYQ3ELYWKER
name: QA2 Rest Time Procedure OSHC V2.docx
webUrl: https://amanaoshcptyltd.sharepoint.com/Shared Documents/NSW & VIC state policies/Procedures/QA2 Rest Time Procedure OSHC V2.docx
path: Shared Documents/NSW & VIC state policies/Procedures/QA2 Rest Time Procedure OSHC V2.docx
lastModified: 2026-02-23T05:24:00.000Z
---
<extracted text>
```

- [ ] **Step 1: Write the fixtures**

Create these files under `src/__tests__/fixtures/knowledge-export/` (frontmatter as above with any plausible `id`/`webUrl`/`lastModified`; bodies as shown):

| Path | Body |
|---|---|
| `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/Procedures/QA2 Rest Time Procedure OSHC V3.docx.md` | `# Rest Time Procedure\n\nVersion 3 text.` |
| `Shared Documents/NSW & VIC state policies/Procedures/QA2 Rest Time Procedure OSHC V2.docx.md` | `# Rest Time Procedure\n\nVersion 2 text.` |
| `Shared Documents/NSW & VIC state policies/Policies/QA2 Bushfire Policy NSW OSHC V11.docx.md` | `# Bushfire Policy NSW\n\nCopy A.` |
| `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/Policies/QA2 Bushfire Policy NSW OSHC V11.docx.md` | `# Bushfire Policy NSW\n\nCopy B — differs.` |
| `Shared Documents/SOPs/Jayden full SOP/6. Centre Operations/OPS-10 Emergency Evacuation Procedures.docx.md` | `# OPS-10 Emergency Evacuation\n\nSteps.` |
| `Melbourne Schools/Amana OSHC - Minaret Doveton/QA3 - Physical Environment/toilet supervision procedure.docx.md` | `# Toilet supervision\n\nNever alone.` |
| `Shared Documents/SOPs/Amana OSHC AUDIT/QA 2- Children_s Health and Safety/evidence.docx.md` | `# Audit evidence\n\nSkip me.` |

- [ ] **Step 2: Write the failing tests**

```ts
// src/__tests__/lib/knowledge/adapters/sharepoint-export.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const upsert = vi.fn(async (i: { externalId: string }) => ({ sourceId: `src-${i.externalId}`, outcome: "created" as const }));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i as { externalId: string }) }));

import { classifyPath, matchServiceByFolder, parseExportFile, importExportDir } from "@/lib/knowledge/adapters/sharepoint-export";

const FIX = path.join(process.cwd(), "src/__tests__/fixtures/knowledge-export");

describe("classifyPath", () => {
  it("maps each tree to category + scope", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/Policies/x.docx")).toEqual({ tree: "reg168", category: "policy", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/NSW & VIC state policies/Procedures/x.docx")).toEqual({ tree: "state", category: "procedure", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/SOPs/Jayden full SOP/6. Centre Operations/OPS-10.docx")).toEqual({ tree: "sop", category: "sop", centreFolder: null, skip: false });
    expect(classifyPath("Melbourne Schools/Amana OSHC - Minaret Doveton/QA3/x.docx")).toEqual({ tree: "centre", category: "procedure", centreFolder: "Amana OSHC - Minaret Doveton", skip: false });
    expect(classifyPath("Shared Documents/SOPs/Amana OSHC AUDIT/QA 2/x.docx").skip).toBe(true);
    expect(classifyPath("Shared Documents/SOPs/Amana HR Management Review Audit/x.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Employment Contract - J Smith.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/WWCC - J Smith.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Contractor Induction Procedure.docx").skip).toBe(false); // \bcontracts?\b, not "contractor"
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/menu.png").skip).toBe(true);
    expect(classifyPath("Random/other.docx").skip).toBe(true);
  });
});

describe("matchServiceByFolder", () => {
  const services = [{ id: "s1", name: "Amana OSHC Minaret Doveton" }, { id: "s2", name: "Amana OSHC Unity Grammar" }];
  it("matches on normalised name containment and returns null otherwise", () => {
    expect(matchServiceByFolder("Amana OSHC - Minaret Doveton", services)).toBe("s1");
    expect(matchServiceByFolder("Minaret Doveton", services)).toBe("s1");
    expect(matchServiceByFolder("Amana OSHC - Somewhere Else", services)).toBeNull();
  });
});

describe("parseExportFile", () => {
  it("reads frontmatter + body", () => {
    const f = parseExportFile("---\nid: 1\nname: A.docx\nwebUrl: https://x/A.docx\npath: P/A.docx\nlastModified: 2026-01-01T00:00:00.000Z\n---\n# A\n\nbody");
    expect(f).toEqual({ id: "1", name: "A.docx", webUrl: "https://x/A.docx", path: "P/A.docx", lastModified: "2026-01-01T00:00:00.000Z", text: "# A\n\nbody" });
  });
});

describe("importExportDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Amana OSHC Minaret Doveton" }]);
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.knowledgeSource.update.mockResolvedValue({});
  });

  it("imports the fixture tree with dedupe, conflict and skip outcomes", async () => {
    const report = await importExportDir(FIX);
    expect(report.counts).toEqual({ imported: 6, unchanged: 0, superseded: 0, conflicts: 1, unmapped: 0, skipped: 1, errors: 0 });
    const inputs = upsert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const rest3 = inputs.find((i) => String(i.title).includes("V3"));
    expect(rest3).toMatchObject({ sourceKind: "sharepoint", category: "procedure", state: null, serviceId: null });
    const sop = inputs.find((i) => String(i.title).startsWith("OPS-10"));
    expect(sop).toMatchObject({ category: "sop" });
    const centre = inputs.find((i) => String(i.title).startsWith("toilet"));
    expect(centre).toMatchObject({ serviceId: "s1", category: "procedure" });
    expect(report.conflicts[0]).toMatchObject({ normalizedTitle: "qa2 bushfire policy", state: "NSW" });
    expect(report.skipped[0].path).toContain("Amana OSHC AUDIT");
  });

  it("flags an unmapped centre folder and excludes its source", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const report = await importExportDir(FIX);
    expect(report.counts.unmapped).toBe(1);
    expect(report.unmapped[0]).toMatchObject({ centreFolder: "Amana OSHC - Minaret Doveton" });
    const excluded = prismaMock.knowledgeSource.update.mock.calls.find((c) => (c[0] as { data: { status?: string } }).data.status === "excluded");
    expect(excluded).toBeTruthy();
    expect((excluded![0] as { data: { excludedBy?: string } }).data.excludedBy).toBe("adapter");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/sharepoint-export.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the adapter**

```ts
// src/lib/knowledge/adapters/sharepoint-export.ts
/**
 * Slice-1 SharePoint ingest from a LOCAL export directory (spec §5.1).
 * The export is produced interactively (see scripts/export-sharepoint-knowledge/README.md);
 * this adapter is pure over the files + Prisma and is reused by the
 * slice-2b Graph sync for classification and centre mapping.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { KnowledgeCategory } from "@prisma/client";
import { upsertKnowledgeSource } from "../pipeline";
import { hashContent, normalizeTitle, parseFilenameMeta, canonicalState } from "../normalize";

export interface PathClass {
  tree: "reg168" | "state" | "sop" | "centre" | null;
  category: KnowledgeCategory;
  centreFolder: string | null;
  skip: boolean;
}

const SKIP_DIRS = [/\/Amana OSHC AUDIT\//i, /Amana HR Management Review Audit/i];
// PII floor from spec §5 plus the staff-compliance scans centre folders hold.
// Word-bounded so "Contractor Induction Procedure" is NOT skipped.
const SKIP_FILES = /\bcontracts?\b|payslip|\bTFN\b|candidate|resume|\bCV\b|\bWWCC\b|passport|\bvisa\b|police\s*check|\.(png|jpe?g|gif|xlsx?|csv|pptx?)$/i;
const CENTRE_ROOTS = ["NSW Schools/", "Melbourne Schools/"];
const REG168_ROOT = "NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/";
const STATE_ROOT = "Shared Documents/NSW & VIC state policies/";
const SOP_ROOT = "Shared Documents/SOPs/Jayden full SOP/";

export function classifyPath(p: string): PathClass {
  const norm = p.replace(/\\/g, "/");
  const skip = (): PathClass => ({ tree: null, category: "guide", centreFolder: null, skip: true });
  if (SKIP_DIRS.some((r) => r.test("/" + norm)) || SKIP_FILES.test(path.basename(norm))) return skip();
  const fileCat = parseFilenameMeta(path.basename(norm)).category;
  // For the two policy libraries the {Policies,Procedures} subfolder is authoritative (spec §5); filename is the fallback.
  const subfolderCat = (root: string): KnowledgeCategory => {
    const seg = norm.slice(root.length).split("/")[0]?.toLowerCase();
    return seg === "policies" ? "policy" : seg === "procedures" ? "procedure" : fileCat;
  };
  if (norm.startsWith(REG168_ROOT)) return { tree: "reg168", category: subfolderCat(REG168_ROOT), centreFolder: null, skip: false };
  if (norm.startsWith(STATE_ROOT)) return { tree: "state", category: subfolderCat(STATE_ROOT), centreFolder: null, skip: false };
  if (norm.startsWith(SOP_ROOT)) return { tree: "sop", category: "sop", centreFolder: null, skip: false };
  for (const root of CENTRE_ROOTS) {
    if (norm.startsWith(root)) {
      const centreFolder = norm.slice(root.length).split("/")[0] ?? null;
      return { tree: "centre", category: fileCat === "policy" ? "policy" : "procedure", centreFolder, skip: false };
    }
  }
  return skip();
}

function nameKey(s: string): string {
  return s.toLowerCase().replace(/amana\s*oshc/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Folder "Amana OSHC - Minaret Doveton" → Service whose normalised name contains / is contained by it. */
export function matchServiceByFolder(folder: string, services: { id: string; name: string }[]): string | null {
  const f = nameKey(folder);
  if (!f) return null;
  const hit = services.find((s) => {
    const n = nameKey(s.name);
    return n && (n === f || n.includes(f) || f.includes(n));
  });
  return hit?.id ?? null;
}

export interface ExportFile {
  id: string; name: string; webUrl: string; path: string; lastModified: string; text: string;
}

export function parseExportFile(raw: string): ExportFile {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Missing frontmatter");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["id", "name", "webUrl", "path", "lastModified"]) {
    if (!meta[k]) throw new Error(`Missing frontmatter key: ${k}`);
  }
  return { id: meta.id, name: meta.name, webUrl: meta.webUrl, path: meta.path, lastModified: meta.lastModified, text: m[2].trim() };
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

export interface ImportReport {
  /** `superseded` is the store-wide total after the run, not a per-run delta. */
  counts: { imported: number; unchanged: number; superseded: number; conflicts: number; unmapped: number; skipped: number; errors: number };
  conflicts: { normalizedTitle: string; state: string | null; version: number | null; paths: string[] }[];
  unmapped: { path: string; centreFolder: string }[];
  skipped: { path: string; reason: string }[];
  errors: { path: string; error: string }[];
}

export async function importExportDir(dir: string): Promise<ImportReport> {
  const report: ImportReport = {
    counts: { imported: 0, unchanged: 0, superseded: 0, conflicts: 0, unmapped: 0, skipped: 0, errors: 0 },
    conflicts: [], unmapped: [], skipped: [], errors: [],
  };
  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  const files = await walk(dir);

  // conflict detection: same (normalizedTitle,state,serviceId,version) with different content
  const seen = new Map<string, { hash: string; paths: string[] }>();

  for (const full of files) {
    const rel = path.relative(dir, full).replace(/\.md$/, "");
    try {
      const f = parseExportFile(await fs.readFile(full, "utf8"));
      const cls = classifyPath(f.path || rel);
      if (cls.skip) { report.skipped.push({ path: f.path, reason: "skip rule" }); report.counts.skipped++; continue; }

      let serviceId: string | null = null;
      let unmapped = false;
      if (cls.tree === "centre" && cls.centreFolder) {
        serviceId = matchServiceByFolder(cls.centreFolder, services);
        if (!serviceId) { unmapped = true; report.unmapped.push({ path: f.path, centreFolder: cls.centreFolder }); report.counts.unmapped++; }
      }

      const meta = parseFilenameMeta(f.name);
      const state = canonicalState(meta.state);
      const key = `${normalizeTitle(f.name)}|${state ?? ""}|${serviceId ?? ""}|${meta.version ?? ""}`;
      const hash = hashContent(f.text);
      const prev = seen.get(key);
      if (prev && prev.hash !== hash) {
        prev.paths.push(f.path);
        report.conflicts.push({ normalizedTitle: normalizeTitle(f.name), state, version: meta.version, paths: [...prev.paths] });
        report.counts.conflicts++;
      } else if (!prev) {
        seen.set(key, { hash, paths: [f.path] });
      }

      const res = await upsertKnowledgeSource({
        sourceKind: "sharepoint",
        externalId: f.id,
        title: f.name,
        category: cls.category,
        text: f.text,
        externalUrl: f.webUrl,
        serviceId,
        state,
        qualityArea: meta.qualityArea,
        version: meta.version,
      });
      if (res.outcome === "error") { report.errors.push({ path: f.path, error: res.error ?? "unknown" }); report.counts.errors++; continue; }
      if (unmapped) {
        // "adapter", so the pipeline self-heals: once a Service exists that
        // matches the folder, the next import re-activates the row; while it
        // is still unmapped, this branch re-excludes it on every run.
        await prisma.knowledgeSource.update({ where: { id: res.sourceId }, data: { status: "excluded", excludedBy: "adapter" } });
      }
      if (res.outcome === "unchanged") report.counts.unchanged++; else report.counts.imported++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Knowledge: export import failed for file", { file: rel, error });
      report.errors.push({ path: rel, error }); report.counts.errors++;
    }
  }

  // Total superseded SharePoint sources after this run (not "this run only" —
  // supersession happens inside upsertKnowledgeSource per key; the V2-vs-V3
  // and unchanged-hash behaviours are covered by the pipeline tests).
  const superseded = await prisma.knowledgeSource.findMany({ where: { sourceKind: "sharepoint", status: "superseded" }, select: { id: true } });
  report.counts.superseded = superseded.length;
  return report;
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/__tests__/lib/knowledge/adapters/sharepoint-export.test.ts`
Expected: PASS (5 tests). If the fixture `path` frontmatter and the on-disk path disagree, `classifyPath` uses the frontmatter `path` — keep them identical.

- [ ] **Step 6: Write the script**

```ts
// scripts/import-sharepoint-knowledge.ts
/**
 * Import a local SharePoint export into the Amana AI knowledge store.
 *
 *   npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export [--dry]
 *
 * `--env-file` (not dotenv in-file) because ESM hoists imports: src/lib/prisma
 * and src/lib/env evaluate before any config() call could run. Targets
 * DATABASE_URL. For production, export PROD_DATABASE_URL explicitly (see
 * .env.example) — nothing here touches prod by default. Writes one
 * KnowledgeSyncRun (adapter "sharepoint") with the full report.
 *
 * Top-level imports are relative; src/lib/prisma itself imports via `@/`,
 * so tsx's tsconfig-paths resolution is still load-bearing (verified by the
 * fixture dry run in the plan).
 */
import { prisma } from "../src/lib/prisma";
import { importExportDir } from "../src/lib/knowledge/adapters/sharepoint-export";

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf("--from");
  const dir = fromIdx >= 0 ? args[fromIdx + 1] : "./knowledge-export";
  const dry = args.includes("--dry");
  const url = process.env.DATABASE_URL ?? "";
  const isProd = url.includes("ep-green-breeze-angq0yoa");
  console.log(`Importing from ${dir} into ${isProd ? "PRODUCTION" : "local/dev"} database${dry ? " (dry run)" : ""}`);
  if (isProd && process.env.ALLOW_PROD_DB !== "yes") {
    console.error("Refusing to write to production without ALLOW_PROD_DB=yes");
    process.exit(2);
  }
  if (dry) {
    // Dry run: classification only, no DB writes
    const { classifyPath } = await import("../src/lib/knowledge/adapters/sharepoint-export");
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) out.push(...(await walk(f))); else if (e.name.endsWith(".md")) out.push(f);
      }
      return out;
    };
    const files = await walk(dir);
    const tally: Record<string, number> = {};
    for (const f of files) {
      const c = classifyPath(path.relative(dir, f).replace(/\.md$/, ""));
      const k = c.skip ? "skip" : `${c.tree}/${c.category}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    console.table(tally);
    return;
  }
  const run = await prisma.knowledgeSyncRun.create({ data: { adapter: "sharepoint", counts: {}, details: {} } });
  const report = await importExportDir(dir);
  await prisma.knowledgeSyncRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), counts: report.counts, details: { conflicts: report.conflicts, unmapped: report.unmapped, skipped: report.skipped, errors: report.errors } },
  });
  console.table(report.counts);
  if (report.conflicts.length) console.log("CONFLICTS (fix in SharePoint):", JSON.stringify(report.conflicts, null, 2));
  if (report.unmapped.length) console.log("UNMAPPED centre folders:", JSON.stringify(report.unmapped, null, 2));
  if (report.errors.length) console.log("ERRORS:", JSON.stringify(report.errors, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
```

`console.*` is acceptable in `scripts/` (not production code).

- [ ] **Step 7: Write the export README** (outer fence is `~~~` because the README itself contains ``` fences)

~~~md
# SharePoint knowledge export

The slice-1 importer reads a LOCAL directory of `.md` files, one per SharePoint document,
because the repo has no app-only Graph access yet (spec §5.1/§5.2).

## Producing the export (interactive, via the SharePoint connector in a Claude session)

1. For each tree below, list documents with `sharepoint_search` (paginate with `offset`) and,
   for `.docx`/`.pdf` results, fetch the extracted text with `read_resource` on the result `uri`.
2. Write `knowledge-export/<path>.md` where `<path>` is the SharePoint path after the site root,
   e.g. `Shared Documents/NSW & VIC state policies/Procedures/QA2 Rest Time Procedure OSHC V2.docx.md`.
3. Frontmatter (all five keys required):
   ```
   ---
   id: <SharePoint item id>
   name: <file name>
   webUrl: <result webUrl>
   path: <path after site root>
   lastModified: <ISO>
   ---
   ```
   followed by the extracted text.

Trees to export:
- `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/{Policies,Procedures}`
- `Shared Documents/NSW & VIC state policies/{Policies,Procedures}`
- `Shared Documents/SOPs/Jayden full SOP/**`
- `NSW Schools/<centre>/**` and `Melbourne Schools/<centre>/**` (centre-specific procedures)

Skip: `Shared Documents/SOPs/Amana OSHC AUDIT/**`, `Amana HR Management Review Audit/**`,
anything named contract / payslip / TFN / candidate / resume / CV / WWCC / passport / visa /
police check, images, spreadsheets. The importer re-applies these rules (`SKIP_DIRS` /
`SKIP_FILES` in `sharepoint-export.ts`), so an over-inclusive export is safe.

## Importing

```bash
npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export --dry   # classification tally only
npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export         # local dev DB
```

Production (explicit opt-in, per CLAUDE.md). ONE command, so the prod URL is scoped to
that process and never lingers in the shell for the next `npx prisma …` (the 2026-07-07
wipe and the 2026-08-31 P3009 were both "prod URL still loaded"):
```bash
DATABASE_URL="$(grep '^PROD_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" ALLOW_PROD_DB=yes npx tsx scripts/import-sharepoint-knowledge.ts --from ./knowledge-export
```

Re-runs are idempotent: unchanged content is a no-op; a new `V<n>` supersedes the old one;
same-version-different-content shows up under CONFLICTS for Daniel to resolve in SharePoint
(also visible in Settings → AI knowledge → Last sync). `superseded` in the counts is the
store-wide total, not this run's delta.
~~~

- [ ] **Step 8: Dry-run the script against the fixture dir**

Run: `npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from src/__tests__/fixtures/knowledge-export --dry`
Expected: a table with `reg168/procedure 1`, `state/procedure 1`, `state/policy 1`, `reg168/policy 1`, `sop/sop 1`, `centre/procedure 1`, `skip 1`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/knowledge/adapters/sharepoint-export.ts scripts/import-sharepoint-knowledge.ts scripts/export-sharepoint-knowledge src/__tests__/fixtures/knowledge-export src/__tests__/lib/knowledge/adapters/sharepoint-export.test.ts && git commit -m "feat(knowledge): SharePoint local-export importer (classify, centre map, dedupe, conflicts)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 23: Monthly regulator cron (+ confirm the AI-usage null bucket from Task 7)

**Files:**
- Create: `src/app/api/cron/knowledge-regulator-refresh/route.ts`
- Modify: `vercel.json`
- Test: `src/__tests__/api/cron/knowledge-regulator-refresh.test.ts` (the usage route + its test were done in Task 7)

- [ ] **Step 1: Write the failing cron test**

```ts
// src/__tests__/api/cron/knowledge-regulator-refresh.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest } from "../../helpers/request";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
import { NextResponse } from "next/server";
const complete = vi.fn(); const fail = vi.fn();
const acquire = vi.fn(async () => ({ acquired: true, complete, fail }));
vi.mock("@/lib/cron-guard", () => ({
  // Real contract: null = authorised, { error: NextResponse } = rejected.
  verifyCronSecret: (req: Request) =>
    req.headers.get("authorization") === "Bearer secret"
      ? null
      : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  acquireCronLock: (...a: unknown[]) => acquire(...a),
}));
const runAdapter = vi.fn(async () => ({ id: "run1", counts: { created: 2 }, error: null }));
vi.mock("@/lib/knowledge/sync", () => ({ runAdapter: (...a: unknown[]) => runAdapter(...a) }));
import { GET } from "@/app/api/cron/knowledge-regulator-refresh/route";

describe("GET /api/cron/knowledge-regulator-refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquire.mockImplementation(async () => ({ acquired: true, complete, fail }));
  });
  it("401 without the cron secret", async () => {
    expect((await GET(createRequest("GET", "/x"))).status).toBe(401);
  });
  it("skips when the lock is held", async () => {
    acquire.mockImplementation(async () => ({ acquired: false, reason: "held", complete, fail }));
    const res = await GET(createRequest("GET", "/x", { headers: { authorization: "Bearer secret" } }));
    expect((await res.json()).skipped).toBe(true);
    expect(runAdapter).not.toHaveBeenCalled();
  });
  it("runs the regulator adapter under a monthly lock", async () => {
    const res = await GET(createRequest("GET", "/x", { headers: { authorization: "Bearer secret" } }));
    expect(acquire).toHaveBeenCalledWith("knowledge-regulator-refresh", "monthly");
    expect(runAdapter).toHaveBeenCalledWith("regulator", null);
    expect((await res.json()).runId).toBe("run1");
    expect(complete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement the cron**

```ts
// src/app/api/cron/knowledge-regulator-refresh/route.ts
import { NextResponse } from "next/server";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runAdapter } from "@/lib/knowledge/sync";

export const maxDuration = 300;

/** Monthly: re-fetch curated regulator pages; unchanged hashes are no-ops. */
export const GET = withApiHandler(async (req) => {
  // verifyCronSecret returns null when authorised, { error } otherwise
  // (same as every other cron — see email-janitor/route.ts:47).
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("knowledge-regulator-refresh", "monthly");
  if (!guard.acquired) return NextResponse.json({ skipped: true, reason: guard.reason });
  try {
    const run = await runAdapter("regulator", null);
    await guard.complete({ runId: run.id, counts: run.counts });
    return NextResponse.json({ runId: run.id, counts: run.counts, error: run.error });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
```

`CronGuard.complete(details?: Record<string, unknown>)` and `fail(error: unknown)` — matches `src/lib/cron-guard.ts:34–36`.

- [ ] **Step 3: Schedule it**

In `vercel.json` `crons`, add next to the other `"0 19 1 * *"` entry:
```json
    { "path": "/api/cron/knowledge-regulator-refresh", "schedule": "30 19 1 * *" }
```

- [ ] **Step 4: Usage-route test** (already created in Task 7 Step 5 with this exact case — if it exists and passes, skip to Step 6)

```ts
// src/__tests__/api/ai-usage.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
import { GET } from "@/app/api/ai/usage/route";

describe("GET /api/ai/usage", () => {
  beforeEach(() => { _clearUserActiveCache(); prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" }); });
  it("buckets null-user rows under System", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.aiUsage.findMany.mockResolvedValue([
      { userId: null, user: null, templateSlug: null, model: "voyage-3", inputTokens: 10, outputTokens: 0, durationMs: 0, section: "knowledge-index", createdAt: new Date() },
      // legacy sentinel written by ai-task-agent.ts — must share the System bucket
      { userId: "system", user: { id: "system", name: "System Agent" }, templateSlug: "t", model: "claude", inputTokens: 1, outputTokens: 1, durationMs: 1, section: "agent", createdAt: new Date() },
      { userId: "u", user: { id: "u", name: "O" }, templateSlug: "x", model: "claude", inputTokens: 5, outputTokens: 5, durationMs: 1, section: "marketing", createdAt: new Date() },
    ]);
    const res = await GET(createRequest("GET", "/api/ai/usage?days=30"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.byUser.system).toMatchObject({ name: "System", calls: 2 });
    expect(json.byUser.u).toMatchObject({ name: "O", calls: 1 });
  });
});
```

- [ ] **Step 5: Usage route** — already fixed in Task 7 Step 5 (`r.user?.id ?? "system"`, `r.user?.name ?? "System"`). Confirm with `grep -n "user?\." src/app/api/ai/usage/route.ts`; nothing else to do.

- [ ] **Step 6: Run both tests**

Run: `npx vitest run src/__tests__/api/cron/knowledge-regulator-refresh.test.ts src/__tests__/api/ai-usage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/knowledge-regulator-refresh vercel.json src/__tests__/api/cron && git commit -m "feat(knowledge): monthly regulator refresh cron

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**End of Chunk 5.** The console, the importer and the cron exist; the store can be filled from every origin.

---

## Chunk 6: Guards, docs, verification, first prod run

### Task 24: Guard tests + CLAUDE.md

**Files:**
- Create: `src/__tests__/lib/knowledge-guard.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the guard test (it should pass immediately — it locks the invariants)**

```ts
// src/__tests__/lib/knowledge-guard.test.ts
/**
 * Invariants from the Amana AI spec §3.1/§3.2: the knowledge store is fed
 * only by adapters, never by Document rows; the old unscoped routes are gone.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

const ROOT = process.cwd();
const GUARDED = ["src/lib/knowledge", "src/app/api/settings/ai-knowledge", "src/lib/embeddings.ts"];

describe("knowledge store guard", () => {
  it("no guarded module touches Document/DocumentChunk", () => {
    for (const rel of GUARDED) {
      const abs = path.join(ROOT, rel);
      const files = statSync(abs).isDirectory() ? walk(abs) : [abs];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        expect(src, f).not.toMatch(/prisma\.document\b/);
        expect(src, f).not.toMatch(/prisma\.documentChunk\b/);
        expect(src, f).not.toMatch(/tx\.documentChunk\b/);
      }
    }
  });

  it("the old unscoped knowledge routes no longer exist", () => {
    expect(existsSync(path.join(ROOT, "src/app/api/knowledge"))).toBe(false);
    for (const r of ["reindex", "backfill", "dedupe"]) {
      expect(existsSync(path.join(ROOT, `src/app/api/settings/ai-knowledge/${r}`))).toBe(false);
    }
  });

  it("document-indexer no longer exports storage/search", async () => {
    const mod = await import("@/lib/document-indexer");
    for (const name of ["searchChunks", "indexDocument", "indexTextContent", "formatChunksForPrompt"]) {
      expect((mod as Record<string, unknown>)[name], name).toBeUndefined();
    }
  });

  it("the assistant tool list has no search_knowledge_base", async () => {
    const { ASSISTANT_TOOLS } = await import("@/lib/ai-tools");
    expect(ASSISTANT_TOOLS.map((t) => t.name)).not.toContain("search_knowledge_base");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/__tests__/lib/knowledge-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Add the CLAUDE.md section** (after "## File Uploads")

```md
## Amana AI knowledge store (2026-09-27)
- **Opt-in by adapter.** `KnowledgeSource`/`KnowledgeChunk` are written ONLY by `src/lib/knowledge/pipeline.ts`, fed by `src/lib/knowledge/adapters/*` (`sharepoint`, `policy_upload`, `help_article`, `handbook`, `lms_module`, `centre_facts`, `regulator`, `manual`). There is deliberately NO path from a `Document` row into the store — the HR file cabinet (233 contracts) must never be indexable. `src/__tests__/lib/knowledge-guard.test.ts` enforces it; the old `/api/knowledge/*` routes and `searchChunks` are gone.
- **Scope is SQL.** `searchKnowledge(query, scope)` takes `buildKnowledgeScope(session)` (`getCentreScope` + canonical state) and filters `serviceId`/`state`/`audienceRoles`/`status='active'` in the `WHERE` — the model never sees scope parameters. Hybrid tsvector ⊕ pgvector (Voyage `voyage-3`, `VOYAGE_API_KEY`; unset = tsvector-only), RRF-fused. `fusedScore` orders; `cosineDistance`/`tsRank` are the relevance signals (slice 2 thresholds use those, never RRF).
- **Dedupe key** is `(normalizedTitle, state, serviceId)`; highest `version` wins, `policy_upload` > `manual` > `sharepoint`; losers are `superseded`. Same-version-different-content = a CONFLICT in the sync report for Daniel to fix in SharePoint, never auto-picked.
- **Triggers** fire swallow-and-log after the primary write: policies create/version/archive, service content PATCH (`staffNotes` is the staff-only centre fact sheet), handbook/Amana Way PATCH, help-centre seed, LMS course PATCH + module create/update/delete. `POST /api/settings/ai-knowledge/sync { adapter: backfill | regulator }` re-runs the DB-backed ones; SharePoint comes from a LOCAL export (`scripts/export-sharepoint-knowledge/README.md` + `scripts/import-sharepoint-knowledge.ts`) until Graph app-only consent lands (slice 2b).
- **Regulator adapter reality check (2026-09-26 probe)**: ACECQA pages are behind a Cloudflare JS challenge — never in `REGULATOR_SOURCES`; load ACECQA PDFs via manual upload. Some .gov.au sites reset connections for unknown bot User-Agents, so the adapter sends a browser-like UA and follows ≤2 redirects only within the allow-list. The console's Last-sync panel shows per-source fetch errors; a URL that 301s to a new slug needs updating in the list, not "fixing" in code.
- **Chat route**: `buildDashboardContext()` (financials/pipeline) is admin-only — it used to reach every role. Tool is `search_knowledge`; `executeToolCall(name, input, { scope })`.
- **Migration noise (expected)**: `prisma migrate diff` always proposes dropping `KnowledgeChunk_embedding_idx` (HNSW) and `KnowledgeChunk_searchVector_idx` (GIN) — Prisma can't express non-btree indexes on `Unsupported` columns, same precedent as `DocumentChunk_searchVector_idx`. Never "fix" that diff. The local dev DB (`db push`) doesn't get those two indexes either; create them by hand from the migration if you need vector search locally (the `vector(1024)` typmod too — `db push` makes a dimensionless `vector` column that HNSW refuses).
- **Spec + plans**: `docs/superpowers/specs/2026-09-26-amana-ai-second-brain-design.md`, `docs/superpowers/plans/2026-09-26-amana-ai-slice-1-*.md`.
```

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/lib/knowledge-guard.test.ts CLAUDE.md && git commit -m "test(knowledge): store invariants guard; document the knowledge store in CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 25: Full verification + PR

- [ ] **Step 1: Full checks**

Run, in order, and paste the tail of each into the PR description:
```bash
npm run lint
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
```
Expected: 0 lint errors; 0 type errors; all tests pass — baseline on `origin/main` (f380e3db, 2026-09-26) was **669 files / 7,110 passed / 3 skipped**; expect ≈ 7,110 − (deleted `knowledge.test.ts` + indexer storage cases) + ~55 new; build succeeds.

- [ ] **Step 2: Local end-to-end smoke**

`npm run dev` → as owner: `/settings/ai-knowledge` → **Sync from dashboard** → rows for the three handbooks, help articles, every active service's centre facts, published LMS modules, current policy PDFs. Open the chat widget → ask *"who is the coordinator at <a centre>?"* → answer cites `<centre> — centre facts`. Log in as a `staff` user at a different centre → same question → the bot does not find that centre's facts (scope). Ask *"what's our policy on medication?"* as staff → no financial figures anywhere in the reply.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/amana-ai-slice-1
gh pr create --title "Amana AI slice 1 — opt-in knowledge store, scoped hybrid search, adapters, leak fixes" --body-file - <<'EOF'
## Summary
- New `KnowledgeSource`/`KnowledgeChunk` store (pgvector + tsvector), fed only by adapters — no path from `Document` (contracts) into the AI.
- `searchKnowledge` with session-derived scope enforced in SQL; RRF-fused hybrid retrieval; Voyage embeddings with tsvector fallback.
- Adapters: handbook, help articles, policy PDFs, centre facts (`staffNotes`), LMS reading modules, regulator refs, manual, backfill; SharePoint via local export + importer with dedupe/conflict/unmapped reporting.
- Retired `/api/knowledge/*` (incl. the unscoped all-roles `ask`), `indexDocument`, `searchChunks`; `buildDashboardContext()` is now admin-only in the chat route.
- Knowledge console: kind/tier/status, sync, tier override, exclude, reindex. Monthly regulator cron.

Spec: docs/superpowers/specs/2026-09-26-amana-ai-second-brain-design.md · Plan: docs/superpowers/plans/2026-09-26-amana-ai-slice-1-content-and-safety.md

## Verification
<paste lint / tsc / test / build tails>
pgvector on Neon dev branch: <version>

## Deploy notes
- Set `VOYAGE_API_KEY` in Vercel before merge (or accept tsvector-only until set, then `Re-index` from the console).
- After deploy: Settings → AI knowledge → **Sync from dashboard**, then run the SharePoint import against prod (Task 26).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

### Task 26: Operational — produce the SharePoint export and import to production

This task is run by Jayden with Claude in an interactive session (the connector is session-bound); it is not automatable from CI.

- [ ] **Step 1: Export** — follow `scripts/export-sharepoint-knowledge/README.md` for the four trees. Expect ~600 files; the audit and HR folders are skipped by the importer even if exported.

- [ ] **Step 2: Dry run** — `npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export --dry`; sanity-check the tally (no `skip` count that looks like a whole tree; centre folders present).

- [ ] **Step 3: Import to the local dev DB first** — run without `--dry`; open `/settings/ai-knowledge`, check the conflict and unmapped lists, ask the bot two policy questions and one centre-specific question.

- [ ] **Step 4: Import to production** — the single-command form in the README (prod URL scoped to one process, `ALLOW_PROD_DB=yes`). Paste the counts table and the CONFLICTS / UNMAPPED lists into the PR (or a follow-up issue for Daniel).

- [ ] **Step 5: Hand Daniel the conflict list** — each entry is a SharePoint title where two copies share a version number but differ; he resolves in SharePoint, and the next import (re-run the export for those files) picks up the fix.

**End of Chunk 6 — end of slice 1.** Slice 2 (retrieval policy, modes, citations UI, admin "test a question") and slice 3 (educator tools, phone UI) get their own plans.
