import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
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

// 2026-08-03: this route no longer sends SMS. The photo goes to the
// family's portal as a message, so the collaborator to assert against is
// the conversation + notification, not a text gateway.
const notifyMock = vi.fn(async () => {});
vi.mock("@/lib/parent-notifications", () => ({
  createInAppNotification: (...args: unknown[]) => notifyMock(...(args as [])),
}));

import { POST } from "@/app/api/attendance/[id]/first-day-photo/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PHOTO = "https://blob.example/parent-posts/firstday-abc-123.jpg";

describe("POST /api/attendance/[id]/first-day-photo", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    notifyMock.mockClear();
    prismaMock.conversation.create.mockResolvedValue({ id: "conv-1" });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc-1" });
    prismaMock.attendanceRecord.update.mockResolvedValue({ id: "att-1" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when no session", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when photoUrl missing", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: {},
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when attendance record not found", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);

    const res = await POST(
      createRequest("POST", "/api/attendance/missing/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when first-day photo already sent", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: new Date("2026-05-13T08:30:00Z"),
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: { primaryParent: { firstName: "Aysha", surname: "Khan", mobile: "0412345678" } },
      },
      service: { name: "Amana OSHC Minaret" },
    });

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when the child has no parent email on file", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: null,
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: { primaryParent: { firstName: "Aysha", surname: "Khan" } },
      },
      service: { name: "Amana OSHC Minaret" },
    });

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the family has no contact at this centre", async () => {
    // Without a CentreContact the parent portal can't authenticate the
    // conversation, so it would be written and never readable.
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(RECORD());
    prismaMock.centreContact.findFirst.mockResolvedValue(null);

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it("sends the photo as a portal message and notifies the parent", async () => {
    mockSession({ id: "user-9", name: "Sara", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(RECORD());

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(200);

    // The photo is an ATTACHMENT on a real conversation, not a link in a
    // body — that's what puts it in the child's gallery and keeps it
    // behind a login.
    const convo = (prismaMock.conversation.create as unknown as {
      mock: { calls: { 0: { data: Record<string, unknown> } }[] };
    }).mock.calls[0][0].data;
    expect(convo.serviceId).toBe("svc-1");
    expect(convo.familyId).toBe("cc-1");
    expect(
      (convo.messages as { create: { attachmentUrls: string[]; senderType: string } })
        .create.attachmentUrls,
    ).toEqual([PHOTO]);
    expect(
      (convo.messages as { create: { senderType: string } }).create.senderType,
    ).toBe("staff");

    // And the bell, or it sits unread in a portal nobody opened.
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentEmail: "aysha@example.com",
        type: "message",
        link: "/parent/messages/conv-1",
      }),
    );

    expect(prismaMock.attendanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({
          firstDayPhotoUrl: PHOTO,
          firstDayPhotoSentTo: "aysha@example.com",
        }),
      }),
    );
  });

  it("lowercases the email so the portal lookup matches", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(
      RECORD("  Aysha@Example.COM "),
    );

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.centreContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "aysha@example.com", serviceId: "svc-1" },
      }),
    );
  });
});

function RECORD(email = "aysha@example.com") {
  return {
    id: "att-1",
    childId: "child-1",
    serviceId: "svc-1",
    firstDayPhotoSentAt: null,
    child: {
      firstName: "Mira",
      surname: "Khan",
      enrolment: {
        primaryParent: { firstName: "Aysha", surname: "Khan", email },
      },
    },
    service: { name: "Amana OSHC Minaret" },
  };
}
