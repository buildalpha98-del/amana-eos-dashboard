/**
 * Visa-expiry branch of the roster cert-guard.
 *
 * Cert blocking is already tested elsewhere; this file pins down the
 * 2026-06-01 addition: blocking shift assignment when a staff member's
 * work / student / bridging visa expires on or before the shift date.
 * Migration Act 1958 director liability.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { assertStaffCertsValidForShift } from "@/app/api/roster/_lib/cert-guard";
import { ApiError } from "@/lib/api-error";

const shiftDate = new Date("2026-07-01");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no certs blocking. Visa is the only variable.
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
});

describe("cert-guard visa branch", () => {
  it("citizen passes regardless of visaExpiry (it's irrelevant)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "citizen",
      visaExpiry: new Date("2020-01-01"), // ages ago, but irrelevant
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-1", shiftDate }),
    ).resolves.toBeUndefined();
  });

  it("permanent_resident passes regardless of visaExpiry", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "permanent_resident",
      visaExpiry: new Date("2020-01-01"),
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-2", shiftDate }),
    ).resolves.toBeUndefined();
  });

  it("null visaStatus passes (we don't make up a rule for missing data)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: null,
      visaExpiry: null,
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-3", shiftDate }),
    ).resolves.toBeUndefined();
  });

  it("work_visa with future expiry passes", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "work_visa",
      visaExpiry: new Date("2027-01-01"), // after the shift
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-4", shiftDate }),
    ).resolves.toBeUndefined();
  });

  it("work_visa with expiry BEFORE shift date is BLOCKED", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "work_visa",
      visaExpiry: new Date("2026-06-15"), // 2 weeks before the shift
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-5", shiftDate }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("work_visa expiring EXACTLY ON the shift date is BLOCKED (<=)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "work_visa",
      visaExpiry: new Date("2026-07-01"),
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-6", shiftDate }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("student_visa is also blocked when expired", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "student_visa",
      visaExpiry: new Date("2026-05-01"),
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-7", shiftDate }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("bridging_visa is also blocked when expired", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "bridging_visa",
      visaExpiry: new Date("2026-05-01"),
    });
    await expect(
      assertStaffCertsValidForShift({ userId: "u-8", shiftDate }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("error message mentions 'Work visa' so admin sees what to fix", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      visaStatus: "work_visa",
      visaExpiry: new Date("2026-06-01"),
    });
    try {
      await assertStaffCertsValidForShift({ userId: "u-9", shiftDate });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain("Work visa");
    }
  });
});
