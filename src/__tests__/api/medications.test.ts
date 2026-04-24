import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
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
import { GET, POST } from "@/app/api/services/[id]/medications/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

const VALID_CHILD_ID = "cjabcdefghijklmnopqrstuvw";
const VALID_WITNESS_ID = "cjwitnessssssssssssssssss";
const VALID_CMID = "550e8400-e29b-41d4-a716-446655440000";
const CMID_2 = "550e8400-e29b-41d4-a716-446655440001";
const NOW = new Date("2026-04-25T13:00:00.000Z").toISOString();

describe("medications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("GET /api/services/[id]/medications", () => {
    it("returns today's doses scoped to service + date window", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findMany.mockResolvedValue([
        { id: "d1", medicationName: "Ventolin", child: { id: "c1" } },
      ]);
      const res = await GET(
        createRequest("GET", "/api/services/s1/medications?date=2026-04-25"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.date).toBe("2026-04-25");
      const call = prismaMock.medicationAdministration.findMany.mock.calls[0][0];
      expect(call.where.serviceId).toBe("s1");
      expect(call.where.administeredAt.gte).toBeInstanceOf(Date);
      expect(call.where.administeredAt.lt).toBeInstanceOf(Date);
    });
  });

  describe("POST /api/services/[id]/medications", () => {
    it("400 when injection has no witness", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "EpiPen",
            dose: "300mcg",
            route: "injection",
            administeredAt: NOW,
            clientMutationId: VALID_CMID,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("400 when witness is the same user as administer", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findUnique.mockResolvedValue(null);
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "EpiPen",
            dose: "300mcg",
            route: "injection",
            administeredAt: NOW,
            witnessedById: "u1",
            clientMutationId: VALID_CMID,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("400 when child not in service", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findUnique.mockResolvedValue(null);
      prismaMock.child.findFirst.mockResolvedValue(null);
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "Paracetamol",
            dose: "5ml",
            route: "oral",
            administeredAt: NOW,
            clientMutationId: VALID_CMID,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("201 on happy path — oral dose, no witness needed", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findUnique.mockResolvedValue(null);
      prismaMock.child.findFirst.mockResolvedValue({ id: VALID_CHILD_ID });
      prismaMock.medicationAdministration.create.mockResolvedValue({
        id: "d1",
        medicationName: "Paracetamol",
        child: { id: VALID_CHILD_ID },
        administeredBy: { id: "u1", name: "C", avatar: null },
        witnessedBy: null,
      });
      prismaMock.activityLog.create.mockResolvedValue({});
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "Paracetamol",
            dose: "5ml",
            route: "oral",
            administeredAt: NOW,
            clientMutationId: CMID_2,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
    });

    it("201 on injection with witness", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findUnique.mockResolvedValue(null);
      prismaMock.child.findFirst.mockResolvedValue({ id: VALID_CHILD_ID });
      prismaMock.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === VALID_WITNESS_ID) {
          return Promise.resolve({ id: VALID_WITNESS_ID, active: true });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.medicationAdministration.create.mockResolvedValue({
        id: "d-inj",
        medicationName: "EpiPen",
        child: { id: VALID_CHILD_ID },
        administeredBy: { id: "u1", name: "C", avatar: null },
        witnessedBy: { id: VALID_WITNESS_ID, name: "W", avatar: null },
      });
      prismaMock.activityLog.create.mockResolvedValue({});
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "EpiPen",
            dose: "300mcg",
            route: "injection",
            administeredAt: NOW,
            witnessedById: VALID_WITNESS_ID,
            clientMutationId: VALID_CMID,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
    });

    it("200 replay — dedupes by clientMutationId, doesn't insert again", async () => {
      mockSession({ id: "u1", name: "C", role: "coordinator", serviceId: "s1" });
      prismaMock.medicationAdministration.findUnique.mockResolvedValue({
        id: "d-existing",
        clientMutationId: VALID_CMID,
        medicationName: "Paracetamol",
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/medications", {
          body: {
            childId: VALID_CHILD_ID,
            medicationName: "Paracetamol",
            dose: "5ml",
            route: "oral",
            administeredAt: NOW,
            clientMutationId: VALID_CMID,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.medicationAdministration.create).not.toHaveBeenCalled();
    });
  });
});
