import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { canSeeBankDetails } from "@/lib/payment-details";
import { assertRecentAuth, decodeProof, encodeProof, loginBinding, RECENT_AUTH_COOKIE, RECENT_AUTH_TTL_MS, type RecentAuthPurpose } from "@/lib/recent-auth";

/** Never derive the relying party or origin from client-supplied headers. */
export function passkeyOrigin() {
  const configured = process.env.PASSKEY_ORIGIN || process.env.NEXTAUTH_URL;
  if (!configured) throw new ApiError(503, "Passkeys aren't configured yet.");
  const url = new URL(configured);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) {
    throw new ApiError(503, "Passkeys need a secure connection.");
  }
  return { origin: url.origin, rpID: url.hostname };
}

async function context(req: NextRequest, session: Session) {
  const config = passkeyOrigin();
  if (req.method !== "GET" && req.headers.get("origin") !== config.origin) throw ApiError.forbidden();
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const login = await loginBinding(req);
  if (!user?.active || !canSeeBankDetails(user) || !login || login.tv !== user.tokenVersion) throw ApiError.forbidden();
  const binding = createHash("sha256").update(`${user.id}:${login.lat}:${login.tv}`).digest("hex");
  return { ...config, user, login, binding };
}

export async function listPasskeys(req: NextRequest, session: Session) {
  const ctx = await context(req, session);
  return prisma.passkey.findMany({ where: { userId: ctx.user.id, rpId: ctx.rpID }, select: { id: true, createdAt: true, lastUsedAt: true } });
}

async function allowRegistration(req: NextRequest, session: Session, rpID: string) {
  await assertRecentAuth(req, session, "passkey_setup");
  const existing = await prisma.passkey.count({ where: { userId: session.user.id, rpId: rpID } });
  const proof = decodeProof(req.cookies.get(RECENT_AUTH_COOKIE)?.value);
  if (existing && proof?.method !== "passkey") {
    throw ApiError.forbidden("Confirm with an existing passkey before adding another device.");
  }
}

export async function beginPasskey(req: NextRequest, session: Session, operation: "register" | "authenticate", purpose: RecentAuthPurpose) {
  const ctx = await context(req, session);
  if (operation === "register") await allowRegistration(req, session, ctx.rpID);
  const credentials = await prisma.passkey.findMany({ where: { userId: ctx.user.id, rpId: ctx.rpID } });
  const descriptors = credentials.map(c => ({ id: c.id, transports: c.transports as AuthenticatorTransportFuture[] }));
  if (operation === "authenticate" && !credentials.length) throw ApiError.conflict("Set up a passkey first.");
  const options = operation === "register"
    ? await generateRegistrationOptions({ rpName: "Amana OSHC", rpID: ctx.rpID,
        userName: ctx.user.email, userID: new Uint8Array(createHash("sha256").update(ctx.user.id).digest()),
        attestationType: "none", excludeCredentials: descriptors,
        authenticatorSelection: { residentKey: "required", userVerification: "required" } })
    : await generateAuthenticationOptions({ rpID: ctx.rpID, allowCredentials: descriptors, userVerification: "required" });
  // Expired challenges hold no personal payload; prune them opportunistically.
  await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const challenge = await prisma.passkeyChallenge.create({ data: {
    userId: ctx.user.id, challenge: options.challenge, binding: ctx.binding, purpose, operation,
    expiresAt: new Date(Date.now() + 120_000),
  } });
  return { challengeId: challenge.id, options };
}

export async function finishPasskey(req: NextRequest, session: Session, challengeId: string, response: AuthenticationResponseJSON | RegistrationResponseJSON) {
  const ctx = await context(req, session);
  const challenge = await prisma.passkeyChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.userId !== ctx.user.id || challenge.binding !== ctx.binding || challenge.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized("That confirmation expired. Please try again.");
  }
  // Consume before verifying. A challenge can never succeed twice, even concurrently.
  const consumed = await prisma.passkeyChallenge.deleteMany({ where: { id: challenge.id, binding: ctx.binding, expiresAt: { gt: new Date() } } });
  if (consumed.count !== 1) throw ApiError.unauthorized("Please start confirmation again.");
  let credentialId: string;
  if (challenge.operation === "register") {
    await allowRegistration(req, session, ctx.rpID);
    const result = await verifyRegistrationResponse({ response: response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true });
    if (!result.verified || !result.registrationInfo) throw ApiError.unauthorized("Passkey setup failed.");
    const credential = result.registrationInfo.credential;
    credentialId = credential.id;
    await prisma.$transaction(async tx => {
      // Serialise first-key enrolment: two password-authorised setup requests
      // must not bypass the existing-passkey requirement by racing each other.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ctx.user.id} FOR UPDATE`;
      const proof = decodeProof(req.cookies.get(RECENT_AUTH_COOKIE)?.value);
      const existing = await tx.passkey.count({ where: { userId: ctx.user.id, rpId: ctx.rpID } });
      if (existing && proof?.method !== "passkey") throw ApiError.forbidden("Confirm with an existing passkey first.");
      await tx.passkey.create({ data: { id: credential.id, userId: ctx.user.id, rpId: ctx.rpID,
        publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter), transports: credential.transports ?? [] } });
      await tx.activityLog.create({ data: { userId: ctx.user.id, action: "passkey_registered", entityType: "User", entityId: ctx.user.id } });
    });
  } else {
    const credential = await prisma.passkey.findFirst({ where: { id: response.id, userId: ctx.user.id, rpId: ctx.rpID } });
    if (!credential) throw ApiError.unauthorized("That passkey doesn't belong to this account.");
    const result = await verifyAuthenticationResponse({ response: response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true,
      credential: { id: credential.id, publicKey: new Uint8Array(credential.publicKey), counter: Number(credential.counter), transports: credential.transports as AuthenticatorTransportFuture[] } });
    if (!result.verified) throw ApiError.unauthorized("Passkey confirmation failed.");
    credentialId = credential.id;
    await prisma.$transaction(async tx => {
      const changed = await tx.passkey.updateMany({ where: { id: credential.id, counter: credential.counter }, data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() } });
      if (changed.count !== 1) throw ApiError.unauthorized("Please confirm again.");
      await tx.activityLog.create({ data: { userId: ctx.user.id, action: "passkey_confirmed", entityType: "User", entityId: ctx.user.id, details: { purpose: challenge.purpose } } });
    });
  }
  // Re-check revocation after the cryptographic work, before issuing a proof.
  await context(req, session);
  return encodeProof({ uid: ctx.user.id, lat: ctx.login.lat, tv: ctx.login.tv, method: "passkey", credentialId,
    pur: challenge.purpose as RecentAuthPurpose, exp: Date.now() + RECENT_AUTH_TTL_MS });
}
