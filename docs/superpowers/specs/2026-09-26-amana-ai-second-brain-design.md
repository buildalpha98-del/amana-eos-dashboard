# Amana AI — Operations Second Brain — Design

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Audience order:** educators on the floor first, then coordinators
**Destination:** C (agent platform with write actions). **Road:** B (retrieval rebuild + educator read tools), built so nothing is undone on the way to C.

---

## 1. Problem

Amana AI already exists: `FloatingChatWidget` → `POST /api/assistant/chat`, a tool-calling assistant over a keyword-searched knowledge base (`Document`/`DocumentChunk`, Postgres tsvector). It answers from three seeded docs (Amana Way, Employee Handbook scaffold, Proven Process — 68 chunks), a curated regulator-site fetch, and — for admin roles only — six live lookups.

For an educator on a phone mid-session it fails in four ways:

1. **Content.** The QA1–QA7 policy and procedure library, the company-wide SOPs, OWNA/Employment Hero how-tos, centre-specific facts, and the regulator references are not in the knowledge base. The handbook seed still contains `[FILL IN YOUR SPECIFICS]`.
2. **Recall.** Keyword search cannot bridge "a kid threw up" → *QA2 Illness Management Procedure*. The prompt compensates by instructing three synonym searches.
3. **Safety of the store.** `searchChunks` joins every `DocumentChunk` with no scoping. The `Document` table holds 233 employment contracts that are unindexed only because nobody has run `POST /api/knowledge/reindex`. Centre-specific documents have no way to be scoped to that centre's staff. NSW-only documents reach VIC staff.
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

A new store replaces "index whatever is in `Document`". Nothing enters it except through a named adapter; there is no path from an arbitrary `Document` row into it. `POST /api/knowledge/reindex` is deleted.

```prisma
enum KnowledgeSourceKind { sharepoint policy_upload help_article handbook lms_module centre_facts regulator }
enum KnowledgeCategory   { policy procedure sop guide reference centre }
enum KnowledgeTier       { safety_critical general }
enum KnowledgeStatus     { active superseded excluded }

model KnowledgeSource {
  id             String              @id @default(cuid())
  title          String
  normalizedTitle String             // lowercased, version/state suffix stripped — dedupe key
  sourceKind     KnowledgeSourceKind
  category       KnowledgeCategory
  tier           KnowledgeTier       @default(general)
  tierOverride   KnowledgeTier?      // admin override wins over the import heuristic
  qualityArea    Int?                // 1–7, parsed from "QA<n>"
  serviceId      String?             // null = org-wide
  service        Service?            @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  state          String?             // "NSW" | "VIC" | null = all
  version        Int?                // parsed "V13" / PolicyDocumentVersion.versionNumber
  externalId     String              // SharePoint item id, PolicyDocumentVersion.id, article id, `service:<id>`, URL
  externalUrl    String?             // citation target
  contentHash    String
  status         KnowledgeStatus     @default(active)
  supersededById String?
  indexedAt      DateTime?
  indexError     String?
  chunks         KnowledgeChunk[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@unique([sourceKind, externalId])
  @@index([status, tier])
  @@index([serviceId])
  @@index([normalizedTitle])
}

model KnowledgeChunk {
  id           String                    @id @default(cuid())
  sourceId     String
  source       KnowledgeSource           @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  chunkIndex   Int
  heading      String?
  content      String                    @db.Text
  tokenCount   Int
  searchVector Unsupported("tsvector")?
  embedding    Unsupported("vector(1024)")?
  createdAt    DateTime                  @default(now())

  @@unique([sourceId, chunkIndex])
}
```

Migration enables `CREATE EXTENSION IF NOT EXISTS vector`, a GIN index on `searchVector` (trigger-maintained, same pattern as `DocumentChunk`), and an HNSW index on `embedding` (cosine).

**Why not extend `Document`/`DocumentChunk`:** `Document` is the HR file cabinet and will always hold contracts and certificates. Indexing must be opt-in by source kind, not opt-out by luck. The existing `Document.indexed`/`DocumentChunk` machinery is retired once the seeds are migrated (Section 6, slice 1).

### 3.2 Adapters

Each adapter is idempotent, keyed on `(sourceKind, externalId)`, and shares one `upsertKnowledgeSource(input)` → `chunk` → `embed` pipeline in `src/lib/knowledge/`.

