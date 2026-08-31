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

import { POST as decideActionItem } from "@/app/api/meetings/[id]/recordings/[recordingId]/action-items/[itemId]/route";
import { POST as decideMissedItem } from "@/app/api/meetings/[id]/recordings/[recordingId]/missed-items/[itemId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = (itemId: string) => ({
  params: Promise.resolve({ id: "m-1", recordingId: "rec-1", itemId }),
});

function reviewFixture() {
  return {
    summary: "s",
    decisions: [],
    actionItems: [
      {
        id: "ai-1",
        title: "Email families",
        suggestedAssigneeUserId: "u2",
        suggestedAssigneeName: "Tracie",
        suggestedDueDate: "2026-09-04",
        quote: "Tracie will email families",
        status: "proposed",
      },
      {
        id: "ai-2",
        title: "No owner item",
        suggestedAssigneeUserId: null,
        suggestedAssigneeName: null,
        suggestedDueDate: null,
        quote: "someone will",
        status: "proposed",
      },
      {
        id: "ai-done",
        title: "Already accepted",
        suggestedAssigneeUserId: "u2",
        suggestedAssigneeName: "Tracie",
        suggestedDueDate: null,
        quote: "q",
        status: "accepted",
        todoId: "t-old",
      },
    ],
    missedItems: [
      {
        id: "mi-1",
        kind: "uncaptured_issue",
        text: "Bus delays keep coming up",
        quote: "the bus was late again",
        status: "proposed",
      },
      {
        id: "mi-2",
        kind: "unowned_commitment",
        text: "Call the council",
        quote: "we should call",
        status: "proposed",
      },
    ],
    speakerMap: [],
    generatedAt: "2026-08-31T00:00:00Z",
    modelId: "test",
  };
}

describe("POST .../action-items/[itemId]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      id: "rec-1",
      meetingId: "m-1",
      aiReview: reviewFixture(),
    });
    prismaMock.todo.create.mockResolvedValue({ id: "t-new" });
    prismaMock.meetingRecording.update.mockImplementation(
      (args: { data: unknown }) => Promise.resolve({ id: "rec-1", ...(args.data as object) }),
    );
  });

  it("401s unauthenticated", async () => {
    mockNoSession();
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept" } }),
      ctx("ai-1"),
    );
    expect(res.status).toBe(401);
  });

  it("403s for a non-meeting role", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "staff" });
    mockSession({ id: "u1", name: "S", role: "staff" as MockUserRole });
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept" } }),
      ctx("ai-1"),
    );
    expect(res.status).toBe(403);
  });

  it("accept creates a meeting-stamped todo and marks the item accepted", async () => {
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept" } }),
      ctx("ai-1"),
    );
    expect(res.status).toBe(200);

    const todoArg = prismaMock.todo.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(todoArg.data.title).toBe("Email families");
    expect(todoArg.data.assigneeId).toBe("u2");
    expect(todoArg.data.meetingId).toBe("m-1");
    expect((todoArg.data.dueDate as Date).toISOString().slice(0, 10)).toBe("2026-09-04");

    const reviewArg = prismaMock.meetingRecording.update.mock.calls[0][0] as {
      data: { aiReview: { actionItems: Array<{ id: string; status: string; todoId?: string }> } };
    };
    const item = reviewArg.data.aiReview.actionItems.find((a) => a.id === "ai-1")!;
    expect(item.status).toBe("accepted");
    expect(item.todoId).toBe("t-new");
  });

  it("accept without any assignee 400s", async () => {
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept" } }),
      ctx("ai-2"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.todo.create).not.toHaveBeenCalled();
  });

  it("accept with a null due date defaults instead of 500ing", async () => {
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept", assigneeId: "u3" } }),
      ctx("ai-2"),
    );
    expect(res.status).toBe(200);
    const todoArg = prismaMock.todo.create.mock.calls[0][0] as {
      data: { dueDate: Date };
    };
    expect(todoArg.data.dueDate).toBeInstanceOf(Date);
  });

  it("double-accept 409s without creating a second todo", async () => {
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "accept" } }),
      ctx("ai-done"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.todo.create).not.toHaveBeenCalled();
  });

  it("dismiss marks the item dismissed with no todo", async () => {
    const res = await decideActionItem(
      createRequest("POST", "/x", { body: { decision: "dismiss" } }),
      ctx("ai-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.todo.create).not.toHaveBeenCalled();
    const reviewArg = prismaMock.meetingRecording.update.mock.calls[0][0] as {
      data: { aiReview: { actionItems: Array<{ id: string; status: string }> } };
    };
    expect(
      reviewArg.data.aiReview.actionItems.find((a) => a.id === "ai-1")!.status,
    ).toBe("dismissed");
  });
});

describe("POST .../missed-items/[itemId]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      id: "rec-1",
      meetingId: "m-1",
      aiReview: reviewFixture(),
      meeting: { serviceIds: ["svc-1"] },
    });
    prismaMock.issue.create.mockResolvedValue({ id: "i-new" });
    prismaMock.meetingRecording.update.mockImplementation(
      (args: { data: unknown }) => Promise.resolve({ id: "rec-1", ...(args.data as object) }),
    );
  });

  it("action on an uncaptured_issue raises a short-term Issue", async () => {
    const res = await decideMissedItem(
      createRequest("POST", "/x", { body: { decision: "action" } }),
      ctx("mi-1"),
    );
    expect(res.status).toBe(200);
    const issueArg = prismaMock.issue.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(issueArg.data.title).toBe("Bus delays keep coming up");
    expect(issueArg.data.category).toBe("short_term");
    expect(issueArg.data.priority).toBe("medium");
    expect(issueArg.data.raisedById).toBe("u1");
    expect(issueArg.data.serviceId).toBe("svc-1");
  });

  it("action on any other kind 400s", async () => {
    const res = await decideMissedItem(
      createRequest("POST", "/x", { body: { decision: "action" } }),
      ctx("mi-2"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.issue.create).not.toHaveBeenCalled();
  });

  it("dismiss works for any kind", async () => {
    const res = await decideMissedItem(
      createRequest("POST", "/x", { body: { decision: "dismiss" } }),
      ctx("mi-2"),
    );
    expect(res.status).toBe(200);
  });
});
