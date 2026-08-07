/**
 * Headcounts and evacuation drills.
 *
 * These records exist to be read back after something went wrong, so the
 * rules under test are about whether they can be trusted: staff and
 * visitors counted as well as children, no self-counter-signing, no
 * quiet rewriting of a past count, and no attaching a count to another
 * centre's excursion.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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

import { GET, POST } from "@/app/api/services/[id]/headcounts/route";
import { PATCH } from "@/app/api/services/[id]/headcounts/[headcountId]/route";

const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });
const ctx2 = (headcountId = "hc-1", id = "svc-1") => ({
  params: Promise.resolve({ id, headcountId }),
});

describe("service headcounts", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.serviceHeadcount.create.mockResolvedValue({ id: "hc-1" });
    prismaMock.serviceHeadcount.update.mockResolvedValue({ id: "hc-1" });
  });

  it("an educator can record a count — that's who takes them", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    const res = await POST(
      createRequest("POST", "/x", {
        body: { childrenCount: 23, staffCount: 3, visitorsCount: 1, sessionType: "asc" },
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.serviceHeadcount.create.mock.calls[0][0].data;
    // Staff and visitors matter: a count of children alone can't show
    // the building was cleared.
    expect(data.staffCount).toBe(3);
    expect(data.visitorsCount).toBe(1);
    expect(data.conductedById).toBe("u-ed");
  });

  it("refuses more named children than were counted", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    const res = await POST(
      createRequest("POST", "/x", {
        body: { childrenCount: 2, childIds: ["a", "b", "c"] },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.serviceHeadcount.create).not.toHaveBeenCalled();
  });

  it("won't attach a count to another centre's excursion", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
    prismaMock.serviceExcursion.findUnique.mockResolvedValue({
      serviceId: "svc-OTHER",
    });
    const res = await POST(
      createRequest("POST", "/x", {
        body: { childrenCount: 10, excursionId: "exc-elsewhere" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.serviceHeadcount.create).not.toHaveBeenCalled();
  });

  it("an educator at another centre is refused outright", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-OTHER" });
    const res = await POST(
      createRequest("POST", "/x", { body: { childrenCount: 10 } }),
      ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("reports days since the last drill", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.serviceHeadcount.findMany.mockResolvedValue([]);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    prismaMock.serviceHeadcount.findFirst.mockResolvedValue({
      conductedAt: tenDaysAgo,
    });
    const res = await GET(createRequest("GET", "/x"), ctx());
    const body = await res.json();
    expect(body.daysSinceLastDrill).toBe(10);
  });

  it("says null — not zero — when no drill has ever been recorded", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.serviceHeadcount.findMany.mockResolvedValue([]);
    prismaMock.serviceHeadcount.findFirst.mockResolvedValue(null);
    const body = await (await GET(createRequest("GET", "/x"), ctx())).json();
    // Zero would read as "a drill today", the opposite of the truth.
    expect(body.daysSinceLastDrill).toBeNull();
  });

  describe("counter-signing", () => {
    it("refuses self-sign-off", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.serviceHeadcount.findUnique.mockResolvedValue({
        id: "hc-1",
        serviceId: "svc-1",
        conductedById: "u-coord",
        signedOffAt: null,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { signOff: true } }),
        ctx2(),
      );
      expect(res.status).toBe(403);
      expect(prismaMock.serviceHeadcount.update).not.toHaveBeenCalled();
    });

    it("refuses an educator as counter-signer", async () => {
      mockSession({ id: "u-ed2", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.serviceHeadcount.findUnique.mockResolvedValue({
        id: "hc-1",
        serviceId: "svc-1",
        conductedById: "u-ed",
        signedOffAt: null,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { signOff: true } }),
        ctx2(),
      );
      expect(res.status).toBe(403);
    });

    it("stamps the signer from the session", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.serviceHeadcount.findUnique.mockResolvedValue({
        id: "hc-1",
        serviceId: "svc-1",
        conductedById: "u-ed",
        signedOffAt: null,
      });
      await PATCH(
        createRequest("PATCH", "/x", {
          body: { signOff: true, signedOffById: "u-someone-else" },
        }),
        ctx2(),
      );
      const data = prismaMock.serviceHeadcount.update.mock.calls[0][0].data;
      expect(data.signedOffById).toBe("u-coord");
    });

    it("keeps the first signature when signed twice", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.serviceHeadcount.findUnique.mockResolvedValue({
        id: "hc-1",
        serviceId: "svc-1",
        conductedById: "u-ed",
        signedOffAt: new Date("2026-08-01"),
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { signOff: true } }),
        ctx2(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.serviceHeadcount.update).not.toHaveBeenCalled();
    });

    it("offers no way to edit the counts themselves", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.serviceHeadcount.findUnique.mockResolvedValue({
        id: "hc-1",
        serviceId: "svc-1",
        conductedById: "u-ed",
        signedOffAt: null,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { childrenCount: 99 } }),
        ctx2(),
      );
      // Unknown key alone → nothing to update, so it's rejected rather
      // than silently ignored.
      expect(res.status).toBe(400);
    });
  });
});
