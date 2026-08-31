import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearAmbassadorCourseCache } from "@/lib/ambassadors/lms-gate";

// Import AFTER mocks are set up
import { GET as pilotGET, PATCH as pilotPATCH } from "@/app/api/ambassadors/pilot/route";
import { GET as recordsGET } from "@/app/api/ambassadors/records/route";
import { POST as transitionPOST } from "@/app/api/ambassadors/records/[id]/transition/route";
import { GET as exportGET, POST as exportPOST } from "@/app/api/ambassadors/payroll-export/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function mockCourseCompleted(completed: boolean) {
  prismaMock.lMSCourse.findFirst.mockResolvedValue({ id: "course-1" });
  prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
    completed ? { status: "completed" } : { status: "in_progress" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  _clearAmbassadorCourseCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  mockCourseCompleted(true);
});

describe("GET /api/ambassadors/pilot", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await pilotGET(createRequest("GET", "/api/ambassadors/pilot"));
    expect(res.status).toBe(401);
  });

  it("computes per-centre progress, team bonus flags, cost incl. super, leaderboard first names", async () => {
    mockSession({ id: "u-owner", name: "Jayden", role: "owner" });
    prismaMock.ambassadorPilot.findFirst.mockResolvedValue({
      id: "pilot-1",
      name: "Pilot",
      startDate: new Date("2026-08-17"),
      endDate: new Date("2026-09-11"),
      status: "active",
      centres: [
        {
          id: "pc-1",
          serviceId: "svc-1",
          targetQualifiedEnrolments: 2,
          teamBonusAmount: 200,
          service: { name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA" },
        },
      ],
    });
    prismaMock.ambassadorEnrolment.findMany.mockResolvedValue([
      {
        serviceId: "svc-1",
        qualified: true,
        incentiveAmount: 50,
        attributionSource: "qr_ref",
        attributionConflict: false,
        status: "director_verified",
        creditedEducatorId: "u-a",
        creditedEducator: { name: "Aisha Rahman" },
      },
      {
        serviceId: "svc-1",
        qualified: true,
        incentiveAmount: 0,
        attributionSource: "unknown",
        attributionConflict: false,
        status: "logged",
        creditedEducatorId: null,
        creditedEducator: null,
      },
    ]);
    prismaMock.ambassadorAdjustment.findMany.mockResolvedValue([
      { educatorId: "u-a", amount: 100, type: "milestone_kicker" },
    ]);

    const res = await pilotGET(createRequest("GET", "/api/ambassadors/pilot"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const centre = body.pilot.centres[0];
    expect(centre.qualifiedCount).toBe(2);
    expect(centre.teamBonusEarned).toBe(true); // 2 >= target 2
    expect(body.pilot.totals.gross).toBe(150); // 50 incentive + 100 kicker
    expect(body.pilot.totals.superAmount).toBe(18); // 12% of 150
    // Leaderboard: first names only — the surname must not appear.
    expect(body.pilot.leaderboard[0].firstName).toBe("Aisha");
    expect(JSON.stringify(body.pilot.leaderboard)).not.toContain("Rahman");
  });

  it("PATCH is denied for members (403)", async () => {
    mockSession({ id: "u-dir", name: "Director", role: "member" });
    const res = await pilotPATCH(
      createRequest("PATCH", "/api/ambassadors/pilot", {
        body: { action: "activate" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("PATCH close stamps closedAt/closedById", async () => {
    mockSession({ id: "u-owner", name: "Jayden", role: "owner" });
    prismaMock.ambassadorPilot.findFirst.mockResolvedValue({
      id: "pilot-1",
      status: "active",
    });
    prismaMock.ambassadorPilot.update.mockResolvedValue({});
    const res = await pilotPATCH(
      createRequest("PATCH", "/api/ambassadors/pilot", {
        body: { action: "close" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.ambassadorPilot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "closed",
          closedById: "u-owner",
        }),
      }),
    );
  });
});

describe("GET /api/ambassadors/records — role scoping", () => {
  beforeEach(() => {
    prismaMock.ambassadorEnrolment.findMany.mockResolvedValue([]);
  });

  it("staff see ONLY their own credited records", async () => {
    mockSession({ id: "u-staff", name: "Educator", role: "staff", serviceId: "svc-1" });
    await recordsGET(createRequest("GET", "/api/ambassadors/records"));
    const where = prismaMock.ambassadorEnrolment.findMany.mock.calls[0][0].where;
    expect(where.creditedEducatorId).toBe("u-staff");
    expect(where.serviceId).toBeUndefined();
  });

  it("members are scoped to their centres", async () => {
    mockSession({ id: "u-dir", name: "Director", role: "member", serviceId: "svc-1" });
    prismaMock.service.findMany.mockResolvedValue([]); // managed services
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
    await recordsGET(createRequest("GET", "/api/ambassadors/records"));
    const where = prismaMock.ambassadorEnrolment.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("owner is unscoped", async () => {
    mockSession({ id: "u-owner", name: "Jayden", role: "owner" });
    await recordsGET(createRequest("GET", "/api/ambassadors/records"));
    const where = prismaMock.ambassadorEnrolment.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBeUndefined();
    expect(where.creditedEducatorId).toBeUndefined();
  });

  it("status filter uses the enum values", async () => {
    mockSession({ id: "u-owner", name: "Jayden", role: "owner" });
    await recordsGET(
      createRequest("GET", "/api/ambassadors/records?status=director_verified"),
    );
    const where = prismaMock.ambassadorEnrolment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("director_verified");
  });
});

describe("POST /api/ambassadors/records/[id]/transition — permission boundaries", () => {
  function mockRecordLookups() {
    // transition route scope lookup + state machine lookup + recompute lookup
    prismaMock.ambassadorEnrolment.findUnique.mockResolvedValue({
      id: "rec-1",
      serviceId: "svc-1",
      creditedEducatorId: "u-a",
      creditedEducator: { name: "Aisha Rahman" },
      status: "director_verified",
      qualified: true,
      attributionConflict: false,
      regularSessionsPerWeek: 3,
      incentiveAmount: 50,
      newChildStatus: "new_child",
      qualifiedAt: new Date(),
      sessions: [],
    });
    prismaMock.ambassadorEnrolment.update.mockResolvedValue({});
    prismaMock.ambassadorEnrolment.count.mockResolvedValue(1);
    prismaMock.ambassadorAdjustment.findUnique.mockResolvedValue(null);
    prismaMock.ambassadorTransition.create.mockResolvedValue({});
  }

  it("staff cannot transition at all (403)", async () => {
    mockSession({ id: "u-staff", name: "Educator", role: "staff" });
    const res = await transitionPOST(
      createRequest("POST", "/api/ambassadors/records/rec-1/transition", {
        body: { to: "director_verified" },
      }),
      ctx("rec-1"),
    );
    expect(res.status).toBe(403);
  });

  it("a member cannot approve (sm_approved is SM+)", async () => {
    mockSession({ id: "u-dir", name: "Director", role: "member", serviceId: "svc-1" });
    mockRecordLookups();
    const res = await transitionPOST(
      createRequest("POST", "/api/ambassadors/records/rec-1/transition", {
        body: { to: "sm_approved" },
      }),
      ctx("rec-1"),
    );
    expect(res.status).toBe(403);
  });

  it("a member cannot touch another centre's record (404, not 403)", async () => {
    mockSession({ id: "u-dir", name: "Director", role: "member", serviceId: "svc-OTHER" });
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
    mockRecordLookups();
    const res = await transitionPOST(
      createRequest("POST", "/api/ambassadors/records/rec-1/transition", {
        body: { to: "director_verified" },
      }),
      ctx("rec-1"),
    );
    expect(res.status).toBe(404);
  });

  it("head_office approves a verified record at their centre", async () => {
    mockSession({ id: "u-sm", name: "State Manager", role: "head_office" });
    prismaMock.userServiceMembership.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ]);
    mockRecordLookups();
    const res = await transitionPOST(
      createRequest("POST", "/api/ambassadors/records/rec-1/transition", {
        body: { to: "sm_approved" },
      }),
      ctx("rec-1"),
    );
    expect(res.status).toBe(200);
  });

  it("the LMS gate surfaces as a 400 with the educator named", async () => {
    mockSession({ id: "u-admin", name: "Daniel", role: "admin" });
    mockRecordLookups();
    prismaMock.ambassadorEnrolment.findUnique.mockResolvedValue({
      id: "rec-1",
      serviceId: "svc-1",
      creditedEducatorId: "u-a",
      creditedEducator: { name: "Aisha Rahman" },
      status: "sm_approved",
      qualified: true,
      attributionConflict: false,
      regularSessionsPerWeek: 3,
      incentiveAmount: 50,
      newChildStatus: "new_child",
      qualifiedAt: new Date(),
      sessions: [],
    });
    mockCourseCompleted(false);
    const res = await transitionPOST(
      createRequest("POST", "/api/ambassadors/records/rec-1/transition", {
        body: { to: "sent_to_payroll" },
      }),
      ctx("rec-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Aisha Rahman has not completed the Amana Ambassadors course");
  });
});

describe("payroll export", () => {
  const APPROVED = [
    {
      id: "rec-1",
      pilotId: "pilot-1",
      incentiveAmount: 50,
      creditedEducatorId: "u-a",
      creditedEducator: { id: "u-a", name: "Aisha Rahman", employmentHeroEmployeeId: 4321 },
      service: { name: "Amana OSHC MFIS Greenacre" },
    },
    {
      id: "rec-2",
      pilotId: "pilot-1",
      incentiveAmount: 30,
      creditedEducatorId: "u-a",
      creditedEducator: { id: "u-a", name: "Aisha Rahman", employmentHeroEmployeeId: 4321 },
      service: { name: "Amana OSHC MFIS Greenacre" },
    },
  ];

  it("is admin/owner only (member gets 403)", async () => {
    mockSession({ id: "u-dir", name: "Director", role: "member" });
    const res = await exportGET(createRequest("GET", "/api/ambassadors/payroll-export"));
    expect(res.status).toBe(403);
  });

  it("CSV groups by educator with the Ambassador Incentive label and 12% super", async () => {
    mockSession({ id: "u-admin", name: "Daniel", role: "admin" });
    prismaMock.ambassadorEnrolment.findMany.mockResolvedValue(APPROVED);
    prismaMock.ambassadorAdjustment.findMany.mockResolvedValue([
      { educatorId: "u-a", amount: 100 },
    ]);
    const res = await exportGET(createRequest("GET", "/api/ambassadors/payroll-export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain('"Aisha Rahman","4321"');
    expect(csv).toContain('"Ambassador Incentive"');
    // gross 80 + kicker 100 = 180; super = 21.60
    expect(csv).toContain('"80.00","100.00"');
    expect(csv).toContain('"21.60"');
  });

  it("holds back an educator who has not completed the course", async () => {
    mockSession({ id: "u-admin", name: "Daniel", role: "admin" });
    prismaMock.ambassadorEnrolment.findMany.mockResolvedValue(APPROVED);
    prismaMock.ambassadorAdjustment.findMany.mockResolvedValue([]);
    mockCourseCompleted(false);
    const res = await exportPOST(
      createRequest("POST", "/api/ambassadors/payroll-export", {
        body: { action: "preview" },
      }),
    );
    const body = await res.json();
    expect(body.groups).toHaveLength(0);
    expect(body.held).toEqual([
      { educatorId: "u-a", name: "Aisha Rahman", recordCount: 2 },
    ]);
  });
});
