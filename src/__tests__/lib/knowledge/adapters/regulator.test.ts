import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async (_i?: unknown) => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async (..._a: unknown[]) => 0),
}));
// A mutable array (not a fresh literal) so individual tests can swap the
// source list in place — regulator.ts reads REGULATOR_SOURCES by property
// access on this same object every call, so splicing it here is visible
// there without re-importing anything.
const { sources } = vi.hoisted(() => ({
  sources: [] as { id: string; title: string; url: string; tier: string }[],
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
vi.mock("@/lib/document-indexer", () => ({ extractTextFromBuffer: vi.fn(async (b: Buffer) => b.toString("utf8")) }));
vi.mock("@/lib/knowledge/regulator-sources", () => ({ REGULATOR_SOURCES: sources }));
import { syncRegulator } from "@/lib/knowledge/adapters/regulator";

const DEFAULT_SOURCES = [
  { id: "ok", title: "OK page", url: "https://www.acecqa.gov.au/ok", tier: "general" },
  { id: "gone", title: "Gone", url: "https://www.acecqa.gov.au/gone", tier: "general" },
  { id: "bad-host", title: "Bad", url: "https://evil.example/x", tier: "general" },
];

describe("regulator adapter", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    sources.length = 0;
    sources.push(...DEFAULT_SOURCES);
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
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("follows one same-allow-list redirect, citing the original list url", async () => {
    sources.length = 0;
    sources.push({ id: "redirecting", title: "Redirecting", url: "https://www.acecqa.gov.au/old", tier: "general" });
    global.fetch = vi.fn(async (url: string) =>
      url === "https://www.acecqa.gov.au/old"
        ? new Response(null, { status: 301, headers: { location: "https://www.nhmrc.gov.au/new-slug" } })
        : new Response("<html><body><p>Moved content</p></body></html>", {
            status: 200, headers: { "content-type": "text/html" },
          }),
    ) as unknown as typeof fetch;

    const report = await syncRegulator();

    expect(report.errors).toEqual([]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      externalId: "redirecting",
      externalUrl: "https://www.acecqa.gov.au/old", // citation stays the list url, not the followed one
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect to a foreign host", async () => {
    sources.length = 0;
    sources.push({ id: "redirecting", title: "Redirecting", url: "https://www.acecqa.gov.au/old", tier: "general" });
    global.fetch = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }),
    ) as unknown as typeof fetch;

    const report = await syncRegulator();

    expect(report.errors).toEqual([{ id: "redirecting", error: "redirect to non-allow-listed host" }]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("declared Content-Length over the cap is rejected before reading", async () => {
    sources.length = 0;
    sources.push({ id: "big", title: "Big", url: "https://www.acecqa.gov.au/big", tier: "general" });
    global.fetch = vi.fn(async () =>
      new Response("ignored", {
        status: 200,
        headers: { "content-length": "9999999", "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const report = await syncRegulator();

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].id).toBe("big");
    expect(report.errors[0].error.startsWith("too large (declared")).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });
});
