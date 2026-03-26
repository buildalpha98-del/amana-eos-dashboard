# Knowledge Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a document-aware knowledge agent that answers staff questions grounded in uploaded policies, procedures, and SOPs with source citations.

**Architecture:** PostgreSQL full-text search (tsvector) over ~500-token document chunks. Two access points: new `search_knowledge_base` tool in existing assistant + dedicated `/knowledge` Q&A page. Auto-indexes documents on upload via fire-and-forget pipeline.

**Tech Stack:** Prisma ORM, PostgreSQL tsvector/ts_rank, pdf-parse, mammoth, Anthropic Claude Haiku, SSE streaming, React Query.

**Spec:** `docs/superpowers/specs/2026-03-26-knowledge-agent-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/document-indexer.ts` | Text extraction, chunking, indexing, search (4 core functions) |
| `src/app/api/knowledge/ask/route.ts` | Q&A endpoint — search + stream Claude response |
| `src/app/api/knowledge/index/route.ts` | Index a single document |
| `src/app/api/knowledge/reindex/route.ts` | Bulk reindex all documents |
| `src/app/api/knowledge/status/route.ts` | Index status for UI badge |
| `src/app/(dashboard)/knowledge/page.tsx` | Knowledge Base Q&A page |
| `src/hooks/useKnowledge.ts` | Client hooks — useKnowledgeStatus, useKnowledgeAsk |
| `src/__tests__/lib/document-indexer.test.ts` | Unit tests for indexer library |
| `src/__tests__/api/knowledge.test.ts` | Route tests for all 4 knowledge endpoints |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add DocumentChunk model, add indexed/indexedAt/indexError to Document |
| `prisma/seed.ts` | Add `knowledge/answer` prompt template |
| `src/lib/ai-tools.ts` | Add `search_knowledge_base` tool definition + handler |
| `src/app/api/documents/route.ts` | Fire-and-forget indexDocument after POST create |
| `src/app/api/documents/bulk/route.ts` | Fire-and-forget indexDocument after bulk create |
| `src/app/api/documents/[id]/route.ts` | Re-index on fileUrl change in PATCH |
| `src/lib/nav-config.ts` | Add Knowledge Base nav item under Operations |
| `package.json` | Add pdf-parse dependency |

---

## Chunk 1: Database & Dependencies

### Task 1: Install pdf-parse and add Prisma schema

**Files:**
- Modify: `package.json` — add pdf-parse
- Modify: `prisma/schema.prisma:1554-1579` — add fields to Document, add DocumentChunk model

- [ ] **Step 1: Install pdf-parse**

```bash
npm install pdf-parse
```

- [ ] **Step 2: Add indexed fields to Document model**

In `prisma/schema.prisma`, add these fields to the `Document` model (after `deleted` field, around line 1571):

```prisma
  indexed      Boolean          @default(false)
  indexedAt     DateTime?
  indexError    String?
  chunks       DocumentChunk[]
```

- [ ] **Step 3: Add DocumentChunk model**

Add after the `DocumentFolder` model (after line 1592):

```prisma
model DocumentChunk {
  id           String   @id @default(cuid())
  documentId   String
  document     Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex   Int
  content      String   @db.Text
  heading      String?
  pageNumber   Int?
  tokenCount   Int
  searchVector Unsupported("tsvector")?
  createdAt    DateTime @default(now())

  @@index([documentId])
  @@unique([documentId, chunkIndex])
}
```

Note: The GIN index on searchVector will be added via raw SQL in the migration, since Prisma doesn't support `@@index` on `Unsupported` types.

- [ ] **Step 4: Create migration**

```bash
npx prisma migrate dev --name add-document-chunks
```

After the migration is created, open the generated migration SQL file and append:

```sql
CREATE INDEX IF NOT EXISTS "DocumentChunk_searchVector_idx" ON "DocumentChunk" USING GIN ("searchVector");
```

Then re-apply:

```bash
npx prisma migrate dev
```

- [ ] **Step 5: Verify migration applied**

```bash
npx prisma db push --dry-run
```

Expected: No changes needed (migration already applied).

- [ ] **Step 6: Commit**

```bash
git add prisma/ package.json package-lock.json
git commit -m "feat: add DocumentChunk model with tsvector for knowledge agent"
```

---

### Task 2: Seed knowledge/answer prompt template

**Files:**
- Modify: `prisma/seed.ts:~1850` — add template to aiTemplates array

- [ ] **Step 1: Add template to seed**

In `prisma/seed.ts`, find the `aiTemplates` array and add this entry:

