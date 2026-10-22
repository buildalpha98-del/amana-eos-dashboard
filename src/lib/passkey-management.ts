import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { canSeeBankDetails } from "@/lib/payment-details";
import { passkeyContext } from "@/lib/passkeys";
import { assertRecentAuth, confirmIdentity, decodeProof, RECENT_AUTH_COOKIE } from "@/lib/recent-auth";

const digest = (userId: string, code: string) => createHash("sha256").update(`amana-passkey-recovery:${userId}:${code.replace(/-/g, "").toLowerCase()}`).digest("hex");
async function lockAccount(tx: Prisma.TransactionClient, userId: string, version: number) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.active || user.isCentreAccount || !canSeeBankDetails(user) || user.tokenVersion !== version) throw ApiError.unauthorized("Sign in again before continuing.");
}
async function managementProof(req: NextRequest, session: Session) {
  const ctx = await passkeyContext(req, session);
  await assertRecentAuth(req, session, "passkey_setup");
  const proof = decodeProof(req.cookies.get(RECENT_AUTH_COOKIE)?.value);
  if (proof?.method !== "passkey" || !proof.credentialId) throw ApiError.forbidden("Confirm with an existing passkey first.");
  return { ...ctx, credentialId: proof.credentialId };
}
async function assertProofStillExists(tx: Prisma.TransactionClient, userId: string, credentialId: string, rpId: string) {
  if (!await tx.passkey.findFirst({ where: { id: credentialId, userId, rpId } })) throw ApiError.unauthorized("Please confirm with a passkey again.");
}
export async function removePasskey(req: NextRequest, session: Session, id: string) {
  const ctx = await managementProof(req, session);
  if (id === ctx.credentialId) throw ApiError.conflict("Confirm with a different passkey before removing this one.");
  await prisma.$transaction(async tx => {
    await lockAccount(tx, ctx.user.id, ctx.user.tokenVersion);
    await assertProofStillExists(tx, ctx.user.id, ctx.credentialId, ctx.rpID);
    if (await tx.passkey.count({ where: { userId: ctx.user.id, rpId: ctx.rpID } }) < 2) throw ApiError.conflict("Keep at least one passkey. Add another before removing this one.");
    const removed = await tx.passkey.deleteMany({ where: { id, userId: ctx.user.id, rpId: ctx.rpID } });
    if (removed.count !== 1) throw ApiError.notFound("Passkey not found");
    await tx.activityLog.create({ data: { userId: ctx.user.id, action: "passkey_removed", entityType: "User", entityId: ctx.user.id } });
  });
}
export async function generateRecoveryCodes(req: NextRequest, session: Session) {
  const ctx = await managementProof(req, session);
  // 128 random bits per code. Raw codes are returned once, never stored/logged.
  const codes = Array.from({ length: 8 }, () => randomBytes(16).toString("hex").match(/.{4}/g)!.join("-"));
  await prisma.$transaction(async tx => {
    await lockAccount(tx, ctx.user.id, ctx.user.tokenVersion);
    await assertProofStillExists(tx, ctx.user.id, ctx.credentialId, ctx.rpID);
    await tx.passkeyRecoveryCode.deleteMany({ where: { userId: ctx.user.id } });
    await tx.passkeyRecoveryCode.createMany({ data: codes.map(code => ({ userId: ctx.user.id, digest: digest(ctx.user.id, code) })) });
    await tx.activityLog.create({ data: { userId: ctx.user.id, action: "passkey_recovery_codes_generated", entityType: "User", entityId: ctx.user.id } });
  });
  return codes;
}
export async function recoverPasskeys(req: NextRequest, session: Session, input: { password: string; mfaCode?: string; recoveryCode: string }) {
  const ctx = await passkeyContext(req, session);
  // Existing MFA is still required where enabled; this does not bypass login MFA.
  await confirmIdentity(req, session, { password: input.password, mfaCode: input.mfaCode, purpose: "passkey_setup" });
  const codeDigest = digest(ctx.user.id, input.recoveryCode.trim());
  await prisma.$transaction(async tx => {
    await lockAccount(tx, ctx.user.id, ctx.user.tokenVersion);
    const used = await tx.passkeyRecoveryCode.deleteMany({ where: { userId: ctx.user.id, digest: codeDigest } });
    if (used.count !== 1) throw ApiError.unauthorized("That recovery code didn't match. Check it and try again.");
    await tx.passkeyRecoveryCode.deleteMany({ where: { userId: ctx.user.id } });
    await tx.passkey.deleteMany({ where: { userId: ctx.user.id } });
    await tx.passkeyChallenge.deleteMany({ where: { userId: ctx.user.id } });
    await tx.user.update({ where: { id: ctx.user.id }, data: { tokenVersion: { increment: 1 } } });
    await tx.activityLog.create({ data: { userId: ctx.user.id, action: "passkeys_recovered_sessions_revoked", entityType: "User", entityId: ctx.user.id } });
  });
}
