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

import { POST as publishCascade } from "@/app/api/communication/cascade/route";
import { POST as remindCascade } from "@/app/api/communication/cascade/[id]/remind/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = { params: Promise.resolve({ id: "c-1" }) };

describe("POST /api/communication/cascade — publish fan-out (2026-08-31)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.cascadeMessage.create.mockResolvedValue({
      id: "c-1",
      meeting: { id: "m-1", title: "Leadership L10", date: new Date() },
      _count: { acknowledgments: 0 },
      acknowledgments: [],
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
  });

  it("notifies every active user EXCEPT the publisher, once per batch", async () => {
    const res = await publishCascade(
      createRequest("POST", "/api/communication/cascade", {
        body: { meetingId: "m-1", message: "Big news" },
      }),
    );
    expect(res.status).toBe(201);

    const userQuery = prismaMock.user.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(userQuery.where.active).toBe(true);
    expect(userQuery.where.id).toEqual({ not: "u1" });

    const notif = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string; link: string }>;
    };
    expect(notif.data).toHaveLength(2);
    expect(notif.data[0].type).toBe("cascade_published");
    expect(notif.data[0].link).toBe("/communication?tab=cascade");
  });

  it("publish still succeeds when the fan-out throws (swallow-and-log)", async () => {
    prismaMock.userNotification.createMany.mockRejectedValue(new Error("db"));
    const res = await publishCascade(
      createRequest("POST", "/api/communication/cascade", {
        body: { meetingId: "m-1", message: "Big news" },
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/communication/cascade/[id]/remind", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "head_office" });
    mockSession({ id: "u1", name: "SM", role: "head_office" });
    prismaMock.cascadeMessage.findFirst.mockResolvedValue({
      id: "c-1",
      message: "Please read the new pickup policy",
      meeting: { title: "Leadership L10" },
      acknowledgments: [{ userId: "u1" }, { userId: "u2" }],
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "u3" }, { id: "u4" }]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
  });

  it("401s unauthenticated", async () => {
    mockNoSession();
    const res = await remindCascade(
      createRequest("POST", "/api/communication/cascade/c-1/remind"),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it.each([["member"], ["marketing"], ["staff"]])(
    "403s for role %s",
    async (role) => {
      prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
      mockSession({ id: "u1", name: "U", role: role as MockUserRole });
      const res = await remindCascade(
        createRequest("POST", "/api/communication/cascade/c-1/remind"),
        ctx,
      );
      expect(res.status).toBe(403);
    },
  );

  it("reminds only active users WITHOUT an ack row", async () => {
    const res = await remindCascade(
      createRequest("POST", "/api/communication/cascade/c-1/remind"),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reminded).toBe(2);

    const userQuery = prismaMock.user.findMany.mock.calls[0][0] as {
      where: { id: { notIn: string[] } };
    };
    expect(userQuery.where.id.notIn.sort()).toEqual(["u1", "u2"]);

    const notif = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string }>;
    };
    expect(notif.data.map((n) => n.userId).sort()).toEqual(["u3", "u4"]);
    expect(notif.data[0].type).toBe("cascade_reminder");
  });

  it("reports zero when everyone has acknowledged", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const res = await remindCascade(
      createRequest("POST", "/api/communication/cascade/c-1/remind"),
      ctx,
    );
    expect((await res.json()).reminded).toBe(0);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });

  it("is rate-limited (3/hour) at the route options level", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      limited: true,
      resetIn: 1000,
    });
    const res = await remindCascade(
      createRequest("POST", "/api/communication/cascade/c-1/remind"),
      ctx,
    );
    expect(res.status).toBe(429);
  });
});
