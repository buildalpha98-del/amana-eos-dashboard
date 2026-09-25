import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET as listSeries, POST as createSeries } from "@/app/api/meetings/series/route";
import { PATCH as patchSeries, DELETE as deleteSeries } from "@/app/api/meetings/series/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = { params: Promise.resolve({ id: "srs-1" }) };

const validBody = {
  name: "Leadership L10",
  dayOfWeek: 2,
  minuteOfDay: 810,
  isLeadership: true,
  attendeeUserIds: ["u1", "u2"],
};

describe("/api/meetings/series", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.meetingSeries.create.mockResolvedValue({ id: "srs-1", ...validBody });
  });

  it("401s unauthenticated on POST", async () => {
    mockNoSession();
    const res = await createSeries(
      createRequest("POST", "/api/meetings/series", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it.each([["member"], ["staff"], ["eos_viewer"]])(
    "403s POST for role %s",
    async (role) => {
      prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
      mockSession({ id: "u1", name: "U", role: role as MockUserRole });
      const res = await createSeries(
        createRequest("POST", "/api/meetings/series", { body: validBody }),
      );
      expect(res.status).toBe(403);
    },
  );

  it.each([
    [{ ...validBody, dayOfWeek: 7 }],
    [{ ...validBody, dayOfWeek: -1 }],
    [{ ...validBody, minuteOfDay: 1440 }],
    [{ ...validBody, name: "" }],
  ])("400s invalid payload %#", async (body) => {
    const res = await createSeries(
      createRequest("POST", "/api/meetings/series", { body }),
    );
    expect(res.status).toBe(400);
  });

  it("creates with defaults (timezone Sydney, active)", async () => {
    const res = await createSeries(
      createRequest("POST", "/api/meetings/series", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const arg = prismaMock.meetingSeries.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.timezone).toBe("Australia/Sydney");
    expect(arg.data.createdById).toBe("u1");
  });

  it("GET lists series for any authed user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u9", active: true, role: "member" });
    mockSession({ id: "u9", name: "M", role: "member" });
    prismaMock.meetingSeries.findMany.mockResolvedValue([]);
    const res = await listSeries(createRequest("GET", "/api/meetings/series"));
    expect(res.status).toBe(200);
  });

  it("PATCH toggles active (pause)", async () => {
    prismaMock.meetingSeries.findUnique.mockResolvedValue({ id: "srs-1" });
    prismaMock.meetingSeries.update.mockResolvedValue({ id: "srs-1", active: false });
    const res = await patchSeries(
      createRequest("PATCH", "/api/meetings/series/srs-1", { body: { active: false } }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.meetingSeries.update).toHaveBeenCalledWith({
      where: { id: "srs-1" },
      data: { active: false },
    });
  });

  it("DELETE is owner/admin only and logs before deleting", async () => {
    prismaMock.meetingSeries.findUnique.mockResolvedValue({ id: "srs-1", name: "X" });
    prismaMock.meetingSeries.delete.mockResolvedValue({});
    const res = await deleteSeries(
      createRequest("DELETE", "/api/meetings/series/srs-1"),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();

    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "eos_implementer" });
    mockSession({ id: "u1", name: "I", role: "eos_implementer" as MockUserRole });
    const res2 = await deleteSeries(
      createRequest("DELETE", "/api/meetings/series/srs-1"),
      ctx,
    );
    expect(res2.status).toBe(403);
  });
});
