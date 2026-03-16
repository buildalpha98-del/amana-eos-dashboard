import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock Prisma ──────────────────────────────────────────────
vi.mock("@/lib/prisma", () => {
  const fn = vi.fn;
  const models = {
    service: { findUnique: fn() },
    user: { findFirst: fn(), findMany: fn() },
    complianceCertificate: { findFirst: fn(), create: fn(), update: fn() },
    staffQualification: { findFirst: fn(), create: fn(), update: fn() },
    policy: { findFirst: fn(), create: fn(), update: fn(), findMany: fn() },
    timesheet: { upsert: fn() },
    timesheetEntry: { deleteMany: fn(), createMany: fn() },
    leaveBalance: { upsert: fn() },
    leaveRequest: { create: fn() },
    budgetItem: { create: fn() },
    healthScore: { upsert: fn() },
    dailyAttendance: { upsert: fn() },
    bookingForecast: { upsert: fn() },
    conversionOpportunity: { findUnique: fn(), create: fn(), update: fn() },
    centreContact: { upsert: fn() },
    npsSurveyResponse: { create: fn() },
    coworkTodo: { create: fn() },
    photoComplianceLog: { upsert: fn() },
    schoolRelationship: { upsert: fn() },
    rosterShift: { upsert: fn() },
    activityLog: { create: fn() },
  };
  return {
    prisma: {
      ...models,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: fn().mockImplementation((cb: any) => cb(models)),
    },
  };
});

// ── Mock Auth ────────────────────────────────────────────────
vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

