# Knowledge Agent — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Author:** Claude + Jayden

## Overview

A document-aware knowledge agent that lets Amana OSHC staff ask natural language questions about uploaded policies, procedures, SOPs, and guides. Answers are grounded in actual uploaded documents with source citations.

## Requirements

- ~100 documents (policies, procedures, SOPs, guides, compliance docs)
- Two access points: existing /assistant chat (new tool) + dedicated /knowledge page
- Best-effort answers with clear confidence labelling (doc-sourced vs general knowledge)
- Auto-index on document upload
- All staff roles can access

## Architecture: Hybrid Full-Text Search

PostgreSQL full-text search (`tsvector`) for retrieval now, with schema designed so vector embeddings can be added later as a column on `DocumentChunk`.

At ~100 documents (~500 chunks), PostgreSQL `ts_rank` provides fast, accurate keyword search with stemming and phrase matching. No external vector DB or embedding API needed.

### Why not vectors now?

- 100 docs is well within PostgreSQL FTS capability
- Zero additional cost (no embedding API calls)
- Simple to debug — visible SQL queries
- Upgrade path is a single column addition + search function swap

---

## Data Model

### New Model: DocumentChunk

```prisma
model DocumentChunk {
  id            String    @id @default(cuid())
  documentId    String
  document      Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex    Int
  content       String    // ~500 tokens of text
  heading       String?   // nearest heading above this chunk
  pageNumber    Int?      // for PDFs
  tokenCount    Int       // for context budget management
  searchVector  Unsupported("tsvector")?
  // Future: embedding Float[] for pgvector
  createdAt     DateTime  @default(now())

  @@index([documentId])
  @@index([searchVector], type: Gin)
  @@unique([documentId, chunkIndex])
}
```

### Changes to Existing Document Model

Add 3 fields:

```prisma
indexed    Boolean   @default(false)
indexedAt   DateTime?
indexError  String?
```

Add relation:

```prisma
chunks DocumentChunk[]
```

### Migration

Prisma migration with raw SQL for the GIN index on `searchVector`, since Prisma doesn't natively support `tsvector` operations.

---

## Indexing Pipeline

### Trigger

Auto-triggered after document upload (both single `POST /api/documents` and bulk `POST /api/documents/bulk`). Fire-and-forget — upload response returns immediately, indexing runs async.

### Steps

1. **Extract text** from file:
   - PDF → `pdf-parse` (new dependency)
   - DOCX → `mammoth` (already installed)
   - TXT/MD/CSV → fetch and read as text
   - Unsupported types → set `indexError`, skip

2. **Chunk text** into ~500-token segments:
   - Split on heading boundaries (markdown `#`/`##`, bold lines)
   - 50-token overlap between chunks for context continuity
   - Track nearest heading per chunk
   - Track page number for PDFs

3. **Store chunks** in `DocumentChunk` table within a transaction:
   - Delete old chunks if re-indexing
   - Insert new chunks
   - Raw SQL to generate `tsvector`:
     ```sql
     UPDATE "DocumentChunk"
     SET "searchVector" = to_tsvector('english', content)
     WHERE "documentId" = $1
     ```

4. **Mark document** as `indexed = true`, set `indexedAt`

### Re-indexing

- On document file update: re-index automatically
- On soft-delete: chunks remain but excluded from search (`WHERE d.deleted = false`)
- Manual reindex endpoint for owner role

---

## Search

### Function: `searchChunks(query, limit = 8)`

```sql
SELECT dc.*, d.title, d."fileName",
  ts_rank(dc."searchVector", plainto_tsquery('english', $1)) AS rank
FROM "DocumentChunk" dc
JOIN "Document" d ON d.id = dc."documentId"
WHERE dc."searchVector" @@ plainto_tsquery('english', $1)
  AND d.deleted = false
ORDER BY rank DESC
LIMIT $2
```

Returns chunks grouped by source document with title, heading, and rank score.

