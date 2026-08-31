/**
 * Parent account auth — Phase 1 of the enrolment re-architecture.
 * Focused on the security-sensitive behaviour rather than happy paths:
 * enumeration resistance, single-use tokens, and the verified-email gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    parentEmailVerification: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    enrolmentSubmission: { findMany: vi.fn() },
    // The enrolment lookup filters inside a JSON column, so it's raw SQL.
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock("@/lib/password-breach-check", () => ({
  checkPasswordBreach: vi.fn(async () => 0),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import {
  createParentAccount,
  confirmParentEmail,
  authenticateParent,
  findEnrolmentIdsForEmail,
  normaliseEmail,
} from "@/lib/parent-account";
import { hash } from "bcryptjs";

const mockPrisma = prisma as unknown as {
  parentAccount: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  parentEmailVerification: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  enrolmentSubmission: { findMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  (checkPasswordBreach as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.parentEmailVerification.create.mockResolvedValue({ id: "v1" });
});

describe("normaliseEmail", () => {
  it("lowercases and trims so lookups can't be bypassed by casing", () => {
    expect(normaliseEmail("  Parent@Example.COM ")).toBe("parent@example.com");
  });
});

describe("createParentAccount", () => {
  it("rejects a breached password", async () => {
    (checkPasswordBreach as ReturnType<typeof vi.fn>).mockResolvedValue(1234);
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    await expect(
      createParentAccount({ email: "a@b.com", password: "password123" }),
    ).rejects.toThrow(/data breaches/i);
  });

  it("never overwrites the password of an already-verified account", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      emailVerifiedAt: new Date(),
    });
    const res = await createParentAccount({
      email: "a@b.com",
      password: "attacker-chosen-pw",
    });
    expect(res.alreadyExisted).toBe(true);
    // The critical assertion: no write touched the existing credentials.
    expect(mockPrisma.parentAccount.update).not.toHaveBeenCalled();
    expect(mockPrisma.parentAccount.create).not.toHaveBeenCalled();
  });

  it("refuses to re-register an UNverified duplicate too", async () => {
    // Changed 2026-07-31. Sign-up now issues a SESSION, so silently
    // replacing the password on any existing account — verified or not —
    // would be one-step account takeover. Every pre-existing account is
    // sent to sign-in instead.
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc-2",
      emailVerifiedAt: null,
    });
    const res = await createParentAccount({ email: "a@b.com", password: "correcthorsebattery" });
    expect(res.alreadyExisted).toBe(true);
    expect(res.mayAutoLogin).toBe(false);
    expect(mockPrisma.parentAccount.update).not.toHaveBeenCalled();
    expect(mockPrisma.parentAccount.create).not.toHaveBeenCalled();
  });

  it("permits auto-login ONLY for an account it just created", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    mockPrisma.parentAccount.create.mockResolvedValue({ id: "acc-new" });
    const res = await createParentAccount({ email: "new@b.com", password: "correcthorsebattery" });
    expect(res.mayAutoLogin).toBe(true);
    expect(res.alreadyExisted).toBe(false);
  });

  it("stores only a hash of the token, never the raw value", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    mockPrisma.parentAccount.create.mockResolvedValue({ id: "acc-3" });
    const res = await createParentAccount({ email: "a@b.com", password: "correcthorsebattery" });
    const stored = mockPrisma.parentEmailVerification.create.mock.calls[0][0].data.tokenHash;
    expect(stored).not.toBe(res.verificationToken);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("confirmParentEmail", () => {
  it("rejects an already-used link", async () => {
    mockPrisma.parentEmailVerification.findUnique.mockResolvedValue({
      id: "v1", accountId: "acc", usedAt: new Date(), expiresAt: new Date(Date.now() + 1000),
      account: { id: "acc", email: "a@b.com", claimedAt: null },
    });
    await expect(confirmParentEmail("tok")).rejects.toThrow(/already been used/i);
  });

  it("rejects an expired link", async () => {
    mockPrisma.parentEmailVerification.findUnique.mockResolvedValue({
      id: "v1", accountId: "acc", usedAt: null, expiresAt: new Date(Date.now() - 1000),
      account: { id: "acc", email: "a@b.com", claimedAt: null },
    });
    await expect(confirmParentEmail("tok")).rejects.toThrow(/expired/i);
  });

  it("rejects an unknown token", async () => {
    mockPrisma.parentEmailVerification.findUnique.mockResolvedValue(null);
    await expect(confirmParentEmail("tok")).rejects.toThrow(/not valid/i);
  });

  it("claims enrolments matching the account email", async () => {
    mockPrisma.parentEmailVerification.findUnique.mockResolvedValue({
      id: "v1", accountId: "acc", usedAt: null, expiresAt: new Date(Date.now() + 10000),
      account: { id: "acc", email: "a@b.com", claimedAt: null },
    });
    // The match is made in SQL now — LOWER/TRIM on both sides — so the
    // non-matching row that used to be filtered in memory simply never
    // comes back.
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "e1", first_name: "Sam", surname: null },
      { id: "e2", first_name: null, surname: null },
    ]);
    const res = await confirmParentEmail("tok");
    expect(res.claimedEnrolmentIds).toEqual(["e1", "e2"]);
  });
});

describe("authenticateParent", () => {
  it("returns null for an unknown email (no enumeration)", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    expect(await authenticateParent("nope@x.com", "pw")).toBeNull();
  });

  it("returns null for a wrong password — same signal as unknown email", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc", email: "a@b.com", passwordHash: await hash("realpassword", 4),
      emailVerifiedAt: new Date(), firstName: null, surname: null,
    });
    expect(await authenticateParent("a@b.com", "wrongpassword")).toBeNull();
  });

  it("ALLOWS login before the email is confirmed", async () => {
    // Changed 2026-07-31: verification moved to the enrolment-approval
    // email. Making a family confirm an address before they could even
    // reach the form was losing people at the doorstep.
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc", email: "a@b.com", passwordHash: await hash("realpassword", 4),
      emailVerifiedAt: null, firstName: null, surname: null,
    });
    const res = await authenticateParent("a@b.com", "realpassword");
    expect(res && "accountId" in res ? res.accountId : null).toBe("acc");
  });

  it("REFUSES a deactivated account even with the right password", async () => {
    // Staff switching a family off has to actually keep them out — the
    // record survives, the access doesn't.
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc", email: "a@b.com", passwordHash: await hash("realpassword", 4),
      emailVerifiedAt: new Date(), firstName: null, surname: null,
      deactivatedAt: new Date(),
    });
    const res = await authenticateParent("a@b.com", "realpassword");
    expect(res).toEqual({ deactivated: true });
  });

  it("succeeds for a verified account with the right password", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc", email: "a@b.com", passwordHash: await hash("realpassword", 4),
      emailVerifiedAt: new Date(), firstName: "Sam", surname: "Lee",
    });
    mockPrisma.parentAccount.update.mockResolvedValue({});
    const res = await authenticateParent("a@b.com", "realpassword");
    expect(res).toMatchObject({ accountId: "acc", name: "Sam Lee" });
  });
});

describe("findEnrolmentIdsForEmail", () => {
  it("asks the database rather than scanning a page of rows", async () => {
    // The bug this replaced: a `take` plus an in-memory scan meant a
    // parent outside that arbitrary window was reported as unknown, and
    // with no `orderBy` the same parent could work once and fail next
    // time. The address lives inside JSON, so the filter belongs in SQL.
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "e1", first_name: "Aysha", surname: "Khan" },
    ]);
    const { enrolmentIds } = await findEnrolmentIdsForEmail("a@b.com");

    expect(enrolmentIds).toEqual(["e1"]);
    expect(mockPrisma.enrolmentSubmission.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it("returns every enrolment the address appears on", async () => {
    // A parent with two children at different centres must get both, or
    // the session they're signed into is missing one of their kids.
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "e1", first_name: "Aysha", surname: "Khan" },
      { id: "e2", first_name: "Aysha", surname: "Khan" },
    ]);
    const { enrolmentIds } = await findEnrolmentIdsForEmail("a@b.com");
    expect(enrolmentIds).toEqual(["e1", "e2"]);
  });

  it("builds a display name from the first row that has one", async () => {
    // The match may come off the secondary parent, whose name columns
    // the query selects instead — so a row with no name isn't an error.
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "e1", first_name: null, surname: null },
      { id: "e2", first_name: "Mo", surname: "Ali" },
    ]);
    const { parentName } = await findEnrolmentIdsForEmail("a@b.com");
    expect(parentName).toBe("Mo Ali");
  });

  it("gives a null name rather than a half one", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "e1", first_name: null, surname: null },
    ]);
    const { parentName } = await findEnrolmentIdsForEmail("a@b.com");
    expect(parentName).toBeNull();
  });

  it("returns nothing for an address with no enrolment", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const { enrolmentIds, parentName } =
      await findEnrolmentIdsForEmail("stranger@example.com");
    expect(enrolmentIds).toEqual([]);
    expect(parentName).toBeNull();
  });
});
