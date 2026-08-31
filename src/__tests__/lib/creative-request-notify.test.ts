import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  notifyRequestSubmitted,
  notifyRequestAssigned,
  notifyRequestStatusChanged,
  notifyRequestMessage,
} from "@/lib/creative-request/notify";

const request = {
  id: "cr1",
  requestNumber: "REQ-2026-0001",
  title: "Table cover",
  requestedById: "req-user",
  assigneeId: "mkt-user",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
});

describe("notifyRequestSubmitted", () => {
  it("notifies all active marketing users except the requester", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "mkt-user" },
      { id: "req-user" }, // requester also has marketing role — must be excluded
    ] as never);
    await notifyRequestSubmitted(prismaMock as never, request);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      userId: "mkt-user",
      type: "creative_request_submitted",
      link: "/requests?open=cr1",
    });
  });

  it("swallows errors", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db down"));
    await expect(notifyRequestSubmitted(prismaMock as never, request)).resolves.toBeUndefined();
  });
});

describe("notifyRequestAssigned", () => {
  it("notifies the assignee, not the actor", async () => {
    await notifyRequestAssigned(prismaMock as never, request, "actor-1");
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("mkt-user");
  });
  it("no-ops when assignee is the actor", async () => {
    await notifyRequestAssigned(prismaMock as never, request, "mkt-user");
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyRequestStatusChanged", () => {
  it("notifies the requester when someone else moves the status", async () => {
    await notifyRequestStatusChanged(prismaMock as never, request, "in_review", "mkt-user");
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0]).toMatchObject({ userId: "req-user", type: "creative_request_status" });
  });
  it("no-ops when the requester moved it themselves", async () => {
    await notifyRequestStatusChanged(prismaMock as never, request, "cancelled", "req-user");
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyRequestMessage", () => {
  it("requester message → notifies assignee", async () => {
    await notifyRequestMessage(prismaMock as never, request, "req-user", false);
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("mkt-user");
  });
  it("fulfiller non-internal message → notifies requester", async () => {
    await notifyRequestMessage(prismaMock as never, request, "mkt-user", false);
    const arg = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(arg.data[0].userId).toBe("req-user");
  });
  it("internal message → notifies nobody outside the team (no requester ping)", async () => {
    await notifyRequestMessage(prismaMock as never, request, "mkt-user", true);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});
