import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET, PUT } from "@/app/api/children/[id]/medical/route";

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

/**
 * 2026-07-12 authz fix: child medical records (allergies, anaphylaxis action
 * plan, medication) were readable AND writable by any authenticated user
 * across all centres. These lock it to the child's own centre (admins bypass).
 */
describe("child medical — centre scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("GET 403 when a coordinator at another centre reads a child's medical", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-2" });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      firstName: "A",
      surname: "B",
      medicalConditions: ["Anaphylaxis"],
      medicationDetails: "EpiPen",
      anaphylaxisActionPlan: true,
      dietaryRequirements: [],
      additionalNeeds: null,
      nextImmunisationDue: null,
      serviceId: "svc-1",
    });
    const res = await GET(createRequest("GET", "/api/children/child-1/medical"), ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("GET 200 for the coordinator at the child's own centre", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      firstName: "A",
      surname: "B",
      medicalConditions: [],
      medicationDetails: null,
      anaphylaxisActionPlan: false,
      dietaryRequirements: [],
      additionalNeeds: null,
      nextImmunisationDue: null,
      serviceId: "svc-1",
    });
    const res = await GET(createRequest("GET", "/api/children/child-1/medical"), ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("GET 200 for an admin regardless of centre", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      firstName: "A",
      surname: "B",
      medicalConditions: [],
      medicationDetails: null,
      anaphylaxisActionPlan: false,
      dietaryRequirements: [],
      additionalNeeds: null,
      nextImmunisationDue: null,
      serviceId: "svc-9",
    });
    const res = await GET(createRequest("GET", "/api/children/child-1/medical"), ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("PUT 403 when a coordinator at another centre tries to overwrite medical (no write happens)", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-2" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1", serviceId: "svc-1" });
    const res = await PUT(
      createRequest("PUT", "/api/children/child-1/medical", { anaphylaxisActionPlan: false }),
      ctx({ id: "child-1" }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.child.update).not.toHaveBeenCalled();
  });
});
