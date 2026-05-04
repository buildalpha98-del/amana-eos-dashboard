import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock email sending. Pattern matches cert-expiry.test.ts so the
// factory is hoisted cleanly without `vi.hoisted` gymnastics.
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() =>
    Promise.resolve({ messageId: "msg-1", suppressed: [], sent: [] }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendEmail } from "@/lib/email";
import { notifyOpenShiftsPosted } from "@/lib/open-shift-notify";

const sendEmailMock = vi.mocked(sendEmail);

function makeOpenShift(overrides: Record<string, unknown> = {}) {
  return {
    id: "sh-1",
    date: new Date("2026-05-15"),
    sessionType: "asc" as const,
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "Educator",
    ...overrides,
  };
}

const baseParams = {
  serviceId: "svc-1",
  serviceName: "Mawson Lakes",
  publishedById: "admin-1",
  openShiftsUrl: "https://example.test/my-portal",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: sendEmail echoes the recipient back into `sent` so we can
  // count emailsSent. Tests that need different behaviour override
  // with `mockResolvedValueOnce` / `mockRejectedValueOnce`.
  sendEmailMock.mockImplementation(
    async (params: { to: string | string[] }) => {
      const to = Array.isArray(params.to) ? params.to : [params.to];
      return { messageId: "msg-1", suppressed: [], sent: to };
    },
  );
});

describe("notifyOpenShiftsPosted", () => {
  it("returns zero counts when there are no open shifts", async () => {
    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [],
    });
    expect(result).toEqual({
      recipientCount: 0,
      emailsSent: 0,
      inAppCreated: 0,
    });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns zero counts when no eligible staff exist at the service", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });
    expect(result).toEqual({
      recipientCount: 0,
      emailsSent: 0,
      inAppCreated: 0,
    });
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("filters recipients by service + active + staff/member roles, excluding the publisher", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
      { id: "u-2", name: "Bob", email: "bob@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });

    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where).toEqual({
      serviceId: "svc-1",
      active: true,
      role: { in: ["staff", "member"] },
      id: { not: "admin-1" },
    });
  });

  it("creates one in-app notification per recipient and sends one email each", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
      { id: "u-2", name: "Bob", email: "bob@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [
        makeOpenShift(),
        makeOpenShift({
          date: new Date("2026-05-16"),
          shiftStart: "07:00",
          shiftEnd: "09:00",
          sessionType: "bsc",
        }),
      ],
    });

    expect(result).toEqual({
      recipientCount: 2,
      emailsSent: 2,
      inAppCreated: 2,
    });

    const createMany =
      prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(createMany.data).toHaveLength(2);
    expect(createMany.data[0]).toMatchObject({
      userId: "u-1",
      type: "open_shift_posted",
      link: "/my-portal",
    });
    expect(createMany.data[0].body).toMatch(/2 open shifts/);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const firstCall = sendEmailMock.mock.calls[0][0];
    expect(firstCall.to).toBe("alice@a.test");
    expect(firstCall.subject).toMatch(/2 new open shifts at Mawson Lakes/);
    expect(firstCall.html).toContain("Mawson Lakes");
    expect(firstCall.html).toContain("ASC");
    expect(firstCall.html).toContain("BSC");
  });

  it("uses singular subject + body when exactly one open shift", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });

    await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });

    const createMany =
      prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(createMany.data[0].body).toMatch(/An open shift/);
    expect(createMany.data[0].body).not.toMatch(/\d+ open shifts/);

    const emailCall = sendEmailMock.mock.calls[0][0];
    expect(emailCall.subject).toMatch(/^New open shift at /);
  });

  it("skips users without an email but still creates in-app notification", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
      { id: "u-2", name: "Bob", email: null },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });

    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });

    expect(result.recipientCount).toBe(2);
    expect(result.inAppCreated).toBe(2);
    expect(result.emailsSent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("counts a suppressed email as not-sent (sendEmail returns no sent addresses)", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
    sendEmailMock.mockResolvedValueOnce({
      messageId: undefined,
      suppressed: ["alice@a.test"],
      sent: [],
    });

    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });
    expect(result.emailsSent).toBe(0);
    expect(result.inAppCreated).toBe(1);
  });

  it("swallows individual email send errors and continues with the next recipient", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
      { id: "u-2", name: "Bob", email: "bob@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
    sendEmailMock
      .mockRejectedValueOnce(new Error("smtp meltdown"))
      .mockResolvedValueOnce({
        messageId: "msg-2",
        suppressed: [],
        sent: ["bob@a.test"],
      });

    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });
    expect(result.emailsSent).toBe(1);
    expect(result.recipientCount).toBe(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("still proceeds with email even if the in-app createMany blows up", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@a.test" },
    ]);
    prismaMock.userNotification.createMany.mockRejectedValue(
      new Error("DB down"),
    );

    const result = await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      openShifts: [makeOpenShift()],
    });
    expect(result.inAppCreated).toBe(0);
    expect(result.emailsSent).toBe(1);
    expect(result.recipientCount).toBe(1);
  });

  it("omits the publisher exclusion when publishedById is undefined", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await notifyOpenShiftsPosted(prismaMock, {
      ...baseParams,
      publishedById: undefined,
      openShifts: [makeOpenShift()],
    });
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where).not.toHaveProperty("id");
  });
});
