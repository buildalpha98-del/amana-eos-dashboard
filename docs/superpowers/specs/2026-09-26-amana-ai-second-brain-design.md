# Amana AI — Operations Second Brain — Design

**Date:** 2026-09-26
**Status:** Spec review ✅ approved (round 3, 2026-09-26); awaiting Jayden's read before planning
**Audience order:** educators on the floor first, then coordinators
**Destination:** C (agent platform with write actions). **Road:** B (retrieval rebuild + educator read tools), built so nothing is undone on the way to C.

---

## 1. Problem

Amana AI already exists: `FloatingChatWidget` → `POST /api/assistant/chat`, a tool-calling assistant over a keyword-searched knowledge base (`Document`/`DocumentChunk`, Postgres tsvector). It answers from three seeded docs (Amana Way, Employee Handbook scaffold, Proven Process — 68 chunks), a curated regulator-site fetch, and — for admin roles only — six live lookups.

For an educator on a phone mid-session it fails in four ways:

1. **Content.** The QA1–QA7 policy and procedure library, the company-wide SOPs, OWNA/Employment Hero how-tos, centre-specific facts, and the regulator references are not in the knowledge base. The handbook seed still contains `[FILL IN YOUR SPECIFICS]`.
2. **Recall.** Keyword search cannot bridge "a kid threw up" → *QA2 Illness Management Procedure*. The prompt compensates by instructing three synonym searches.
3. **Safety of the store.** `searchChunks` joins every `DocumentChunk` with no scoping. The `Document` table holds 233 employment contracts that are unindexed only because nobody has run `POST /api/knowledge/reindex`. Centre-specific documents have no way to be scoped to that centre's staff. NSW-only documents reach VIC staff. A second, all-roles assistant (`POST /api/knowledge/ask`) reads the same unscoped store.
4. **Leak + no live data for staff.** `buildDashboardContext()` (current-month revenue/profit by centre, CRM pipeline) is injected into the system prompt for **every role** (`src/app/api/assistant/chat/route.ts:83`). Meanwhile non-admin staff get zero live-data tools — the bot cannot tell an educator when their next shift is.

## 2. Decisions made in brainstorming

| Decision | Choice |
|---|---|
| First audience | Educators on the floor (phone, mid-session); coordinators second |
| Answer policy | **Tiered**: strict Amana-sourced-only for safety-critical topics; Amana-first with a labelled general-knowledge fallback for everything else |
| Content supply | **Both**: bulk import of SharePoint text now; `/policies` PDF uploads supersede the text of the same title as Daniel loads them |
| Canonical SharePoint tree | **Neither yet**: ingest all trees, dedupe by normalised title keeping the highest `V<n>`, flag conflicts for Daniel to resolve in SharePoint |
| "Jayden full SOP" | Company-wide operational SOPs — first-class source, category `sop`, distinct from official `policy`/`procedure` |
| Scope | B now (slices 1–3), C next (slice 4+), designed on one scaffold |

## 3. Architecture

### 3.1 Knowledge store — opt-in by adapter

A new store replaces "index whatever is in `Document`". Nothing enters it except through a named adapter; there is no path from an arbitrary `Document` row into it.

