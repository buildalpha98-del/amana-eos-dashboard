import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate limiting
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

// Mock document-indexer
vi.mock("@/lib/document-indexer", () => ({
  indexDocument: vi.fn(),
  searchChunks: vi.fn(),
  formatChunksForPrompt: vi.fn(),
}));

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  generateRequestId: vi.fn(() => "test1234"),
}));

// Mock ai module
vi.mock("@/lib/ai", () => ({
  getAI: vi.fn(),
}));

import { GET as getStatus } from "@/app/api/knowledge/status/route";
import { POST as postIndex } from "@/app/api/knowledge/index/route";
import { POST as postReindex } from "@/app/api/knowledge/reindex/route";
import { POST as postAsk } from "@/app/api/knowledge/ask/route";
import { indexDocument, searchChunks, formatChunksForPrompt } from "@/lib/document-indexer";
import { getAI } from "@/lib/ai";

const mockedIndexDocument = vi.mocked(indexDocument);
const mockedSearchChunks = vi.mocked(searchChunks);
const mockedFormatChunksForPrompt = vi.mocked(formatChunksForPrompt);
const mockedGetAI = vi.mocked(getAI);

// ─── GET /api/knowledge/status ────────────────────────────────

describe("GET /api/knowledge/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/knowledge/status");
    const res = await getStatus(req);
    expect(res.status).toBe(401);
  });

  it("returns correct knowledge status counts", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    // Use mockImplementation with arg matching for document.count
    prismaMock.document.count.mockImplementation(
      (args: { where?: { deleted?: boolean; indexed?: boolean } } | undefined) => {
        if (!args?.where || (args.where.deleted === false && !("indexed" in args.where))) {
          return Promise.resolve(10);
        }
        if (args.where.deleted === false && args.where.indexed === true) {
          return Promise.resolve(7);
        }
        return Promise.resolve(0);
      },
    );

    prismaMock.documentChunk.count.mockResolvedValue(42);

    prismaMock.document.findFirst.mockResolvedValue({
      indexedAt: new Date("2026-03-25T10:00:00Z"),
    });

    prismaMock.document.findMany.mockResolvedValue([
      { id: "doc-1", title: "Policy", indexError: "Failed to parse" },
    ]);

    const req = createRequest("GET", "/api/knowledge/status");
    const res = await getStatus(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalDocuments).toBe(10);
    expect(body.indexedDocuments).toBe(7);
    expect(body.totalChunks).toBe(42);
    expect(body.lastIndexedAt).toBe("2026-03-25T10:00:00.000Z");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].id).toBe("doc-1");
  });
});

// ─── POST /api/knowledge/index ────────────────────────────────

describe("POST /api/knowledge/index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "doc-1" },
    });
    const res = await postIndex(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });
    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "doc-1" },
    });
    const res = await postIndex(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing documentId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/knowledge/index", {
      body: {},
    });
    const res = await postIndex(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 and indexes document successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    mockedIndexDocument.mockResolvedValue(undefined);

    // After indexing, the route queries chunk count
    prismaMock.documentChunk.count.mockResolvedValue(5);

    const req = createRequest("POST", "/api/knowledge/index", {
      body: { documentId: "doc-1" },
    });
    const res = await postIndex(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.documentId).toBe("doc-1");
    expect(body.chunksCreated).toBe(5);

    expect(mockedIndexDocument).toHaveBeenCalledWith("doc-1");
  });
});

// ─── POST /api/knowledge/reindex ──────────────────────────────

describe("POST /api/knowledge/reindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 403 for non-owner roles", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/knowledge/reindex");
    const res = await postReindex(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 and reindexes all documents for owner", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.document.findMany.mockResolvedValue([
      { id: "doc-1", title: "Policy A" },
      { id: "doc-2", title: "Policy B" },
    ]);

    mockedIndexDocument.mockResolvedValue(undefined);
    prismaMock.documentChunk.count.mockResolvedValue(15);

    const req = createRequest("POST", "/api/knowledge/reindex");
    const res = await postReindex(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.documentsProcessed).toBe(2);
    expect(body.totalChunks).toBe(15);
    expect(body.errors).toHaveLength(0);

    expect(mockedIndexDocument).toHaveBeenCalledTimes(2);
    expect(mockedIndexDocument).toHaveBeenCalledWith("doc-1");
    expect(mockedIndexDocument).toHaveBeenCalledWith("doc-2");
  });
});

// ─── POST /api/knowledge/ask ──────────────────────────────────

describe("POST /api/knowledge/ask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "What is the leave policy?" },
    });
    const res = await postAsk(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for question shorter than 3 characters", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "Hi" },
    });
    const res = await postAsk(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing question", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/knowledge/ask", {
      body: {},
    });
    const res = await postAsk(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when AI is not configured", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    mockedGetAI.mockReturnValue(null);

    mockedSearchChunks.mockResolvedValue([]);
    mockedFormatChunksForPrompt.mockReturnValue("");

    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "What is the leave policy?" },
    });
    const res = await postAsk(req);
    expect(res.status).toBe(503);
  });

  it("returns SSE stream for valid question with AI configured", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const mockSearchResults = [
      {
        documentId: "doc-1",
        documentTitle: "Leave Policy",
        documentCategory: "policy",
        fileName: "leave-policy.pdf",
        chunks: [
          {
            id: "chunk-1",
            chunkIndex: 0,
            content: "All staff are entitled to 4 weeks annual leave.",
            heading: "Annual Leave",
            tokenCount: 12,
            rank: 0.9,
          },
        ],
      },
    ];
    mockedSearchChunks.mockResolvedValue(mockSearchResults);
    mockedFormatChunksForPrompt.mockReturnValue(
      "--- Leave Policy (policy) ---\nAll staff are entitled to 4 weeks annual leave.",
    );

    // Mock the AiPromptTemplate lookup
    prismaMock.aiPromptTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      slug: "knowledge/answer",
      promptTemplate: "Answer based on: {{context}}\n\nQuestion: {{question}}",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      active: true,
    });

    // Mock Anthropic client
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Staff get 4 weeks annual leave." }],
      usage: { input_tokens: 50, output_tokens: 20 },
    });
    mockedGetAI.mockReturnValue({
      messages: { create: mockCreate },
    } as any);

    // Mock AiUsage create
    prismaMock.aiUsage.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/knowledge/ask", {
      body: { question: "What is the leave policy?" },
    });
    const res = await postAsk(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    // Read the SSE stream
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain("[DONE]");
    // Should contain answer text
    expect(text).toContain("Staff get 4 weeks annual leave.");
    // Should contain sources in final event
    expect(text).toContain("Leave Policy");
  });
});
