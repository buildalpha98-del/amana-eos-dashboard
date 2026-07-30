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
};

beforeEach(() => {
  vi.clearAllMocks();
  (checkPasswordBreach as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([]);
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

  it("lets an UNverified duplicate re-register (lost email / mistyped pw)", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc-2",
      emailVerifiedAt: null,
    });
    mockPrisma.parentAccount.update.mockResolvedValue({ id: "acc-2" });
    const res = await createParentAccount({ email: "a@b.com", password: "correcthorsebattery" });
    expect(mockPrisma.parentAccount.update).toHaveBeenCalled();
    expect(res.accountId).toBe("acc-2");
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
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", primaryParent: { email: "A@B.com", firstName: "Sam" }, secondaryParent: null },
      { id: "e2", primaryParent: { email: "other@x.com" }, secondaryParent: { email: "a@b.com" } },
      { id: "e3", primaryParent: { email: "nope@x.com" }, secondaryParent: null },
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

  it("blocks login until the email is confirmed", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      id: "acc", email: "a@b.com", passwordHash: await hash("realpassword", 4),
      emailVerifiedAt: null, firstName: null, surname: null,
    });
    await expect(authenticateParent("a@b.com", "realpassword")).rejects.toThrow(
      /confirm your email/i,
    );
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
  it("matches case-insensitively on primary and secondary parent", async () => {
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", primaryParent: { email: "  A@B.COM  " }, secondaryParent: null },
      { id: "e2", primaryParent: null, secondaryParent: { email: "a@b.com" } },
    ]);
    const { enrolmentIds } = await findEnrolmentIdsForEmail("a@b.com");
    expect(enrolmentIds).toEqual(["e1", "e2"]);
  });

  it("tolerates malformed JSON blobs without throwing", async () => {
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "e1", primaryParent: null, secondaryParent: null },
      { id: "e2", primaryParent: { email: 42 }, secondaryParent: undefined },
      { id: "e3", primaryParent: "not-an-object", secondaryParent: null },
    ]);
    const { enrolmentIds } = await findEnrolmentIdsForEmail("a@b.com");
    expect(enrolmentIds).toEqual([]);
  });
});
