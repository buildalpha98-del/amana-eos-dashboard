import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest } from "../../helpers/request";
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
import { NextResponse } from "next/server";
const complete = vi.fn(); const fail = vi.fn();
const acquire = vi.fn(async (..._a: unknown[]) => ({ acquired: true, complete, fail }));
vi.mock("@/lib/cron-guard", () => ({
  // Real contract: null = authorised, { error: NextResponse } = rejected.
  verifyCronSecret: (req: Request) =>
    req.headers.get("authorization") === "Bearer secret"
      ? null
      : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  acquireCronLock: (...a: unknown[]) => acquire(...a),
}));
const runAdapter = vi.fn(async (..._a: unknown[]) => ({ id: "run1", counts: { created: 2 }, error: null }));
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
