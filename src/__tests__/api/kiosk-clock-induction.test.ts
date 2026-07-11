/**
 * Kiosk clock-in induction gate.
 *
 * The kiosk route hand-rolls JSON responses (it is not withApiAuth), so the
 * induction gate is wrapped in a try/catch that returns a coordinator-readable
 * 403. This pins that bespoke path.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/kiosk-auth", () => ({
  authenticateKiosk: vi.fn(() =>
    Promise.resolve({ id: "kiosk-1", serviceId: "svc-1" }),
  ),
}));
vi.mock("bcryptjs", () => ({ compare: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/kiosk/clock/route";

function kioskReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/kiosk/clock", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });
}

const validBody = { userId: "u-1", pin: "1234", action: "in" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("kiosk clock-in induction gate", () => {
  it("returns 403 with a readable reason when the user is not cleared", async () => {
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      // PIN/user lookup (kioskPinHash + serviceId + active).
      if (select && "kioskPinHash" in select)
        return Promise.resolve({
          id: "u-1",
          name: "Newbie",
          active: true,
          serviceId: "svc-1",
          kioskPinHash: "hash",
        });
      // Induction gate lookup.
      if (select && "inductionStatus" in select)
        return Promise.resolve({
          inductionStatus: "in_training",
          inductionGraceUntil: null,
          inductionOverrideUntil: null,
        });
      // Readiness profile lookup.
      return Promise.resolve({ avatar: null, phone: null, _count: { emergencyContacts: 0 } });
    });
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findFirst.mockResolvedValue(null);
    prismaMock.policyDocument.findMany.mockResolvedValue([]);

    const res = await POST(kioskReq(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot clock in/i);
    // The gate short-circuits before any shift lookup.
    expect(prismaMock.rosterShift.findMany).not.toHaveBeenCalled();
  });

  it("proceeds past the gate for a cleared user", async () => {
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      if (select && "kioskPinHash" in select)
        return Promise.resolve({
          id: "u-1",
          name: "Vet",
          active: true,
          serviceId: "svc-1",
          kioskPinHash: "hash",
        });
      if (select && "inductionStatus" in select)
        return Promise.resolve({
          inductionStatus: "cleared",
          inductionGraceUntil: null,
          inductionOverrideUntil: null,
        });
      return Promise.resolve(null);
    });
    // No eligible shift → route returns 404 (proves the gate was passed).
    prismaMock.rosterShift.findMany.mockResolvedValue([]);

    const res = await POST(kioskReq(validBody));
    expect(res.status).toBe(404);
    expect(prismaMock.rosterShift.findMany).toHaveBeenCalled();
  });
});