```prisma
enum KnowledgeSourceKind { sharepoint policy_upload help_article handbook lms_module centre_facts regulator manual }
enum KnowledgeCategory   { policy procedure sop guide reference centre }
enum KnowledgeTier       { safety_critical general }
enum KnowledgeStatus     { active superseded excluded }

model KnowledgeSource {
  id              String              @id @default(cuid())
  title           String
  normalizedTitle String              // lowercased, "V<n>"/"NSW"/"VIC"/"OSHC" tokens and punctuation stripped
  sourceKind      KnowledgeSourceKind
  category        KnowledgeCategory
  tier            KnowledgeTier       @default(general)
  tierOverride    KnowledgeTier?      // admin override wins over the import heuristic
  qualityArea     Int?                // 1–7, parsed from "QA<n>"
  serviceId       String?             // null = org-wide
  service         Service?            @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  state           String?             // canonical abbreviation ("NSW", "VIC") or null = all states
  audienceRoles   String[]            @default([])  // help_article only; [] = every role
  version         Int?                // parsed "V13" / PolicyDocumentVersion.versionNumber
  externalId      String              // SharePoint item id | PolicyDocumentVersion.id | article id | `service:<id>` | URL | manual upload id
  externalUrl     String?             // citation target
  contentHash     String
  status          KnowledgeStatus     @default(active)
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
  embedding    Unsupported("vector(1024)")?
  createdAt    DateTime                     @default(now())

  @@unique([sourceId, chunkIndex])
}

model KnowledgeSyncRun {
  id          String    @id @default(cuid())
  adapter     String    // "sharepoint" | "regulator" | "backfill"
  startedById String?   // null for cron
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  cursor      String?   // resumable position (see §5)
  counts      Json      // { imported, unchanged, superseded, conflicts, unmapped, errors }
  details     Json      // per-item report rows
  error       String?

  @@index([adapter, startedAt])
}

model AssistantTurn {
  id         String   @id @default(cuid())
  userId     String
  serviceId  String?
  mode       String   // "strict" | "refuse" | "general"
  message    String   @db.Text
  chunkIds   String[] // retrieved KnowledgeChunk ids (pre-retrieval + tool searches)
  toolCalls  Json     // [{ name, args, durationMs, resultBytes, resultId? }]
  inputTokens  Int
  outputTokens Int
  createdAt  DateTime @default(now())

  @@index([userId, createdAt])
  @@index([createdAt])
}
```

`AssistantTurn` rows are pruned after 90 days by the existing `email-janitor`-style daily cron (`knowledge-janitor`). `AiUsage.userId` becomes nullable so cron/script embedding runs can log cost without a user (`section: "knowledge-index"`); `GET /api/ai/usage` (Settings usage dashboard) groups by user and must render null-user rows under a "System" bucket — verified by a new route test (`src/__tests__/api/ai-usage.test.ts`) before the migration lands.

Migration (hand-written SQL in the Prisma migration): `CREATE EXTENSION IF NOT EXISTS vector`; GIN index on `searchVector`; HNSW index on `embedding` (`vector_cosine_ops`). **`searchVector` is set explicitly by the indexing pipeline** (`UPDATE … SET "searchVector" = to_tsvector('english', content)`) — the same approach `document-indexer.ts` uses today; there is no trigger.

**Why not extend `Document`/`DocumentChunk`:** `Document` is the HR file cabinet and will always hold contracts and certificates. Indexing must be opt-in by source kind, not opt-out by luck.

### 3.2 Retiring the old store (slice 1, explicit list)

| Today | Fate |
|---|---|
| `POST /api/knowledge/reindex`, `POST /api/knowledge/index`, `GET /api/knowledge/status` | **Deleted** |
| `POST /api/knowledge/ask` (second all-roles assistant, unscoped) | **Deleted** — the chat route is the only assistant |
| `searchChunks` / `formatChunksForPrompt` / `indexDocument` / `indexTextContent` in `document-indexer.ts` | **Deleted**; `extractText`/`extractTextFromBuffer` stay (used by contracts + the new adapters) |
| `indexDocument` callers in `api/documents/*` and `audits/[id]/document` | **Removed** — general documents are no longer indexed |
| `/api/settings/ai-knowledge` root (`GET` list, `POST` paste-create), `/upload`, `/register`, `/[id]`, `/seed` | **Kept, re-pointed**: the root `GET` lists `KnowledgeSource`; root `POST` (paste) and `/upload` + `/register` write `sourceKind: manual`; `/seed` becomes a `backfill` trigger — none touch `Document` or `indexTextContent` |
| `/api/settings/ai-knowledge/reindex`, `/backfill`, `/dedupe` | **Replaced** by `/api/settings/ai-knowledge/sync` (runs an adapter → `KnowledgeSyncRun`) and `/[id]/reindex` |
| `Document.indexed/indexedAt/indexError`, `DocumentChunk` | Left in place with **no writers** in slice 1; dropped in a later cleanup migration once prod is verified |
| `ASSISTANT_TOOLS.search_knowledge_base` | Renamed `search_knowledge`, backed by `searchKnowledge()` |

