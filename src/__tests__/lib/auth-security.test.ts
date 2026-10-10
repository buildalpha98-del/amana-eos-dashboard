import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { TOTP, Secret } from "otpauth";
import { encode, decode } from "next-auth/jwt";
import { prismaMock } from "../helpers/prisma-mock";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })), resetRateLimit: vi.fn() }));
vi.mock("@/lib/induction-essentials", () => ({ hasPublishedEssentials: vi.fn(async () => false) }));
vi.mock("@/lib/org-settings", () => ({ getOrgSettings: vi.fn(async () => ({ rolePageOverrides: {} })) }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })), headers: vi.fn(async () => new Headers()) }));
vi.mock("bcryptjs", () => ({ compare: vi.fn(async () => true) }));
import { compare } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { generateSecret, generateBackupCodes } from "@/lib/totp";
import { resetRateLimit } from "@/lib/rate-limit";

// Exercise the installed NextAuth session lifecycle, including cookie clearing
// and token renewal; checking an exp field alone missed the original defect.
const require = createRequire(import.meta.url);
const sessionHandler = require(path.join(path.dirname(require.resolve("next-auth")), "core/routes/session.js")).default;
// Provider options contain the original credentials authorizer in NextAuth v4.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authorize = (authOptions.providers[0] as any).options.authorize;
const user = {
  id: "owner", name: "Owner", email: "owner@example.test", role: "owner" as const,
  active: true, passwordHash: "hash", tokenVersion: 1, inductionStatus: "cleared",
  mfaEnabledAt: null as Date | null, mfaSecret: null as string | null, mfaBackupCodes: [] as string[],
};
const token = () => ({ id: user.id, role: user.role, tokenVersion: 1, loginAt: Date.now(), rememberMe: true, tokenVersionCheckedAt: Date.now() });

async function readSession(overrides = {}) {
  const secret = "local-session-test-secret";
  const store = {
    value: await encode({ secret, token: { ...token(), ...overrides } }),
    chunk: vi.fn(() => [{ name: "session", value: "renewed" }]),
    clean: vi.fn(() => [{ name: "session", value: "", options: { maxAge: 0 } }]),
  };
  const result = await sessionHandler({
    sessionStore: store,
    options: {
      session: authOptions.session, jwt: { secret, encode, decode },
      callbacks: authOptions.callbacks, events: {}, logger: { error: vi.fn() },
    },
  });
  return { result, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MFA_ENCRYPTION_KEY", "1".repeat(64));
  prismaMock.user.findUnique.mockResolvedValue({ ...user });
  vi.mocked(compare).mockResolvedValue(true as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("staff session security", () => {
  it("renews an active account session", async () => {
    const { result, store } = await readSession();
    expect(result.body.user.id).toBe(user.id);
    expect(store.chunk).toHaveBeenCalled();
    expect(store.clean).not.toHaveBeenCalled();
  });
  it.each([
    { tokenVersion: 2 }, { active: false },
  ])("returns no session and clears its cookie after revocation: %j", async (change) => {
    prismaMock.user.findUnique.mockResolvedValue({ ...user, ...change });
    const { result, store } = await readSession();
    expect(result.body).toEqual({});
    expect(store.clean).toHaveBeenCalled();
    expect(store.chunk).not.toHaveBeenCalled();
  });
  it("expires a non-remembered session after 24 hours without renewing it", async () => {
    const { result, store } = await readSession({ rememberMe: false, loginAt: Date.now() - 25 * 3600_000 });
    expect(result.body).toEqual({});
    expect(store.chunk).not.toHaveBeenCalled();
    expect(store.clean).toHaveBeenCalled();
  });
  it("fails closed on a database failure", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("offline"));
    expect((await readSession()).result.body).toEqual({});
  });
  it("rejects an old unverified session when MFA is enabled", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...user, mfaEnabledAt: new Date() });
    expect((await readSession()).result.body).toEqual({});
  });
  it("rejects verification from a previous MFA setup", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...user, mfaEnabledAt: new Date() });
    expect((await readSession({ mfaVerified: true, mfaEnabledAt: "2025-01-01T00:00:00.000Z" })).result.body).toEqual({});
  });
});

describe("MFA credentials login", () => {
  const credentials = { email: user.email, password: "password" };
  function enabledUser() {
    const secret = generateSecret();
    const enabled = { ...user, mfaEnabledAt: new Date(), mfaSecret: secret.encryptedSecret };
    prismaMock.user.findUnique.mockResolvedValue(enabled);
    return { enabled, secret };
  }
  it("requires the second factor before issuing an identity or recording login", async () => {
    enabledUser();
    await expect(authorize(credentials)).rejects.toThrow("MFA_REQUIRED");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(resetRateLimit).not.toHaveBeenCalled();
  });
  it("rejects invalid or malformed codes without resetting the attempt limit", async () => {
    enabledUser();
    await expect(authorize({ ...credentials, mfaCode: "wrong" })).rejects.toThrow("Invalid verification code");
    expect(resetRateLimit).not.toHaveBeenCalled();
  });
  it("requires a valid password even with a correct second factor", async () => {
    enabledUser();
    vi.mocked(compare).mockResolvedValue(false as never);
    await expect(authorize({ ...credentials, mfaCode: "123456" })).rejects.toThrow("Invalid email or password");
  });
  it("grants a verified session only after a valid authenticator code", async () => {
    const { enabled, secret } = enabledUser();
    const code = new TOTP({ secret: Secret.fromBase32(secret.secret), period: 30 }).generate();
    const authenticated = await authorize({ ...credentials, mfaCode: code });
    expect(authenticated.mfaVerified).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issued = await (authOptions.callbacks!.jwt as any)({ token: {}, user: authenticated });
    expect(issued.mfaEnabledAt).toBe(enabled.mfaEnabledAt.toISOString());
    expect((await readSession(issued)).result.body.user.id).toBe(user.id);
  });
  it("consumes backup codes with compare-and-set and rejects a concurrent reuse", async () => {
    const { enabled } = enabledUser();
    const backup = generateBackupCodes();
    prismaMock.user.findUnique.mockResolvedValue({ ...enabled, mfaBackupCodes: backup.hashes });
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await authorize({ ...credentials, mfaCode: backup.codes[0] })).mfaVerified).toBe(true);
    await expect(authorize({ ...credentials, mfaCode: backup.codes[0] })).rejects.toThrow("Invalid verification code");
    expect(prismaMock.user.updateMany.mock.calls[0][0].where.mfaBackupCodes).toEqual({ equals: backup.hashes });
  });
  it("keeps ordinary password login working for accounts without MFA", async () => {
    expect((await authorize(credentials)).id).toBe(user.id);
  });
});