---

## AI Integration

### Prompt Template: `knowledge/answer`

New entry in `AiPromptTemplate` seed:

- **Slug:** `knowledge/answer`
- **Model:** `claude-haiku-4-5-20251001` (fast + cheap for retrieval Q&A)
- **Max tokens:** 1024

**Prompt structure:**

```
You are a knowledge assistant for Amana OSHC staff.
Answer questions using ONLY the provided document excerpts.

RULES:
- Cite sources: "According to [Document Title], Section [heading]..."
- Confident answer if excerpts contain a clear match
- Partial answer with uncertainty flag (⚠️) if excerpts are partially relevant
- "I couldn't find this in your uploaded documents" if no match,
  then offer general guidance with "⚠️ Not from your documents" label
- Australian English, concise, practical

DOCUMENT EXCERPTS:
{{chunks}}

QUESTION: {{question}}
```

### Token Budget Per Question

| Component | Tokens |
|-----------|--------|
| System prompt | ~300 |
| 8 chunks × ~500 tokens | ~4,000 |
| Response | ~500 |
| **Total** | **~4,800** |

Cost: ~$0.02/question on Haiku.

### Two Access Points

**1. Existing Assistant — New Tool**

Add `search_knowledge_base` to `ai-tools.ts`:

```typescript
{
  name: "search_knowledge_base",
  description: "Search uploaded policies, procedures, SOPs, and guides. Use when staff ask about company policies, procedures, compliance requirements, or operational guidelines.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keywords rephrased from the user's question"
      }
    },
    required: ["query"]
  }
}
```

Tool handler calls `searchChunks(query)` and returns formatted chunk text for Claude to synthesize.

**2. Dedicated /knowledge Page**

Uses `POST /api/knowledge/ask` — a direct route that does search + Claude call in one step (no tool-use loop). Simpler and faster than the assistant's multi-tool approach.

---

## API Routes

### POST /api/knowledge/ask

- **Auth:** `withApiAuth` — all roles
- **Body:** `{ question: string }` (Zod validated, min 3 chars, max 500)
- **Rate limit:** 30 req/min per user
- **Flow:** searchChunks → build prompt with template → stream Claude response via SSE
- **Response:** SSE stream with text deltas, final event includes source metadata
- **Usage logging:** Logs to `AiUsage` table with section `"knowledge"`

### POST /api/knowledge/index

- **Auth:** `withApiAuth` — admin/owner/head_office
- **Body:** `{ documentId: string }`
- **Flow:** download file → extractText → chunkText → upsert chunks → update tsvector → set indexed
- **Response:** `{ chunksCreated: number, tokenCount: number }`

### POST /api/knowledge/reindex

- **Auth:** `withApiAuth` — owner only
- **Body:** none
- **Flow:** fetch all non-deleted documents → delete all chunks → re-extract and chunk → update flags
- **Response:** `{ documentsProcessed: number, totalChunks: number, errors: string[] }`

### GET /api/knowledge/status

- **Auth:** `withApiAuth` — all roles
- **Response:** `{ totalDocuments, indexedDocuments, totalChunks, lastIndexedAt, errors: { documentId, title, error }[] }`

---

## /knowledge Page UI

### Desktop Layout

- **Header:** "Knowledge Base" title + "Ask questions about policies, procedures & SOPs" subtitle + index status badge ("42 documents indexed" / green READY)
- **Suggested questions:** Clickable chips — "What's our anaphylaxis procedure?", "Sun safety requirements", "Sign-in/out procedure for parents", "Staff-to-child ratios"
- **Chat area:** Max-width 720px, centered. User messages right-aligned (indigo), agent messages left-aligned (white card with border)
- **Source citations:** Indigo left-border card below each answer showing document title, version, upload date. Clickable link to `/documents`
- **Confidence indicators:** Indigo border = from docs. Amber border + ⚠️ = general knowledge
- **Input:** Textarea with send button, streaming with abort

