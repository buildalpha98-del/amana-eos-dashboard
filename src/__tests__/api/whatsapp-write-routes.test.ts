import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { POST as QUICK_ENTRY_POST } from "@/app/api/marketing/whatsapp/quick-entry/route";
import { PATCH as CELL_PATCH } from "@/app/api/marketing/whatsapp/cell/route";
import { POST as FLAG_POST } from "@/app/api/marketing/whatsapp/cell/flag/route";
import { POST as NETWORK_POST_CREATE } from "@/app/api/marketing/whatsapp/network-post/route";
import { DELETE as NETWORK_POST_DELETE } from "@/app/api/marketing/whatsapp/network-post/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("POST /api/marketing/whatsapp/quick-entry", () => {
  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: { date: "2026-04-22", entries: [{ serviceId: "svc-1", posted: true }] },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for non-marketing role", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: { date: "2026-04-22", entries: [{ serviceId: "svc-1", posted: true }] },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 on weekend date", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: { date: "2026-04-25", entries: [{ serviceId: "svc-1", posted: true }] },
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Mon.+Fri/);
  });

  it("400 on invalid body", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: { entries: [] } as any,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on unknown serviceId", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1" }]);
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: { date: "2026-04-22", entries: [{ serviceId: "svc-X", posted: true }] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("upserts each entry and returns count", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1" }, { id: "svc-2" }]);
    prismaMock.whatsAppCoordinatorPost.upsert.mockResolvedValue({ id: "rec" });
    const res = await QUICK_ENTRY_POST(
      createRequest("POST", "/api/marketing/whatsapp/quick-entry", {
        body: {
          date: "2026-04-22",
          entries: [
            { serviceId: "svc-1", posted: true },
            { serviceId: "svc-2", posted: false, notPostingReason: "coordinator_sick" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved).toBe(2);
    expect(prismaMock.whatsAppCoordinatorPost.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("PATCH /api/marketing/whatsapp/cell", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await CELL_PATCH(
      createRequest("PATCH", "/api/marketing/whatsapp/cell", {
        body: { serviceId: "svc-1", date: "2026-04-22", posted: true },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 weekend", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await CELL_PATCH(
      createRequest("PATCH", "/api/marketing/whatsapp/cell", {
        body: { serviceId: "svc-1", date: "2026-04-25", posted: true },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("404 missing service", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await CELL_PATCH(
      createRequest("PATCH", "/api/marketing/whatsapp/cell", {
        body: { serviceId: "svc-X", date: "2026-04-22", posted: true },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("upserts cell happy path", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    prismaMock.whatsAppCoordinatorPost.upsert.mockResolvedValue({
      id: "rec-1",
      serviceId: "svc-1",
      postedDate: new Date("2026-04-22T00:00:00Z"),
      posted: true,
      notPostingReason: null,
      notes: null,
    });
    const res = await CELL_PATCH(
      createRequest("PATCH", "/api/marketing/whatsapp/cell", {
        body: { serviceId: "svc-1", date: "2026-04-22", posted: true, notes: "Posted at 8am" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posted).toBe(true);
  });
});

describe("POST /api/marketing/whatsapp/cell/flag", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await FLAG_POST(
      createRequest("POST", "/api/marketing/whatsapp/cell/flag", {
        body: { serviceId: "svc-1" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns wa.me link when phone known", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", name: "Centre A" });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "coord-1",
      name: "Sara",
      email: "s@x.com",
      phone: "+61400000001",
    });
    const res = await FLAG_POST(
      createRequest("POST", "/api/marketing/whatsapp/cell/flag", {
        body: { serviceId: "svc-1", date: "2026-04-22", context: "one_off" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.coordinatorName).toBe("Sara");
    expect(data.message).toContain("Sara");
    expect(data.message).toContain("Centre A");
    expect(data.whatsappLink).toContain("wa.me/61400000001");
  });

  it("returns null wa.me link when phone unknown", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", name: "Centre A" });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "coord-1",
      name: "Sara",
      email: "s@x.com",
      phone: null,
    });
    const res = await FLAG_POST(
      createRequest("POST", "/api/marketing/whatsapp/cell/flag", {
        body: { serviceId: "svc-1", context: "two_week_pattern" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.whatsappLink).toBeNull();
    expect(data.message).toContain("quieter couple of weeks");
  });
});

describe("POST /api/marketing/whatsapp/network-post", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await NETWORK_POST_CREATE(
      createRequest("POST", "/api/marketing/whatsapp/network-post", {
        body: { group: "engagement", postedAt: "2026-04-22T09:00:00Z" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 invalid group", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await NETWORK_POST_CREATE(
      createRequest("POST", "/api/marketing/whatsapp/network-post", {
        body: { group: "wrong", postedAt: "2026-04-22T09:00:00Z" } as any,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates and returns 201", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.whatsAppNetworkPost.create.mockResolvedValue({
      id: "np-1",
      group: "engagement",
      postedAt: new Date("2026-04-22T09:00:00Z"),
      topic: "Holiday programme",
      notes: null,
      marketingPostId: null,
    });
    const res = await NETWORK_POST_CREATE(
      createRequest("POST", "/api/marketing/whatsapp/network-post", {
        body: { group: "engagement", postedAt: "2026-04-22T09:00:00Z", topic: "Holiday programme" },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("np-1");
    expect(data.group).toBe("engagement");
  });

  it("400 when marketingPostId does not exist", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.marketingPost.findUnique.mockResolvedValue(null);
    const res = await NETWORK_POST_CREATE(
      createRequest("POST", "/api/marketing/whatsapp/network-post", {
        body: { group: "engagement", postedAt: "2026-04-22T09:00:00Z", marketingPostId: "missing" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/marketing/whatsapp/network-post/[id]", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await NETWORK_POST_DELETE(
      createRequest("DELETE", "/api/marketing/whatsapp/network-post/np-1"),
      { params: Promise.resolve({ id: "np-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 not found", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.whatsAppNetworkPost.findUnique.mockResolvedValue(null);
    const res = await NETWORK_POST_DELETE(
      createRequest("DELETE", "/api/marketing/whatsapp/network-post/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("deletes and returns id", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.whatsAppNetworkPost.findUnique.mockResolvedValue({ id: "np-1" });
    prismaMock.whatsAppNetworkPost.delete.mockResolvedValue({ id: "np-1" });
    const res = await NETWORK_POST_DELETE(
      createRequest("DELETE", "/api/marketing/whatsapp/network-post/np-1"),
      { params: Promise.resolve({ id: "np-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe("np-1");
  });
});