Guard test: no module under `src/lib/knowledge/` or `src/app/api/settings/ai-knowledge/` imports `prisma.document` / `prisma.documentChunk`.

### 3.3 Adapters

Each adapter is idempotent, keyed on `(sourceKind, externalId)`, and shares one pipeline in `src/lib/knowledge/index.ts`: `upsertKnowledgeSource(input)` → skip if `contentHash` unchanged → `chunk` (existing heading-aware splitter, 500-token chunks, 50 overlap) → `embed` → replace chunks in a transaction → `indexedAt`.

| Adapter | Trigger | Notes |
|---|---|---|
| `sharepoint` | Slice 1: local export (§5.1). Slice 2b: Graph app-only sync (§5.2) | |
| `policy_upload` | Hook in the `/policies` version-publish path (`POST /api/policies/[id]/versions` and initial create) | Extract PDF text via `extractTextFromBuffer`. Supersedes a `sharepoint` source with the same `(normalizedTitle, state: null, serviceId: null)`; state-specific SharePoint variants stay active because `PolicyDocument` has no state |
| `help_article` | `POST /api/knowledge-base/seed` (the only write path — articles have no CRUD) + the `backfill` adapter at boot | `published` only; `audienceRoles` copied onto the source |
| `handbook` | `PATCH /api/amana-handbook/content` and `/api/amana-way/content` + `backfill` from the hardcoded defaults | Replaces `KNOWLEDGE_SEEDS`; the seed route becomes a `backfill` trigger |
| `lms_module` | (a) `LMSModule` save when the parent course is `status: published`; (b) `PATCH /api/lms/courses/[id]` when `status` transitions **to** `published` → index every reading module of that course; transitions to `draft`/`archived` → mark those sources `excluded` | Reading modules only; quiz questions/answers are never indexed. (b) covers the normal authoring order (draft course → write modules → publish) |
| `centre_facts` | `PATCH /api/services/[id]/content` (the existing `Service.content` route) | Renders selected `serviceContentSchema` fields to Markdown: `contacts`, `dailyRoutine`, `foodProvider`, `locationWithinSchool`, `meetingPoints`, `parentOnboarding`, plus a **new `staffNotes` field** (string, max 4000, coordinator-editable, labelled "Staff-only notes — gate/alarm, evacuation point, key contacts"). `serviceId` set; `category: centre`. Parent-facing fields (`about`, `tagline`, `heroImage`, `enrolmentThankYou`) are not indexed |
| `regulator` | Curated list in `src/lib/knowledge/regulator-sources.ts` + monthly cron `knowledge-regulator-refresh` | NQS, National Regulations guide, MTOP v2.0, *Staying Healthy* exclusion table, Children's Services Award summary, ASCIA action-plan guidance, NSW/VIC regulator pages. Fetch + `extractTextFromBuffer`. Distinct from the existing `regulatory-monitor` cron (which AI-scans for *changes* and files a report); this adapter indexes the *reference text* |
| `manual` | Root `POST /api/settings/ai-knowledge` (paste) + `/upload` + `/register` (existing admin upload/paste UI) | Admin sets category/tier/service/state in the form |
| `backfill` | `POST /api/settings/ai-knowledge/sync { adapter: "backfill" }` + once at first deploy | Sweeps `KnowledgeBaseArticle`, handbook defaults, published `LMSModule`s, every `Service.content`, and current `PolicyDocumentVersion`s |

Embedding: Voyage `voyage-3` (1024-dim) via `src/lib/embeddings.ts` — batches of 128, retry with backoff, cost logged to `AiUsage` (`userId: null`, `section: "knowledge-index"`). Env: `VOYAGE_API_KEY`. `contentHash` unchanged → no re-chunk, no re-embed.

### 3.4 Retrieval

`searchKnowledge(query, scope, limit = 8)` in `src/lib/knowledge/search.ts`:

1. Embed the query (one Voyage call). On failure, log and continue tsvector-only — the bot never goes dark for a vendor hiccup.
2. Run two SQL queries in parallel over `KnowledgeChunk` ⋈ `KnowledgeSource`:
   - tsvector: `plainto_tsquery` first, `websearch_to_tsquery` fallback (existing behaviour).
   - pgvector: `embedding <=> $queryVec` cosine, top 20.