```typescript
{
  slug: "knowledge/answer",
  name: "Knowledge Base Answer",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 1024,
  variables: JSON.stringify(["chunks", "question"]),
  promptTemplate: `You are a knowledge assistant for Amana OSHC staff.
Answer questions using ONLY the provided document excerpts.

RULES:
- Cite sources: "According to [Document Title], Section [heading]..."
- Confident answer if excerpts contain a clear match
- Partial answer with uncertainty flag (⚠️) if excerpts are partially relevant
- "I couldn't find this in your uploaded documents" if no match, then offer general guidance with "⚠️ Not from your documents" label
- Use Australian English
- Be concise and practical — staff need quick answers

DOCUMENT EXCERPTS:
{{chunks}}

QUESTION: {{question}}`
},
```

- [ ] **Step 2: Run seed**

```bash
npx prisma db seed
```

Expected: Template upserted without errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: add knowledge/answer AI prompt template"
```

---

## Chunk 2: Document Indexer Library

### Task 3: Write document-indexer tests

**Files:**
- Create: `src/__tests__/lib/document-indexer.test.ts`

- [ ] **Step 1: Write extractText tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "PDF content here\nPage 2 content" }),
}));

// Mock mammoth
vi.mock("mammoth", () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: "DOCX content here" }),
}));

// Mock global fetch for file downloads
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { extractText, chunkText, searchChunks } from "@/lib/document-indexer";

describe("extractText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      text: () => Promise.resolve("Plain text content"),
    });
  });

  it("extracts text from PDF files", async () => {
    const result = await extractText("https://blob.vercel.com/test.pdf", "application/pdf");
    expect(result).toBe("PDF content here\nPage 2 content");
  });

  it("extracts text from DOCX files", async () => {
    const result = await extractText(
      "https://blob.vercel.com/test.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result).toBe("DOCX content here");
  });

  it("reads plain text files directly", async () => {
    const result = await extractText("https://blob.vercel.com/test.txt", "text/plain");
    expect(result).toBe("Plain text content");
  });

  it("reads markdown files directly", async () => {
    const result = await extractText("https://blob.vercel.com/test.md", "text/markdown");
    expect(result).toBe("Plain text content");
  });

  it("reads CSV files directly", async () => {
    const result = await extractText("https://blob.vercel.com/test.csv", "text/csv");
    expect(result).toBe("Plain text content");
  });

  it("throws for unsupported mime types", async () => {
    await expect(
      extractText("https://blob.vercel.com/test.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ).rejects.toThrow("Unsupported file type");
  });

  it("throws when file download fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      extractText("https://blob.vercel.com/missing.pdf", "application/pdf")
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write chunkText tests**

```typescript
describe("chunkText", () => {
  it("chunks text at heading boundaries", () => {
    const text = "# Introduction\nSome intro text here.\n\n# Section Two\nMore content here.";
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].heading).toBe("Introduction");
    expect(chunks[1].heading).toBe("Section Two");
  });

  it("respects token limit per chunk", () => {
    const longText = "Word ".repeat(600); // ~600 tokens
    const chunks = chunkText(longText);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(550); // ~500 + margin
    }
  });

  it("includes overlap between chunks", () => {
    const longText = "Word ".repeat(600);
    const chunks = chunkText(longText);
    if (chunks.length >= 2) {
      const end1 = chunks[0].content.slice(-100);
      const start2 = chunks[1].content.slice(0, 100);
      // Overlap means some text from end of chunk 1 appears at start of chunk 2
      expect(end1.length).toBeGreaterThan(0);
    }
  });

  it("handles empty text", () => {
    const chunks = chunkText("");
    expect(chunks).toEqual([]);
  });

  it("handles text with no headings", () => {
    const text = "Just a paragraph of text without any headings.";
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBeNull();
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it("tracks chunk index sequentially", () => {
    const text = "# A\nContent A\n\n# B\nContent B\n\n# C\nContent C";
    const chunks = chunkText(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it("estimates token count", () => {
    const text = "Hello world this is a test.";
    const chunks = chunkText(text);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
    // Rough estimate: ~1 token per 4 chars
    expect(chunks[0].tokenCount).toBeLessThan(text.length);
  });
});
```

- [ ] **Step 3: Write searchChunks tests**

```typescript
import { prismaMock } from "../helpers/prisma-mock";

describe("searchChunks", () => {
  it("returns ranked chunks grouped by document", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([
      {
        id: "chunk1",
        documentId: "doc1",
        content: "Medication must be in original packaging",
        heading: "Administration",
        chunkIndex: 0,
        tokenCount: 50,
        title: "Medication Policy",
        fileName: "medication-policy.pdf",
        rank: 0.95,
      },
      {
        id: "chunk2",
        documentId: "doc1",
        content: "Two educators must witness administration",
        heading: "Witnessing",
        chunkIndex: 1,
        tokenCount: 45,
        title: "Medication Policy",
        fileName: "medication-policy.pdf",
        rank: 0.82,
      },
    ]);

    const results = await searchChunks("medication administration");
    expect(results.length).toBe(1); // grouped by document
    expect(results[0].documentTitle).toBe("Medication Policy");
    expect(results[0].chunks.length).toBe(2);
    expect(results[0].chunks[0].rank).toBeGreaterThan(results[0].chunks[1].rank);
  });

  it("returns empty array when no matches", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    const results = await searchChunks("cryptocurrency payments");
    expect(results).toEqual([]);
  });

  it("respects limit parameter", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    await searchChunks("test query", 5);
    const call = prismaMock.$queryRawUnsafe.mock.calls[0];
    // Last parameter should be the limit
    expect(call[call.length - 1]).toBe(5);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npm test -- src/__tests__/lib/document-indexer.test.ts
```

Expected: FAIL — module `@/lib/document-indexer` does not exist yet.

- [ ] **Step 5: Commit test file**

```bash
git add src/__tests__/lib/document-indexer.test.ts
git commit -m "test: add document-indexer unit tests (red)"
```

---

### Task 4: Implement document-indexer.ts

**Files:**
- Create: `src/lib/document-indexer.ts`

- [ ] **Step 1: Write the indexer library**

```typescript
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────

export interface DocumentChunkData {
  content: string;
  heading: string | null;
  chunkIndex: number;
  pageNumber?: number;
  tokenCount: number;
}

export interface SearchResult {
  documentId: string;
  documentTitle: string;
  fileName: string;
  chunks: {
    id: string;
    content: string;
    heading: string | null;
    chunkIndex: number;
    tokenCount: number;
    rank: number;
  }[];
}

interface IndexResult {
  chunksCreated: number;
  totalTokens: number;
}

// ── Text Extraction ────────────────────────────────────────────────────

const TEXT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
];

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(
  fileUrl: string,
  mimeType: string
): Promise<string> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  if (mimeType === PDF_MIME) {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === DOCX_MIME) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (TEXT_MIME_TYPES.some((t) => mimeType.startsWith(t))) {
    return response.text();
  }

  throw new Error(
    `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, MD, CSV.`
  );
}

// ── Chunking ───────────────────────────────────────────────────────────

const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const HEADING_RE = /^#{1,3}\s+(.+)$/;

/** Rough token estimate: ~1 token per 4 characters */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string): DocumentChunkData[] {
  if (!text.trim()) return [];

  // Split into sections by headings
  const lines = text.split("\n");
  const sections: { heading: string | null; lines: string[] }[] = [];
  let current: { heading: string | null; lines: string[] } = {
    heading: null,
    lines: [],
  };

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      if (current.lines.length > 0 || current.heading !== null) {
        sections.push(current);
      }
      current = { heading: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.heading !== null) {
    sections.push(current);
  }

  // Build chunks from sections, splitting long sections
  const chunks: DocumentChunkData[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText && !section.heading) continue;

    const tokens = estimateTokens(sectionText);

    if (tokens <= TARGET_TOKENS) {
      // Section fits in one chunk
      if (sectionText) {
        chunks.push({
          content: sectionText,
          heading: section.heading,
          chunkIndex: chunkIndex++,
          tokenCount: tokens,
        });
      }
    } else {
      // Split long section into multiple chunks with overlap
      const words = sectionText.split(/\s+/);
      const wordsPerChunk = Math.floor(TARGET_TOKENS * 3.5); // ~3.5 chars/word avg
      const overlapWords = Math.floor(OVERLAP_TOKENS * 3.5);
      let start = 0;

      while (start < words.length) {
        const end = Math.min(start + wordsPerChunk, words.length);
        const chunkContent = words.slice(start, end).join(" ");
        const tokenCount = estimateTokens(chunkContent);

        chunks.push({
          content: chunkContent,
          heading: section.heading,
          chunkIndex: chunkIndex++,
          tokenCount,
        });

        start = end - overlapWords;
        if (start >= words.length - overlapWords) break;
      }
    }
  }

  return chunks;
}

