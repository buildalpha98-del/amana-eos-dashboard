import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

// Mute structured logger but preserve generateRequestId / other exports
// so withApiHandler still works.
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

const ORIGINAL_ENV = { ...process.env };

describe("/api/cron/neon-snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T14:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEON_API_KEY = "napi_test_key";
    process.env.NEON_PROJECT_ID = "proj-test";
    // Default: no prior run for this period.
    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({
      id: "run-1",
      cronName: "neon-snapshot",
      period: "2026-04-30",
      status: "running",
    });
    prismaMock.cronRun.update.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/cron/neon-snapshot/route");
    const res = await GET(createRequest("GET", "/api/cron/neon-snapshot"));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates today's snapshot branch when none exists and reaps old ones", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1) initial list — only production
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              { id: "br-prod", name: "production", primary: true, default: true, created_at: "2026-04-04T00:00:00Z" },
            ],
          }),
          { status: 200 },
        ),
      )
      // 2) create today's snapshot
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branch: { id: "br-today", name: "snapshot-2026-04-30", created_at: "2026-04-30T14:00:00Z" },
          }),
          { status: 200 },
        ),
      )
      // 3) re-list to find expirables — includes one too-old snapshot
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              { id: "br-prod", name: "production", primary: true, default: true, created_at: "2026-04-04T00:00:00Z" },
              { id: "br-today", name: "snapshot-2026-04-30", created_at: "2026-04-30T14:00:00Z" },
              { id: "br-old", name: "snapshot-2026-04-10", created_at: "2026-04-10T14:00:00Z" },
            ],
          }),
          { status: 200 },
        ),
      )
      // 4) delete the expired one
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const { GET } = await import("@/app/api/cron/neon-snapshot/route");
    const res = await GET(
      createRequest("GET", "/api/cron/neon-snapshot", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.created).toBe("br-today");
    expect(body.todaySnapshotAlreadyExisted).toBe(false);
    expect(body.deletedCount).toBe(1);

    // Verify the create call payload (no parent_timestamp = HEAD).
    const createCall = fetchSpy.mock.calls[1];
    const createBody = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(createBody).toEqual({ branch: { name: "snapshot-2026-04-30" } });

    // Verify the delete used the expired branch id.
    const deleteCall = fetchSpy.mock.calls[3];
    expect(deleteCall[0]).toContain("/branches/br-old");
    expect((deleteCall[1] as RequestInit).method).toBe("DELETE");
  });

  it("is idempotent — does not recreate today's snapshot if it already exists", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1) initial list — today's snapshot already there
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              { id: "br-prod", name: "production", primary: true, default: true, created_at: "2026-04-04T00:00:00Z" },
              { id: "br-today", name: "snapshot-2026-04-30", created_at: "2026-04-30T05:00:00Z" },
            ],
          }),
          { status: 200 },
        ),
      );
    // No more fetch calls expected (no create, no re-list since nothing was created
    // and the original list has nothing reapable).

    const { GET } = await import("@/app/api/cron/neon-snapshot/route");
    const res = await GET(
      createRequest("GET", "/api/cron/neon-snapshot", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.created).toBeNull();
    expect(body.todaySnapshotAlreadyExisted).toBe(true);
    expect(body.deletedCount).toBe(0);
    // 1 list call only — no create, no second list, no delete.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never deletes the production branch even if name match would slip", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              { id: "br-prod", name: "production", primary: true, default: true, created_at: "2026-04-04T00:00:00Z" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branch: { id: "br-today", name: "snapshot-2026-04-30", created_at: "2026-04-30T14:00:00Z" },
          }),
          { status: 200 },
        ),
      )
      // re-list contains a branch with our prefix BUT it's flagged primary —
      // the reaper must skip it.
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              { id: "br-prod", name: "production", primary: true, default: true, created_at: "2026-04-04T00:00:00Z" },
              { id: "br-today", name: "snapshot-2026-04-30", created_at: "2026-04-30T14:00:00Z" },
              {
                id: "br-trap",
                name: "snapshot-2026-01-01",
                created_at: "2026-01-01T00:00:00Z",
                primary: true, // this should be enough to skip
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const { GET } = await import("@/app/api/cron/neon-snapshot/route");
    const res = await GET(
      createRequest("GET", "/api/cron/neon-snapshot", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.deletedCount).toBe(0);
  });

  it("returns 500 when NEON_PROJECT_ID is missing", async () => {
    delete process.env.NEON_PROJECT_ID;
    const { GET } = await import("@/app/api/cron/neon-snapshot/route");
    const res = await GET(
      createRequest("GET", "/api/cron/neon-snapshot", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(500);
  });
});