// ── Helper ───────────────────────────────────────────────────
function makeReq(
  url: string,
  method: string = "POST",
  body?: Record<string, unknown>
) {
  const init: RequestInit = {
    method,
    headers: { Authorization: "Bearer test-key" },
  };
  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

const SERVICE = { id: "svc-1", name: "Test Centre" };

// ══════════════════════════════════════════════════════════════
// A1: HR Compliance
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/hr/compliance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects without auth", async () => {
    (authenticateCowork as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { POST } = await import("@/app/api/cowork/hr/compliance/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/compliance", "POST", {
        serviceCode: "ATC",
        certificates: [],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown service", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const { POST } = await import("@/app/api/cowork/hr/compliance/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/compliance", "POST", {
        serviceCode: "UNKNOWN",
        certificates: [{ type: "wwcc", expiryDate: "2029-01-01" }],
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates new certificate and flags expiring", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (
      prisma.complianceCertificate.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (
      prisma.complianceCertificate.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import("@/app/api/cowork/hr/compliance/route");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/compliance", "POST", {
        serviceCode: "ATC",
        certificates: [
          {
            userEmail: "edu@test.com",
            staffName: "Test Staff",
            type: "wwcc",
            expiryDate: tomorrow,
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.alerts.length).toBe(1); // expires within 30 days
  });

  it("updates existing certificate", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (
      prisma.complianceCertificate.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "cert-1", fileUrl: "old-url" });
    (
      prisma.complianceCertificate.update as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import("@/app/api/cowork/hr/compliance/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/compliance", "POST", {
        serviceCode: "ATC",
        certificates: [
          {
            userEmail: "edu@test.com",
            type: "wwcc",
            expiryDate: "2030-01-01",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.updated).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// A2: HR Qualifications
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/hr/qualifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 without qualifications array", async () => {
    const { POST } = await import(
      "@/app/api/cowork/hr/qualifications/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/qualifications", "POST", {})
    );
    expect(res.status).toBe(400);
  });

  it("creates new qualification", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (
      prisma.staffQualification.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (
      prisma.staffQualification.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import(
      "@/app/api/cowork/hr/qualifications/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/qualifications", "POST", {
        qualifications: [
          {
            userEmail: "edu@test.com",
            type: "diploma",
            name: "Diploma of Early Childhood",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// A3: HR Policies
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/hr/policies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates new policy", async () => {
    (prisma.policy.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    (prisma.policy.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pol-1",
      title: "WHS Policy",
      version: 1,
    });

    const { POST } = await import("@/app/api/cowork/hr/policies/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/policies", "POST", {
        action: "create_policy",
        title: "WHS Policy",
        category: "safety",
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.policyId).toBe("pol-1");
  });

  it("returns 400 for invalid action", async () => {
    const { POST } = await import("@/app/api/cowork/hr/policies/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/policies", "POST", {
        action: "invalid",
      })
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════
// A4: HR Timesheets
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/hr/timesheets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 without required fields", async () => {
    const { POST } = await import("@/app/api/cowork/hr/timesheets/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/timesheets", "POST", {
        serviceCode: "ATC",
      })
    );
    expect(res.status).toBe(400);
  });

  it("imports timesheet with entries", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.timesheet.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ts-1",
    });
    (
      prisma.timesheetEntry.deleteMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 0 });
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (
      prisma.timesheetEntry.createMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });

    const { POST } = await import("@/app/api/cowork/hr/timesheets/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/timesheets", "POST", {
        serviceCode: "ATC",
        weekEnding: "2026-03-22",
        entries: [
          {
            userEmail: "edu@test.com",
            date: "2026-03-16",
            shiftStart: "14:00",
            shiftEnd: "18:30",
            totalHours: 4.5,
            shiftType: "shift_asc",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.entryCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// A5: HR Leave
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/hr/leave", () => {
  beforeEach(() => vi.clearAllMocks());

  it("syncs leave balances", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (prisma.leaveBalance.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(
      {}
    );

    const { POST } = await import("@/app/api/cowork/hr/leave/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/leave", "POST", {
        action: "sync_balances",
        balances: [
          { userEmail: "edu@test.com", leaveType: "annual", balance: 15.5 },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.synced).toBe(1);
  });

  it("creates leave request", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
    });
    (prisma.leaveRequest.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "lr-1",
    });

    const { POST } = await import("@/app/api/cowork/hr/leave/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/leave", "POST", {
        action: "create_request",
        userEmail: "edu@test.com",
        leaveType: "annual",
        startDate: "2026-04-01",
        endDate: "2026-04-05",
        totalDays: 5,
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.requestId).toBe("lr-1");
  });

  it("returns 400 for invalid action", async () => {
    const { POST } = await import("@/app/api/cowork/hr/leave/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/hr/leave", "POST", {
        action: "invalid",
      })
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════
// B1: Finance Budget
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/finance/budget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for unknown service", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const { POST } = await import("@/app/api/cowork/finance/budget/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/budget", "POST", {
        serviceCode: "UNKNOWN",
        items: [{ name: "Test", amount: 50, category: "other", date: "2026-03-16" }],
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates budget items", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.budgetItem.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      {}
    );

    const { POST } = await import("@/app/api/cowork/finance/budget/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/budget", "POST", {
        serviceCode: "ATC",
        items: [
          { name: "Groceries", amount: 185.5, category: "kitchen", date: "2026-03-16" },
          { name: "Art supplies", amount: 42, category: "art_craft", date: "2026-03-17" },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.totalAmount).toBeCloseTo(227.5);
  });
});

// ══════════════════════════════════════════════════════════════
// B2: Finance Health Score
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/finance/health-score", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts health score", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.healthScore.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "hs-1",
    });

    const { POST } = await import(
      "@/app/api/cowork/finance/health-score/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/health-score", "POST", {
        serviceCode: "ATC",
        periodStart: "2026-03-01",
        periodType: "monthly",
        scores: { overall: 78, financial: 72, operational: 85 },
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.overall).toBe(78);
  });
});

// ══════════════════════════════════════════════════════════════
// B3: Finance Attendance
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/finance/attendance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts attendance records", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.dailyAttendance.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import(
      "@/app/api/cowork/finance/attendance/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/attendance", "POST", {
        serviceCode: "ATC",
        records: [
          { date: "2026-03-16", sessionType: "asc", enrolled: 25, attended: 22, capacity: 30 },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.upserted).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// B4: Finance Bookings
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/finance/bookings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts booking forecasts", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.bookingForecast.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import("@/app/api/cowork/finance/bookings/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/bookings", "POST", {
        serviceCode: "ATC",
        forecasts: [
          { date: "2026-03-17", sessionType: "asc", regular: 20, casual: 5, capacity: 30 },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.upserted).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// B5: Finance Conversions
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/finance/conversions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates new conversion opportunity", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.conversionOpportunity.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (
      prisma.conversionOpportunity.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const { POST } = await import(
      "@/app/api/cowork/finance/conversions/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/finance/conversions", "POST", {
        serviceCode: "ATC",
        opportunities: [
          {
            familyRef: "FAM-001",
            sessionType: "asc",
            casualCount: 8,
            periodStart: "2026-02-01",
            periodEnd: "2026-03-01",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// C1: PX NPS
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/px/nps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records NPS responses and detects detractors", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.centreContact.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: "contact-1" }
    );
    (
      prisma.npsSurveyResponse.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});
    (prisma.coworkTodo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      {}
    );

    const { POST } = await import("@/app/api/cowork/px/nps/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/px/nps", "POST", {
        serviceCode: "ATC",
        responses: [
          { email: "happy@parent.com", firstName: "Happy", score: 9 },
          {
            email: "unhappy@parent.com",
            firstName: "Unhappy",
            score: 4,
            comment: "Disappointed",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.created).toBe(2);
    expect(data.detractorCount).toBe(1);
    expect(data.followUpCreated).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// C2: PX Photo Compliance
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/px/photo-compliance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs photo compliance", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.photoComplianceLog.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ confirmed: true });

    const { POST } = await import(
      "@/app/api/cowork/px/photo-compliance/route"
    );
    const res = await POST(
      makeReq("http://localhost/api/cowork/px/photo-compliance", "POST", {
        serviceCode: "ATC",
        date: "2026-03-16",
        confirmed: true,
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.confirmed).toBe(true);
  });

  it("is idempotent (upserts same date)", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.photoComplianceLog.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ confirmed: true });

    const { POST } = await import(
      "@/app/api/cowork/px/photo-compliance/route"
    );
    // First call
    await POST(
      makeReq("http://localhost/api/cowork/px/photo-compliance", "POST", {
        serviceCode: "ATC",
        date: "2026-03-16",
        confirmed: true,
      })
    );
    // Second call same date
    const res = await POST(
      makeReq("http://localhost/api/cowork/px/photo-compliance", "POST", {
        serviceCode: "ATC",
        date: "2026-03-16",
        confirmed: true,
      })
    );
    expect(res.status).toBe(201);
    // Upsert was called twice, not create
    expect(prisma.photoComplianceLog.upsert).toHaveBeenCalledTimes(2);
  });
});

// ══════════════════════════════════════════════════════════════
// D1: Partnerships Relationships
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/partnerships/relationships", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts school relationship", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (
      prisma.schoolRelationship.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "rel-1",
      renewalStatus: "active",
      relationshipScore: 8,
    });

    const { POST } = await import(
      "@/app/api/cowork/partnerships/relationships/route"
    );
    const res = await POST(
      makeReq(
        "http://localhost/api/cowork/partnerships/relationships",
        "POST",
        {
          serviceCode: "ATC",
          principalName: "Dr. Mohammed",
          relationshipScore: 8,
          renewalStatus: "active",
          contractEnd: "2026-12-31",
        }
      )
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.relationshipScore).toBe(8);
  });

  it("returns 400 without serviceCode", async () => {
    const { POST } = await import(
      "@/app/api/cowork/partnerships/relationships/route"
    );
    const res = await POST(
      makeReq(
        "http://localhost/api/cowork/partnerships/relationships",
        "POST",
        { principalName: "Test" }
      )
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════
// E: Ops Roster
// ══════════════════════════════════════════════════════════════
describe("POST /api/cowork/ops/roster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts roster shifts", async () => {
    (prisma.service.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      SERVICE
    );
    (prisma.rosterShift.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(
      {}
    );

    const { POST } = await import("@/app/api/cowork/ops/roster/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/ops/roster", "POST", {
        serviceCode: "ATC",
        shifts: [
          {
            date: "2026-03-17",
            staffName: "Fatima Ahmed",
            shiftStart: "14:00",
            shiftEnd: "18:30",
            sessionType: "asc",
            role: "educator",
          },
        ],
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.upserted).toBe(1);
  });

  it("returns 400 without shifts array", async () => {
    const { POST } = await import("@/app/api/cowork/ops/roster/route");
    const res = await POST(
      makeReq("http://localhost/api/cowork/ops/roster", "POST", {
        serviceCode: "ATC",
      })
    );
    expect(res.status).toBe(400);
  });
});