// ── Indexing ────────────────────────────────────────────────────────────

export async function indexDocument(
  documentId: string
): Promise<IndexResult> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, fileUrl: true, mimeType: true, title: true },
  });

  if (!doc) throw new Error(`Document not found: ${documentId}`);
  if (!doc.mimeType) throw new Error(`Document has no mimeType: ${documentId}`);

  try {
    const text = await extractText(doc.fileUrl, doc.mimeType);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          indexed: true,
          indexedAt: new Date(),
          indexError: "No extractable text content",
        },
      });
      return { chunksCreated: 0, totalTokens: 0 };
    }

    // Transaction: delete old chunks, insert new ones
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId } });
      await tx.documentChunk.createMany({
        data: chunks.map((c) => ({
          documentId,
          chunkIndex: c.chunkIndex,
          content: c.content,
          heading: c.heading,
          pageNumber: c.pageNumber ?? null,
          tokenCount: c.tokenCount,
        })),
      });
    });

    // Generate tsvector via raw SQL (outside transaction for safety)
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentChunk" SET "searchVector" = to_tsvector('english', content) WHERE "documentId" = $1`,
      documentId
    );

    await prisma.document.update({
      where: { id: documentId },
      data: {
        indexed: true,
        indexedAt: new Date(),
        indexError: null,
      },
    });

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    logger.info("Document indexed", {
      documentId,
      title: doc.title,
      chunks: chunks.length,
      totalTokens,
    });

    return { chunksCreated: chunks.length, totalTokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.document.update({
      where: { id: documentId },
      data: { indexError: message },
    });
    logger.error("Document indexing failed", { documentId, error: message });
    throw err;
  }
}