### Mobile Layout

- Horizontal scrolling suggested question chips
- Compact message bubbles
- Fixed bottom input bar
- Same functionality, responsive breakpoint at `sm:` (640px)

### Navigation

Add to `nav-config.ts` under **Operations** section:
- Label: "Knowledge Base"
- Icon: `BookOpen` (lucide-react)
- Path: `/knowledge`
- Roles: all (every staff member can look up policies)

---

## File Processing Library

### New file: `src/lib/document-indexer.ts`

Four core functions:

1. **`extractText(fileUrl: string, mimeType: string): Promise<string>`**
   - PDF → `pdf-parse`
   - DOCX → `mammoth`
   - TXT/MD/CSV → fetch as text
   - Other → throw with descriptive error

2. **`chunkText(text: string, options?): DocumentChunkData[]`**
   - Split on heading boundaries
   - Target ~500 tokens per chunk
   - 50-token overlap
   - Return: `{ content, heading, chunkIndex, pageNumber?, tokenCount }`

3. **`indexDocument(documentId: string): Promise<IndexResult>`**
   - Orchestrates: fetch doc → download file → extract → chunk → store → update tsvector
   - Transaction for chunk upsert
   - Sets `indexed`, `indexedAt`, clears `indexError` on success
   - Sets `indexError` on failure

4. **`searchChunks(query: string, limit?: number): Promise<SearchResult[]>`**
   - Raw SQL with `ts_rank` and `plainto_tsquery`
   - Groups results by document
   - Returns chunks with document metadata

---

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `pdf-parse` | Extract text from PDF files | ~50KB, zero native deps |

`mammoth` is already installed for DOCX parsing.

---

## Integration Points

### Existing Document Upload Routes

- `POST /api/documents` — after creating Document record, fire-and-forget `indexDocument(id)`
- `POST /api/documents/bulk` — after bulk creation, loop and `indexDocument(id)` for each
- `PATCH /api/documents/[id]` — if `fileUrl` changed, re-index
- `DELETE /api/documents/[id]` — soft delete; chunks excluded from search via `WHERE d.deleted = false`

### Existing Assistant

- Add `search_knowledge_base` tool to `ai-tools.ts` tool definitions
- Add tool handler in `assistant/chat/route.ts` tool execution switch

### Existing AI Infrastructure

- New prompt template seed: `knowledge/answer`
- Usage logging to existing `AiUsage` table with `section: "knowledge"`
- Reuse `AMANA_SYSTEM_PROMPT` as base context

---

## Testing Plan

### Route Tests

- `/api/knowledge/ask` — auth (401), validation (400), empty results, successful Q&A with mocked Claude, rate limiting
- `/api/knowledge/index` — auth (401), role check (403), invalid doc (404), successful indexing with mocked file
- `/api/knowledge/reindex` — owner-only (403), successful bulk reindex
- `/api/knowledge/status` — returns correct counts

### Library Tests

- `extractText` — PDF extraction, DOCX extraction, TXT passthrough, unsupported type error
- `chunkText` — heading splitting, overlap, token counting, empty input
- `searchChunks` — mocked Prisma raw query, result grouping
- `indexDocument` — full pipeline with mocked dependencies

### Integration with Upload

- Verify indexing triggered after single upload
- Verify indexing triggered after bulk upload
- Verify re-indexing on file update
- Verify soft-deleted docs excluded from search

---

## Future Upgrade Path (Vectors)

When document count exceeds ~500 or semantic search is needed:

1. Enable `pgvector` extension on Railway PostgreSQL
2. Add `embedding Float[]` column to `DocumentChunk`
3. Add embedding generation step to `indexDocument` (Voyage API)
4. Add `searchChunksByEmbedding` function using cosine similarity
5. Swap search function in `/api/knowledge/ask` — no other changes needed

Estimated upgrade effort: 1 day.
