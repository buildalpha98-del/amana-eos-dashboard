import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "./helpers/prisma-mock";
import { resolveAssignee } from "@/app/api/cowork/_lib/resolve-assignee";

// ── Mock user records ──────────────────────────────────────────

const JAYDEN = { id: "user-jayden", name: "Jayden Kowaider", email: "jayden@amanaoshc.com.au", role: "owner", state: null, active: true };
const DANIEL = { id: "user-daniel", name: "Daniel", email: "daniel@amanaoshc.com.au", role: "admin", state: null, active: true };
const AKRAM = { id: "user-akram", name: "Akram", email: "akram@amanaoshc.com.au", role: "marketing", state: null, active: true };
const MIRNA = { id: "user-mirna", name: "Mirna", email: "mirna@amanaoshc.com.au", role: "coordinator", state: "NSW", active: true };
const TRACIE = { id: "user-tracie", name: "Tracie", email: "tracie@amanaoshc.com.au", role: "coordinator", state: "VIC", active: true };

describe("Assignee Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Type 1: Named ID", () => {
    it('resolves "daniel" to Daniel\'s user ID', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(DANIEL);

      const result = await resolveAssignee({ assignee: "daniel" });
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("user-daniel");
    });

    it('resolves "jayden" to Jayden\'s user ID', async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(JAYDEN);

      const result = await resolveAssignee({ assignee: "jayden" });
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("user-jayden");
    });

    it("returns empty array for unknown name", async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);

      const result = await resolveAssignee({ assignee: "nonexistent" });
      expect(result).toHaveLength(0);
    });

    it("looks up by name (case-insensitive) or email prefix", async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(DANIEL);

      await resolveAssignee({ assignee: "daniel" });

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { equals: "daniel", mode: "insensitive" } },
            { email: { startsWith: "daniel@" } },
          ],
          active: true,
        },
        select: { id: true },
      });
    });
  });

  describe("Type 2: Pipe-separated", () => {
    it('resolves "mirna|tracie" with NSW centre to Mirna only', async () => {
      // Service lookup returns NSW state
      prismaMock.service.findUnique.mockResolvedValue({
        state: "NSW",
        managerId: null,
      });
      // State-filtered query returns only Mirna
      prismaMock.user.findMany.mockResolvedValue([{ id: "user-mirna" }]);

      const result = await resolveAssignee({
        assignee: "mirna|tracie",
        serviceCode: "MFIS-GR",
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("user-mirna");
    });

    it('resolves "mirna|tracie" with VIC centre to Tracie only', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        state: "VIC",
        managerId: null,
      });
      prismaMock.user.findMany.mockResolvedValue([{ id: "user-tracie" }]);

      const result = await resolveAssignee({
        assignee: "mirna|tracie",
        serviceCode: "AIA-KKCC",
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("user-tracie");
    });

    it('resolves "mirna|tracie" without context to both', async () => {
      // No service code → no state context → returns all matching
      prismaMock.user.findMany.mockResolvedValue([
        { id: "user-mirna" },
        { id: "user-tracie" },
      ]);

      const result = await resolveAssignee({
        assignee: "mirna|tracie",
      });
      expect(result).toHaveLength(2);
    });

    it("falls back to all matching users when state filtering returns empty", async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        state: "QLD",
        managerId: null,
      });
      // State-filtered query returns empty (neither is QLD)
      prismaMock.user.findMany
        .mockResolvedValueOnce([]) // first call: state-filtered
        .mockResolvedValueOnce([
          { id: "user-mirna" },
          { id: "user-tracie" },
        ]); // fallback: all matching

      const result = await resolveAssignee({
        assignee: "mirna|tracie",
        serviceCode: "SOME-QLD",
      });
      expect(result).toHaveLength(2);
    });
  });

  describe("Type 3: Role-based resolution", () => {
    it('resolves "resolve:service-coordinator" via service manager first', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        state: "NSW",
        managerId: "user-manager",
      });

      const result = await resolveAssignee({
        assignee: "resolve:service-coordinator",
        serviceCode: "UNITY-GR",
      });
      expect(result).toEqual(["user-manager"]);
    });

    it('resolves "resolve:service-coordinator" via coordinator by state when no manager', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        state: "NSW",
        managerId: null,
      });
      // First service.findUnique for role resolution returns no manager
      prismaMock.service.findUnique.mockResolvedValue({
        managerId: null,
      });
      prismaMock.user.findFirst.mockResolvedValue({ id: "user-mirna" });

      const result = await resolveAssignee({
        assignee: "resolve:service-coordinator",
        serviceCode: "UNITY-GR",
      });
      expect(result.length).toBeGreaterThan(0);
    });

    it('resolves "resolve:state-manager-or-coordinator" with VIC centre', async () => {
      prismaMock.service.findUnique.mockResolvedValue({
        state: "VIC",
        managerId: null,
      });
      prismaMock.user.findMany.mockResolvedValue([{ id: "user-tracie" }]);

      const result = await resolveAssignee({
        assignee: "resolve:state-manager-or-coordinator",
        serviceCode: "MIN-OFF",
      });
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Type 4: System", () => {
    it('returns empty array for "system"', async () => {
      const result = await resolveAssignee({ assignee: "system" });
      expect(result).toHaveLength(0);
    });

    it("returns empty array for empty assignee", async () => {
      const result = await resolveAssignee({ assignee: "" });
      expect(result).toHaveLength(0);
    });
  });

  describe("Fallback behaviour", () => {
    it("falls back to seat-based role mapping when resolve type is unknown", async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      // resolveByRole unknown → falls back to seat role map → partnerships = owner
      prismaMock.user.findMany.mockResolvedValue([{ id: "user-jayden" }]);

      const result = await resolveAssignee({
        assignee: "resolve:unknown-role",
        seat: "partnerships",
      });
      expect(result.length).toBeGreaterThan(0);
    });

    it("falls back to owner as last resort", async () => {
      prismaMock.service.findUnique.mockResolvedValue(null);
      prismaMock.user.findMany.mockResolvedValue([]); // no seat-based users
      prismaMock.user.findFirst.mockResolvedValue({ id: "user-jayden" }); // owner

      const result = await resolveAssignee({
        assignee: "resolve:unknown-role",
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBe("user-jayden");
    });
  });
});

