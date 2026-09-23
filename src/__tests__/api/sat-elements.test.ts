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
import { PATCH as PATCH_ELEMENT } from "@/app/api/qip/[id]/elements/[elementCode]/route";
import { PATCH as PATCH_LEGAL } from "@/app/api/qip/[id]/legal/[checkKey]/route";
import { POST as POST_IMPROVEMENT } from "@/app/api/qip/[id]/improvements/route";
import {
  PATCH as PATCH_IMPROVEMENT,
  DELETE as DELETE_IMPROVEMENT,
} from "@/app/api/qip/[id]/improvements/[improvementId]/route";

async function ctx(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function primeQip() {
  prismaMock.qualityImprovementPlan.findUnique.mockResolvedValue({
    id: "q1",
    serviceId: "s1",
    documentType: "sat",
  });
  prismaMock.activityLog.create.mockResolvedValue({});
}

describe("SAT element/legal/improvement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("PATCH /api/qip/[id]/elements/[elementCode]", () => {
    it("401 without session", async () => {
      mockNoSession();
      const res = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/1.1.1", {
          body: { assessment: "met" },
        }),
        await ctx({ id: "q1", elementCode: "1.1.1" }),
      );
      expect(res.status).toBe(401);
    });

    it("400 on unknown element code", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      const res = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/9.9.9", {
          body: { assessment: "met" },
        }),
        await ctx({ id: "q1", elementCode: "9.9.9" }),
      );
      expect(res.status).toBe(400);
    });

    it("403 for member of another service", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "other" });
      primeQip();
      const res = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/1.1.1", {
          body: { assessment: "met" },
        }),
        await ctx({ id: "q1", elementCode: "1.1.1" }),
      );
      expect(res.status).toBe(403);
    });

    it("upserts evidence + assessment", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      prismaMock.satElementAssessment.upsert.mockResolvedValue({
        id: "el1",
        elementCode: "1.1.1",
        assessment: "met",
      });
      const res = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/1.1.1", {
          body: { evidence: ["Practice one", "Practice two"], assessment: "met" },
        }),
        await ctx({ id: "q1", elementCode: "1.1.1" }),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.satElementAssessment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { qipId_elementCode: { qipId: "q1", elementCode: "1.1.1" } },
          update: { evidence: ["Practice one", "Practice two"], assessment: "met" },
        }),
      );
    });

    it("400 on more than 5 evidence entries or unknown keys", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      const tooMany = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/1.1.1", {
          body: { evidence: ["1", "2", "3", "4", "5", "6"] },
        }),
        await ctx({ id: "q1", elementCode: "1.1.1" }),
      );
      expect(tooMany.status).toBe(400);
      const unknown = await PATCH_ELEMENT(
        createRequest("PATCH", "/api/qip/q1/elements/1.1.1", {
          body: { rating: "met" },
        }),
        await ctx({ id: "q1", elementCode: "1.1.1" }),
      );
      expect(unknown.status).toBe(400);
    });
  });

  describe("PATCH /api/qip/[id]/legal/[checkKey]", () => {
    it("upserts a valid checklist answer", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      prismaMock.satLegalCheck.upsert.mockResolvedValue({
        id: "lc1",
        checkKey: "qa1-01",
        assessment: "compliant",
      });
      const res = await PATCH_LEGAL(
        createRequest("PATCH", "/api/qip/q1/legal/qa1-01", {
          body: { assessment: "compliant" },
        }),
        await ctx({ id: "q1", checkKey: "qa1-01" }),
      );
      expect(res.status).toBe(200);
    });

    it("400 on unknown checkKey or invalid assessment", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      const badKey = await PATCH_LEGAL(
        createRequest("PATCH", "/api/qip/q1/legal/bogus", {
          body: { assessment: "compliant" },
        }),
        await ctx({ id: "q1", checkKey: "bogus" }),
      );
      expect(badKey.status).toBe(400);
      const badVal = await PATCH_LEGAL(
        createRequest("PATCH", "/api/qip/q1/legal/qa1-01", {
          body: { assessment: "sure" },
        }),
        await ctx({ id: "q1", checkKey: "qa1-01" }),
      );
      expect(badVal.status).toBe(400);
    });
  });

  describe("improvements CRUD", () => {
    it("creates a row", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      prismaMock.satImprovement.create.mockResolvedValue({
        id: "imp1",
        elementCode: "1.1.1",
        priority: "high",
      });
      const res = await POST_IMPROVEMENT(
        createRequest("POST", "/api/qip/q1/improvements", {
          body: {
            elementCode: "1.1.1",
            issue: "Inconsistent MTOP linking",
            outcomeGoal: "All plans link to MTOP",
            priority: "high",
            steps: "Run PD session",
            successMeasure: "All educators link activities",
          },
        }),
        await ctx({ id: "q1" }),
      );
      expect(res.status).toBe(201);
    });

    it("rejects bad element/standard codes and unknown fields", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      const res = await POST_IMPROVEMENT(
        createRequest("POST", "/api/qip/q1/improvements", {
          body: {
            elementCode: "banana",
            issue: "x",
            outcomeGoal: "y",
            steps: "z",
            successMeasure: "w",
          },
        }),
        await ctx({ id: "q1" }),
      );
      expect(res.status).toBe(400);
    });

    it("updates and deletes with qip scoping", async () => {
      mockSession({ id: "u1", name: "Dir", role: "member", serviceId: "s1" });
      primeQip();
      prismaMock.satImprovement.findFirst.mockResolvedValue({ id: "imp1" });
      prismaMock.satImprovement.update.mockResolvedValue({ id: "imp1", status: "completed" });
      prismaMock.satImprovement.delete.mockResolvedValue({});

      const upd = await PATCH_IMPROVEMENT(
        createRequest("PATCH", "/api/qip/q1/improvements/imp1", {
          body: { status: "completed" },
        }),
        await ctx({ id: "q1", improvementId: "imp1" }),
      );
      expect(upd.status).toBe(200);

      const del = await DELETE_IMPROVEMENT(
        createRequest("DELETE", "/api/qip/q1/improvements/imp1"),
        await ctx({ id: "q1", improvementId: "imp1" }),
      );
      expect(del.status).toBe(200);

      prismaMock.satImprovement.findFirst.mockResolvedValue(null);
      const missing = await PATCH_IMPROVEMENT(
        createRequest("PATCH", "/api/qip/q1/improvements/imp2", {
          body: { status: "completed" },
        }),
        await ctx({ id: "q1", improvementId: "imp2" }),
      );
      expect(missing.status).toBe(404);
    });
  });
});
