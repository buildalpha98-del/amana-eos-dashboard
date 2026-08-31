import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { NO_SERVICE_MATCH } from "@/lib/authz-scope";

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

import { GET as enrolmentsGET } from "@/app/api/enrolments/route";
import { GET as medicalAlertsGET } from "@/app/api/reports/medical-alerts/route";

/**
 * 2026-07-12 authz sweep: these list routes leaked org-wide PII to any
 * authenticated user. Verify a non-admin's query is pinned to their centre
 * and an admin's is not.
 */
describe("list-route centre scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("enrolments: a coordinator's list query is scoped to their own serviceId", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    await enrolmentsGET(createRequest("GET", "/api/enrolments"));
    const where = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBe("svc-1");
  });

  it("enrolments: an org-wide non-admin (marketing, no serviceId) sees nothing", async () => {
    mockSession({ id: "u1", name: "Mkt", role: "marketing", serviceId: null });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    await enrolmentsGET(createRequest("GET", "/api/enrolments"));
    const where = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBe(NO_SERVICE_MATCH);
  });

  it("enrolments: an admin's list query is NOT service-scoped", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    await enrolmentsGET(createRequest("GET", "/api/enrolments"));
    const where = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBeUndefined();
  });

  it("medical-alerts: a member omitting ?serviceId is pinned to their centre, not all centres", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.child.findMany.mockResolvedValue([]);
    await medicalAlertsGET(createRequest("GET", "/api/reports/medical-alerts"));
    const where = prismaMock.child.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBe("svc-1");
  });

  it("medical-alerts: a member CANNOT widen by requesting another centre's id", async () => {
    mockSession({ id: "u1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.child.findMany.mockResolvedValue([]);
    await medicalAlertsGET(
      createRequest("GET", "/api/reports/medical-alerts?serviceId=svc-9"),
    );
    const where = prismaMock.child.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBe(NO_SERVICE_MATCH);
  });
});
