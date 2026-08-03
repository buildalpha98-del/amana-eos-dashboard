/**
 * Parent account operations — sign-up, email confirmation, password login,
 * and claiming pre-account enrolments.
 *
 * 2026-07-30, Phase 1 of the enrolment re-architecture. Before this,
 * parents had no account at all: they submitted an anonymous enrolment and
 * were identified afterwards by scanning EnrolmentSubmission JSON for a
 * matching email. Now the account is created FIRST and owns what follows.
 *
 * Login is password-primary; the existing magic link stays as the
 * forgot-password path so a parent can never be locked out of their own
 * enrolment.
 *
 * Security posture, deliberately mirroring the staff-side conventions:
 *   - bcrypt at cost 12 (same as src/app/api/users/route.ts)
 *   - HIBP breach check on every password (checkPasswordBreach)
 *   - only a SHA-256 hash of the confirmation token is stored, so a
 *     database leak can't be replayed to verify someone else's address
 *   - sign-up and login responses never reveal whether an email exists
 */

import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/** Confirmation links are single-use and short-lived. */
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const BCRYPT_COST = 12;

export function normaliseEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Store only the hash — the raw token exists solely in the email. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Find every enrolment whose primary or secondary parent email matches.
 *
 * Extracted from the magic-link verify route so sign-up, login and the
 * claim flow all share one definition instead of four copies drifting
 * apart.
 *
 * KNOWN LIMITATION (pre-existing, carried over): parent emails live inside
 * a JSON column, so this scans and caps at 500 rows rather than indexing.
 * It was `take: 100` before. Worth moving to a real column if enrolment
 * volume grows — noted rather than silently inherited.
 */
export async function findEnrolmentIdsForEmail(
  emailLower: string,
): Promise<{ enrolmentIds: string[]; parentName: string | null }> {
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { status: { not: "draft" } },
    select: { id: true, primaryParent: true, secondaryParent: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const ids: string[] = [];
  let parentName: string | null = null;

  const matches = (blob: unknown): Record<string, unknown> | null => {
    const p = blob as Record<string, unknown> | null;
    if (!p || typeof p.email !== "string") return null;
    return p.email.toLowerCase().trim() === emailLower ? p : null;
  };

  for (const e of enrolments) {
    const hit = matches(e.primaryParent) ?? matches(e.secondaryParent);
    if (!hit) continue;
    ids.push(e.id);
    if (!parentName && typeof hit.firstName === "string") {
      parentName = `${hit.firstName}${
        typeof hit.surname === "string" && hit.surname ? ` ${hit.surname}` : ""
      }`;
    }
  }

  return { enrolmentIds: ids, parentName };
}

export interface CreateAccountResult {
  accountId: string;
  /** Raw token to embed in the confirmation email. Never persisted. */
  verificationToken: string;
  /** True when this email already had an account. */
  alreadyExisted: boolean;
  /**
   * Whether the caller may sign this person straight in.
   *
   * FALSE whenever the account already existed. Sign-up now issues a
   * session, so auto-logging into an account someone else created would
   * be single-step account takeover: type a known family's email, choose
   * any password, and you're inside their child's records. The only
   * accounts we log straight into are ones this request just created.
   */
  mayAutoLogin: boolean;
}

/**
 * Create an unverified account and mint a confirmation token.
 *
 * When the email already exists we return `alreadyExisted` WITHOUT touching
 * the stored password. The caller still sends an email and still returns a
 * generic success, so sign-up can't be used to enumerate which families are
 * already registered.
 */
export async function createParentAccount(params: {
  email: string;
  password: string;
  firstName?: string | null;
  surname?: string | null;
}): Promise<CreateAccountResult> {
  const email = normaliseEmail(params.email);

  const breachCount = await checkPasswordBreach(params.password);
  if (breachCount > 0) {
    throw ApiError.badRequest(
      `This password has appeared in ${breachCount.toLocaleString()} known data breaches. Please choose a different one.`,
    );
  }

  const existing = await prisma.parentAccount.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });

  // Already verified → do nothing but mint a token so the caller can send a
  // "you already have an account" email. Never overwrite a live password.
  if (existing) {
    // Do NOT touch the password and do NOT issue a session. They own this
    // address already; the caller sends a "you already have an account"
    // email and points them at sign-in.
    return {
      accountId: existing.id,
      verificationToken: randomBytes(32).toString("hex"),
      alreadyExisted: true,
      mayAutoLogin: false,
    };
  }

  const passwordHash = await hash(params.password, BCRYPT_COST);

  const account = await prisma.parentAccount.create({
    data: {
      email,
      passwordHash,
      firstName: params.firstName ?? null,
      surname: params.surname ?? null,
    },
    select: { id: true },
  });

  const raw = randomBytes(32).toString("hex");
  await prisma.parentEmailVerification.create({
    data: {
      accountId: account.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });

  return {
    accountId: account.id,
    verificationToken: raw,
    alreadyExisted: false,
    mayAutoLogin: true,
  };
}

