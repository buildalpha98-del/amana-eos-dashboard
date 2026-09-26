import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async (_i?: unknown) => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async (..._a: unknown[]) => 0),
}));
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
