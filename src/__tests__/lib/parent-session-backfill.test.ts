import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { signParentJwt, verifyParentJwt, withParentAuth, type ParentJwtPayload } from "@/lib/parent-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
process.env.PARENT_JWT_SECRET = "test-secret-at-least-32-characters-long";

const legacySession = { email: "Aysha@Example.com", name: "Aysha Khan", enrolmentIds: [] as string[] };
const account = { id: "acc-1", email: "aysha@example.com", deactivatedAt: null, sessionVersion: 0 };
// Mint the actual pre-migration shape, independently of today's signer.
const legacyToken = (payload: ParentJwtPayload) => new SignJWT({ ...payload })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d")
  .sign(new TextEncoder().encode(process.env.PARENT_JWT_SECRET));
async function run(payload: ParentJwtPayload) {
  const token = await legacyToken(payload);
  let parent: ParentJwtPayload | undefined;
  const handler = withParentAuth(async (_req, ctx) => {
    parent = ctx.parent;
    return NextResponse.json({ ok: true });
  });
  const response = await handler(createRequest("GET", "/api/parent/state", { headers: { cookie: `parent-session=${token}` } }));
  return { parent, response };
}
beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.parentAccount.findUnique.mockResolvedValue(account);
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
});

describe("parent session revocation and legacy compatibility", () => {
  it("backfills an active account from a normalised legacy email", async () => {
    const { parent, response } = await run(legacySession);
    expect(response.status).toBe(200);
    expect(parent?.accountId).toBe(account.id);
    expect(prismaMock.parentAccount.findUnique.mock.calls[0][0].where).toEqual({ email: account.email });
  });
  it.each([undefined, "acc-1"])("rejects disabled accounts with accountId=%s", async accountId => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, deactivatedAt: new Date() });
    const { parent, response } = await run({ ...legacySession, accountId });
    expect(response.status).toBe(401);
    expect(parent).toBeUndefined();
  });
  it("keeps legitimate accountless magic-link sessions usable", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue(null);
    const { parent, response } = await run(legacySession);
    expect(response.status).toBe(200);
    expect(parent?.accountId).toBeUndefined();
  });
  it("validates account-bound sessions on every request", async () => {
    expect((await run({ ...legacySession, accountId: account.id })).response.status).toBe(200);
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, deactivatedAt: new Date() });
    expect((await run({ ...legacySession, accountId: account.id })).response.status).toBe(401);
    expect(prismaMock.parentAccount.findUnique).toHaveBeenCalledTimes(2);
  });
  it("rejects a deleted or mismatched account", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue(null);
    expect((await run({ ...legacySession, accountId: account.id })).response.status).toBe(401);
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, email: "other@example.com" });
    expect((await run({ ...legacySession, accountId: account.id })).response.status).toBe(401);
  });
  it.each([undefined, 0, 1])("revokes earlier versions even after reactivation: %s", async sessionVersion => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, sessionVersion: 2 });
    expect((await run({ ...legacySession, sessionVersion })).response.status).toBe(401);
  });
  it("signs fresh sessions with the account's current revocation version", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, sessionVersion: 3 });
    expect(await verifyParentJwt(await signParentJwt(legacySession))).toMatchObject({ accountId: account.id, sessionVersion: 3 });
  });
  it("cannot refresh a session revoked while its request was in progress", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, sessionVersion: 3 });
    await expect(signParentJwt({ ...legacySession, accountId: account.id, sessionVersion: 2 })).rejects.toMatchObject({ status: 401 });
  });
  it("cannot mint a new session for a disabled account", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, deactivatedAt: new Date() });
    await expect(signParentJwt(legacySession)).rejects.toMatchObject({ status: 401 });
  });
  it("rechecks ownership and retains primary and secondary carers only", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "primary", primaryParent: { email: "AYSHA@example.com" }, secondaryParent: null },
      { id: "secondary", primaryParent: {}, secondaryParent: { email: "aysha@example.com" } },
      { id: "removed", primaryParent: { email: "another@example.com" }, secondaryParent: {} },
    ]);
    const { parent } = await run({ ...legacySession, enrolmentIds: ["primary", "secondary", "removed"] });
    expect(parent?.enrolmentIds).toEqual(["primary", "secondary"]);
  });
});