// ── Search ─────────────────────────────────────────────────────────────

interface RawChunkRow {
  id: string;
  documentId: string;
  content: string;
  heading: string | null;
  chunkIndex: number;
  tokenCount: number;
  title: string;
  fileName: string;
  rank: number;
}

export async function searchChunks(
  query: string,
  limit: number = 8
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const rows = await prisma.$queryRawUnsafe<RawChunkRow[]>(
    `SELECT dc.id, dc."documentId", dc.content, dc.heading, dc."chunkIndex", dc."tokenCount",
            d.title, d."fileName",
            ts_rank(dc."searchVector", plainto_tsquery('english', $1)) AS rank
     FROM "DocumentChunk" dc
     JOIN "Document" d ON d.id = dc."documentId"
     WHERE dc."searchVector" @@ plainto_tsquery('english', $1)
       AND d.deleted = false
     ORDER BY rank DESC
     LIMIT $2`,
    query,
    limit
  );

  // Group by document
  const grouped = new Map<string, SearchResult>();
  for (const row of rows) {
    if (!grouped.has(row.documentId)) {
      grouped.set(row.documentId, {
        documentId: row.documentId,
        documentTitle: row.title,
        fileName: row.fileName,
        chunks: [],
      });
    }
    grouped.get(row.documentId)!.chunks.push({
      id: row.id,
      content: row.content,
      heading: row.heading,
      chunkIndex: row.chunkIndex,
      tokenCount: row.tokenCount,
      rank: Number(row.rank),
    });
  }

  return Array.from(grouped.values());
}

// ── Format for AI Prompt ───────────────────────────────────────────────

export function formatChunksForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return "No relevant documents found.";

  return results
    .map((doc) => {
      const header = `[Document: ${doc.documentTitle}]`;
      const chunkTexts = doc.chunks
        .map((c) => {
          const sectionLabel = c.heading ? `[Section: ${c.heading}]` : "";
          return `${sectionLabel}\n${c.content}`;
        })
        .join("\n\n");
      return `${header}\n${chunkTexts}`;
    })
    .join("\n\n---\n\n");
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- src/__tests__/lib/document-indexer.test.ts
```

Expected: All extractText and chunkText tests PASS. searchChunks tests PASS (with mocked prisma).

- [ ] **Step 3: Fix any failing tests and re-run**

Iterate until all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/document-indexer.ts
git commit -m "feat: implement document-indexer library (extract, chunk, index, search)"
```

---

## Chunk 3: API Routes

### Task 5: Write knowledge route tests

**Files:**
- Create: `src/__tests__/api/knowledge.test.ts`

- [ ] **Step 1: Write tests for all 4 routes**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock document-indexer
vi.mock("@/lib/document-indexer", () => ({
  indexDocument: vi.fn().mockResolvedValue({ chunksCreated: 5, totalTokens: 2500 }),
  searchChunks: vi.fn().mockResolvedValue([]),
  formatChunksForPrompt: vi.fn().mockReturnValue("No relevant documents found."),
}));

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Test answer" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}));