| Adapter | Trigger | Notes |
|---|---|---|
| `sharepoint` | `scripts/import-sharepoint-knowledge.ts` + admin "Sync" button + weekly cron `knowledge-sharepoint-sync` | See §5 |
| `policy_upload` | Hook in the `/policies` version-publish path | Extract PDF text; **wins** over a `sharepoint` source with the same `normalizedTitle` (that one → `superseded`) |
| `help_article` | On `KnowledgeBaseArticle` save | `published` only; respects `audienceRoles` by mapping to a role filter at query time |
| `handbook` | On `AmanaHandbookContent`/`AmanaWayContent` save + once at boot from defaults | Replaces `KNOWLEDGE_SEEDS` |
| `lms_module` | On `LMSModule` save when course `status = published` | Reading modules only; quiz questions/answers are never indexed |
| `centre_facts` | On `Service.knowledgeFacts` save | `serviceId` set; `category: centre` |
| `regulator` | Curated list in `src/lib/knowledge/regulator-sources.ts` + monthly cron | NQS, National Regulations guide, MTOP v2.0, *Staying Healthy* exclusion table, Children's Services Award summary, ASCIA action-plan guidance, NSW/VIC regulator pages |

Chunking reuses the existing heading-aware splitter (500-token chunks, 50 overlap). Embedding: Voyage `voyage-3` (1024-dim) via `src/lib/embeddings.ts` — batches of 128, retry with backoff, cost logged to `AiUsage` with `section: "knowledge-index"`. Env: `VOYAGE_API_KEY`. `contentHash` unchanged → no re-chunk, no re-embed.

### 3.3 Retrieval

`searchKnowledge(query, scope, limit = 8)` in `src/lib/knowledge/search.ts`:

1. Embed the query (one Voyage call). On failure, log and continue tsvector-only — the bot never goes dark for a vendor hiccup.
2. Run two SQL queries in parallel over `KnowledgeChunk` ⋈ `KnowledgeSource`:
   - tsvector: `plainto_tsquery` first, `websearch_to_tsquery` fallback (existing behaviour).
   - pgvector: `embedding <=> $queryVec` cosine, top 20.
3. Reciprocal-rank fusion (k = 60), top `limit`.

**Scope is a SQL `WHERE`, not a prompt instruction:**

```sql
s.status = 'active'
AND (s."serviceId" IS NULL OR s."serviceId" = ANY($serviceIds))
AND (s.state IS NULL OR s.state = $userState)
AND (s."sourceKind" <> 'help_article' OR $role = ANY(s."audienceRoles") OR s."audienceRoles" = '{}')
```

`scope = { role, serviceIds, state }` is derived in the route from the session: `serviceIds` via `serviceScopeFilter(session)` (primary service + active `UserServiceMembership`s; owner/head_office/admin = all), `state` from the user's primary `Service.state`. The model cannot widen scope — it is not a tool parameter.

### 3.4 Tiered answer policy

