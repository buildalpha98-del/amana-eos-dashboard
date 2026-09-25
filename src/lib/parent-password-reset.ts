/**
 * Parent password resets — the recovery path the portal never had.
 *
 * `ParentAccount.passwordHash` was written exactly once, at sign-up, and by no
 * other code path in the application. "Forgot your password?" on the sign-in
 * page sent a magic LOGIN link: it gets the parent in, but leaves the password
 * they cannot remember exactly as it was, so the next sign-in fails the same
 * way. Meanwhile the sign-up route told anyone with an existing address that
 * they "can reset your password from the sign-in page" — a promise nothing in
 * the codebase could keep.
 *
 * A reset link is deliberately NOT a login link:
 *   - it proves control of the mailbox and then asks for a NEW password,
 *     rather than papering over the old one;
 *   - using one invalidates every other outstanding reset for that address,
 *     so a forwarded or leaked older email stops working;
 *   - it never signs anyone in by itself. The parent signs in with the
 *     password they just chose, which is the moment they learn it works.
 */
import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normaliseEmail } from "@/lib/parent-account";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * One hour, not the magic link's fifteen minutes.
 *
 * Fifteen minutes assumes someone sitting at the sign-in page with their inbox
 * open. Parents request these from a phone at pick-up and open the email that
 * evening — by which time the link is dead, and the family's read on it is
 * simply "the link doesn't work". An hour still bounds the damage from a
 * forwarded email while surviving an ordinary gap between asking and reading.
 */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Same floor as sign-up — a portal password guards health and payment data. */
export const MIN_PASSWORD_LENGTH = 10;

const BCRYPT_COST = 12;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a reset token for an address.
 *
 * Callers decide whether the address deserves one — the public route stays
 * silent about whether an account exists, while the staff route is explicit
 * because the staff member is looking at the family's record.
 *
 * `issuedByUserId` records a staff-initiated reset so "who sent this?" has an
 * answer months later.
 */
export async function createParentPasswordReset(
  email: string,
  opts: { issuedByUserId?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const emailLower = normaliseEmail(email);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.parentPasswordReset.create({
    data: {
      email: emailLower,
      tokenHash: hashToken(token),
      expiresAt,
      issuedByUserId: opts.issuedByUserId ?? null,
    },
  });

  return { token, expiresAt };
}

/** The link a reset email points at. Kept here so both senders agree. */
export function parentResetUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/parent/reset-password?token=${token}`;
}

export type ResetTokenCheck =
  | { ok: true; email: string; id: string }
  | { ok: false; reason: "unknown" | "used" | "expired" };

/**
 * Look a token up WITHOUT consuming it.
 *
 * The reset page calls this on load so it can say "this link has expired, ask
 * for a new one" before the parent types a password — rather than letting them
 * choose one, submit, and only then be told the link was dead.
 */
export async function checkParentPasswordReset(
  token: string,
): Promise<ResetTokenCheck> {
  const row = await prisma.parentPasswordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, usedAt: true, expiresAt: true },
  });
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, email: row.email, id: row.id };
}

/**
 * Complete a reset: validate the token and the new password, then set it.
 *
 * Everything happens in one transaction, and the token is claimed with a
 * status-guarded `updateMany` so two submissions of the same link can't both
 * succeed — the second finds zero rows and is told the link was already used.
 */
export async function completeParentPasswordReset(params: {
  token: string;
  password: string;
}): Promise<{ email: string }> {
  const check = await checkParentPasswordReset(params.token);
  if (!check.ok) {
    throw ApiError.badRequest(
      check.reason === "used"
        ? "This reset link has already been used. Please request a new one."
        : "This reset link has expired. Please request a new one.",
    );
  }

  if (params.password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  // Same check sign-up runs — a reset is no reason to accept a password that
  // is already circulating in a breach corpus.
  const breachCount = await checkPasswordBreach(params.password);
  if (breachCount > 0) {
    throw ApiError.badRequest(
      `This password has appeared in ${breachCount.toLocaleString()} known data breaches. Please choose a different one.`,
    );
  }

  const account = await prisma.parentAccount.findUnique({
    where: { email: check.email },
    select: { id: true },
  });
  if (!account) {
    // The address had a token but no account — deleted between request and
    // use. Nothing to set, and saying so would leak that the account is gone.
    throw ApiError.badRequest(
      "This reset link is no longer valid. Please request a new one.",
    );
  }

  const passwordHash = await hash(params.password, BCRYPT_COST);

  await prisma.$transaction(async (tx) => {
    // Claim THIS token first. Zero rows means someone else already used it.
    const claimed = await tx.parentPasswordReset.updateMany({
      where: { id: check.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw ApiError.badRequest(
        "This reset link has already been used. Please request a new one.",
      );
    }

    await tx.parentAccount.update({
      where: { id: account.id },
      data: {
        passwordHash,
        // Completing a reset proves they control the mailbox, which is all
        // email verification ever asserted. A family who verified long ago is
        // unaffected; one who never did should not be left half-locked-out
        // after proving the same thing.
        emailVerifiedAt: { set: new Date() },
      },
    });

    // Every OTHER outstanding reset for this address dies with it, so an
    // older email sitting in the inbox can't be replayed.
    await tx.parentPasswordReset.updateMany({
      where: { email: check.email, usedAt: null },
      data: { usedAt: new Date() },
    });
  });

  logger.info("Parent password reset completed", { email: check.email });
  return { email: check.email };
}

/**
 * Set a family's password directly, on a staff member's instruction.
 *
 * Deliberately separate from the token flow and deliberately audited by the
 * caller: this is the "parent is on the phone and cannot receive email"
 * path, not the everyday one. It also burns any outstanding reset links,
 * because after this the password in the parent's hand is the staff member's,
 * and an older link would quietly overwrite it.
 */
export async function setParentPasswordDirect(params: {
  accountId: string;
  password: string;
}): Promise<void> {
  if (params.password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  const breachCount = await checkPasswordBreach(params.password);
  if (breachCount > 0) {
    throw ApiError.badRequest(
      `That password has appeared in ${breachCount.toLocaleString()} known data breaches. Please choose a different one.`,
    );
  }

  const account = await prisma.parentAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, email: true },
  });
  if (!account) throw ApiError.notFound("Family account not found");

  const passwordHash = await hash(params.password, BCRYPT_COST);

  await prisma.$transaction([
    prisma.parentAccount.update({
      where: { id: account.id },
      data: { passwordHash },
    }),
    prisma.parentPasswordReset.updateMany({
      where: { email: account.email, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
}
