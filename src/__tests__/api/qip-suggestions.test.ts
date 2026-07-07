import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/qip/[id]/suggestions/route";
import { PATCH } from "@/app/api/qip/[id]/suggestions/[suggestionId]/route";

async function ctx(id = "q1") {
  return { params: Promise.resolve({ id }) };
}
async function subCtx(id = "q1", suggestionId = "sg1") {
  return { params: Promise.resolve({ id, suggestionId }) };
}

const suggestion = (over: Record<string, unknown> = {}) => ({
  id: "sg1",
  qipId: "q1",
  qualityArea: 5,
  field: "strengths",
  currentText: "old text",
  proposedText: "new proposed text",
  rationale: "evidence shows",
  evidenceRefs: [{ type: "reflection", id: "r1", excerpt: "..." }],
  status: "pending",
  weekOf: new Date("2026-06-29"),
  qip: { serviceId: "s1" },
  ...over,
});

describe("QIP suggestions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("GET /api/qip/[id]/suggestions", () => {
    it("401 without session", async () => {
      mockNoSession();
      const res = await GET(
        createRequest("GET", "/api/qip/q1/suggestions"),
        await ctx(),
      );
      expect(res.status).toBe(401);
    });

    it("403 for member of another service", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "other" });
      prismaMock.qualityImprovementPlan.findUnique.mockResolvedValue({
        id: "q1",
        serviceId: "s1",
      });
      const res = await GET(
        createRequest("GET", "/api/qip/q1/suggestions"),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("404 for unknown qip", async () => {
      mockSession({ id: "u1", name: "C", role: "admin", serviceId: null });
      prismaMock.qualityImprovementPlan.findUnique.mockResolvedValue(null);
      const res = await GET(
        createRequest("GET", "/api/qip/q1/suggestions"),
        await ctx(),
      );
      expect(res.status).toBe(404);
    });

    it("returns pending suggestions by default; all with ?status=all", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      prismaMock.qualityImprovementPlan.findUnique.mockResolvedValue({
        id: "q1",
        serviceId: "s1",
      });
      prismaMock.qipSuggestion.findMany.mockResolvedValue([suggestion()]);

      const res = await GET(
        createRequest("GET", "/api/qip/q1/suggestions"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.qipSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ qipId: "q1", status: "pending" }),
        }),
      );

      await GET(
        createRequest("GET", "/api/qip/q1/suggestions?status=all"),
        await ctx(),
      );
      const lastWhere =
        prismaMock.qipSuggestion.findMany.mock.calls.at(-1)![0].where;
      expect(lastWhere.status).toBeUndefined();
    });
  });

  describe("PATCH /api/qip/[id]/suggestions/[suggestionId]", () => {
    function mockReviewPath(sugg = suggestion()) {
      mockSession({ id: "u9", name: "Dir", role: "member", serviceId: "s1" });
      prismaMock.qipSuggestion.findFirst.mockResolvedValue(sugg);
      prismaMock.qIPQualityArea.update.mockResolvedValue({});
      prismaMock.qualityImprovementPlan.update.mockResolvedValue({});
      prismaMock.qipSuggestion.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...sugg, ...data }),
      );
      prismaMock.activityLog.create.mockResolvedValue({});
    }

    it("401 without session", async () => {
      mockNoSession();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "accept" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(401);
    });

    it("accept patches the QA field and bumps review metadata", async () => {
      mockReviewPath();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "accept" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.qIPQualityArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { qipId_qualityArea: { qipId: "q1", qualityArea: 5 } },
          data: { strengths: "new proposed text" },
        }),
      );
      expect(prismaMock.qualityImprovementPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "q1" },
          data: expect.objectContaining({ reviewedById: "u9" }),
        }),
      );
      expect(prismaMock.qipSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "accepted", reviewedById: "u9" }),
        }),
      );
    });

    it("edit patches with the edited text and stores it", async () => {
      mockReviewPath();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "edit", text: "director's improved wording" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.qIPQualityArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { strengths: "director's improved wording" },
        }),
      );
      expect(prismaMock.qipSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "edited",
            proposedText: "director's improved wording",
          }),
        }),
      );
    });

    it("edit without text is a 400", async () => {
      mockReviewPath();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "edit" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(400);
    });

    it("reject leaves the document untouched", async () => {
      mockReviewPath();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "reject" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.qIPQualityArea.update).not.toHaveBeenCalled();
      expect(prismaMock.qualityImprovementPlan.update).not.toHaveBeenCalled();
      expect(prismaMock.qipSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "rejected" }),
        }),
      );
    });

    it("404 when suggestion does not belong to this qip", async () => {
      mockSession({ id: "u9", name: "Dir", role: "member", serviceId: "s1" });
      prismaMock.qipSuggestion.findFirst.mockResolvedValue(null);
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "accept" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(404);
    });

    it("409 when already reviewed", async () => {
      mockReviewPath(suggestion({ status: "accepted" }));
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "accept" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(409);
    });

    it("403 for member of another service", async () => {
      mockSession({ id: "u9", name: "Dir", role: "member", serviceId: "other" });
      prismaMock.qipSuggestion.findFirst.mockResolvedValue(suggestion());
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "accept" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(403);
    });

    it("400 invalid action", async () => {
      mockReviewPath();
      const res = await PATCH(
        createRequest("PATCH", "/api/qip/q1/suggestions/sg1", {
          body: { action: "yolo" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(400);
    });
  });
});
