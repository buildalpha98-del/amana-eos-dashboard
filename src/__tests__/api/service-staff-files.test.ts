import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));
vi.mock("@/lib/org-settings", () => ({ getOrgSettings: vi.fn(async () => null) }));

import { GET } from "@/app/api/services/[id]/staff-files/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const call = (id = "svc-1") =>
  GET(createRequest("GET", `/api/services/${id}/staff-files`), { params: Promise.resolve({ id }) } as never);

describe("GET /api/services/[id]/staff-files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    prismaMock.document.findMany.mockResolvedValue([]);
  });

  it("educators can't open it", async () => {
    mockSession({ id: "s1", name: "Ed", role: "staff", serviceId: "svc-1" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-1" } as never);
    expect((await call()).status).toBe(403);
  });

  it("a Director of ANOTHER centre can't open it", async () => {
    mockSession({ id: "d2", name: "Dir", role: "member", serviceId: "svc-2" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-2" } as never);
    expect((await call("svc-1")).status).toBe(403);
  });

  it("the centre's Director sees every staff member, their files, and what's missing", async () => {
    mockSession({ id: "d1", name: "Dir", role: "member", serviceId: "svc-1" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-1" } as never);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", name: "Safina", role: "staff", avatar: null }] as never);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      { id: "c1", userId: "u1", type: "wwcc", label: null, fileUrl: "https://x", expiryDate: new Date("2030-01-01") },
    ] as never);

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff[0].files[0]).toMatchObject({ title: "WWCC", href: "/api/compliance/c1/download" });
    expect(body.staff[0].missing).not.toContain("WWCC");
    expect(body.staff[0].missing.length).toBeGreaterThan(0);
    // Contracts carry pay rates — never part of a centre's staff files.
    expect(prismaMock.employmentContract.findMany).not.toHaveBeenCalled();
  });
});
