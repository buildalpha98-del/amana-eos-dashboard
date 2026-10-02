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
// `error` is widened here: the literal `null` would type the mock as never-erroring and reject the "boom" case below.
const runAdapter = vi.fn(async (..._a: unknown[]) => ({ id: "run1", counts: { created: 2 }, error: null as string | null }));
vi.mock("@/lib/knowledge/sync", () => ({ runAdapter: (...a: unknown[]) => runAdapter(...a) }));
import { GET } from "@/app/api/cron/knowledge-regulator-refresh/route";

describe("GET /api/cron/knowledge-regulator-refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquire.mockImplementation(async () => ({ acquired: true, complete, fail }));
    runAdapter.mockImplementation(async () => ({ id: "run1", counts: { created: 2 }, error: null }));
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
    expect(complete).toHaveBeenCalledWith({ runId: "run1", counts: { created: 2 } });
    expect(fail).not.toHaveBeenCalled();
  });
  it("fails the CronRun when the adapter records an error (still 200 with the error in the body)", async () => {
    runAdapter.mockImplementation(async () => ({ id: "run2", counts: { created: 0 }, error: "boom" }));
    const res = await GET(createRequest("GET", "/x", { headers: { authorization: "Bearer secret" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("run2");
    expect(body.error).toBe("boom");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((fail.mock.calls[0][0] as Error).message).toBe("boom");
    expect(complete).not.toHaveBeenCalled();
  });
});
