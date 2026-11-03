/**
 * Recent authentication ("confirm it's you") for sensitive reveals —
 * security brief 2026-10-21, batch 2 (S04).
 *
 * Showing a family's full BSB and account number needs more than a live
 * session: a laptop left signed in for a day shouldn't be enough. The person
 * uses a user-verified passkey at `POST /api/auth/passkeys`, which sets a
 * short-lived proof cookie. Password/MFA verification only authorises
 * first-key setup. `assertRecentAuth` checks proofs before reveals/changes.
 *
 * The proof is an HMAC-signed, httpOnly cookie bound to:
 *   - the person (user id),
 *   - THIS login (the JWT's `loginAt` and `tokenVersion`), so it dies with
 *     logout, "sign out everywhere", a password reset or a new login, and a
 *     proof minted in one session can't be replayed in another;
 *   - one purpose, and a five-minute expiry enforced on the server.
 * Shared centre logins can never obtain one — a mailbox is not a person.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { compare } from "bcryptjs";
import type { Session } from "next-auth";
import { canSeeBankDetails } from "@/lib/payment-details";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { decryptSecret, verifyBackupCode, verifyTotp } from "@/lib/totp";

export const RECENT_AUTH_COOKIE = "amana-recent-auth";
export const RECENT_AUTH_TTL_MS = 5 * 60 * 1000;
export const RECENT_AUTH_REQUIRED = "RECENT_AUTH_REQUIRED";

export type RecentAuthPurpose = "payment_reveal" | "payment_change" | "passkey_setup";

interface Proof {
  method?: "passkey" | "password";
  credentialId?: string;
  uid: string;
  lat: number; // JWT loginAt
  tv: number; // JWT tokenVersion
  pur: RecentAuthPurpose;
  exp: number;
}

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  // A derived key, so a proof can never double as any other signed value.
  return createHmac("sha256", secret).update("amana-recent-auth-v1").digest();
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

/** The current login's binding, read from the verified session JWT. */
export async function loginBinding(req: NextRequest): Promise<{ lat: number; tv: number } | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const lat = token?.loginAt;
  const tv = token?.tokenVersion;
  return typeof lat === "number" && typeof tv === "number" ? { lat, tv } : null;
}

export function encodeProof(p: Proof): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeProof(value: string | undefined | null): Proof | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Proof;
    return typeof p.uid === "string" && typeof p.exp === "number" ? p : null;
  } catch {
    return null;
  }
}

function required(mfa: boolean): ApiError {
  return new ApiError(428, "Confirm it's you to see these details.", { code: RECENT_AUTH_REQUIRED, mfa });
}

/**
 * Throws 428 RECENT_AUTH_REQUIRED unless this person proved it's them in
 * THIS login within the last five minutes. Shared centre logins get 403.
 */
export async function assertRecentAuth(req: NextRequest, session: Session, purpose: RecentAuthPurpose): Promise<void> {
  if (session.user.isCentreAccount) {
    throw ApiError.forbidden("A shared centre login can't view these details. Sign in as yourself.");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, isCentreAccount: true, mfaEnabledAt: true, tokenVersion: true, role: true },
  });
  if (!user?.active || user.isCentreAccount || !canSeeBankDetails(user)) throw ApiError.forbidden();

  const proof = decodeProof(req.cookies.get(RECENT_AUTH_COOKIE)?.value);
  const binding = await loginBinding(req);
  const ok =
    !!proof &&
    !!binding &&
    proof.uid === session.user.id &&
    proof.pur === purpose &&
    proof.lat === binding.lat &&
    proof.tv === binding.tv &&
    proof.tv === user.tokenVersion &&
    proof.exp > Date.now();
  if (!ok) throw required(!!user.mfaEnabledAt);
  if (purpose !== "passkey_setup" && proof?.method !== "passkey") throw required(!!user.mfaEnabledAt);
  if (proof?.method === "passkey") {
    const credential = proof.credentialId && await prisma.passkey.findFirst({ where: { id: proof.credentialId, userId: session.user.id } });
    if (!credential) throw required(!!user.mfaEnabledAt);
  }
}

/**
 * Check the password (and second factor when enabled) and mint a proof for
 * this login. Returns the cookie value; the route sets it. Throws a generic
 * 401 for any wrong answer so it can't be used to probe which part failed.
 */
export async function confirmIdentity(
  req: NextRequest,
  session: Session,
  input: { password: string; mfaCode?: string; purpose: RecentAuthPurpose },
): Promise<string> {
  if (session.user.isCentreAccount) {
    throw ApiError.forbidden("A shared centre login can't do this. Sign in as yourself.");
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.active || user.isCentreAccount || !canSeeBankDetails(user)) throw ApiError.forbidden();
  const binding = await loginBinding(req);
  if (!binding || binding.tv !== user.tokenVersion) throw ApiError.unauthorized("Your session has ended. Sign in again.");

  const wrong = () => ApiError.unauthorized("That didn't match. Check your password and code and try again.");
  if (!(await compare(input.password, user.passwordHash))) throw wrong();

  if (user.mfaEnabledAt) {
    const code = input.mfaCode?.trim().toLowerCase() ?? "";
    if (!user.mfaSecret) throw wrong();
    if (/^\d{6}$/.test(code)) {
      if (!verifyTotp(decryptSecret(user.mfaSecret), code)) throw wrong();
    } else if (/^[0-9a-f]{8}$/.test(code)) {
      const { valid, remainingHashes } = verifyBackupCode(code, user.mfaBackupCodes);
      if (!valid) throw wrong();
      // Same compare-and-set as sign-in: a backup code works once.
      const consumed = await prisma.user.updateMany({
        where: { id: user.id, active: true, tokenVersion: user.tokenVersion, mfaBackupCodes: { equals: user.mfaBackupCodes } },
        data: { mfaBackupCodes: remainingHashes },
      });
      if (consumed.count !== 1) throw wrong();
    } else {
      throw wrong();
    }
  }

  return encodeProof({ method: "password", uid: user.id, lat: binding.lat, tv: binding.tv, pur: input.purpose, exp: Date.now() + RECENT_AUTH_TTL_MS });
}

/** Headers for any response carrying revealed values. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
} as const;