3. Reciprocal-rank fusion (k = 60), top `limit`. Each result carries `fusedScore` (ordering only), plus the underlying **relevance** signals — `cosineDistance` (from the vector leg, null if absent) and `tsRank` (from the tsvector leg, null if absent) — `tier`, `sourceId`, `externalUrl`.

**Scope is a SQL `WHERE`, not a prompt instruction.** `scope = { role, serviceIds: string[] | null, state: string | null }` is built by `buildKnowledgeScope(session)`:

- `serviceIds` = `getCentreScope(session)` (`src/lib/centre-scope.ts`): `null` for owner/admin/EOS roles (unscoped); head_office → every centre in `User.state` + memberships; member/staff → primary service + manager-of + memberships. **`serviceScopeFilter()` is not used** — it is deliberately primary-only.
- `state` = canonical abbreviation via `stateMatchValues()` of `User.state` (head_office) or the primary `Service.state` (member/staff); `null` for owner/admin or when unset.

```sql
s.status = 'active'
AND ($serviceIds IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($serviceIds))
AND ($state IS NULL OR s.state IS NULL OR s.state = $state)
AND (s."audienceRoles" = '{}' OR $role = ANY(s."audienceRoles"))
```

The `$x IS NULL OR …` branches matter: `= ANY(NULL)` matches nothing, and `getCentreScope` can return `[]` (no centre), which correctly yields org-wide sources only. With Prisma `$queryRaw` a `null` array parameter must be cast (`$1::text[]`) or Postgres cannot infer its type. Import canonicalises `state` to the abbreviation so exact equality is safe. The model cannot widen scope — scope is not a tool parameter.

### 3.5 Tiered answer policy