**Tier lives on the source, set at import, overridable by admin.** Heuristic: `qualityArea = 2` (Children's Health & Safety), or title matches child protection / medication / incident / emergency / evacuation / lockdown / safe arrival / collection / missing child / anaphylaxis / asthma / epilepsy / diabetes → `safety_critical`. Everything else `general`. `tierOverride` wins.

Per turn, the route decides the mode **before** the model answers:

1. Run retrieval for the user's message.
2. `safetyHit = results.some(r => r.tier === "safety_critical")`.
3. `safetyIntent = SAFETY_INTENT_REGEX.test(message)` — a small keyword classifier (medication, allergy, injur, bleed, missing, evacuat, lockdown, abuse, disclos, unconscious, seizure, choking, …), maintained in `src/lib/knowledge/safety-intent.ts` with tests.
4. Mode:
   - `safetyHit` → **strict**: system prompt says answer *only* from retrieved chunks; cite `[Title → Heading]` per step; end with the escalation line naming `Service.manager.name` and `Service.phone`.
   - `!safetyHit && safetyIntent` → **refuse-and-escalate**: the model is told the library has no matching procedure and must respond only with the escalation line. No improvisation.
   - otherwise → **general**: cite Amana sources when present; may answer from general OSHC/NQF knowledge, prefixed *"General guidance, not Amana policy — confirm with your coordinator."*

The mode and the retrieved chunk ids are logged per turn (`AssistantTurn` row: userId, serviceId, mode, chunkIds, toolCalls, tokens) so admins can audit why the bot said what it said.

**Citations** carry `externalUrl` and are streamed as a final SSE `sources` event, rendered as tappable chips.

**Version honesty:** `superseded` and `excluded` are excluded in SQL; one title, one active source.

### 3.5 Tools — one scaffold

Three properties, no exceptions:

1. **Scope from session, never from the model.** Tool input schemas contain only arguments the user could legitimately vary (date range, search term). `userId`, `serviceIds`, `role` are injected by the executor.
2. **Role-gated registry.** `getToolsForRole(role): ToolDef[]` in `src/lib/ai-tools/registry.ts` replaces the admin/non-admin fork. `buildDashboardContext()` is only injected for `owner`/`head_office`/`admin` — the leak fix.
3. **Every call audited** on the `AssistantTurn` row (name, args, duration, result size; for writes, the committed record id).

**Educator read tools (slice 3):**

| Tool | Reads | Example |
|---|---|---|
| `my_shifts` | `RosterShift` where `userId`, next 14 days | "When am I on next?" |
| `my_certificates` | `StaffCertificate` + `getRequiredCertTypes(role, orgSettings)` | "Is my CPR expiring?" |
| `my_leave` | Internal `LeaveRequest` + `getApprovedEhLeave()` cache | "Did my leave get approved?" |
| `my_induction` | `getInductionReadiness(userId)` | "Why can't I clock in?" |
| `my_centre` | `Service` (address, phone, manager, hours) + `centre_facts` source | "Who's my coordinator?" |
| `my_training` | `LMSEnrollment` progress | "What courses do I still have to do?" |

Existing admin tools are re-registered unchanged. `search_knowledge_base` becomes `search_knowledge` over the new store. `fetch_oshc_reference` stays (host allowlist unchanged).

**Coordinator read tools (slice 4, service-scoped via membership):** `service_bookings_today`, `service_roster_today`, `child_medical_plan` (by child name, within their service only), `service_open_incidents`.

### 3.6 Write contract (C)

Writes are two-phase. The model proposes; the human commits; the write goes through the existing validated route.

```prisma
model PendingAction {
  id         String   @id @default(cuid())
  userId     String
  serviceId  String
  kind       String   // "reflection" | "hazard" | "leave" | "incident"
  payload    Json     // already validated against the target schema
  turnId     String   // AssistantTurn that proposed it
  expiresAt  DateTime // now + 10 min
  committedAt DateTime?
  resultId   String?  // id of the created record
  createdAt  DateTime @default(now())

  @@index([userId, expiresAt])
}
```

- **Propose:** model calls `propose_reflection({ title, content, type, qualityAreas, mood })`. Executor validates with `createReflectionSchema`, resolves `serviceId` from session (multi-membership → the tool returns `needs_service_choice` and the model asks), inserts `PendingAction`, and the route streams an SSE `action` event → confirmation card (*"Log this as a reflection for Minaret Doveton, tagged QA1 & QA5? [Save] [Edit] [Cancel]"*).
- **Commit:** `POST /api/assistant/actions/[id]/confirm` — 404 if not the caller's, 410 if expired or already committed; re-validates payload; writes via the same code path as `POST /api/services/[id]/reflections`; stamps `committedAt`/`resultId`. **Edit** opens the normal reflection dialog pre-filled from the payload. **Cancel** deletes the row.
- The model never sees the commit endpoint; it cannot auto-confirm.

First write tool: `log_reflection` → `StaffReflection`, which the QIP evidence engine already fans out to QA evidence. Later tools (`report_hazard`, `request_leave`, `log_incident`) add only a schema and a target route.

## 4. Phone UI

`FloatingChatWidget` gains: full-screen mode under `sm:`; a quick-prompt row on open (*"What do I do if a child is injured?"*, *"My next shift"*, *"Log a reflection"*); citation chips; the confirmation card; the escalation line rendered as `tel:` link. `MobileTabBar` "More" sheet gains "Ask Amana AI". Existing `useAssistant` hook handles the new `sources` and `action` SSE events.

## 5. SharePoint import

`scripts/import-sharepoint-knowledge.ts` (also callable from the admin console) walks:

| Tree | Category | Scope |
|---|---|---|
| `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/{Policies,Procedures}` | `policy` / `procedure` | org-wide; `state` from filename |
| `Shared Documents/NSW & VIC state policies/{Policies,Procedures}` | `policy` / `procedure` | org-wide; `state` from filename |
| `Shared Documents/SOPs/Jayden full SOP/**` | `sop` | org-wide |
| `NSW Schools/<centre>/**`, `Melbourne Schools/<centre>/**` | `procedure` (or `centre`) | `serviceId` mapped from folder name |

Skipped: `Shared Documents/SOPs/Amana OSHC AUDIT/**` (evidence, not guidance), `Amana HR Management Review Audit/**`, anything matching contract/payslip/TFN/candidate/resume, images, spreadsheets.

Per file: extract text (connector) → parse `QA<n>`, `V<n>`, `NSW|VIC` from the filename → map centre folder → `Service` by name (unmapped → **flagged, not guessed**; source created with `status: excluded`) → `upsertKnowledgeSource` keyed on SharePoint item id → dedupe by `normalizedTitle`: highest `version` is `active`, others `superseded` with `supersededById`.

Import report (persisted as `KnowledgeSyncRun`: startedAt, counts, JSON details): imported / unchanged / superseded / **conflicts** (same `normalizedTitle`, same `version`, different `contentHash`) / unmapped centres / extraction errors. Surfaced in the admin console.

## 6. Admin console

`/settings/ai-knowledge` becomes the knowledge console:

- Source table: title, kind, category, tier (with override), QA, service, state, version, status, indexedAt. Filters. Row actions: override tier, exclude/restore, re-index.
- "Sync from SharePoint" (owner/head_office/admin) → runs the import, shows the report.
- Conflict list with SharePoint links so Daniel fixes the source of truth.
- **Test a question**: enter a query, pick a role + service to impersonate scope, see retrieved chunks with fusion rank and tier, and the mode the route would choose — *before* the answer.
- Centre fact sheet editor lives on the service settings tab (coordinator-editable) with a seeded template: address, gate/alarm, school contact, session times, evacuation point, food provider, key people.

## 7. Delivery slices

| Slice | Contents | Outcome |
|---|---|---|
| **1 — Content + safety** | Schema + migration (pgvector, `KnowledgeSource`/`Chunk`, `AssistantTurn`); adapters `handbook`, `help_article`, `policy_upload`, `centre_facts`, `regulator`; SharePoint import script + first run; delete `knowledge/reindex`; role-gate `buildDashboardContext()`; migrate the three seeds; search still tsvector-only | Bot is more useful and no longer dangerous |
| **2 — Retrieval** | `embeddings.ts`, hybrid search + RRF, scope SQL, tier heuristic + `tierOverride`, strict/general/refuse modes, `safety-intent.ts`, citations as chips, admin console incl. "test a question" | Recall + safety policy |
| **3 — Educator tools** | Tool registry, six `my_*` tools, phone UI (full-screen, quick prompts, `tel:` escalation), `MobileTabBar` entry | "Any question" for educators |
| **4 — Coordinators (C begins)** | Service-scoped reads; `PendingAction` + propose/confirm + `log_reflection`; confirmation card | First write action |
| 5+ | `report_hazard`, `request_leave`, `log_incident`; per-user memory; proactive nudges | The second brain |

Each slice ships as its own PR, build + tests green, behind no flag (slice 1 is strictly additive; slice 2 replaces search only once embeddings exist for all active chunks).

## 8. Testing

Unit (`src/__tests__/lib/knowledge/`):
- Scope SQL: a `serviceId`-scoped chunk never returns for a user outside that service; a `state: NSW` chunk never returns for a VIC user; `superseded`/`excluded` never return; owner sees all.
- Fusion: tsvector-only fallback when embedding throws; RRF ordering.
- Tier + mode: safety hit → strict; safety intent with no hit → refuse; otherwise general. `tierOverride` beats heuristic.
- Import deduper: V2 vs V3 → V3 active; same version different hash → conflict; unmapped centre → excluded + flagged; unchanged hash → no re-embed.
- Tool registry per role; `buildDashboardContext` absent for staff.
- Propose/confirm: cross-user confirm → 404; expired → 410; double-commit → 410; commit writes through `createReflectionSchema`; model output cannot set `serviceId`.

Route tests (`src/__tests__/api/`): `assistant/chat` mode selection and SSE events; `assistant/actions/[id]/confirm`; `settings/ai-knowledge/*`.

Integration: local Postgres with pgvector, import a fixture tree (six docx/pdf text fixtures with two duplicates and one conflict), assert the report.

Guard test: `email-bypass-guard`-style registry asserting no adapter reads from `Document` rows with `category: hr` or an `assignedToId`.

## 9. Risks & mitigations

- **Embedding vendor outage** → tsvector fallback; never blocks answers.
- **Wrong centre mapping on import** → unmapped is `excluded` + flagged, never guessed.
- **Stale SharePoint text after Daniel uploads a PDF** → `policy_upload` supersedes by `normalizedTitle`.
- **Model ignores strict mode** → mode is chosen by the route, prompt is per-turn, and refuse mode gives the model nothing to cite; `AssistantTurn` logs every case for audit.
- **Write from chat creates a bad record** → propose/confirm, same schema and route as the form, audited to the turn.
- **Neon pgvector availability** → verify `CREATE EXTENSION vector` on the prod branch before slice 1 merges; Neon supports it on all plans.
- **Cost** → embedding ~600 docs × ~20 chunks × 1024-dim ≈ negligible one-off; per-query embed ≈ $0.00002. Logged to `AiUsage`.

## 10. Out of scope (this spec)

Voice input; parent-facing assistant; OWNA write-backs; autonomous actions without a confirm tap; per-user long-term memory (slice 5+).
