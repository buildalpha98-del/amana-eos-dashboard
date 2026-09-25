/**
 * Unit tests for the shared user-notification creation path
 * (`src/lib/notify-user.ts`) — in-app rows + web-push fan-out.
 *
 * Contract under test:
 * - creates one UserNotification per unique user (falsy ids dropped),
 * - fans the same title/body/link out via sendPushToUsers,
 * - push failures are swallowed (never thrown into callers),
 * - createMany failures DO propagate (callers keep their own try/catch
 *   semantics, unchanged from the pre-helper code).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const sendPushToUsers = vi.fn();
vi.mock("@/lib/push/webPush", () => ({
  sendPushToUsers: (...args: unknown[]) => sendPushToUsers(...args),
  sendPushToUser: vi.fn(),
}));

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

import { notifyUsers, notifyUser } from "@/lib/notify-user";
import { logger } from "@/lib/logger";

const content = {
  type: "open_shift_posted",
  title: "Open shift available",
  body: "An open shift is up for grabs.",
  link: "/my-portal",
};

describe("notifyUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
    sendPushToUsers.mockResolvedValue({ sent: 1, removed: 0 });
  });

  it("creates one row per unique user and fans out push with the same payload", async () => {
    const created = await notifyUsers(prismaMock, ["u1", "u2", "u1", ""], content);

    expect(created).toBe(2);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          type: "open_shift_posted",
          title: "Open shift available",
          body: "An open shift is up for grabs.",
          link: "/my-portal",
        },
        {
          userId: "u2",
          type: "open_shift_posted",
          title: "Open shift available",
          body: "An open shift is up for grabs.",
          link: "/my-portal",
        },
      ],
    });
    expect(sendPushToUsers).toHaveBeenCalledWith(["u1", "u2"], {
      title: "Open shift available",
      body: "An open shift is up for grabs.",
      url: "/my-portal",
    });
  });

  it("passes url: undefined when the notification has no link", async () => {
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
    await notifyUsers(prismaMock, ["u1"], { ...content, link: null });

    const row = prismaMock.userNotification.createMany.mock.calls[0][0].data[0];
    expect(row.link).toBeNull();
    expect(sendPushToUsers).toHaveBeenCalledWith(["u1"], {
      title: content.title,
      body: content.body,
      url: undefined,
    });
  });

  it("is a no-op (no create, no push) for an empty user list", async () => {
    const created = await notifyUsers(prismaMock, ["", ""], content);
    expect(created).toBe(0);
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("swallows and logs push failures instead of throwing into callers", async () => {
    sendPushToUsers.mockRejectedValueOnce(new Error("push exploded"));

    const created = await notifyUsers(prismaMock, ["u1", "u2"], content);

    expect(created).toBe(2); // in-app rows still count as created
    expect(logger.error).toHaveBeenCalledWith(
      "notifyUsers: push fan-out failed",
      expect.objectContaining({ type: "open_shift_posted", userCount: 2 }),
    );
  });

  it("propagates createMany failures (callers keep their own catch semantics)", async () => {
    prismaMock.userNotification.createMany.mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(notifyUsers(prismaMock, ["u1"], content)).rejects.toThrow(
      "db down",
    );
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("notifyUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
    sendPushToUsers.mockResolvedValue({ sent: 0, removed: 0 });
  });

  it("delegates to notifyUsers with a single-element list", async () => {
    const created = await notifyUser(prismaMock, "u9", content);
    expect(created).toBe(1);
    const call = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(call.data).toHaveLength(1);
    expect(call.data[0].userId).toBe("u9");
    expect(sendPushToUsers).toHaveBeenCalledWith(["u9"], expect.any(Object));
  });
});
