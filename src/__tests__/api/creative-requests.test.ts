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
vi.mock("@/lib/send-assignment-email", () => ({
  sendAssignmentEmail: vi.fn(),
  sendCreativeRequestSubmittedEmails: vi.fn(() => Promise.resolve()),
}));

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/creative-requests/route";
import { GET as GET_DETAIL, PATCH as PATCH_REQUEST } from "@/app/api/creative-requests/[id]/route";
import { GET as GET_MESSAGES, POST as POST_MESSAGE } from "@/app/api/creative-requests/[id]/messages/route";
import { GET as GET_PROOFS, POST as POST_PROOF } from "@/app/api/creative-requests/[id]/proofs/route";
import { POST as POST_DECISION } from "@/app/api/creative-requests/[id]/proofs/[proofId]/decision/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { DEFAULT_CHECKLISTS } from "@/lib/creative-request/constants";
import {
  sendAssignmentEmail,
  sendCreativeRequestSubmittedEmails,
} from "@/lib/send-assignment-email";

const sendAssignmentEmailMock = vi.mocked(sendAssignmentEmail);
const sendCreativeRequestSubmittedEmailsMock = vi.mocked(sendCreativeRequestSubmittedEmails);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const decisionCtx = (id: string, proofId: string) =>
  ({ params: Promise.resolve({ id, proofId }) }) as never;

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

  it("filters by campaignId", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findMany.mockResolvedValue([] as never);
    const res = await GET_LIST(
      createRequest("GET", "/api/creative-requests?campaignId=camp-1"),
    );
    expect(res.status).toBe(200);
    const findArgs = prismaMock.creativeRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.campaignId).toBe("camp-1");
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
    // Email twin of the in-app fan-out — fires with the created request's
    // identifiers so marketing gets a deep-linked email.
    expect(sendCreativeRequestSubmittedEmailsMock).toHaveBeenCalledWith({
      requestId: baseRequest.id,
      requestNumber: baseRequest.requestNumber,
      requestTitle: baseRequest.title,
      requesterId: "member-1",
    });
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

  it("seeds the checklist from the type's default", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.count.mockResolvedValue(0);
    prismaMock.creativeRequest.create.mockResolvedValue(baseRequest as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }] as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster for open day",
          type: "poster",
          purpose: "Open day",
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequest.create.mock.calls[0][0];
    expect(createArgs.data.checklist).toEqual(
      DEFAULT_CHECKLISTS.poster.map((label) => ({ label, done: false })),
    );
  });

  it("rejects a campaignId that doesn't resolve to a campaign", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          campaignId: "nope",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a deleted campaign at create", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({
      id: "camp-gone",
      deleted: true,
    } as never);
    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          campaignId: "camp-gone",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
  });

  it("any role (centre member) may link a campaign at create", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({
      id: "camp-1",
      deleted: false,
    } as never);
    prismaMock.creativeRequest.count.mockResolvedValue(0);
    prismaMock.creativeRequest.create.mockResolvedValue(baseRequest as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }] as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_CREATE(
      createRequest("POST", "/api/creative-requests", {
        body: {
          title: "Poster",
          type: "poster",
          purpose: "Open day",
          campaignId: "camp-1",
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequest.create.mock.calls[0][0];
    expect(createArgs.data.campaignId).toBe("camp-1");
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
    expect(sendAssignmentEmailMock).toHaveBeenCalledWith({
      type: "creative_request",
      assigneeId: "mkt-2",
      assignerId: "mkt-1",
      entityTitle: baseRequest.title,
      entityId: baseRequest.id,
      entityNumber: baseRequest.requestNumber,
    });
  });

  it("self-assign does not send an assignment email", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      assigneeId: "mkt-1",
      assignee: { id: "mkt-1", name: "Tracie" },
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { assigneeId: "mkt-1" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    expect(sendAssignmentEmailMock).not.toHaveBeenCalled();
  });

  it("unassigning (assigneeId: null) does not send an assignment email", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      assigneeId: "mkt-2",
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      assigneeId: null,
      assignee: null,
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { assigneeId: null },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    expect(sendAssignmentEmailMock).not.toHaveBeenCalled();
  });

  it("a non-assignee patch (priority only) does not send an assignment email", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      priority: "high",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { priority: "high" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    expect(sendAssignmentEmailMock).not.toHaveBeenCalled();
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

  it("fulfiller PATCH out of in_review accumulates pausedMs and nulls pausedAt", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_review",
      pausedAt: twoHoursAgo,
      pausedMs: 0,
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "changes_requested",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "changes_requested" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.pausedAt).toBeNull();
    expect(updateArgs.data.pausedMs).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000);
    expect(updateArgs.data.changesRequestedAt).toBeInstanceOf(Date);
  });

  it("fulfiller PATCH in_progress → in_review is rejected (proof-driven only)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "in_review" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.creativeRequest.update).not.toHaveBeenCalled();
  });

  it("checklist patch: fulfiller gets 200 with the checklist in the update data, requester gets 403", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
      checklist: [{ label: "Draft design", done: true }],
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { checklist: [{ label: "Draft design", done: true }] },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.checklist).toEqual([{ label: "Draft design", done: true }]);

    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
    } as never);
    const res2 = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { checklist: [{ label: "Draft design", done: true }] },
      }),
      ctx("cr1"),
    );
    expect(res2.status).toBe(403);
  });

  it("fulfiller can link a campaign via PATCH", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({
      id: "camp-1",
      deleted: false,
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      campaignId: "camp-1",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { campaignId: "camp-1" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.campaignId).toBe("camp-1");
  });

  it("fulfiller can unlink with campaignId: null", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      campaignId: "camp-1",
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...baseRequest,
      campaignId: null,
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { campaignId: null },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.campaignId).toBeNull();
    // Unlink needs no campaign lookup
    expect(prismaMock.marketingCampaign.findUnique).not.toHaveBeenCalled();
  });

  it("fulfiller linking a nonexistent campaign is a 400", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { campaignId: "nope" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.creativeRequest.update).not.toHaveBeenCalled();
  });

  it("requester cannot set campaignId (403)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { campaignId: "camp-1" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.creativeRequest.update).not.toHaveBeenCalled();
  });

  it("requester cannot smuggle campaignId alongside a cancel (403)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(baseRequest as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { status: "cancelled", campaignId: null },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.creativeRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a checklist item missing a label", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...baseRequest,
      status: "in_progress",
    } as never);
    const res = await PATCH_REQUEST(
      createRequest("PATCH", "/api/creative-requests/cr1", {
        body: { checklist: [{ done: true }] },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(400);
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

// ---------------------------------------------------------------------------
// Phase 2: proofs + decisions
// ---------------------------------------------------------------------------

const proofBaseRequest = {
  ...baseRequest,
  pausedAt: null as Date | null,
  pausedMs: 0,
};

const validFileUrl = "https://abc123.public.blob.vercel-storage.com/draft.pdf";

describe("POST /api/creative-requests/[id]/proofs", () => {
  it("403s a member (requester) trying to upload a proof", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST_PROOF(
      createRequest("POST", "/api/creative-requests/cr1/proofs", {
        body: { fileName: "draft.pdf", fileUrl: validFileUrl },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
  });

  it("409s when the request status is new (upload not yet allowed)", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(proofBaseRequest as never);
    const res = await POST_PROOF(
      createRequest("POST", "/api/creative-requests/cr1/proofs", {
        body: { fileName: "draft.pdf", fileUrl: validFileUrl },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
  });

  it("happy path: v1 upload transitions to in_review, pauses the clock, notifies the requester", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...proofBaseRequest,
      status: "in_progress",
    } as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue(null);
    prismaMock.creativeRequestProof.create.mockResolvedValue({
      id: "p1",
      requestId: "cr1",
      version: 1,
      fileName: "draft.pdf",
      fileUrl: validFileUrl,
      fileSize: 2000,
      mimeType: "application/pdf",
      note: null,
      uploadedById: "mkt-1",
      decision: null,
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
      createdAt: new Date(),
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...proofBaseRequest,
      status: "in_review",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_PROOF(
      createRequest("POST", "/api/creative-requests/cr1/proofs", {
        body: {
          fileName: "draft.pdf",
          fileUrl: validFileUrl,
          fileSize: 2000,
          mimeType: "application/pdf",
        },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);

    const createArgs = prismaMock.creativeRequestProof.create.mock.calls[0][0];
    expect(createArgs.data.version).toBe(1);

    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("in_review");
    expect(updateArgs.data.inReviewAt).toBeInstanceOf(Date);
    expect(updateArgs.data.pausedAt).toBeInstanceOf(Date);

    expect(prismaMock.userNotification.createMany).toHaveBeenCalled();
  });

  it("increments the version when a prior proof exists", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...proofBaseRequest,
      status: "in_progress",
    } as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ version: 2 } as never);
    prismaMock.creativeRequestProof.create.mockResolvedValue({
      id: "p3",
      requestId: "cr1",
      version: 3,
    } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...proofBaseRequest,
      status: "in_review",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_PROOF(
      createRequest("POST", "/api/creative-requests/cr1/proofs", {
        body: { fileName: "draft-v3.pdf", fileUrl: validFileUrl },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs = prismaMock.creativeRequestProof.create.mock.calls[0][0];
    expect(createArgs.data.version).toBe(3);
  });

  it("rejects a javascript: fileUrl", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...proofBaseRequest,
      status: "in_progress",
    } as never);
    const res = await POST_PROOF(
      createRequest("POST", "/api/creative-requests/cr1/proofs", {
        body: { fileName: "x.pdf", fileUrl: "javascript:alert(1)" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/creative-requests/[id]/proofs", () => {
  it("member owner sees their request's proof versions", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(proofBaseRequest as never);
    prismaMock.creativeRequestProof.findMany.mockResolvedValue([
      { id: "p1", version: 1 },
    ] as never);
    const res = await GET_PROOFS(
      createRequest("GET", "/api/creative-requests/cr1/proofs"),
      ctx("cr1"),
    );
    expect(res.status).toBe(200);
  });

  it("404s a non-participant", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(proofBaseRequest as never);
    const res = await GET_PROOFS(
      createRequest("GET", "/api/creative-requests/cr1/proofs"),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/creative-requests/[id]/proofs/[proofId]/decision", () => {
  const inReviewRequest = {
    ...proofBaseRequest,
    status: "in_review",
    pausedAt: new Date(Date.now() - 5000),
    pausedMs: 1000,
  };
  const undecidedProof = {
    id: "p1",
    requestId: "cr1",
    version: 1,
    fileName: "draft.pdf",
    fileUrl: validFileUrl,
    fileSize: null,
    mimeType: null,
    note: null,
    uploadedById: "mkt-1",
    decision: null,
    decisionNote: null,
    decidedById: null,
    decidedAt: null,
    createdAt: new Date(),
  };

  it("requester approves: claims the proof, banks pause time, sets status approved", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p1" } as never);
    prismaMock.creativeRequestProof.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...inReviewRequest,
      status: "approved",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(200);

    const claimArgs = prismaMock.creativeRequestProof.updateMany.mock.calls[0][0];
    expect(claimArgs.where).toEqual({ id: "p1", decision: null });
    expect(claimArgs.data.decision).toBe("approved");
    expect(claimArgs.data.decidedById).toBe("member-1");
    expect(claimArgs.data.decidedAt).toBeInstanceOf(Date);

    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("approved");
    expect(updateArgs.data.pausedAt).toBeNull();
    expect(updateArgs.data.pausedMs).toBeGreaterThanOrEqual(1000);
  });

  it("approved_with_changes without a note → 400", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p1" } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved_with_changes" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.creativeRequestProof.updateMany).not.toHaveBeenCalled();
  });

  it("changes_requested with a note → status changes_requested", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p1" } as never);
    prismaMock.creativeRequestProof.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...inReviewRequest,
      status: "changes_requested",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "changes_requested", note: "Please make the logo bigger" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.creativeRequest.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("changes_requested");
  });

  it("409s an already-decided proof", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue({
      ...undecidedProof,
      decision: "approved",
    } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(409);
  });

  it("409s a race-lost claim and never touches the request", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p1" } as never);
    prismaMock.creativeRequestProof.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.creativeRequest.update).not.toHaveBeenCalled();
  });

  it("409s a superseded proof (a newer version exists)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p2" } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(409);
  });

  it("404s a non-participant", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(404);
  });

  it("a fulfiller may also decide on behalf of the requester", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(inReviewRequest as never);
    prismaMock.creativeRequestProof.findUnique.mockResolvedValue(undecidedProof as never);
    prismaMock.creativeRequestProof.findFirst.mockResolvedValue({ id: "p1" } as never);
    prismaMock.creativeRequestProof.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.creativeRequest.update.mockResolvedValue({
      ...inReviewRequest,
      status: "approved",
    } as never);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST_DECISION(
      createRequest("POST", "/api/creative-requests/cr1/proofs/p1/decision", {
        body: { decision: "approved" },
      }),
      decisionCtx("cr1", "p1"),
    );
    expect(res.status).toBe(200);
  });
});
