/**
 * Bank-detail reveal and payment writes (security brief 2026-10-21, batch 2
 * — S04). Synthetic values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9, resetIn: 0 })),
  resetRateLimit: vi.fn(async () => {}),
}));
const jwt = vi.hoisted(() => ({ token: { loginAt: 1_700_000_000_000, tokenVersion: 3 } as Record<string, unknown> | null }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => jwt.token) }));
const crypto = vi.hoisted(() => ({ plaintext: "", encrypted: [] as string[] }));
vi.mock("@/lib/field-encryption", () => ({
  decryptField: vi.fn(() => crypto.plaintext),
  encryptField: vi.fn((p: string) => {
    crypto.encrypted.push(p);
    return "v1:synthetic-ciphertext";
  }),
}));

import { POST as REVEAL, PUT as STAFF_PUT } from "@/app/api/enrolments/[id]/payment/route";
import { POST as CONFIRM } from "@/app/api/auth/confirm-identity/route";
import { RECENT_AUTH_COOKIE, encodeProof } from "@/lib/recent-auth";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "synthetic-test-secret";
const PAN = "4111111111111111";
const ctx = { params: Promise.resolve({ id: "enr-1" }) };
const BANK_PLAINTEXT = JSON.stringify({ method: "bank_account", accountName: "Synthetic Family", bsb: "062000", accountNumber: "12345678" });
const owner = { id: "owner-1", name: "Synthetic owner", role: "owner" as const };

const proof = (over: Partial<Parameters<typeof encodeProof>[0]> = {}) =>
  encodeProof({ method: "passkey", credentialId: "key-1", uid: owner.id, lat: 1_700_000_000_000, tv: 3, pur: "payment_reveal", exp: Date.now() + 60_000, ...over });
const reveal = (cookie?: string) =>
  REVEAL(createRequest("POST", "/api/enrolments/enr-1/payment", { headers: cookie ? { cookie: `${RECENT_AUTH_COOKIE}=${cookie}` } : {} }), ctx);

let passwordHash = "";
beforeEach(async () => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  jwt.token = { loginAt: 1_700_000_000_000, tokenVersion: 3 };
  crypto.plaintext = BANK_PLAINTEXT;
  crypto.encrypted = [];
  passwordHash ||= await hash("synthetic-password", 4);
  mockSession(owner);
  prismaMock.user.findUnique.mockImplementation(async () => ({
    id: owner.id, active: true, role: "owner", isCentreAccount: false, mfaEnabledAt: null, mfaSecret: null,
    mfaBackupCodes: [], tokenVersion: 3, passwordHash,
  }));
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "enr-1", paymentMethod: "bank_account", paymentDetails: { bsbLastThree: "000", accountLastFour: "5678", raw: "v1:x" } });
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.passkey.findFirst.mockResolvedValue({ id: "key-1", userId: owner.id });
});

describe("revealing bank details", () => {
  it("asks the person to confirm it's them first, and decrypts nothing", async () => {
    const res = await reveal();
    expect(res.status).toBe(428);
    expect((await res.json()).details).toEqual({ code: "RECENT_AUTH_REQUIRED", mfa: false });
    expect(prismaMock.enrolmentSubmission.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "payment_details_reveal_denied" }) }));
  });

  it("releases bank fields only, privately, after writing the audit row", async () => {
    const res = await reveal(proof());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ method: "bank_account", accountName: "Synthetic Family", bsb: "062000", accountNumber: "12345678" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    const audit = prismaMock.activityLog.create.mock.calls.at(-1)![0].data;
    expect(audit).toMatchObject({ userId: owner.id, action: "payment_details_revealed", entityId: "enr-1", details: { result: "released" } });
    expect(JSON.stringify(audit)).not.toContain("12345678");
  });

  it("refuses to reveal when the audit row can't be written", async () => {
    prismaMock.activityLog.create.mockRejectedValue(new Error("audit store down"));
    const res = await reveal(proof());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("12345678");
  });

  it.each([
    ["an expired proof", () => proof({ exp: Date.now() - 1 })],
    ["a proof from a different login", () => proof({ lat: 1_600_000_000_000 })],
    ["a proof from before 'sign out everywhere'", () => proof({ tv: 2 })],
    ["someone else's proof", () => proof({ uid: "other-admin" })],
    ["a proof for another purpose", () => proof({ pur: "bulk_export" as never })],
    ["a tampered proof", () => proof().replace(/.$/, "x")],
    ["garbage", () => "not-a-proof"],
  ])("refuses %s", async (_label, make) => {
    const res = await reveal(make());
    expect(res.status).toBe(428);
    expect(prismaMock.enrolmentSubmission.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a shared centre login even with a valid-looking proof", async () => {
    mockSession({ ...owner, isCentreAccount: true });
    expect((await reveal(proof())).status).toBe(403);
  });

  it.each(["head_office", "member", "staff", "marketing", "eos"] as const)("refuses the %s role before anything else", async (role) => {
    mockSession({ ...owner, role });
    expect((await reveal(proof())).status).toBe(403);
    expect(prismaMock.enrolmentSubmission.findUnique).not.toHaveBeenCalled();
  });

  it("never decrypts a legacy card record", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "enr-1", paymentMethod: "credit_card", paymentDetails: { lastFour: "1111", raw: "v1:x" } });
    crypto.plaintext = JSON.stringify({ method: "credit_card", cardNumber: PAN, ccv: "123" });
    const res = await reveal(proof());
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain(PAN);
  });
});

describe("confirming identity", () => {
  const confirm = (body: Record<string, unknown>) => CONFIRM(createRequest("POST", "/api/auth/confirm-identity", { body }));

  it("sets a short, httpOnly, strict proof bound to this login on the right password", async () => {
    const res = await confirm({ password: "synthetic-password", purpose: "passkey_setup" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${RECENT_AUTH_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Max-Age=300/);
  });

  it("refuses a wrong password, and records the failure", async () => {
    expect((await confirm({ password: "wrong", purpose: "passkey_setup" })).status).toBe(401);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "identity_confirm_failed" }) }));
  });

  it("requires the second factor when MFA is on", async () => {
    prismaMock.user.findUnique.mockImplementation(async () => ({
      id: owner.id, active: true, role: "owner", isCentreAccount: false, mfaEnabledAt: new Date(), mfaSecret: "enc", mfaBackupCodes: [], tokenVersion: 3, passwordHash,
    }));
    expect((await confirm({ password: "synthetic-password", purpose: "passkey_setup" })).status).toBe(401);
  });

  it("refuses a shared centre login", async () => {
    mockSession({ ...owner, isCentreAccount: true });
    expect((await confirm({ password: "synthetic-password", purpose: "passkey_setup" })).status).toBe(403);
  });

  it("refuses when the session's token version is stale", async () => {
    jwt.token = { loginAt: 1_700_000_000_000, tokenVersion: 2 };
    expect((await confirm({ password: "synthetic-password", purpose: "passkey_setup" })).status).toBe(401);
  });
});

describe("staff payment edits", () => {
  const put = (body: Record<string, unknown>) => STAFF_PUT(createRequest("PUT", "/api/enrolments/enr-1/payment", { body, headers: { cookie: `${RECENT_AUTH_COOKIE}=${proof({ pur: "payment_change" })}` } }), ctx);

  it.each([
    { method: "credit_card", cardName: "X", cardNumber: PAN, ccv: "123", expiryMonth: "01", expiryYear: "2030" },
    { method: "bank_account", accountName: "A", bsb: "062000", accountNumber: "12345678", ccv: "123" },
    { method: "bank_account", accountName: "A", bsb: "062000", accountNumber: "12345678", cardNumber: PAN },
  ])("refuses card data and stores nothing: %o", async (body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(crypto.encrypted).toHaveLength(0);
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });

  it.each(["head_office", "member", "staff"] as const)("refuses an edit from %s", async (role) => {
    mockSession({ ...owner, role });
    const res = await put({ method: "bank_account", accountName: "A", bsb: "062000", accountNumber: "12345678" });
    expect(res.status).toBe(403);
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });

  it("refuses an edit from a shared centre login, even with an admin role", async () => {
    mockSession({ ...owner, role: "admin", isCentreAccount: true });
    const res = await put({ method: "bank_account", accountName: "A", bsb: "062000", accountNumber: "12345678" });
    expect(res.status).toBe(403);
  });

  it("saves a valid bank update, encrypting bank fields only", async () => {
    const res = await put({ method: "bank_account", accountName: "Synthetic Family", bsb: "062-000", accountNumber: "12345678" });
    expect(res.status).toBe(200);
    expect(JSON.parse(crypto.encrypted[0])).toEqual(JSON.parse(BANK_PLAINTEXT));
    expect(prismaMock.enrolmentSubmission.update.mock.calls[0][0].data).toEqual({
      paymentMethod: "bank_account",
      paymentDetails: { bsbLastThree: "000", accountLastFour: "5678", raw: "v1:synthetic-ciphertext" },
    });
  });
});
