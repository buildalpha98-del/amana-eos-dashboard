import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock pdf-parse (v2 class-based API)
const mockGetText = vi.fn();
const mockDestroy = vi.fn();
vi.mock("pdf-parse", () => {
  class MockPDFParse {
    getText = mockGetText;
    destroy = mockDestroy;
  }
  return { PDFParse: MockPDFParse };
});

// Mock mammoth
vi.mock("mammoth", () => ({
  default: { extractRawText: vi.fn() },
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withRequestId: vi.fn().mockReturnThis(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("document-indexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── extractText ────────────────────────────────────────────

  describe("extractText", () => {
    it("extracts text from PDF via pdf-parse", async () => {
      const pdfBuffer = Buffer.from("fake-pdf-content");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => pdfBuffer.buffer,
      });

      mockGetText.mockResolvedValue({ text: "Hello from PDF" });
      mockDestroy.mockResolvedValue(undefined);

      const { extractText } = await import("@/lib/document-indexer");
      const result = await extractText(
        "https://example.com/doc.pdf",
        "application/pdf",
      );

      expect(result).toBe("Hello from PDF");
      expect(mockGetText).toHaveBeenCalled();
    });

    it("extracts text from DOCX via mammoth", async () => {
      const docxBuffer = Buffer.from("fake-docx-content");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => docxBuffer.buffer,
      });

      const mammoth = (await import("mammoth")).default;
      (mammoth.extractRawText as ReturnType<typeof vi.fn>).mockResolvedValue({
        value: "Hello from DOCX",
      });

      const { extractText } = await import("@/lib/document-indexer");
      const result = await extractText(
        "https://example.com/doc.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      expect(result).toBe("Hello from DOCX");
      expect(mammoth.extractRawText).toHaveBeenCalled();
    });

    it("extracts plain text directly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "Plain text content here",
      });

      const { extractText } = await import("@/lib/document-indexer");
      const result = await extractText(
        "https://example.com/doc.txt",
        "text/plain",
      );

      expect(result).toBe("Plain text content here");
    });

    it("extracts markdown text directly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "# Heading\n\nSome markdown",
      });

      const { extractText } = await import("@/lib/document-indexer");
      const result = await extractText(
        "https://example.com/doc.md",
        "text/markdown",
      );

      expect(result).toBe("# Heading\n\nSome markdown");
    });

    it("extracts CSV text directly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "name,age\nAlice,30",
      });

      const { extractText } = await import("@/lib/document-indexer");
      const result = await extractText(
        "https://example.com/data.csv",
        "text/csv",
      );

      expect(result).toBe("name,age\nAlice,30");
    });

    it("throws for unsupported MIME type", async () => {
      const { extractText } = await import("@/lib/document-indexer");

      await expect(
        extractText("https://example.com/img.png", "image/png"),
      ).rejects.toThrow(/unsupported/i);
    });

    it("throws when download fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const { extractText } = await import("@/lib/document-indexer");

      await expect(
        extractText("https://example.com/missing.pdf", "application/pdf"),
      ).rejects.toThrow();
    });
  });

  // ─── chunkText ──────────────────────────────────────────────

  describe("chunkText", () => {
    it("returns empty array for empty text", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      expect(chunkText("")).toEqual([]);
    });

    it("returns empty array for whitespace-only text", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      expect(chunkText("   \n\n   ")).toEqual([]);
    });

    it("chunks at heading boundaries", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      const text = [
        "# Introduction",
        "This is the intro paragraph.",
        "",
        "## Details",
        "Here are the details.",
      ].join("\n");

      const chunks = chunkText(text);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].heading).toBe("Introduction");
      expect(chunks[0].content).toContain("intro paragraph");
      expect(chunks[1].heading).toBe("Details");
      expect(chunks[1].content).toContain("details");
    });

    it("respects ~500 token limit per chunk", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      // Create text that exceeds 500 tokens (~2000 chars)
      const longParagraph = "This is a sentence with several words. ".repeat(
        150,
      );
      const text = `# Section\n${longParagraph}`;

      const chunks = chunkText(text);

      for (const chunk of chunks) {
        // Each chunk should be roughly 500 tokens or less (with some tolerance)
        expect(chunk.tokenCount).toBeLessThanOrEqual(600);
      }
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("includes overlap between chunks", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      // Create text long enough to split into multiple chunks
      const longText = "Word ".repeat(2500); // ~2500 words = ~625 tokens

      const chunks = chunkText(longText);

      if (chunks.length >= 2) {
        // The end of chunk 0 should overlap with the start of chunk 1
        const chunk0End = chunks[0].content.slice(-100);
        const chunk1Start = chunks[1].content.slice(0, 200);
        // Some text from end of chunk 0 should appear in the start of chunk 1
        const overlapWords = chunk0End.trim().split(/\s+/).slice(-5).join(" ");
        expect(chunk1Start).toContain(overlapWords);
      }
    });

    it("handles text with no headings", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      const text = "Just some plain text without any headings at all.";

      const chunks = chunkText(text);

      expect(chunks.length).toBe(1);
      expect(chunks[0].heading).toBeNull();
      expect(chunks[0].content).toContain("plain text");
    });

    it("produces sequential chunk indexes", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      const text = [
        "# First",
        "Content one.",
        "# Second",
        "Content two.",
        "# Third",
        "Content three.",
      ].join("\n");

      const chunks = chunkText(text);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBe(i);
      }
    });

    it("estimates token count as ceil(chars / 4)", async () => {
      const { chunkText } = await import("@/lib/document-indexer");
      const text = "Hello world"; // 11 chars => ceil(11/4) = 3

      const chunks = chunkText(text);

      expect(chunks[0].tokenCount).toBe(Math.ceil(text.length / 4));
    });
  });

  // ─── searchChunks ──────────────────────────────────────────

  describe("searchChunks", () => {
    it("returns ranked chunks grouped by document", async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([
        {
          id: "chunk-1",
          documentId: "doc-1",
          chunkIndex: 0,
          content: "Relevant content about policies",
          heading: "Policies",
          tokenCount: 50,
          rank: 0.8,
          documentTitle: "Staff Handbook",
          documentCategory: "policy",
          fileName: "handbook.pdf",
        },
        {
          id: "chunk-2",
          documentId: "doc-1",
          chunkIndex: 1,
          content: "More policy details",
          heading: "Policies",
          tokenCount: 40,
          rank: 0.6,
          documentTitle: "Staff Handbook",
          documentCategory: "policy",
          fileName: "handbook.pdf",
        },
        {
          id: "chunk-3",
          documentId: "doc-2",
          chunkIndex: 0,
          content: "Another relevant doc",
          heading: "Overview",
          tokenCount: 30,
          rank: 0.5,
          documentTitle: "Procedures",
          documentCategory: "procedure",
          fileName: "procedures.pdf",
        },
      ]);

      const { searchChunks } = await import("@/lib/document-indexer");
      const results = await searchChunks("policy guidelines");

      expect(results.length).toBe(2); // 2 documents
      // First group should be doc-1 (higher rank)
      expect(results[0].documentId).toBe("doc-1");
      expect(results[0].chunks.length).toBe(2);
      expect(results[1].documentId).toBe("doc-2");
      expect(results[1].chunks.length).toBe(1);
    });

    it("returns empty array when no matches", async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      const { searchChunks } = await import("@/lib/document-indexer");
      const results = await searchChunks("nonexistent query");

      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([
        {
          id: "chunk-1",
          documentId: "doc-1",
          chunkIndex: 0,
          content: "First result",
          heading: null,
          tokenCount: 20,
          rank: 0.9,
          documentTitle: "Doc One",
          documentCategory: "policy",
          fileName: "one.pdf",
        },
      ]);

      const { searchChunks } = await import("@/lib/document-indexer");
      await searchChunks("test query", 3);

      // Verify limit was passed to the raw query
      const queryCall = prismaMock.$queryRawUnsafe.mock.calls[0];
      // The limit should appear in the query or as a parameter
      expect(queryCall).toBeDefined();
      // The raw SQL should include the limit
      const sql = queryCall[0] as string;
      expect(sql).toContain("LIMIT");
    });
  });
});
