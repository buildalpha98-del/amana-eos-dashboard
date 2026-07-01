/**
 * Auth + visibility tests for /api/performance-reviews.
 *
 * Phase 1 contract we lock down:
 *   - unauthenticated → 401
 *   - non-admin querying someone else's reviews → 403
 *   - non-admin querying their OWN reviews → 200, privateNotes stripped
 *   - admin sees all fields including privateNotes
 *   - POST is admin-only (admin/owner/head_office)
 *   - PATCH from subject during self_assessment → allowed
 *   - PATCH from subject in wrong status → 403
 *   - PATCH from subject touching forbidden fields → 403
 *   - PATCH `submitSelfAssessment` from subject transitions status
 *   - PATCH `acknowledge` from subject in awaiting_acknowledgement → completed
 *   - DELETE is owner-only
 *   - Soft-deleted reviews (deleted=true) → not found
 *   - period/due date ordering enforced
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET, POST } from "@/app/api/performance-reviews/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/performance-reviews/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const baseReview = {
  id: "rev-1",
  userId: "subject-1",
  reviewerUserId: "reviewer-1",
  createdById: "admin-1",
  type: "annual",
  status: "scheduled",
  periodStart: new Date("2025-06-01"),
  periodEnd: new Date("2026-06-01"),
  dueDate: new Date("2026-06-14"),
  selfAssessment: null,
  selfStrengths: null,
  selfImprovements: null,
  selfSubmittedAt: null,
  managerAssessment: null,
  managerStrengths: null,
  managerImprovements: null,
  managerSubmittedAt: null,
  overallRating: null,
  acknowledgedAt: null,
  acknowledgementNotes: null,
  privateNotes: "HR-only context",
  completedAt: null,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "subject-1", name: "Subject" },
  reviewer: { id: "reviewer-1", name: "Reviewer" },
  createdBy: { id: "admin-1", name: "Admin" },
  goals: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

// ── GET list ────────────────────────────────────────────────────────

describe("GET /api/performance-reviews — auth + visibility", () => {
  it("rejects unauthenticated requests", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/performance-reviews?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("staff cannot query another user's reviews", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/performance-reviews?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("staff CAN query their OWN reviews via mine=1, privateNotes stripped", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findMany.mockResolvedValue([baseReview]);
    const res = await GET(
      createRequest("GET", "/api/performance-reviews?mine=1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].privateNotes).toBeUndefined();
  });

  it("staff querying ?userId=themselves works (matches mine=1 path)", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findMany.mockResolvedValue([baseReview]);
    const res = await GET(
      createRequest("GET", "/api/performance-reviews?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews[0].privateNotes).toBeUndefined();
  });

  it("admin sees privateNotes intact", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceReview.findMany.mockResolvedValue([baseReview]);
    const res = await GET(
      createRequest("GET", "/api/performance-reviews?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews[0].privateNotes).toBe("HR-only context");
  });

  it("returns 400 when neither userId nor mine=1 is set", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/performance-reviews"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

// ── POST ────────────────────────────────────────────────────────────

describe("POST /api/performance-reviews", () => {
  beforeEach(() => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    // first user.findUnique = server-auth active check
    prismaMock.user.findUnique.mockResolvedValueOnce({
      active: true,
      serviceId: "svc-1",
    });
    // second user.findUnique = subject lookup in POST handler
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "subject-1",
      name: "Subject",
    });
    prismaMock.performanceReview.create.mockResolvedValue(baseReview);
  });

  it("rejects staff role", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/performance-reviews", {
        body: {
          userId: "subject-1",
          type: "annual",
          periodStart: "2025-06-01",
          periodEnd: "2026-06-01",
          dueDate: "2026-06-14",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can create a review + records ActivityLog", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-reviews", {
        body: {
          userId: "subject-1",
          type: "annual",
          periodStart: "2025-06-01",
          periodEnd: "2026-06-01",
          dueDate: "2026-06-14",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(prismaMock.performanceReview.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    const log = prismaMock.activityLog.create.mock.calls[0]?.[0];
    expect(log?.data.action).toBe("performance_review_created");
  });

  it("rejects when periodEnd < periodStart", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-reviews", {
        body: {
          userId: "subject-1",
          type: "annual",
          periodStart: "2026-06-01",
          periodEnd: "2025-06-01",
          dueDate: "2026-06-14",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects when dueDate < periodEnd", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-reviews", {
        body: {
          userId: "subject-1",
          type: "annual",
          periodStart: "2025-06-01",
          periodEnd: "2026-06-01",
          dueDate: "2026-05-01",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

// ── GET single + PATCH + DELETE ─────────────────────────────────────

describe("GET/PATCH/DELETE /api/performance-reviews/[id]", () => {
  it("404 on soft-deleted reviews", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceReview.findUnique.mockResolvedValue({
      ...baseReview,
      deleted: true,
    });
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-reviews/rev-1"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("subject can read their own review (privateNotes stripped)", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue(baseReview);
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-reviews/rev-1"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.privateNotes).toBeNull();
  });

  it("non-subject staff cannot read someone else's review", async () => {
    mockSession({ id: "other-1", name: "Other", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue(baseReview);
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-reviews/rev-1"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can PATCH the review fully", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceReview.findUnique.mockResolvedValue(baseReview);
    prismaMock.performanceReview.update.mockResolvedValue(baseReview);
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: {
          managerAssessment: "Great period overall.",
          overallRating: "meeting_expectations",
        },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("subject can submit self-assessment when status=self_assessment", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue({
      ...baseReview,
      status: "self_assessment",
    });
    prismaMock.performanceReview.update.mockResolvedValue(baseReview);
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: {
          selfAssessment: "I think it went well.",
          submitSelfAssessment: true,
        },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
    // The transaction handler in prisma-mock invokes our callback with
    // the proxy — check the inner update call.
    const updateCalls = prismaMock.performanceReview.update.mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];
    expect(lastUpdate?.data.status).toBe("manager_review");
  });

  it("subject CANNOT submit self-assessment when status=scheduled", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue({
      ...baseReview,
      status: "scheduled",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: {
          selfAssessment: "Trying to jump the gun.",
          submitSelfAssessment: true,
        },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("subject CANNOT edit managerAssessment", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue({
      ...baseReview,
      status: "self_assessment",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: { managerAssessment: "Nice try." },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("subject can acknowledge when status=awaiting_acknowledgement → completed", async () => {
    mockSession({ id: "subject-1", name: "Subject", role: "staff" });
    prismaMock.performanceReview.findUnique.mockResolvedValue({
      ...baseReview,
      status: "awaiting_acknowledgement",
    });
    prismaMock.performanceReview.update.mockResolvedValue(baseReview);
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: {
          acknowledge: true,
          acknowledgementNotes: "Thanks for the feedback.",
        },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
    const updateCalls = prismaMock.performanceReview.update.mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];
    expect(lastUpdate?.data.status).toBe("completed");
    expect(lastUpdate?.data.completedAt).toBeInstanceOf(Date);
  });

  it("admin DELETE soft-deletes", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.performanceReview.findUnique.mockResolvedValue(baseReview);
    prismaMock.performanceReview.update.mockResolvedValue({
      ...baseReview,
      deleted: true,
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/performance-reviews/rev-1"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
    const update = prismaMock.performanceReview.update.mock.calls[0]?.[0];
    expect(update?.data.deleted).toBe(true);
  });

  it("admin (non-owner) cannot DELETE", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await DELETE(
      createRequest("DELETE", "/api/performance-reviews/rev-1"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("admin PATCH with bad date ordering returns 400", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceReview.findUnique.mockResolvedValue(baseReview);
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-reviews/rev-1", {
        body: {
          periodStart: "2026-06-01",
          periodEnd: "2025-06-01",
        },
      }),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(400);
  });
});