import { indexDocument, searchChunks, formatChunksForPrompt } from "@/lib/document-indexer";

describe("GET /api/knowledge/status", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/knowledge/status/route");
    GET = mod.GET;
  });

  it("returns 401 without session", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/knowledge/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns index status counts", async () => {
    mockSession({ role: "member" });
    prismaMock.document.count.mockImplementation((args: { where?: { deleted?: boolean; indexed?: boolean } } = {}) => {
      if (args.where?.indexed === true) return Promise.resolve(38);
      return Promise.resolve(42);
    });
    prismaMock.documentChunk.count.mockResolvedValue(190);
    prismaMock.document.findMany.mockResolvedValue([]);
    prismaMock.document.findFirst.mockResolvedValue({
      indexedAt: new Date("2026-03-26T10:00:00Z"),
    });

    const req = createRequest("GET", "/api/knowledge/status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDocuments).toBe(42);
    expect(body.indexedDocuments).toBe(38);
    expect(body.totalChunks).toBe(190);
  });
});

describe("POST /api/knowledge/index", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/knowledge/index/route");
    POST = mod.POST;
  });

  it("returns 401 without session", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "test123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    mockSession({ role: "member" });
    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "test123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing documentId", async () => {
    mockSession({ role: "admin" });
    const req = createRequest("POST", "/api/knowledge/index", {
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("indexes document successfully", async () => {
    mockSession({ role: "admin" });
    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "doc123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(indexDocument).toHaveBeenCalledWith("doc123");
  });
});

describe("POST /api/knowledge/reindex", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/knowledge/reindex/route");
    POST = mod.POST;
  });

  it("returns 403 for non-owner", async () => {
    mockSession({ role: "admin" });
    const req = createRequest("POST", "/api/knowledge/reindex");
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("reindexes all documents for owner", async () => {
    mockSession({ role: "owner" });
    prismaMock.document.findMany.mockResolvedValue([
      { id: "doc1", title: "Doc 1" },
      { id: "doc2", title: "Doc 2" },
    ]);
    const req = createRequest("POST", "/api/knowledge/reindex");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(indexDocument).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/knowledge/ask", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/knowledge/ask/route");
    POST = mod.POST;
  });

  it("returns 401 without session", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "What is our sun safety policy?" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for short question", async () => {
    mockSession({ role: "member" });
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "Hi" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing question", async () => {
    mockSession({ role: "member" });
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: {} },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/api/knowledge.test.ts
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/api/knowledge.test.ts
git commit -m "test: add knowledge API route tests (red)"
```

---

### Task 6: Implement knowledge API routes

**Files:**
- Create: `src/app/api/knowledge/status/route.ts`
- Create: `src/app/api/knowledge/index/route.ts`
- Create: `src/app/api/knowledge/reindex/route.ts`
- Create: `src/app/api/knowledge/ask/route.ts`

- [ ] **Step 1: Create GET /api/knowledge/status**

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

async function handler(_req: NextRequest) {
  const [totalDocuments, indexedDocuments, totalChunks, errors, lastIndexed] =
    await Promise.all([
      prisma.document.count({ where: { deleted: false } }),
      prisma.document.count({ where: { deleted: false, indexed: true } }),
      prisma.documentChunk.count(),
      prisma.document.findMany({
        where: { deleted: false, indexError: { not: null } },
        select: { id: true, title: true, indexError: true },
        take: 20,
      }),
      prisma.document.findFirst({
        where: { indexed: true },
        orderBy: { indexedAt: "desc" },
        select: { indexedAt: true },
      }),
    ]);

  return NextResponse.json({
    totalDocuments,
    indexedDocuments,
    totalChunks,
    lastIndexedAt: lastIndexed?.indexedAt ?? null,
    errors: errors.map((e) => ({
      documentId: e.id,
      title: e.title,
      error: e.indexError,
    })),
  });
}

export const GET = withApiAuth(handler);
```

- [ ] **Step 2: Create POST /api/knowledge/index**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { indexDocument } from "@/lib/document-indexer";

const schema = z.object({
  documentId: z.string().min(1),
});

async function handler(req: NextRequest) {
  const body = await parseJsonBody(req);
  const { documentId } = schema.parse(body);
  const result = await indexDocument(documentId);
  return NextResponse.json(result);
}

export const POST = withApiAuth(handler, {
  roles: ["owner", "head_office", "admin"],
});
```

- [ ] **Step 3: Create POST /api/knowledge/reindex**

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

async function handler(_req: NextRequest) {
  const documents = await prisma.document.findMany({
    where: { deleted: false },
    select: { id: true, title: true },
  });

  const errors: string[] = [];
  let totalChunks = 0;

  for (const doc of documents) {
    try {
      const result = await indexDocument(doc.id);
      totalChunks += result.chunksCreated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.title}: ${message}`);
      logger.warn("Reindex failed for document", {
        documentId: doc.id,
        error: message,
      });
    }
  }

  return NextResponse.json({
    documentsProcessed: documents.length,
    totalChunks,
    errors,
  });
}