describe("CoworkReport API (integration)", () => {
  // These tests require a running app + valid API key.
  // Skip by default in CI — run manually with:
  //   TEST_BASE_URL=http://localhost:3000 COWORK_API_KEY=xxx npx vitest run src/__tests__/cowork-routing.test.ts

  const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
  const API_KEY = process.env.COWORK_API_KEY || "";

  const shouldRun = !!process.env.COWORK_API_KEY;

  describe.skipIf(!shouldRun)("POST /api/cowork/reports/automation", () => {
    it("creates a report assigned to daniel", async () => {
      const res = await fetch(`${BASE_URL}/api/cowork/reports/automation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seat: "people",
          reportType: "test-routing",
          title: "Routing Test — Direct Assignment",
          content: "This report should be assigned to Daniel.",
          assignee: "daniel",
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.assignedTo).toHaveLength(1);
    });

    it("resolves pipe-separated with VIC centre context", async () => {
      const res = await fetch(`${BASE_URL}/api/cowork/reports/automation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seat: "operations",
          reportType: "test-routing",
          title: "Routing Test — State Resolution",
          content: "This report should resolve to Tracie (VIC centre).",
          assignee: "mirna|tracie",
          serviceCode: "ALTAQWA",
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.assignedTo).toHaveLength(1);
    });
  });

  describe.skipIf(!shouldRun)("GET /api/cowork/reports/automation", () => {
    it("filters reports by seat", async () => {
      const res = await fetch(
        `${BASE_URL}/api/cowork/reports/automation?seat=people`,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reports).toBeDefined();
      expect(
        data.reports.every((r: { seat: string }) => r.seat === "people")
      ).toBe(true);
    });
  });
});
