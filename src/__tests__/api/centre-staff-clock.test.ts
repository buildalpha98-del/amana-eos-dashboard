/**
 * Attendances → Staff sign in & out (2026-10-09). Your own shift: no PIN.
 * Anyone else's (the shared centre login / iPad): THEIR PIN, or nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hash } from "bcryptjs";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 4, resetIn: 0 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "t",
}));
const clock = vi.hoisted(() => ({ clockShift: vi.fn(() => Promise.resolve({ kind: "ok", shift: { id: "sh1", actualStart: new Date(), actualEnd: null } })) }));
vi.mock("@/lib/shift-clock", () => clock);

import { POST } from "@/app/api/services/[id]/staff-clock/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let pinHash = "";

beforeEach(async () => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  pinHash = pinHash || (await hash("2580", 4));
  prismaMock.user.findUnique.mockImplementation(async (args: { select?: Record<string, unknown>; where: { id: string } }) => {
    if (args.select && "kioskPinHash" in args.select) {
      return args.where.id === "sarah"
        ? { active: true, kioskPinHash: pinHash, serviceId: "svc-a", serviceMemberships: [] }
        : { active: true, kioskPinHash: pinHash, serviceId: "svc-b", serviceMemberships: [] };
    }
    return { active: true };
  });
});

describe("staff sign in & out", () => {
  it("clocks you into your own shift without a PIN", async () => {
    mockSession({ id: "sarah", name: "Sarah", role: "staff", serviceId: "svc-a" });
    const res = await POST(createRequest("POST", "/x", { body: { userId: "sarah", action: "in" } }), ctx("svc-a"));
    expect(res.status).toBe(200);
    expect(clock.clockShift).toHaveBeenCalledWith("sarah", "in", expect.any(Date), expect.anything());
  });

  it("on the centre login, needs that person's PIN", async () => {
    mockSession({ id: "centre", name: "Greenacre", role: "member", serviceId: "svc-a" });
    expect((await POST(createRequest("POST", "/x", { body: { userId: "sarah", action: "in" } }), ctx("svc-a"))).status).toBe(400);
    expect((await POST(createRequest("POST", "/x", { body: { userId: "sarah", action: "in", pin: "1111" } }), ctx("svc-a"))).status).toBe(401);
    expect((await POST(createRequest("POST", "/x", { body: { userId: "sarah", action: "in", pin: "2580" } }), ctx("svc-a"))).status).toBe(200);
  });

  it("won't clock someone from another centre, PIN or not", async () => {
    mockSession({ id: "centre", name: "Greenacre", role: "member", serviceId: "svc-a" });
    expect((await POST(createRequest("POST", "/x", { body: { userId: "omar", action: "in", pin: "2580" } }), ctx("svc-a"))).status).toBe(401);
    expect(clock.clockShift).not.toHaveBeenCalled();
  });
});
