import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

// Control the cron guard directly (auth + lock).
const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(),
}));

const { logEnquiryStageEvent } = await import("@/lib/enquiry-stage-events");

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/enquiry-auto-cold", () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";

    verifyCronSecret.mockReturnValue(null);
    acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });

    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    verifyCronSecret.mockReturnValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/cron/enquiry-auto-cold/route");
    const res = await GET(createRequest("GET", "/api/cron/enquiry-auto-cold"));
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({
      acquired: false,
      reason: "already ran this week",
    });

    const { GET } = await import("@/app/api/cron/enquiry-auto-cold/route");
    const res = await GET(
      createRequest("GET", "/api/cron/enquiry-auto-cold", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.parentEnquiry.updateMany).not.toHaveBeenCalled();
  });

  it("moves untouched stale enquiries to cold and logs a stage event for each", async () => {
    prismaMock.parentEnquiry.findMany.mockResolvedValue([
      { id: "enq-1", touchpoints: [] },
      { id: "enq-2", touchpoints: [{ id: "tp-1" }] }, // recent touchpoint — stays
      { id: "enq-3", touchpoints: [] },
    ] as never);
    prismaMock.parentEnquiry.updateMany.mockResolvedValue({ count: 2 });

    const { GET } = await import("@/app/api/cron/enquiry-auto-cold/route");
    const res = await GET(
      createRequest("GET", "/api/cron/enquiry-auto-cold", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movedToCold).toBe(2);

    const call = prismaMock.parentEnquiry.updateMany.mock.calls[0][0];
    expect(call.where.id).toEqual({ in: ["enq-1", "enq-3"] });
    expect(call.data.stage).toBe("cold");

    expect(logEnquiryStageEvent).toHaveBeenCalledTimes(2);
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-1", "nurturing", "cold");
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-3", "nurturing", "cold");

    await Promise.resolve();
    expect(complete).toHaveBeenCalledWith({ coldedCount: 2 });
  });

  it("does not write or log events when nothing is stale", async () => {
    const { GET } = await import("@/app/api/cron/enquiry-auto-cold/route");
    const res = await GET(
      createRequest("GET", "/api/cron/enquiry-auto-cold", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.parentEnquiry.updateMany).not.toHaveBeenCalled();
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });
});
