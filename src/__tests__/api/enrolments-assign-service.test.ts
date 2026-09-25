/**
 * Assigning and duplicating an enrolment across services.
 *
 * The behaviours worth pinning down are the ones a careless refactor would
 * quietly break: the three links (submission, children, billing contacts)
 * moving TOGETHER, and a partial assignment NOT stamping the whole
 * submission with one service.
 */
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

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") {
      return new ApiError(400, message);
    }
    static notFound(message = "Not found") {
      return new ApiError(404, message);
    }
    static forbidden(message = "Forbidden") {
      return new ApiError(403, message);
    }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try {
        return await req.json();
      } catch {
        throw ApiError.badRequest("Invalid or missing JSON body");
      }
    },
  };
});

vi.mock("@/lib/api-handler", async () => {
  const { NextResponse } = await import("next/server");
  return {
    handleApiError: vi.fn((_req: unknown, err: unknown) => {
      return NextResponse.json(
        { error: (err as any)?.message || "Internal error" },
        { status: (err as any)?.statusCode || 500 },
      );
    }),
  };
});

const upsertContacts = vi.fn(async () => ({
  primary: { id: "cc-1" },
  secondary: null,
}));
vi.mock("@/lib/enrolment-parent-contacts", () => ({
  upsertContactsFromSubmission: (...args: unknown[]) =>
    upsertContacts(...(args as [])),
}));

import { POST as assign } from "@/app/api/enrolments/[id]/assign-service/route";
import { POST as duplicate } from "@/app/api/enrolments/[id]/duplicate/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const CHILDREN = [
  { id: "ch-1", serviceId: null, bookingPrefs: null },
  { id: "ch-2", serviceId: null, bookingPrefs: null },
];

function seedCommon() {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findUnique.mockResolvedValue({
    id: "svc-2",
    name: "Amana OSHC Minaret Officer",
    status: "active",
  });
  // The route's transaction callback runs against the same mock client.
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.enrolmentSubmission.update.mockResolvedValue({ id: "es-1" });
  prismaMock.child.updateMany.mockResolvedValue({ count: 2 });
}

describe("POST /api/enrolments/[id]/assign-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    seedCommon();
  });

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    const res = await assign(
      createRequest("POST", "/api/enrolments/es-1/assign-service", {
        body: { serviceId: "svc-2" },
      }),
      ctx("es-1"),
    );
    expect(res.status).toBe(401);
  });

  it("links submission, children and billing contacts together", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      id: "es-1",
      serviceId: null,
      status: "submitted",
      primaryParent: { firstName: "Jane" },
      secondaryParent: null,
      childRecords: CHILDREN,
    });

    const res = await assign(
      createRequest("POST", "/api/enrolments/es-1/assign-service", {
        body: { serviceId: "svc-2" },
      }),
      ctx("es-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenAssigned).toBe(2);

    // The whole enrolment moved, so the submission itself is stamped.
    expect(prismaMock.enrolmentSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { serviceId: "svc-2" } }),
    );
    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { serviceId: "svc-2" } }),
    );
    // A family enrolled at a centre it can't be invoiced at is the bug
    // this assertion exists to prevent.
    expect(upsertContacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ serviceId: "svc-2" }),
    );
  });

  it("does NOT stamp the submission when only one sibling moves", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      id: "es-1",
      serviceId: "svc-1",
      status: "submitted",
      primaryParent: { firstName: "Jane" },
      secondaryParent: null,
      childRecords: CHILDREN,
    });

    const res = await assign(
      createRequest("POST", "/api/enrolments/es-1/assign-service", {
        body: { serviceId: "svc-2", childIds: ["ch-1"] },
      }),
      ctx("es-1"),
    );

    expect(res.status).toBe(200);
    // Siblings really do attend different campuses — stamping one service
    // on the submission would misrepresent the child left behind.
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["ch-1"] } } }),
    );
  });

  it("refuses children that belong to another enrolment", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      id: "es-1",
      serviceId: null,
      status: "submitted",
      primaryParent: {},
      secondaryParent: null,
      childRecords: CHILDREN,
    });

    const res = await assign(
      createRequest("POST", "/api/enrolments/es-1/assign-service", {
        body: { serviceId: "svc-2", childIds: ["ch-1", "someone-elses-kid"] },
      }),
      ctx("es-1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.child.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a closed service", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-2",
      name: "Amana OSHC Closed",
      status: "inactive",
    });

    const res = await assign(
      createRequest("POST", "/api/enrolments/es-1/assign-service", {
        body: { serviceId: "svc-2" },
      }),
      ctx("es-1"),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/enrolments/[id]/duplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    seedCommon();
    prismaMock.enrolmentSubmission.create.mockResolvedValue({ id: "es-copy" });
    prismaMock.child.create.mockResolvedValue({ id: "ch-copy" });
  });

  const source = {
    id: "es-1",
    serviceId: "svc-1",
    primaryParent: { firstName: "Jane" },
    secondaryParent: null,
    children: [],
    emergencyContacts: [],
    authorisedPickup: [],
    consents: {},
    paymentMethod: "direct_debit",
    paymentDetails: {},
    referralSource: null,
    signature: "Jane Doe",
    termsAccepted: true,
    privacyAccepted: true,
    debitAgreement: true,
    courtOrders: false,
    courtOrderFiles: [],
    medicalFiles: [],
    documentUploads: [],
    childRecords: [
      { id: "ch-1", firstName: "Billy", surname: "Doe", dob: new Date() },
      { id: "ch-2", firstName: "Sally", surname: "Doe", dob: new Date() },
    ],
  };

  it("creates a fresh submission the receiving centre must confirm", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(source);

    const res = await duplicate(
      createRequest("POST", "/api/enrolments/es-1/duplicate", {
        body: { serviceId: "svc-2" },
      }),
      ctx("es-1"),
    );

    expect(res.status).toBe(200);
    // Carrying the original's approval across would put a child on a roll
    // nobody at the new centre agreed to take.
    expect(prismaMock.enrolmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted", serviceId: "svc-2" }),
      }),
    );
    expect(prismaMock.child.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.child.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending", serviceId: "svc-2" }),
      }),
    );
    // Copy, not move — the originals are untouched.
    expect(prismaMock.child.updateMany).not.toHaveBeenCalled();
  });

  it("withdraws rather than deletes the originals when moving", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue(source);

    const res = await duplicate(
      createRequest("POST", "/api/enrolments/es-1/duplicate", {
        body: { serviceId: "svc-2", childIds: ["ch-1"], move: true },
      }),
      ctx("es-1"),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.child.create).toHaveBeenCalledTimes(1);
    // Attendance and invoices reference these rows — the history of care
    // actually given has to survive the move.
    expect(prismaMock.child.delete).not.toHaveBeenCalled();
    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "withdrawn" } }),
    );
  });

  it("refuses to duplicate an enrolment onto its own service", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      ...source,
      serviceId: "svc-2",
    });

    const res = await duplicate(
      createRequest("POST", "/api/enrolments/es-1/duplicate", {
        body: { serviceId: "svc-2" },
      }),
      ctx("es-1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.enrolmentSubmission.create).not.toHaveBeenCalled();
  });
});
