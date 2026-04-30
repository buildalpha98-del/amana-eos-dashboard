import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") { return new ApiError(400, message); }
    static notFound(message = "Not found") { return new ApiError(404, message); }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try { return await req.json(); }
      catch { throw ApiError.badRequest("Invalid or missing JSON body"); }
    },
  };
});

vi.mock("@/lib/api-handler", () => ({
  handleApiError: vi.fn((_req: unknown, err: unknown, _reqId?: string) => {
    const { NextResponse } = require("next/server");
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    const message = (err as { message?: string })?.message ?? "Internal error";
    return NextResponse.json({ error: message }, { status });
  }),
}));

// Fixture: CentreContact (family) has ONLY email, firstName, lastName, serviceId per pre-flight.
// Address/mobile come from EnrolmentSubmission.primaryParent JSON.
const APP_FIXTURE = {
  id: "app-1",
  serviceId: "svc-1",
  familyId: "fam-1",
  status: "pending",
  type: "sibling",
  childFirstName: "Ada",
  childLastName: "Lovelace",
  childDateOfBirth: new Date("2017-05-12"),
  childGender: "female",
  childSchool: "Amana Primary",
  childYear: "Year 2",
  sessionTypes: ["BSC"],
  startDate: new Date("2026-05-01"),
  medicalConditions: ["Asthma"],
  dietaryRequirements: [],
  medicationDetails: null,
  anaphylaxisActionPlan: null,
  additionalNeeds: null,
  consentPhotography: false,
  consentSunscreen: false,
  consentFirstAid: false,
  consentExcursions: false,
  copyAuthorisedPickups: true,
  copyEmergencyContacts: true,
  reviewedById: null,
  reviewedAt: null,
  declineReason: null,
  notes: null,
  createdChildId: null,
  ownaExportedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  family: {
    id: "fam-1",
    email: "grace@example.com",
    firstName: "Grace",
    lastName: "Lovelace",
    serviceId: "svc-1",
  },
};

const SUBMISSION_FIXTURE = {
  id: "sub-1",
  serviceId: "svc-1",
  status: "processed",
  primaryParent: {
    firstName: "Grace",
    surname: "Lovelace",
    email: "grace@example.com",
    mobile: "+61400000000",
    address: "1 Analytical Lane",
    suburb: "Coalbrook",
    state: "NSW",
    postcode: "2000",
  },
  secondaryParent: null,
  createdAt: new Date("2025-01-01"),
};

describe("GET /api/enrolment-applications/[id]/owna-csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("rejects unauthenticated requests with 401", async () => {
    mockNoSession();
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects below-coordinator roles (staff) with 403", async () => {
    mockSession({ role: "staff", id: "u-1", name: "Staff User" });
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when application does not exist", async () => {
    mockSession({ role: "coordinator", id: "u-1", name: "Coordinator" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(null);
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/missing/owna-csv"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with CSV + sets ownaExportedAt, pulling address from EnrolmentSubmission", async () => {
    mockSession({ role: "coordinator", id: "u-1", name: "Coordinator" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(APP_FIXTURE);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(SUBMISSION_FIXTURE);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });

    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("enrolment-ada-lovelace-");

    const body = await res.text();
    expect(body).toContain("first_name,last_name");
    expect(body).toContain("Ada");
    expect(body).toContain("Lovelace");
    expect(body).toContain("1 Analytical Lane");
    expect(body).toContain("Coalbrook");
    expect(body).toContain("grace@example.com");

    expect(prismaMock.enrolmentApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ ownaExportedAt: expect.any(Date) }),
      }),
    );
  });

  it("returns 200 with empty address when no matching EnrolmentSubmission exists", async () => {
    mockSession({ role: "coordinator", id: "u-1", name: "Coordinator" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(APP_FIXTURE);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(null);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });

    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    // Still contains the child + parent name + email from CentreContact
    expect(body).toContain("Ada");
    expect(body).toContain("Grace");
    expect(body).toContain("grace@example.com");
  });

  it("allows re-download (ownaExportedAt already set)", async () => {
    mockSession({ role: "owner", id: "u-1", name: "Owner" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date("2026-04-20"),
    });
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(SUBMISSION_FIXTURE);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(200);
  });
});
