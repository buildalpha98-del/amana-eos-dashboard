/**
 * Centre accounts — shared centre mailboxes (arkana@amanaoshc.com.au) get
 * full access to their centre and are never onboarded, inducted, ramped or
 * rostered. Daniel, 2026-10-06.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  convertCentreMailboxUser,
  centreAccountCreateFields,
  findCentreForEmail,
  isCentreAccount,
} from "@/lib/centre-account";
import { isInductionLocked } from "@/lib/induction-lock";
import { assertUserCleared } from "@/lib/induction";
import { getRequiredCertTypes } from "@/lib/cert-requirements";
import { createStaffRamp } from "@/lib/ramp/create";
import { seedOnboardingPackage } from "@/lib/onboarding-seed";

beforeEach(() => vi.clearAllMocks());

describe("identifying a centre account", () => {
  it("reads the flag, nothing else", () => {
    expect(isCentreAccount({ isCentreAccount: true })).toBe(true);
    expect(isCentreAccount({ isCentreAccount: false })).toBe(false);
    expect(isCentreAccount(null)).toBe(false);
  });

  it("matches a centre's email case- and space-insensitively", async () => {
    prismaMock.service.findFirst.mockResolvedValue({ id: "svc-ark", name: "Arkana" } as never);
    await expect(findCentreForEmail(prismaMock as never, "  Arkana@AmanaOSHC.com.au ")).resolves.toEqual({
      id: "svc-ark",
      name: "Arkana",
    });
    const where = (prismaMock.service.findFirst.mock.calls[0][0] as { where: unknown }).where;
    expect(where).toEqual({ email: { equals: "arkana@amanaoshc.com.au", mode: "insensitive" } });
  });

  it("never looks anything up for a blank email", async () => {
    await expect(findCentreForEmail(prismaMock as never, "  ")).resolves.toBeNull();
    expect(prismaMock.service.findFirst).not.toHaveBeenCalled();
  });
});

describe("creating a centre account", () => {
  it("is cleared, attached to its centre, and a Director of Service", () => {
    expect(centreAccountCreateFields({ id: "svc-ark" }, "staff", null)).toMatchObject({
      isCentreAccount: true,
      inductionStatus: "cleared",
      serviceId: "svc-ark",
      role: "member",
    });
  });

  it("never downgrades a more senior role that was chosen", () => {
    expect(centreAccountCreateFields({ id: "svc-ark" }, "admin").role).toBe("admin");
  });
});

describe("never onboarded", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_INDUCTION_LOCK_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("is never locked into induction, even as a new starter", () => {
    expect(
      isInductionLocked("new_starter", null, { role: "member", isCentreAccount: true }),
    ).toBe(false);
    // …while a person in the same state still is.
    expect(isInductionLocked("new_starter", null, { role: "member" })).toBe(true);
  });

  it("needs no certificates", () => {
    expect(getRequiredCertTypes("member", null, { isCentreAccount: true })).toEqual([]);
  });

  it("gets no 90-day ramp", async () => {
    prismaMock.staffRamp.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ isCentreAccount: true } as never);
    const res = await createStaffRamp(prismaMock as never, "u-centre", new Date("2026-10-01"));
    expect(res).toEqual({ created: false, rampId: null });
    expect(prismaMock.staffRamp.create).not.toHaveBeenCalled();
  });

  it("gets no onboarding todos", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isCentreAccount: true } as never);
    await seedOnboardingPackage("u-centre");
    expect(prismaMock.todo.createMany).not.toHaveBeenCalled();
  });
});

describe("never rostered as a person", () => {
  it("refuses to roster or clock in a centre account", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "cleared",
      inductionGraceUntil: null,
      inductionOverrideUntil: null,
      isCentreAccount: true,
    } as never);
    await expect(assertUserCleared("u-centre")).rejects.toThrow(/centre account/i);
  });

  it("still lets a cleared person through", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "cleared",
      inductionGraceUntil: null,
      inductionOverrideUntil: null,
      isCentreAccount: false,
    } as never);
    await expect(assertUserCleared("u-person")).resolves.toBeUndefined();
  });
});

describe("saving a centre's email", () => {
  it("converts the user who already logs in with it", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", role: "staff", serviceId: null } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.staffRamp.updateMany.mockResolvedValue({ count: 1 } as never);

    await expect(
      convertCentreMailboxUser(prismaMock as never, "svc-ark", "Arkana@AmanaOSHC.com.au"),
    ).resolves.toEqual({ converted: "u1" });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        isCentreAccount: true,
        inductionStatus: "cleared",
        serviceId: "svc-ark",
        role: "member",
      }),
    });
    expect(prismaMock.staffRamp.updateMany).toHaveBeenCalled();
  });

  it("keeps a senior role and an existing centre", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u2", role: "admin", serviceId: "svc-other" } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.staffRamp.updateMany.mockResolvedValue({ count: 0 } as never);
    await convertCentreMailboxUser(prismaMock as never, "svc-ark", "x@amanaoshc.com.au");
    const data = (prismaMock.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.role).toBeUndefined();
    expect(data.serviceId).toBe("svc-other");
  });

  it("does nothing when nobody uses that address", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(
      convertCentreMailboxUser(prismaMock as never, "svc-ark", "nobody@amanaoshc.com.au"),
    ).resolves.toEqual({ converted: null });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
