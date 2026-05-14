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

const sendSmsMock = vi.fn();
vi.mock("@/lib/sms", () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
  normaliseAuMobile: (raw: string) => {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+61") && cleaned.length === 12) return cleaned;
    if (cleaned.startsWith("04") && cleaned.length === 10) return `+61${cleaned.slice(1)}`;
    return null;
  },
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
    sendSmsMock.mockReset();
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

  it("returns 400 when child has no parent mobile on file", async () => {
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
    const json = await res.json();
    expect(json.error).toMatch(/mobile/i);
  });

  it("returns 400 when parent mobile is not a valid AU number", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: null,
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: { primaryParent: { firstName: "Aysha", surname: "Khan", mobile: "not-a-number" } },
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
  });

  it("dispatches SMS and updates record on happy path", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: null,
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: { primaryParent: { firstName: "Aysha", surname: "Khan", mobile: "0412345678" } },
      },
      service: { name: "Amana OSHC Minaret" },
    });
    prismaMock.attendanceRecord.update.mockResolvedValue({});
    sendSmsMock.mockResolvedValue({ ok: true, provider: "messagemedia", messageIds: ["m-1"] });

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.sentTo).toBe("+61412345678");

    expect(sendSmsMock).toHaveBeenCalledOnce();
    const smsArg = sendSmsMock.mock.calls[0][0];
    expect(smsArg.to.number).toBe("+61412345678");
    expect(smsArg.body).toContain("Mira");
    expect(smsArg.body).toContain("Amana OSHC Minaret");
    expect(smsArg.body).toContain(PHOTO);

    expect(prismaMock.attendanceRecord.update).toHaveBeenCalledOnce();
    const updateArgs = prismaMock.attendanceRecord.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "att-1" });
    expect(updateArgs.data.firstDayPhotoUrl).toBe(PHOTO);
    expect(updateArgs.data.firstDayPhotoSentTo).toBe("+61412345678");
    expect(updateArgs.data.firstDayPhotoSentAt).toBeInstanceOf(Date);
  });

  it("does NOT update record if SMS dispatch fails", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: null,
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: { primaryParent: { firstName: "Aysha", surname: "Khan", mobile: "0412345678" } },
      },
      service: { name: "Amana OSHC Minaret" },
    });
    sendSmsMock.mockResolvedValue({ ok: false, reason: "not_configured" });

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );

    expect(res.status).toBe(400);
    expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it("falls back to CentreContact mobile when primaryParent.mobile is missing", async () => {
    mockSession({ id: "user-1", name: "Tester", role: "admin" });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-1",
      childId: "child-1",
      serviceId: "svc-1",
      firstDayPhotoSentAt: null,
      child: {
        firstName: "Mira",
        surname: "Khan",
        enrolment: {
          primaryParent: { firstName: "Aysha", surname: "Khan", email: "ParentA@example.com" },
        },
      },
      service: { name: "Amana OSHC Minaret" },
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({
      mobile: "0498765432",
    });
    prismaMock.attendanceRecord.update.mockResolvedValue({});
    sendSmsMock.mockResolvedValue({ ok: true, provider: "messagemedia", messageIds: ["m-1"] });

    const res = await POST(
      createRequest("POST", "/api/attendance/att-1/first-day-photo", {
        body: { photoUrl: PHOTO },
      }),
      ctx("att-1"),
    );

    expect(res.status).toBe(200);
    // Lowercased + trimmed for lookup
    const lookupArgs = prismaMock.centreContact.findFirst.mock.calls[0][0];
    expect(lookupArgs.where.email).toBe("parenta@example.com");
    expect(sendSmsMock.mock.calls[0][0].to.number).toBe("+61498765432");
  });
});