export const POST = withApiAuth(handler, {
  roles: ["owner"],
  timeoutMs: 120_000, // 2 min for bulk reindex
});
```

- [ ] **Step 4: Create POST /api/knowledge/ask**

```typescript
import { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { searchChunks, formatChunksForPrompt } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import type { Session } from "next-auth";

const schema = z.object({
  question: z.string().min(3).max(500),
});

let anthropic: Anthropic | null = null;
function getAI(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw ApiError.badRequest("AI features not configured");
    }
    anthropic = new Anthropic();
  }
  return anthropic;
}

async function handler(req: NextRequest, session: Session) {
  const body = await parseJsonBody(req);
  const { question } = schema.parse(body);

  // Search for relevant chunks
  const results = await searchChunks(question, 8);
  const chunksText = formatChunksForPrompt(results);

  // Load prompt template
  const template = await prisma.aiPromptTemplate.findUnique({
    where: { slug: "knowledge/answer" },
  });

  if (!template) {
    throw ApiError.badRequest("Knowledge template not configured. Run prisma db seed.");
  }

  const prompt = template.promptTemplate
    .replace("{{chunks}}", chunksText)
    .replace("{{question}}", question);

  // Build source metadata for final event
  const sources = results.map((r) => ({
    documentId: r.documentId,
    title: r.documentTitle,
    fileName: r.fileName,
    chunkCount: r.chunks.length,
  }));

  const startTime = Date.now();

  // Stream response via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ai = getAI();
        const response = await ai.messages.create({
          model: template.model,
          max_tokens: template.maxTokens,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        // Send sources as final event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ sources, done: true })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // Log usage
        const durationMs = Date.now() - startTime;
        await prisma.aiUsage.create({
          data: {
            userId: session.user?.id ?? "unknown",
            templateSlug: "knowledge/answer",
            model: template.model,
            inputTokens: 0, // Not available from streaming
            outputTokens: 0,
            durationMs,
            section: "knowledge",
            metadata: { question, sourceCount: sources.length },
          },
        }).catch((err: unknown) => {
          logger.warn("Failed to log AI usage", { error: err });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI generation failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const POST = withApiAuth(handler, {
  rateLimit: { max: 30, windowMs: 60_000 },
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/__tests__/api/knowledge.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/knowledge/
git commit -m "feat: implement knowledge API routes (status, index, reindex, ask)"
```

---

## Chunk 4: Assistant Tool Integration & Upload Hooks

### Task 7: Add search_knowledge_base tool to assistant

**Files:**
- Modify: `src/lib/ai-tools.ts:14-141`

- [ ] **Step 1: Add tool definition to ASSISTANT_TOOLS array**

In `src/lib/ai-tools.ts`, add to the `ASSISTANT_TOOLS` array (after the last tool definition):

```typescript
{
  name: "search_knowledge_base",
  description:
    "Search uploaded policies, procedures, SOPs, and guides. Use when staff ask about company policies, procedures, compliance requirements, or operational guidelines.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Search keywords rephrased from the user's question about policies or procedures",
      },
    },
    required: ["query"],
  },
},
```

- [ ] **Step 2: Add tool handler to executeToolCall switch**

In the `executeToolCall` function's switch statement, add:

```typescript
case "search_knowledge_base": {
  const { searchChunks, formatChunksForPrompt } = await import(
    "@/lib/document-indexer"
  );
  const results = await searchChunks(input.query as string, 8);
  if (results.length === 0) {
    return JSON.stringify({
      message: "No matching documents found for this query.",
      suggestion:
        "The knowledge base may not have documents covering this topic yet.",
    });
  }
  return formatChunksForPrompt(results);
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai-tools.ts
git commit -m "feat: add search_knowledge_base tool to AI assistant"
```

---

### Task 8: Hook indexing into document upload routes

**Files:**
- Modify: `src/app/api/documents/route.ts:~106-120` — POST handler
- Modify: `src/app/api/documents/bulk/route.ts:~164-182` — POST handler

- [ ] **Step 1: Add auto-index to single document upload**

In `src/app/api/documents/route.ts`, after the `prisma.document.create()` call, add a fire-and-forget index call:

```typescript
// Fire-and-forget indexing — don't await, don't block upload response
import { indexDocument } from "@/lib/document-indexer";
// ... after const document = await prisma.document.create(...)
indexDocument(document.id).catch((err) => {
  logger.warn("Auto-index failed", { documentId: document.id, error: err });
});
```

Note: Import at top of file. The `.catch()` prevents unhandled promise rejection. The upload response returns immediately.

- [ ] **Step 2: Add auto-index to bulk upload**

In `src/app/api/documents/bulk/route.ts`, after the transaction creates documents, loop through and index:

```typescript
// Fire-and-forget indexing for each created document
import { indexDocument } from "@/lib/document-indexer";
// ... after const created = await prisma.$transaction(...)
for (const doc of created) {
  indexDocument(doc.id).catch((err) => {
    logger.warn("Auto-index failed", { documentId: doc.id, error: err });
  });
}
```

- [ ] **Step 3: Add re-index on PATCH when fileUrl changes**

In `src/app/api/documents/[id]/route.ts`, in the PATCH handler, after the `prisma.document.update()` call, check if fileUrl was part of the update and trigger re-indexing:

```typescript
import { indexDocument } from "@/lib/document-indexer";
// ... after const updated = await prisma.document.update(...)
// If the file was replaced, re-index
if (body.fileUrl && body.fileUrl !== existingDoc.fileUrl) {
  indexDocument(updated.id).catch((err) => {
    logger.warn("Re-index after file update failed", { documentId: updated.id, error: err });
  });
}
```

Note: You may need to fetch the existing document before the update to compare `fileUrl`. If the PATCH schema doesn't include `fileUrl`, add it as an optional field to the Zod schema: `fileUrl: z.string().url().optional()`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/documents/route.ts src/app/api/documents/bulk/route.ts src/app/api/documents/\[id\]/route.ts
git commit -m "feat: auto-index documents on upload and re-index on file update"
```

---

## Chunk 5: Client Hooks & Knowledge Page UI

### Task 9: Create useKnowledge hooks

**Files:**
- Create: `src/hooks/useKnowledge.ts`

- [ ] **Step 1: Write the hooks**

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { useState, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────

interface KnowledgeStatus {
  totalDocuments: number;
  indexedDocuments: number;
  totalChunks: number;
  lastIndexedAt: string | null;
  errors: { documentId: string; title: string; error: string }[];
}

interface KnowledgeSource {
  documentId: string;
  title: string;
  fileName: string;
  chunkCount: number;
}

export interface KnowledgeMessage {
  role: "user" | "assistant";
  content: string;
  sources?: KnowledgeSource[];
}

// ── Status Hook ────────────────────────────────────────────────────────

export function useKnowledgeStatus() {
  return useQuery<KnowledgeStatus>({
    queryKey: ["knowledge-status"],
    queryFn: () => fetchApi<KnowledgeStatus>("/api/knowledge/status"),
    retry: 2,
    staleTime: 60_000,
  });
}

// ── Ask Hook (streaming) ───────────────────────────────────────────────

export function useKnowledgeAsk() {
  const [messages, setMessages] = useState<KnowledgeMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string) => {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.text,
                  };
                }
                return updated;
              });
            }

            if (parsed.sources) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    sources: parsed.sources,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", description: message });
      // Remove empty assistant message on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, ask, isStreaming, stopStreaming, clearMessages };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useKnowledge.ts
git commit -m "feat: add useKnowledgeStatus and useKnowledgeAsk hooks"
```

---

### Task 10: Build /knowledge page

**Files:**
- Create: `src/app/(dashboard)/knowledge/page.tsx`
- Modify: `src/lib/nav-config.ts:74-82` — add nav item

- [ ] **Step 1: Create the knowledge page**

Build the page following the existing assistant page pattern (`src/app/(dashboard)/assistant/page.tsx`). Key elements:

- PageHeader with title "Knowledge Base" and subtitle
- Index status badge (useKnowledgeStatus) — green "READY" or amber "INDEXING"
- Suggested question chips (clickable, fill input)
- Chat area with user/assistant message bubbles
- Source citation cards below each assistant message
- Confidence indicator (indigo border for doc-sourced, amber for general)
- Textarea input with send button and abort
- Auto-scroll to bottom on new messages
- Responsive: mobile chips scroll horizontally, compact bubbles

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { BookOpen, Send, Square, Trash2 } from "lucide-react";
import { useKnowledgeAsk, useKnowledgeStatus, KnowledgeMessage } from "@/hooks/useKnowledge";
import { PageHeader } from "@/components/ui/PageHeader";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SUGGESTED_QUESTIONS = [
  "What's our anaphylaxis procedure?",
  "Sun safety requirements",
  "Sign-in/out procedure for parents",
  "Staff-to-child ratios",
  "Medication administration policy",
  "Child protection reporting process",
];

export default function KnowledgePage() {
  const { messages, ask, isStreaming, stopStreaming, clearMessages } =
    useKnowledgeAsk();
  const { data: status } = useKnowledgeStatus();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput("");
    ask(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Knowledge Base"
        subtitle="Ask questions about policies, procedures & SOPs"
        icon={BookOpen}
      >
        <div className="flex items-center gap-2">
          {status && (
            <>
              <span className="text-xs text-muted-foreground">
                {status.indexedDocuments} of {status.totalDocuments} documents
                indexed
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  status.indexedDocuments === status.totalDocuments
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
              >
                {status.indexedDocuments === status.totalDocuments
                  ? "READY"
                  : "INDEXING"}
              </span>
            </>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
        <div className="max-w-[720px] mx-auto">
          {/* Suggested questions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mt-6 mb-8">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    ask(q);
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} isStreaming={isStreaming && i === messages.length - 1} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-background px-4 sm:px-6 py-3">
        <div className="max-w-[720px] mx-auto flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about any policy or procedure..."
            rows={1}
            className="flex-1 resize-none rounded-xl border-2 border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="shrink-0 w-10 h-10 rounded-xl bg-destructive flex items-center justify-center text-destructive-foreground transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: KnowledgeMessage;
  isStreaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%]">
        <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-sm text-sm">
          {message.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <div className="flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}
        </div>
        {/* Source citations */}
        {hasSources && (
          <div className="mt-1.5 px-3 py-2 border-l-3 border-primary bg-primary/5 rounded-r-lg text-xs text-muted-foreground">
            {message.sources!.map((s, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <a
                  href={`/documents?search=${encodeURIComponent(s.title)}`}
                  className="hover:underline"
                >
                  📄 {s.title}
                </a>
              </span>
            ))}
          </div>
        )}
        {/* No sources warning */}
        {!isStreaming && message.content && !hasSources && (
          <div className="mt-1.5 px-3 py-2 border-l-3 border-amber-500 bg-amber-500/5 rounded-r-lg text-xs text-muted-foreground">
            ⚠️ No matching documents found
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to navigation**

In `src/lib/nav-config.ts`, in the Operations section (around line 74-82), add:

```typescript
{
  href: "/knowledge",
  label: "Knowledge Base",
  icon: BookOpen,
  section: "Operations",
},
```

Import `BookOpen` from lucide-react at the top of the file if not already imported.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Verify dev server**

```bash
npm run dev
```

Navigate to `/knowledge` — page should render with suggested questions and status badge.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/knowledge/ src/lib/nav-config.ts
git commit -m "feat: add /knowledge page with chat UI, nav item, and source citations"
```

---

## Chunk 6: Final Verification & Cleanup

### Task 11: Run full test suite and build

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass including new document-indexer and knowledge route tests.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No new lint errors.

- [ ] **Step 4: Verify no console.log in new files**

Check all new files for stray console.log/warn/error (should use logger instead):

```bash
grep -rn "console\.\(log\|warn\|error\)" src/lib/document-indexer.ts src/app/api/knowledge/ src/hooks/useKnowledge.ts src/app/\(dashboard\)/knowledge/
```

Expected: No matches.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address test/lint/build issues for knowledge agent"
```

---

### Task 12: Manual smoke test checklist

Before declaring done, verify these flows:

- [ ] Upload a PDF document via `/documents` → verify it gets `indexed: true` in DB
- [ ] Upload a DOCX document → verify chunks created in DocumentChunk table
- [ ] Go to `/knowledge` → verify status badge shows correct count
- [ ] Ask "What's our medication procedure?" → verify streaming answer with source citation
- [ ] Ask something not in documents → verify amber "Not from your documents" warning
- [ ] Go to `/assistant` → ask a policy question → verify assistant uses `search_knowledge_base` tool
- [ ] Test on mobile viewport → verify responsive layout
