/**
 * 2026-10-08: Directors (incl. a centre's own login) hit "Error loading
 * data — forbidden" on their centre page: Service Info's capacity card
 * (/api/enquiries/stats) and Families (/api/families) were admin-only.
 * Both now allow ONE centre in the Director's scope — never org-wide,
 * never another centre.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));
vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: ["svc-1"] })),
}));

import { GET as stats } from "@/app/api/enquiries/stats/route";
import { GET as families } from "@/app/api/families/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("coordinator access to their own centre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
    mockSession({ id: "d1", name: "Dir", role: "member", serviceId: "svc-1" });
    prismaMock.parentEnquiry.groupBy.mockResolvedValue([] as never);
    prismaMock.parentEnquiry.count.mockResolvedValue(0 as never);
    prismaMock.parentEnquiry.findMany.mockResolvedValue([] as never);
    prismaMock.service.findMany.mockResolvedValue([] as never);
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([] as never);
  });

  it("enquiry stats: own centre OK", async () => {
    const res = await stats(createRequest("GET", "/api/enquiries/stats?serviceId=svc-1"));
    expect(res.status).not.toBe(403);
  });

  it("enquiry stats: another centre or org-wide refused", async () => {
    expect((await stats(createRequest("GET", "/api/enquiries/stats?serviceId=svc-9"))).status).toBe(403);
    expect((await stats(createRequest("GET", "/api/enquiries/stats"))).status).toBe(403);
  });

  it("families: own centre OK", async () => {
    const res = await families(createRequest("GET", "/api/families?serviceId=svc-1"));
    expect(res.status).toBe(200);
  });

  it("families: another centre or org-wide refused", async () => {
    expect((await families(createRequest("GET", "/api/families?serviceId=svc-9"))).status).toBe(403);
    expect((await families(createRequest("GET", "/api/families"))).status).toBe(403);
  });

  it("educators are still refused", async () => {
    mockSession({ id: "s1", name: "Ed", role: "staff", serviceId: "svc-1" });
    expect((await families(createRequest("GET", "/api/families?serviceId=svc-1"))).status).toBe(403);
    expect((await stats(createRequest("GET", "/api/enquiries/stats?serviceId=svc-1"))).status).toBe(403);
  });
});
