import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// Rate-limit is used inside withParentAuth, but we also stub withParentAuth
// below — still mock it so other imports don't explode.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
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

vi.mock("@/lib/notifications/messaging", () => ({
  sendNewMessageNotification: vi.fn().mockResolvedValue(undefined),
}));

const mockParentPayload = {
  email: "parent@test.com",
  name: "Test Parent",
  enrolmentIds: ["enr-1"],
};
let parentAuthEnabled = true;

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: (...args: unknown[]) => unknown) => {
    return async (req: Request, routeContext?: unknown) => {
      if (!parentAuthEnabled) {
        const { NextResponse } = await import("next/server");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const ctx = {
        ...((routeContext as object) ?? {}),
        parent: mockParentPayload,
      };
      try {
        return await handler(req, ctx);
      } catch (err) {
        const { handleApiError } = await import("@/lib/api-handler");
        return handleApiError(req as never, err, "test-req-id");
      }
    };
  },
}));

import { POST as NewMessagePost } from "@/app/api/parent/messages/route";

/**
 * 2026-10-06: a family enrolled through the portal had no CentreContact, so
 * their first message failed with "No contact record found" — and any
 * serviceId the client sent was accepted unchecked.
 */
describe("POST /api/parent/messages — who you can message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ] as never);
    prismaMock.child.findMany.mockResolvedValue([] as never);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValue({
      id: "enr-1",
      primaryParent: { firstName: "Aisha", surname: "Rahman", mobile: "0400 000 000" },
    } as never);
    prismaMock.conversation.create.mockImplementation((async (args: {
      data: { serviceId: string; familyId: string };
    }) => ({
      id: "conv-1",
      ...args.data,
      messages: [{ id: "m-1" }],
    })) as never);
  });

  const send = (body: Record<string, unknown>) =>
    NewMessagePost(
      createRequest("POST", "/api/parent/messages", { body }) as never,
      {} as never,
    );

  it("creates the family's contact record on their first message", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.upsert.mockResolvedValue({
      id: "contact-new",
      firstName: "Aisha",
      lastName: "Rahman",
    } as never);

    const res = await send({ subject: "Help", message: "Can't find OWNA login" });

    expect(res.status).toBe(201);
    expect(prismaMock.centreContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email_serviceId: { email: "parent@test.com", serviceId: "svc-1" } },
        create: expect.objectContaining({
          firstName: "Aisha",
          lastName: "Rahman",
          sourceEnrolmentId: "enr-1",
        }),
      }),
    );
    const created = prismaMock.conversation.create.mock.calls[0][0] as {
      data: { familyId: string };
    };
    expect(created.data.familyId).toBe("contact-new");
  });

  it("reuses an existing contact rather than creating another", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({
      id: "contact-1",
      firstName: "Aisha",
      lastName: "Rahman",
    } as never);
    const res = await send({ subject: "Hi", message: "Question" });
    expect(res.status).toBe(201);
    expect(prismaMock.centreContact.upsert).not.toHaveBeenCalled();
  });

  it("refuses a centre the family doesn't belong to", async () => {
    const res = await send({ subject: "Hi", message: "x", serviceId: "svc-other" });
    expect(res.status).toBe(403);
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it("uses a centre staff assigned to the child when the enrolment has none", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: null },
    ] as never);
    prismaMock.child.findMany.mockResolvedValue([{ serviceId: "svc-2" }] as never);
    prismaMock.centreContact.findFirst.mockResolvedValue({
      id: "contact-2",
      firstName: "A",
      lastName: "R",
    } as never);
    const res = await send({ subject: "Hi", message: "x" });
    expect(res.status).toBe(201);
    const created = prismaMock.conversation.create.mock.calls[0][0] as {
      data: { serviceId: string };
    };
    expect(created.data.serviceId).toBe("svc-2");
  });
});
