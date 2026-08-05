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
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/creative-requests/route";
import { GET as GET_DETAIL, PATCH as PATCH_REQUEST } from "@/app/api/creative-requests/[id]/route";
import { GET as GET_MESSAGES, POST as POST_MESSAGE } from "@/app/api/creative-requests/[id]/messages/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const baseRequest = {
  id: "cr1",
  requestNumber: "REQ-2026-0001",
  title: "Table cover — Punchbowl",
  type: "table_cover",
  status: "new",
  priority: "normal",
  serviceId: "svc1",
  service: { id: "svc1", name: "Punchbowl" },
  requestedById: "member-1",
  requestedBy: { id: "member-1", name: "Mirna" },
  assigneeId: null,
  assignee: null,
  purpose: "School expo stall",
  exactCopy: null,
  sizeSpec: "6ft trestle",
  outputFormat: null,
  dueDate: new Date("2026-08-12"),
  briefedAt: null,
  inProgressAt: null,
  inReviewAt: null,
  changesRequestedAt: null,
  approvedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  attachments: [],
};

function mockActiveUsers() {
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      const id = args?.where?.id;
      if (id === "mkt-1") return { id, role: "marketing", active: true } as never;
      if (id === "member-1") return { id, role: "member", active: true } as never;
      if (id === "member-2") return { id, role: "member", active: true } as never;
      return null;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockActiveUsers();
});

describe("GET /api/creative-requests", () => {
  it("returns 401 with no session", async () => {
    mockNoSession();
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(401);
  });

  it("marketing sees all requests", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findMany.mockResolvedValue([baseRequest] as never);
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.requestedById).toBeUndefined();
  });

  it("member list is force-scoped to their own requests", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findMany.mockResolvedValue([baseRequest] as never);
    const res = await GET_LIST(createRequest("GET", "/api/creative-requests"));
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.requestedById).toBe("member-1");
  });

  it("rejects an invalid status filter", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    const res = await GET_LIST(
      createRequest("GET", "/api/creative-requests?status=bogus"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/creative-requests", () => {
  it("returns 400 on missing purpose", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: { title: "Poster", type: "poster" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates with generated number, default due date, and notifies marketing", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.count.mockResolvedValue(0);
    prismaMock.creativeRequest.create.mockResolvedValue(baseRequest as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }] as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Table cover — Punchbowl",
          type: "table_cover",
          purpose: "School expo stall",
          serviceId: "svc1",
          sizeSpec: "6ft trestle",
          attachments: [
            {
              fileName: "old-cover.jpg",
              fileUrl: "https://abc123.public.blob.vercel-storage.com/x.jpg",
              fileSize: 1000,
              mimeType: "image/jpeg",
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequest.create.mock.calls[0][0];
    expect(createArgs.data.requestNumber).toMatch(/^REQ-\d{4}-0001$/);
    expect(createArgs.data.requestedById).toBe("member-1");
    expect(createArgs.data.dueDate).toBeInstanceOf(Date);
    expect(createArgs.data.attachments.create).toHaveLength(1);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("rejects a dueDate in the past", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          dueDate: "2020-01-01",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a javascript: attachment URL", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          attachments: [
            { fileName: "x.jpg", fileUrl: "javascript:alert(1)", fileSize: 100, mimeType: "image/jpeg" },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an off-host attachment URL", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          attachments: [
            { fileName: "x.jpg", fileUrl: "https://evil.example.com/x.png", fileSize: 100, mimeType: "image/jpeg" },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/creative-requests/[id]", () => {
  it("404s for a member who doesn't own the request", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await GET_DETAIL(
      createRequest("GET", "/api/creative-requests/cr1"),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns the request for its owner", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await GET_DETAIL(
      createRequest("GET", "/api/creative-requests/cr1"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
  });

  it("only includes brief-level attachments (excludes message attachments, including internal-note ones)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    await GET_DETAIL(
      createRequest("GET", "/api/creative-requests/cr1"),
      ctx("cr1"),
    );
    const findArgs = prismaMock.creativeRequest.findUnique.mock.calls[0][0];
    expect(findArgs.include.attachments).toEqual({ where: { messageId: null } });
  });
});

describe("PATCH /api/creative-requests/[id]", () => {
  it("403s a member trying to transition someone's request", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
  });

  it("owner can cancel while status is new (with reason)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "cancelled",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "cancelled", cancellationReason: "No longer needed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("cancelled");
    expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
  });

  it("owner cannot make a non-cancel transition", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an invalid transition (new → approved)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "approved" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
  });

  it("marketing transition stamps the stage timestamp and notifies requester", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "briefed",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "briefed" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.briefedAt).toBeInstanceOf(Date);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("marketing can assign, which notifies the assignee", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      assigneeId: "mkt-2",
      assignee: { id: "mkt-2", name: "Akram" },
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { assigneeId: "mkt-2" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("owner cancelling an in_progress request is rejected", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "cancelled" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
  });

  it("rejects a null dueDate", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { dueDate: null },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-status patch on a closed (cancelled) request", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "cancelled",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { priority: "high" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/creative-requests/[id]/messages", () => {
  const messages = [
    { id: "m1", requestId: "cr1", authorId: "member-1", author: { id: "member-1", name: "Mirna" }, body: "Logo bigger please", internal: false, createdAt: new Date(), attachments: [] },
    { id: "m2", requestId: "cr1", authorId: "mkt-1", author: { id: "mkt-1", name: "Tracie" }, body: "QR was regenerated", internal: true, createdAt: new Date(), attachments: [] },
  ];

  it("requester never receives internal messages", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.findMany.mockResolvedValue(
      messages.filter((m) => !m.internal) as never,
    );
    const res = await GET_MESSAGES(
      createRequest("GET", "/api/creative-requests/cr1/messages"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequestMessage.findMany.mock.calls[0][0];
    expect(findArgs.where.internal).toBe(false);
  });

  it("marketing receives the full thread", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.findMany.mockResolvedValue(messages as never);
    const res = await GET_MESSAGES(
      createRequest("GET", "/api/creative-requests/cr1/messages"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequestMessage.findMany.mock.calls[0][0];
    expect(findArgs.where.internal).toBeUndefined();
  });
});

describe("POST /api/creative-requests/[id]/messages", () => {
  it("404s a non-participant member (existence not leaked)", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "hi" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
  });

  it("forces internal=false for the requester", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.create.mockResolvedValue({
      id: "m3", requestId: "cr1", authorId: "member-1", body: "hi", internal: false, createdAt: new Date(), author: { id: "member-1", name: "Mirna" }, attachments: [],
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "hi", internal: true }, // requester tries to flag internal
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequestMessage.create.mock.calls[0][0];
    expect(createArgs.data.internal).toBe(false);
  });

  it("marketing internal note is stored internal and creates no requester notification", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequestMessage.create.mockResolvedValue({
      id: "m4", requestId: "cr1", authorId: "mkt-1", body: "note", internal: true, createdAt: new Date(), author: { id: "mkt-1", name: "Tracie" }, attachments: [],
    } as never);
    const res = await POST_MESSAGE(
      createRequest("POST", "/api/creative-requests/cr1/messages", {
        body: { body: "note", internal: true },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequestMessage.create.mock.calls[0][0];
    expect(createArgs.data.internal).toBe(true);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});