**Tier lives on the source, set at import, overridable by admin.** Heuristic: `qualityArea = 2` (Children's Health & Safety), or title matches child protection / medication / incident / emergency / evacuation / lockdown / safe arrival / collection / missing child / anaphylaxis / asthma / epilepsy / diabetes → `safety_critical`. Everything else `general`. `tierOverride` wins.

**Per turn, before the model runs**, the route pre-retrieves once on the user's latest message. Pre-retrieval does two jobs: it picks the mode, and its chunks are injected into the system prompt as context so the common case needs no tool round-trip. `search_knowledge` remains a tool for follow-up searches with different wording. Tools are **never** removed by mode — "when's my next shift" still calls `my_shifts` in any mode.

1. `top = results[0]`; `safetyHit = top?.tier === "safety_critical" && isStrongMatch(top)` where `isStrongMatch = cosineDistance != null ? cosineDistance <= SAFETY_COSINE_MAX : tsRank >= SAFETY_TSRANK_MIN`. RRF scores are rank-derived (rank 1 is ≈ 0.016–0.033 whatever the match quality), so the floor is on the **relevance** signal, never on `fusedScore`. Thresholds are constants tuned in the admin "test a question" view, which shows both. A stray safety chunk at rank 7, or a weak rank-1 match to a nonsense query, does not flip the mode.
2. `safetyIntent = SAFETY_INTENT_REGEX.test(message)` — keyword classifier (medication, allergy, injur, bleed, missing, evacuat, lockdown, abuse, disclos, unconscious, seizure, choking, …) in `src/lib/knowledge/safety-intent.ts`, with tests.
3. Mode:
   - `safetyHit` → **strict**: for procedural content, answer *only* from retrieved chunks; cite `[Title → Heading]` per step; end with the escalation line.
   - `!safetyHit && safetyIntent` → **refuse-and-escalate**: the library has no matching procedure; respond only with the escalation line. No improvisation.
   - otherwise → **general**: cite Amana sources when present; may answer from general OSHC/NQF knowledge, prefixed *"General guidance, not Amana policy — confirm with your coordinator."*

**Escalation line** = `Service.manager.name` + `Service.phone` for the user's primary service; if either is null, the `head_office` user for the user's state (`User.state`), else the org contact from org settings (`welcomePack.contactPhone`, default "1300 200 262"). Resolved by `resolveEscalation(session)` and injected per turn.

Mode, chunk ids, tool calls and tokens are written to `AssistantTurn`.

**Citations** carry `externalUrl` and stream as a **new** SSE `sources` event on the chat route (`{ sources: [{ sourceId, title, heading, url, tier }] }`) — today the chat stream has only `text`/`error`/`[DONE]`; the only `sources` event lives in `/api/knowledge/ask`, which is deleted. `useAssistant` gains a handler. Rendered as tappable chips.

**Version honesty:** `superseded` and `excluded` are excluded in SQL; one `(normalizedTitle, state, serviceId)`, one active source.

### 3.6 Tools — one scaffold

Three properties, no exceptions:

1. **Scope from session, never from the model.** Tool input schemas contain only arguments the user could legitimately vary (date range, search term). `userId`, `serviceIds`, `role` are injected by the executor from `session` + `buildKnowledgeScope`.
2. **Role-gated registry.** `getToolsForRole(role): ToolDef[]` in `src/lib/ai-tools/registry.ts` replaces the admin/non-admin fork. `buildDashboardContext()` is only injected for `owner`/`head_office`/`admin` — the leak fix.
3. **Every call audited** on `AssistantTurn.toolCalls` (name, args, duration, result size; for writes, the committed record id).

**Educator read tools (slice 3):**

| Tool | Reads | Example |
|---|---|---|
| `my_shifts` | `RosterShift` where `userId`, next 14 days | "When am I on next?" |
| `my_certificates` | `ComplianceCertificate` where `userId`, `supersededAt IS NULL`; `expiryDate: null` = never expires; required set from `getRequiredCertTypes(role, orgSettings)` | "Is my CPR expiring?" |
| `my_leave` | Internal `LeaveRequest` + `getApprovedEhLeave()` cache | "Did my leave get approved?" |
| `my_induction` | `getInductionReadiness(userId)` | "Why can't I clock in?" |
| `my_centre` | `Service` (address, phone, manager) + the `centre_facts` source | "Who's my coordinator?" |
| `my_training` | `LMSEnrollment` progress | "What courses do I still have to do?" |
| `service_roster_today` | `RosterShift` for the user's **primary** service today (+ RP register) — every staff role; scope from session | "Who's on with me?" / "Who's the RP?" |
| `child_medical_plan` | Child medical/allergy plans + authorised collectors, by child name, **primary service only**; never returns other centres' children; result logged on `AssistantTurn` (PII read audit) | "Does Ali have allergies?" / "Who can collect Mia?" |

The last two are service-scoped reads pulled forward from the coordinator set (decision 2026-09-26): an educator at pick-up needs them more than a coordinator at a desk. They use `session.user.serviceId` (primary) only, matching `ensureServiceAccess`.

Existing admin tools are re-registered unchanged. `fetch_oshc_reference` stays (host allowlist unchanged); it overlaps the `regulator` adapter and is the fallback for pages not curated.

**Coordinator read tools (slice 4, scoped via `getCentreScope`):** `service_bookings_today`, `service_open_incidents`, `service_ratio_forecast`, plus `service_roster_today`/`child_medical_plan` widened from primary-only to the member's full `getCentreScope`.

### 3.7 Write contract (C)

Writes are two-phase. The model proposes; the human commits; the write goes through the same helper the form uses.

```prisma
model PendingAction {
  id          String    @id @default(cuid())
  userId      String
  serviceId   String?   // null for org-level actions (e.g. request_leave later)
  kind        String    // "reflection" | "hazard" | "leave" | "incident"
  payload     Json      // already validated against the target schema
  turnId      String
  expiresAt   DateTime  // now + 10 min
  committedAt DateTime?
  resultId    String?
  createdAt   DateTime  @default(now())

  @@index([userId, expiresAt])
}
```

- **Propose:** model calls `propose_reflection({ title, content, type, qualityAreas, mood })`. Executor validates with `createReflectionSchema`, sets `serviceId = session.user.serviceId` (the **primary** service — the same rule `POST /api/services/[id]/reflections` enforces via `ensureServiceAccess`; the tool never offers other centres in slice 4, and returns `no_primary_service` for users without one), inserts `PendingAction`, and the route streams an SSE `action` event → confirmation card (*"Log this as a reflection for Minaret Doveton, tagged QA1 & QA5? [Save] [Edit] [Cancel]"*).
- **Commit:** `POST /api/assistant/actions/[id]/confirm` — 404 if not the caller's, 410 if expired or already committed; re-validates payload; calls `createStaffReflection(db, { authorId, serviceId, ...payload })` — a helper **extracted from the existing route handler** (including its `$transaction` and `clientMutationId` dedupe) so both the form and the bot share one write path; stamps `committedAt`/`resultId`. **Edit** opens the existing reflection dialog pre-filled from the payload. **Cancel** deletes the row.
- The model never sees the commit endpoint; it cannot auto-confirm.

First write tool: `log_reflection` → `StaffReflection` with `qualityAreas` and `mood`. **Dependency — stated, not assumed:** the QIP evidence engine ("tags are the ledger" on `StaffReflection.qualityAreas`, `docs/superpowers/specs/2026-07-07-daily-reflections-qip-engine-design.md`) lives on the **unmerged** PR #166 (`feat/daily-reflections-qip-engine`). On `main` today `REFLECTION_TYPES` is `weekly | monthly | critical | team` (no `daily`) and nothing surfaces QA-tagged reflections as evidence. Slice 4 therefore: (1) writes `type: "daily"` **only if PR #166 has merged**, otherwise `type: "weekly"` with the same tags (the tags are what the engine reads, the type is the cadence label); (2) makes no claim that the reflection *appears in QIP* until #166 merges — the plan lists "merge or rebase PR #166" as a prerequisite task, and the QIP evidence outcome is delivered by that PR, not this one. (`EducatorReflection` is the cowork ingest model and is not involved.)

Later tools (`report_hazard`, `request_leave`, `log_incident`) add only a schema, a target helper, and a card renderer.

## 4. Phone UI

`FloatingChatWidget` gains: full-screen mode under `sm:`; a quick-prompt row on open (*"What do I do if a child is injured?"*, *"My next shift"*, *"Log a reflection"*); citation chips; the confirmation card; the escalation line rendered as a `tel:` link. `MobileTabBar` "More" sheet gains "Ask Amana AI". `useAssistant` handles the extended `sources` event and the new `action` event.

## 5. SharePoint import

Trees, categories and scope:

| Tree | Category | Scope |
|---|---|---|
| `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/{Policies,Procedures}` | `policy` / `procedure` | org-wide; `state` from filename |
| `Shared Documents/NSW & VIC state policies/{Policies,Procedures}` | `policy` / `procedure` | org-wide; `state` from filename |
| `Shared Documents/SOPs/Jayden full SOP/**` | `sop` | org-wide |
| `NSW Schools/<centre>/**`, `Melbourne Schools/<centre>/**` | `procedure` (or `centre`) | `serviceId` mapped from folder name |

Skipped: `Shared Documents/SOPs/Amana OSHC AUDIT/**` (evidence, not guidance), `Amana HR Management Review Audit/**`, filenames matching contract / payslip / TFN / candidate / resume / CV, images, spreadsheets.

Per file: parse `QA<n>`, `V<n>`, `NSW|VIC` from the filename → canonicalise state → map centre folder → `Service` by name (unmapped → **flagged, not guessed**; source created `status: excluded`) → `upsertKnowledgeSource` keyed on SharePoint item id → dedupe within `(normalizedTitle, state, serviceId)`: highest `version` is `active`, others `superseded` with `supersededById`. Report rows: imported / unchanged / superseded / **conflicts** (same key, same version, different `contentHash`) / unmapped / errors → `KnowledgeSyncRun`.

### 5.1 Slice 1 — local export (no admin consent required)

The repo has **no** SharePoint/Graph integration; `microsoft-calendar.ts` uses delegated per-user tokens that a script or cron cannot use. Slice 1 therefore imports from a **local export directory**:

- `scripts/export-sharepoint-knowledge/` — run interactively once (this session, via the SharePoint connector, which returns extracted text): writes `knowledge-export/<tree>/<file>.md` with frontmatter `{ id, name, webUrl, path, lastModified }`. The export directory is git-ignored; a six-file fixture copy lives in `src/__tests__/fixtures/knowledge-export/`.
- `knowledge-export/` is added to `.gitignore` (it contains the full policy text).
- `scripts/import-sharepoint-knowledge.ts --from ./knowledge-export` — reads the directory, applies §5 rules, runs the pipeline against the target DB (`DATABASE_URL`; prod requires `PROD_DATABASE_URL` exported explicitly per the repo rule), writes a `KnowledgeSyncRun`.

This makes slice 1 independently shippable.

### 5.2 Slice 2b — Graph app-only sync (gated on tenant admin consent)

- Azure app registration with **application** permission `Sites.Read.All` + admin consent (same blocker as the Outlook connector's `Mail.Send`; raise with the tenant admin at slice 1 kick-off).
- Env: `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_IDS` (comma-separated; the four trees span two drives).
- `src/lib/knowledge/sharepoint-graph.ts`: client-credentials token, drive delta walk, download `.docx`/`.pdf` → `extractTextFromBuffer`.
- Resumable: `KnowledgeSyncRun.cursor` stores the delta link + last item id; each invocation processes **≤ 25 files** then re-enqueues itself (`POST /api/settings/ai-knowledge/sync` with `runId`) until the walk completes — Vercel's 300 s `maxDuration` is never the bound.
- Admin "Sync from SharePoint" button + weekly cron `knowledge-sharepoint-sync` both call this.

## 6. Admin console

`/settings/ai-knowledge` becomes the knowledge console:

- Source table: title, kind, category, tier (with override), QA, service, state, version, status, indexedAt. Filters. Row actions: override tier, exclude/restore, re-index.
- "Sync" (owner/head_office/admin): pick adapter (`backfill`, `regulator`, and — after 2b — `sharepoint`); shows the `KnowledgeSyncRun` report; conflict list with SharePoint links so Daniel fixes the source of truth.
- **Test a question**: enter a query, pick a role + service to impersonate scope, see retrieved chunks with fusion score and tier, and the mode the route would choose — *before* the answer. Shows `fusedScore`, `cosineDistance` and `tsRank` per chunk; this is where `SAFETY_COSINE_MAX` / `SAFETY_TSRANK_MIN` get tuned.
- Manual upload/paste (existing UI) re-pointed at `manual`.
- Centre fact sheet: the `staffNotes` field on the service settings tab (coordinator-editable) with placeholder guidance — gate/alarm, school contact, session times, evacuation point, key people. The other indexed fields already exist on that tab.

## 7. Delivery slices

| Slice | Contents | Outcome |
|---|---|---|
| **1 — Content + safety** | Schema + migration (pgvector, `KnowledgeSource`/`Chunk`/`SyncRun`/`AssistantTurn`, `AiUsage.userId` nullable, `Service.content.staffNotes`); pipeline (chunk + embed + tsvector); adapters `handbook`, `help_article`, `policy_upload`, `centre_facts`, `regulator`, `manual`, `backfill`; SharePoint local export + import (§5.1) run against prod; retire the old store per §3.2; role-gate `buildDashboardContext()`; `search_knowledge` over the new store (tsvector + vector, no mode logic yet) | Bot is more useful and no longer dangerous |
| **2 — Retrieval policy** | Hybrid RRF ranking, `buildKnowledgeScope`, tier heuristic + override, strict/refuse/general modes, `safety-intent.ts`, `resolveEscalation`, citations as chips, `AssistantTurn` logging, admin console incl. "test a question" | Recall + safety policy |
| **2b — Graph sync** (parallel, gated on admin consent) | §5.2 | SharePoint stays current without a laptop |
| **3 — Educator tools** | Tool registry, six `my_*` tools + `service_roster_today` + `child_medical_plan` (primary-service reads), phone UI (full-screen, quick prompts, `tel:` escalation), `MobileTabBar` entry | "Any question" for educators |
| **4 — Coordinators (C begins)** | Service-scoped reads; `PendingAction` + propose/confirm + `createStaffReflection` extraction + `log_reflection`; confirmation card. **Prerequisite:** PR #166 (QIP evidence engine) merged or rebased, or `log_reflection` ships with `type: "weekly"` and no QIP claim | First write action |
| **5** (order decided 2026-09-26) | (1) `log_incident` — bot extracts mandatory incident fields, asks for the rest, coordinator review; (2) `request_leave` sick-leave (`serviceId` null) + coordinator notification; (3) `clock_in`/`clock_out` via the existing clock routes (+ `assertUserCleared`); (4) **morning briefing** push at shift start (shift, co-workers, bookings, medical-plan flags, due drills) | Most taps removed for most people |
| 6+ | `report_hazard`, `log_observation`, roster swap, coordinator approvals, family posts, creative-request intake, EOS issue/rock capture; proactive nudges (cert expiry, unsubmitted timesheet); page-aware pre-fill; voice input; offline queue; "teach the bot" → draft `manual` source; escalate-to-human with transcript | The second brain |

Each slice ships as its own PR, build + tests green. Slice 1 is strictly additive except for the §3.2 deletions.

## 8. Testing

Unit (`src/__tests__/lib/knowledge/`):
- Scope: `buildKnowledgeScope` uses `getCentreScope`, not `serviceScopeFilter`; a `serviceId`-scoped chunk never returns for a user outside that service; a `state: NSW` chunk never returns for a VIC user; `null` scope returns everything; `null` state returns state-specific docs; `superseded`/`excluded` never return; `audienceRoles` filter.
- Fusion: tsvector-only fallback when embedding throws; RRF ordering; `fusedScore` present.
- Tier + mode: top-1 safety with strong relevance → strict; top-1 safety with weak relevance (high cosine distance / low ts_rank) → not strict; `fusedScore` alone never decides; safety intent with no hit → refuse; otherwise general; `tierOverride` beats heuristic; tools list unchanged across modes.
- Escalation fallback chain (manager → head_office by state → org contact).
- Import deduper: V2 vs V3 → V3 active; same key + version, different hash → conflict; NSW V3 vs VIC V2 → **both active**; unmapped centre → excluded + flagged; unchanged hash → no re-embed; skip rules (audit folder, contract filenames).
- `policy_upload` supersedes only the state-null SharePoint source.
- Tool registry per role; `buildDashboardContext` absent for staff; `child_medical_plan` and `service_roster_today` for a staff user return only their primary service's rows and 404 a child at another centre (no existence leak).
- Propose/confirm: cross-user confirm → 404; expired → 410; double-commit → 410; commit goes through `createStaffReflection` with `serviceId` from session; model output cannot set `serviceId`.

Route tests (`src/__tests__/api/`): `assistant/chat` mode selection and SSE events; `assistant/actions/[id]/confirm`; `settings/ai-knowledge/*` (sync, reindex, upload re-pointed); `services/[id]/reflections` still passes after the helper extraction.

Guard tests: no `prisma.document`/`documentChunk` access under `src/lib/knowledge/` or the console routes; `/api/knowledge/*` routes no longer exist; `searchChunks` no longer exported.

Integration: local Postgres with pgvector; import the six-file fixture export (two duplicates, one conflict, one unmapped centre); assert the `KnowledgeSyncRun` counts.

## 9. Risks & mitigations

- **Embedding vendor outage** → tsvector fallback; never blocks answers.
- **Wrong centre mapping on import** → unmapped is `excluded` + flagged, never guessed.
- **Stale SharePoint text after Daniel uploads a PDF** → `policy_upload` supersedes by key.
- **Model ignores strict mode** → mode chosen by the route, per-turn prompt, refuse mode gives it nothing to cite; `AssistantTurn` logs every case.
- **Write from chat creates a bad record** → propose/confirm, shared helper, audited to the turn.
- **Tenant admin consent for Graph never arrives** → slice 1's local export still works; re-run it manually until 2b lands.
- **Neon pgvector** → verify `CREATE EXTENSION vector` on a Neon branch before slice 1 merges; supported on all plans.
- **Cost** → ~600 docs × ~20 chunks one-off embed ≈ negligible; per-query embed ≈ $0.00002; logged to `AiUsage`.

## 10. Out of scope (this spec)

Voice input; parent-facing assistant; OWNA write-backs; autonomous actions without a confirm tap; per-user long-term memory (slice 5+); `KnowledgeBaseArticle` CRUD; multi-membership centre choice for writes (slice 5+ — needs the reflections route widened first).
