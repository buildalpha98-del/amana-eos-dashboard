import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

import { GET } from "@/app/api/notifications/route";
import { POST as markRead } from "@/app/api/notifications/[id]/mark-read/route";
import { POST as markAllRead } from "@/app/api/notifications/mark-all-read/route";
import { GET as unreadCount } from "@/app/api/notifications/unread-count/route";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeNotif(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    userId: "u1",
    type: "cert_expiring_30d",
    title: "Cert expiring",
    body: "Your First Aid cert expires in 30 days",
    link: "/staff/u1?tab=compliance",
    read: false,
    readAt: null,
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
    ...overrides,
  };
}

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------

describe("GET /api/notifications", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/notifications"));
    expect(res.status).toBe(401);
  });

  it("returns the current user's notifications", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findMany.mockResolvedValue([makeNotif()]);

    const res = await GET(createRequest("GET", "/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("n1");

    // Scoped to the session user
    expect(prismaMock.userNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1" }),
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
  });

  it("filters to unread=true", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/notifications?unread=true"),
    );
    expect(res.status).toBe(200);

    const callArgs = prismaMock.userNotification.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ userId: "u1", read: false });
  });

  it("does not apply read filter when unread param absent", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findMany.mockResolvedValue([]);

    await GET(createRequest("GET", "/api/notifications"));
    const callArgs = prismaMock.userNotification.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({ userId: "u1" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/[id]/mark-read
// ---------------------------------------------------------------------------

describe("POST /api/notifications/[id]/mark-read", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await markRead(
      createRequest("POST", "/api/notifications/n1/mark-read"),
      paramsOf("n1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when notification is missing", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findUnique.mockResolvedValue(null);

    const res = await markRead(
      createRequest("POST", "/api/notifications/missing/mark-read"),
      paramsOf("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the notification belongs to another user", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findUnique.mockResolvedValue(
      makeNotif({ id: "n2", userId: "u2" }),
    );

    const res = await markRead(
      createRequest("POST", "/api/notifications/n2/mark-read"),
      paramsOf("n2"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.userNotification.update).not.toHaveBeenCalled();
  });

  it("updates read + readAt on the happy path", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.findUnique.mockResolvedValue(makeNotif());
    prismaMock.userNotification.update.mockImplementation(async (args: any) => ({
      ...makeNotif(),
      read: true,
      readAt: args.data.readAt,
    }));

    const res = await markRead(
      createRequest("POST", "/api/notifications/n1/mark-read"),
      paramsOf("n1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notification.read).toBe(true);
    expect(body.notification.readAt).not.toBeNull();

    const callArgs = prismaMock.userNotification.update.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: "n1" });
    expect(callArgs.data.read).toBe(true);
    expect(callArgs.data.readAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/mark-all-read
// ---------------------------------------------------------------------------

describe("POST /api/notifications/mark-all-read", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await markAllRead(
      createRequest("POST", "/api/notifications/mark-all-read"),
    );
    expect(res.status).toBe(401);
  });

  it("updates only the session user's unread notifications", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.updateMany.mockResolvedValue({ count: 3 });

    const res = await markAllRead(
      createRequest("POST", "/api/notifications/mark-all-read"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);

    const callArgs = prismaMock.userNotification.updateMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({ userId: "u1", read: false });
    expect(callArgs.data.read).toBe(true);
    expect(callArgs.data.readAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-count
// ---------------------------------------------------------------------------

describe("GET /api/notifications/unread-count", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await unreadCount(
      createRequest("GET", "/api/notifications/unread-count"),
    );
    expect(res.status).toBe(401);
  });

  it("returns the unread count for the session user", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    prismaMock.userNotification.count.mockResolvedValue(7);

    const res = await unreadCount(
      createRequest("GET", "/api/notifications/unread-count"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(7);

    const callArgs = prismaMock.userNotification.count.mock.calls[0][0];
    expect(callArgs.where).toEqual({ userId: "u1", read: false });
  });
});
