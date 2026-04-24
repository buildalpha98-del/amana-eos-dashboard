import { describe, it, expect, beforeEach, vi } from "vitest";

import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

// Toggle the parent-auth mock per test. When false, the wrapper returns a
// 401 before invoking the handler, mirroring withParentAuth's real behaviour
// when no parent-session cookie is present.
let authEnabled = true;

vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>(
    "@/lib/parent-auth",
  );
  return {
    ...actual,
    withParentAuth:
      (
        handler: (
          req: unknown,
          ctx: {
            parent: { email: string; enrolmentIds: string[] };
            params?: Promise<Record<string, string>>;
          },
        ) => Promise<Response>,
      ) =>
      async (
        req: unknown,
        routeContext?: { params?: Promise<Record<string, string>> },
      ) => {
        if (!authEnabled) {
          return new Response(
            JSON.stringify({ error: "Invalid or expired parent session" }),
            {
              status: 401,
              headers: { "content-type": "application/json" },
            },
          );
        }
        try {
          return await handler(req, {
            ...routeContext,
            parent: { email: "p1@x.test", enrolmentIds: ["enr1"] },
          });
        } catch (err) {
          if (err instanceof ApiError) {
            return new Response(
              JSON.stringify({
                error: err.message,
                ...(err.details != null ? { details: err.details } : {}),
              }),
              {
                status: err.status,
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw err;
        }
      },
  };
});

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

import { PATCH } from "@/app/api/parent/bookings/[bookingId]/route";

const TRUSTED_CERT_URL =
  "https://abcd.public.blob.vercel-storage.com/parent-absence-certs/cert-1.pdf";
const UNTRUSTED_CERT_URL = "https://evil.example.com/cert.pdf";

function patch(bookingId: string, body: unknown) {
  return {
    req: createRequest("PATCH", `/api/parent/bookings/${bookingId}`, {
      body: body as Record<string, unknown>,
    }),
    ctx: { params: Promise.resolve({ bookingId }) },
  };
}

const FUTURE_DATE = new Date("2026-05-01T00:00:00.000Z");
const PAST_DATE = new Date("2026-04-20T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-24T10:00:00.000Z"));
  authEnabled = true;

  prismaMock.child.findMany.mockResolvedValue([{ id: "c1" }]);
  prismaMock.booking.findUnique.mockResolvedValue({
    id: "bk1",
    childId: "c1",
    serviceId: "s1",
    date: FUTURE_DATE,
    sessionType: "asc",
    status: "confirmed",
    type: "casual",
  });
  prismaMock.booking.update.mockResolvedValue({
    id: "bk1",
    status: "absent_notified",
    child: { id: "c1", firstName: "Arlo", surname: "Smith" },
    service: { id: "s1", name: "Lakemba" },
  });
  prismaMock.absence.create.mockResolvedValue({ id: "abs1" });
});

describe("PATCH /api/parent/bookings/[bookingId]", () => {
  it("200 on happy path — isIllness + notes + trusted cert URL", async () => {
    const { req, ctx } = patch("bk1", {
      isIllness: true,
      notes: "Fever since last night",
      medicalCertificateUrl: TRUSTED_CERT_URL,
    });

    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.booking.status).toBe("absent_notified");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.absence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          childId: "c1",
          serviceId: "s1",
          isIllness: true,
          medicalCertificateUrl: TRUSTED_CERT_URL,
          notes: "Fever since last night",
        }),
      }),
    );
  });

  it("400 when the booking date is in the past (Sydney)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk1",
      childId: "c1",
      serviceId: "s1",
      date: PAST_DATE,
      sessionType: "asc",
      status: "confirmed",
      type: "casual",
    });

    const { req, ctx } = patch("bk1", { isIllness: false });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/past booking/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("401 when no parent session", async () => {
    authEnabled = false;

    const { req, ctx } = patch("bk1", { isIllness: true });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(401);
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
  });

  it("403 when the booking's child does not belong to this parent", async () => {
    prismaMock.child.findMany.mockResolvedValue([{ id: "other-child" }]);

    const { req, ctx } = patch("bk1", { isIllness: false });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the medical certificate URL is not from our upload endpoint", async () => {
    const { req, ctx } = patch("bk1", {
      isIllness: true,
      medicalCertificateUrl: UNTRUSTED_CERT_URL,
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the booking has already been cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk1",
      childId: "c1",
      serviceId: "s1",
      date: FUTURE_DATE,
      sessionType: "asc",
      status: "cancelled",
      type: "casual",
    });

    const { req, ctx } = patch("bk1", { isIllness: false });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cancelled/i);
  });
});