/**
 * Consume a confirmation token and mark the address verified.
 *
 * Also runs the one-time claim: any enrolment already submitted under this
 * email is attached to the account, so an existing family keeps its history
 * instead of starting empty.
 */
export async function confirmParentEmail(rawToken: string): Promise<{
  accountId: string;
  email: string;
  claimedEnrolmentIds: string[];
}> {
  const record = await prisma.parentEmailVerification.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { account: { select: { id: true, email: true, claimedAt: true } } },
  });

  if (!record) throw ApiError.badRequest("This confirmation link is not valid.");
  if (record.usedAt) {
    throw ApiError.badRequest("This confirmation link has already been used.");
  }
  if (record.expiresAt < new Date()) {
    throw ApiError.badRequest(
      "This confirmation link has expired. Please request a new one.",
    );
  }

  const { enrolmentIds } = await findEnrolmentIdsForEmail(record.account.email);

  await prisma.$transaction([
    prisma.parentEmailVerification.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.parentAccount.update({
      where: { id: record.accountId },
      data: {
        emailVerifiedAt: new Date(),
        // Stamp the claim once so the backfill is auditable and idempotent.
        claimedAt: record.account.claimedAt ?? new Date(),
      },
    }),
  ]);

  logger.info("Parent email confirmed", {
    accountId: record.accountId,
    claimedEnrolments: enrolmentIds.length,
  });

  return {
    accountId: record.accountId,
    email: record.account.email,
    claimedEnrolmentIds: enrolmentIds,
  };
}

/**
 * Verify an email + password pair.
 *
 * Returns null for BOTH "no such account" and "wrong password" so callers
 * can't distinguish them. An unverified address throws a distinct error —
 * that one is safe to disclose, because the person already proved they know
 * the password, and they need telling why they can't get in.
 */
export async function authenticateParent(
  email: string,
  password: string,
): Promise<
  | { accountId: string; email: string; name: string | null; deactivated?: false }
  | { deactivated: true }
  | null
> {
  const emailLower = normaliseEmail(email);
  const account = await prisma.parentAccount.findUnique({
    where: { email: emailLower },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      emailVerifiedAt: true,
      firstName: true,
      surname: true,
      deactivatedAt: true,
    },
  });

  if (!account) return null;
  if (!(await compare(password, account.passwordHash))) return null;

  // Reported only AFTER the password checks out — telling an anonymous
  // caller which addresses are deactivated would be enumeration. Someone
  // who knows the password has earned a straight answer.
  if (account.deactivatedAt) return { deactivated: true };

  // 2026-07-31: an UNVERIFIED address can now sign in. Verification moved
  // to the enrolment-approval email — making a family verify before they
  // can even see the form was turning people away at the door, and the
  // address gets proven before anything of consequence happens anyway.
  await prisma.parentAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });

  const name =
    [account.firstName, account.surname].filter(Boolean).join(" ") || null;

  return { accountId: account.id, email: account.email, name };
}

/** Mint a fresh confirmation token for an unverified account. */
export async function reissueVerification(
  email: string,
): Promise<{ token: string; accountId: string } | null> {
  const account = await prisma.parentAccount.findUnique({
    where: { email: normaliseEmail(email) },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!account || account.emailVerifiedAt) return null;

  const raw = randomBytes(32).toString("hex");
  await prisma.parentEmailVerification.create({
    data: {
      accountId: account.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });
  return { token: raw, accountId: account.id };
}
