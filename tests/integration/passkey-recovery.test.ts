/** Real PostgreSQL transactions on a disposable localhost database; no providers. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createRequest } from "../../src/__tests__/helpers/request";
import { generateRecoveryCodes, recoverPasskeys, removePasskey } from "@/lib/passkey-management";
import { assertRecentAuth, encodeProof, RECENT_AUTH_COOKIE } from "@/lib/recent-auth";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { beginPasskey, finishPasskey } from "@/lib/passkeys";
const login = vi.hoisted(() => ({ loginAt: 100, tokenVersion: 0 }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => login) }));
vi.mock("@simplewebauthn/server", async importOriginal => ({
  ...await importOriginal<typeof import("@simplewebauthn/server")>(),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true, registrationInfo: { credential: { id: "synthetic-registration", publicKey: new Uint8Array([1]), counter: 0, transports: [] } } })),
}));
const uid = `security-${randomUUID()}`;
const key1 = `${uid}-1`, key2 = `${uid}-2`;
const password = randomUUID();
const session = { user: { id: uid, role: "owner" }, expires: "2099" } as never;
let guarded = false;
function req(method: "passkey" | "password" = "passkey", credentialId = key1) {
  return createRequest("POST", "/api/auth/passkeys/recovery", { headers: { origin: "http://localhost:4199", cookie: `${RECENT_AUTH_COOKIE}=${encodeProof({ uid, lat: 100, tv: 0, pur: "passkey_setup", method, credentialId, exp: Date.now() + 60_000 })}` } });
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/amana_security_test") throw new Error("Requires the isolated amana_security_test database on localhost:55439");
  guarded = true;
  process.env.PASSKEY_ORIGIN = "http://localhost:4199";
  await prisma.user.create({ data: { id: uid, name: "Synthetic owner", email: `${uid}@example.test`, passwordHash: await hash(password, 4), role: "owner", active: true } });
});
beforeEach(async () => {
  await prisma.passkey.deleteMany({ where: { userId: uid } });
  await prisma.passkeyRecoveryCode.deleteMany({ where: { userId: uid } });
  await prisma.passkeyChallenge.deleteMany({ where: { userId: uid } });
  await prisma.user.update({ where: { id: uid }, data: { tokenVersion: 0, role: "owner" } });
  login.tokenVersion = 0;
  await prisma.passkey.createMany({ data: [key1, key2].map(id => ({ id, userId: uid, publicKey: Buffer.from([1]), rpId: "localhost", transports: [], label: "Synthetic device" })) });
});
afterAll(async () => {
  if (!guarded) return;
  await prisma.activityLog.deleteMany({ where: { userId: uid } });
  await prisma.user.delete({ where: { id: uid } });
  await prisma.$disconnect();
});
describe("passkey lifecycle with real PostgreSQL", () => {
  it("stores hashes only and replaces the previous recovery set", async () => {
    const codes = await generateRecoveryCodes(req(), session);
    expect(new Set(codes).size).toBe(8);
    const rows = await prisma.passkeyRecoveryCode.findMany({ where: { userId: uid } });
    expect(rows).toHaveLength(8);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.digest))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(codes[0]);
    await generateRecoveryCodes(req(), session);
    await expect(recoverPasskeys(req(), session, { password, recoveryCode: codes[0] })).rejects.toMatchObject({ status: 401 });
    expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(2);
  });
  it("does not accept a password proof for management", async () => {
    await expect(generateRecoveryCodes(req("password"), session)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.passkeyRecoveryCode.count({ where: { userId: uid } })).toBe(0);
  });
  it("removes a lost device but keeps the confirming passkey", async () => {
    await removePasskey(req(), session, key2);
    expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(1);
    await expect(removePasskey(req(), session, key1)).rejects.toMatchObject({ status: 409 });
    await expect(removePasskey(req(), session, "another-person-key")).rejects.toMatchObject({ status: 409 });
  });
  it("requires the account password as well as the recovery code", async () => {
    const codes = await generateRecoveryCodes(req(), session);
    await expect(recoverPasskeys(req(), session, { password: "wrong synthetic value", recoveryCode: codes[0] })).rejects.toMatchObject({ status: 401 });
    expect(await prisma.passkeyRecoveryCode.count({ where: { userId: uid } })).toBe(8);
  });
  it("allows only one concurrent recovery and revokes credentials, challenges and sessions", async () => {
    const codes = await generateRecoveryCodes(req(), session);
    await beginPasskey(req(), session, "authenticate", "payment_reveal");
    const results = await Promise.allSettled([0, 1].map(() => recoverPasskeys(req(), session, { password, recoveryCode: codes[0] })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(0);
    expect(await prisma.passkeyChallenge.count({ where: { userId: uid } })).toBe(0);
    expect(await prisma.passkeyRecoveryCode.count({ where: { userId: uid } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).tokenVersion).toBe(1);
    await expect(assertRecentAuth(req(), session, "passkey_setup")).rejects.toMatchObject({ status: 428 });
  });
  it("refuses a registration begun before recovery", async () => {
    const codes = await generateRecoveryCodes(req(), session);
    const started = await beginPasskey(req(), session, "register", "passkey_setup", "Replacement");
    await recoverPasskeys(req(), session, { password, recoveryCode: codes[0] });
    await expect(finishPasskey(req(), session, started.challengeId, { id: "synthetic-registration" } as never)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(0);
  });
  it("rechecks revocation after registration verification, inside the account lock", async () => {
    const started = await beginPasskey(req(), session, "register", "passkey_setup", "Replacement");
    vi.mocked(verifyRegistrationResponse).mockImplementationOnce(async () => {
      await prisma.user.update({ where: { id: uid }, data: { tokenVersion: { increment: 1 } } });
      return { verified: true, registrationInfo: { credential: { id: "synthetic-registration", publicKey: new Uint8Array([1]), counter: 0, transports: [] } } } as never;
    });
    await expect(finishPasskey(req(), session, started.challengeId, { id: "synthetic-registration" } as never)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.passkey.findUnique({ where: { id: "synthetic-registration" } })).toBeNull();
  });
  it("never removes both keys when two removal requests race", async () => {
    const results = await Promise.allSettled([removePasskey(req(), session, key2), removePasskey(req("passkey", key2), session, key1)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(1);
  });
  it("rolls recovery back if the audit write fails", async () => {
    const codes = await generateRecoveryCodes(req(), session);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION security_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'passkeys_recovered_sessions_revoked' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER security_test_audit_failure BEFORE INSERT ON "ActivityLog" FOR EACH ROW EXECUTE FUNCTION security_test_reject_audit()`);
    try {
      await expect(recoverPasskeys(req(), session, { password, recoveryCode: codes[0] })).rejects.toThrow();
      expect(await prisma.passkey.count({ where: { userId: uid } })).toBe(2);
      expect(await prisma.passkeyRecoveryCode.count({ where: { userId: uid } })).toBe(8);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).tokenVersion).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER security_test_audit_failure ON "ActivityLog"');
      await prisma.$executeRawUnsafe('DROP FUNCTION security_test_reject_audit()');
    }
  });
  it("blocks a demoted account despite an old owner session", async () => {
    await prisma.user.update({ where: { id: uid }, data: { role: "staff" } });
    await expect(generateRecoveryCodes(req(), session)).rejects.toMatchObject({ status: 403 });
  });
});
