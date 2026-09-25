/**
 * Same-origin streaming of files held in Vercel Blob storage.
 *
 * 2026-09-15 regression cover. Every HR file proxy answered with
 * `NextResponse.redirect(blobUrl)`. A top-level navigation followed it
 * happily, but an <iframe> did not: the app sets no CSP `frame-src`, so it
 * falls back to `default-src 'self'` and the browser rejects the
 * cross-origin hop. Staff clicking "View contract" got an error where the
 * contract should be, while "Open in new tab" on the very same URL worked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isStoredFileUrl, streamStoredFile } from "@/lib/blob-proxy";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const BLOB = "https://abc123.public.blob.vercel-storage.com/contract.pdf";

describe("isStoredFileUrl", () => {
  it("accepts our Blob storage hosts", () => {
    expect(isStoredFileUrl(BLOB)).toBe(true);
    expect(
      isStoredFileUrl("https://public.blob.vercel-storage.com/x.pdf"),
    ).toBe(true);
  });

  it("rejects every other host — this is the SSRF guard", () => {
    expect(isStoredFileUrl("https://evil.example.com/x.pdf")).toBe(false);
    expect(isStoredFileUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    // A lookalike suffix must not slip through.
    expect(
      isStoredFileUrl("https://public.blob.vercel-storage.com.evil.com/x"),
    ).toBe(false);
  });

  it("rejects non-https and malformed URLs", () => {
    expect(isStoredFileUrl("http://abc.public.blob.vercel-storage.com/x")).toBe(false);
    expect(isStoredFileUrl("file:///etc/passwd")).toBe(false);
    expect(isStoredFileUrl("not a url")).toBe(false);
  });
});

describe("streamStoredFile", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function upstream(body = "PDFBYTES", headers: Record<string, string> = {}) {
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/pdf", ...headers },
    });
  }

  it("returns the bytes over our own origin — no redirect", async () => {
    fetchMock.mockResolvedValue(upstream());
    const res = await streamStoredFile(BLOB, { fileName: "contract.pdf" });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    await expect(res.text()).resolves.toBe("PDFBYTES");
  });

  it("renders inline by default and attaches when asked", async () => {
    fetchMock.mockResolvedValue(upstream());
    const inline = await streamStoredFile(BLOB, { fileName: "contract.pdf" });
    expect(inline.headers.get("Content-Disposition")).toMatch(/^inline;/);

    fetchMock.mockResolvedValue(upstream());
    const attached = await streamStoredFile(BLOB, {
      fileName: "contract.pdf",
      download: true,
    });
    expect(attached.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });

  it("never lets a filename break out of the header", async () => {
    fetchMock.mockResolvedValue(upstream());
    const res = await streamStoredFile(BLOB, {
      fileName: 'ev"il\r\nX-Injected: 1.pdf',
    });
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).not.toContain('"ev"');
    expect(disposition).not.toContain("\n");
    expect(res.headers.get("X-Injected")).toBeNull();
  });

  it("falls back on a missing upstream content-type", async () => {
    // A stream body sets no Content-Type of its own — passing a string
    // would make undici stamp "text/plain" and the fallback would never run.
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("bytes"));
        c.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
    const res = await streamStoredFile(BLOB, {
      fileName: "c.pdf",
      fallbackContentType: "application/pdf",
    });
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("marks HR documents as uncacheable", async () => {
    fetchMock.mockResolvedValue(upstream());
    const res = await streamStoredFile(BLOB, { fileName: "c.pdf" });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("404s a URL that isn't our storage, without fetching it", async () => {
    await expect(
      streamStoredFile("https://evil.example.com/x.pdf", { fileName: "x" }),
    ).rejects.toThrow(/not found/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s when storage has no such object", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(
      streamStoredFile(BLOB, { fileName: "x.pdf" }),
    ).rejects.toThrow(/not found/i);
  });

  it("404s rather than throwing raw when storage is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      streamStoredFile(BLOB, { fileName: "x.pdf" }),
    ).rejects.toThrow(/not found/i);
  });
});
