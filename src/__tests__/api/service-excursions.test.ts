/**
 * Excursions and incursions.
 *
 * The rules under test are the ones an incident investigation would care
 * about: that consent is collected per child, that a risk assessment
 * can't be signed off before it exists or by someone junior, that the
 * reviewer is taken from the session rather than the payload, and that
 * replacing the document clears the old sign-off.
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
vi.mock("@/lib/trusted-urls", () => ({
  isTrustedBlobUrl: (u: string) => u.startsWith("https://blob.vercel-storage.com/"),
}));

import { GET, POST } from "@/app/api/services/[id]/excursions/route";
import { PATCH } from "@/app/api/services/[id]/excursions/[excursionId]/route";

const BLOB = "https://blob.vercel-storage.com/risk.pdf";
const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });
const ctx2 = (excursionId = "exc-1", id = "svc-1") => ({
  params: Promise.resolve({ id, excursionId }),
});

describe("service excursions", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.centreContact.findMany.mockResolvedValue([]);
  });

  describe("POST", () => {
    beforeEach(() => {
      prismaMock.parentForm.create.mockResolvedValue({ id: "form-1" });
      prismaMock.serviceExcursion.create.mockResolvedValue({
        id: "exc-1",
        formId: "form-1",
      });
      prismaMock.$transaction.mockImplementation(async (fn: never) =>
        typeof fn === "function"
          ? (fn as (tx: unknown) => unknown)(prismaMock)
          : fn,
      );
    });

    it("mints a PER-CHILD permission form alongside the excursion", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      const res = await POST(
        createRequest("POST", "/api/services/svc-1/excursions", { body: {
          title: "Holiday Quest movie day",
          date: "2026-09-10",
          destination: "Hoyts Broadway",
          sessionType: "vc",
        } }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const form = prismaMock.parentForm.create.mock.calls[0][0].data;
      // Consent for one child says nothing about their sibling.
      expect(form.perChild).toBe(true);
      expect(form.title).toContain("Holiday Quest movie day");
      expect(form.description).toContain("Hoyts Broadway");
      // Signatures are wanted before they leave.
      expect(form.dueDate).toEqual(new Date("2026-09-10T00:00:00.000Z"));
    });

    it("can skip the form for an incursion that needs no consent", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      await POST(
        createRequest("POST", "/api/services/svc-1/excursions", { body: {
          kind: "incursion",
          title: "Reptile show in the hall",
          date: "2026-09-10",
          createPermissionForm: false,
        } }),
        ctx(),
      );
      expect(prismaMock.parentForm.create).not.toHaveBeenCalled();
      expect(
        prismaMock.serviceExcursion.create.mock.calls[0][0].data.formId,
      ).toBeNull();
    });

    it("refuses a risk assessment URL from outside our storage", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      const res = await POST(
        createRequest("POST", "/api/services/svc-1/excursions", { body: {
          title: "Park visit",
          date: "2026-09-10",
          riskAssessmentUrl: "https://evil.example.com/risk.pdf",
        } }),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.serviceExcursion.create).not.toHaveBeenCalled();
    });

    it("a coordinator from another centre is refused", async () => {
      mockSession({
        id: "u-1",
        name: "Coord",
        role: "member",
        serviceId: "svc-OTHER",
      });
      const res = await POST(
        createRequest("POST", "/api/services/svc-1/excursions", { body: {
          title: "Park visit",
          date: "2026-09-10",
        } }),
        ctx(),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET", () => {
    it("reports attending from bookings and signed from the form", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      prismaMock.serviceExcursion.findMany.mockResolvedValue([
        {
          id: "exc-1",
          kind: "excursion",
          title: "Movie day",
          destination: "Hoyts",
          date: new Date("2026-09-10T00:00:00.000Z"),
          sessionType: "vc",
          departTime: null,
          returnTime: null,
          transport: null,
          notes: null,
          status: "planned",
          riskAssessmentUrl: null,
          riskAssessmentFileName: null,
          riskAssessmentReviewedAt: null,
          formId: "form-1",
          form: { id: "form-1", title: "t", status: "active", _count: { signatures: 8 } },
          riskAssessmentReviewedBy: null,
        },
      ]);
      prismaMock.booking.groupBy.mockResolvedValue([
        {
          date: new Date("2026-09-10T00:00:00.000Z"),
          sessionType: "vc",
          _count: { _all: 31 },
        },
      ]);
      const res = await GET(
        createRequest("GET", "/api/services/svc-1/excursions"),
        ctx(),
      );
      const body = await res.json();
      // The two numbers that matter, on one line — 31 going, 8 signed.
      expect(body.excursions[0].attendingCount).toBe(31);
      expect(body.excursions[0].signedCount).toBe(8);
      // Never the raw code.
      expect(body.excursions[0].programmeName).toBe("Holiday Quest");
    });
  });

  describe("PATCH — risk assessment sign-off", () => {
    beforeEach(() => {
      prismaMock.serviceExcursion.update.mockResolvedValue({ id: "exc-1" });
    });

    it("won't mark reviewed when no risk assessment is attached", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      prismaMock.serviceExcursion.findUnique.mockResolvedValue({
        id: "exc-1",
        serviceId: "svc-1",
        riskAssessmentUrl: null,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { reviewRiskAssessment: true } }),
        ctx2(),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.serviceExcursion.update).not.toHaveBeenCalled();
    });

    it("won't let an educator sign off a risk assessment", async () => {
      mockSession({ id: "u-9", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.serviceExcursion.findUnique.mockResolvedValue({
        id: "exc-1",
        serviceId: "svc-1",
        riskAssessmentUrl: BLOB,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { reviewRiskAssessment: true } }),
        ctx2(),
      );
      expect(res.status).toBe(403);
    });

    it("stamps the reviewer from the session, not the payload", async () => {
      mockSession({ id: "u-boss", name: "Mirna", role: "admin" });
      prismaMock.serviceExcursion.findUnique.mockResolvedValue({
        id: "exc-1",
        serviceId: "svc-1",
        riskAssessmentUrl: BLOB,
      });
      await PATCH(
        createRequest("PATCH", "/x", { body: {
          reviewRiskAssessment: true,
          // A caller trying to attribute the sign-off to someone else.
          riskAssessmentReviewedById: "u-someone-else",
        } }),
        ctx2(),
      );
      const data = prismaMock.serviceExcursion.update.mock.calls[0][0].data;
      expect(data.riskAssessmentReviewedById).toBe("u-boss");
      expect(data.riskAssessmentReviewedAt).toBeInstanceOf(Date);
    });

    it("replacing the document clears the previous sign-off", async () => {
      mockSession({ id: "u-boss", name: "Mirna", role: "admin" });
      prismaMock.serviceExcursion.findUnique.mockResolvedValue({
        id: "exc-1",
        serviceId: "svc-1",
        riskAssessmentUrl: BLOB,
      });
      await PATCH(
        createRequest("PATCH", "/x", { body: {
          riskAssessmentUrl: "https://blob.vercel-storage.com/risk-v2.pdf",
        } }),
        ctx2(),
      );
      const data = prismaMock.serviceExcursion.update.mock.calls[0][0].data;
      // A new document has not been read by anyone yet.
      expect(data.riskAssessmentReviewedAt).toBeNull();
      expect(data.riskAssessmentReviewedById).toBeNull();
    });

    it("404s for an excursion belonging to another service", async () => {
      mockSession({ id: "u-1", name: "Admin", role: "admin" });
      prismaMock.serviceExcursion.findUnique.mockResolvedValue({
        id: "exc-1",
        serviceId: "svc-OTHER",
        riskAssessmentUrl: null,
      });
      const res = await PATCH(
        createRequest("PATCH", "/x", { body: { status: "cancelled" } }),
        ctx2(),
      );
      expect(res.status).toBe(404);
    });
  });
});
