/**
 * Centre accounts — a shared CENTRE mailbox (arkana@amanaoshc.com.au,
 * unitygrammar@amanaoshc.com.au …) used by whoever is coordinating that
 * centre, as opposed to a person's own login.
 *
 * Daniel, 2026-10-06: a centre account has full access to its own centre and
 * must NEVER be put through onboarding. Before this the system treated the
 * mailbox as a new employee: onboarding todos, induction enrolment, a 90-day
 * ramp emailing "how's your first week?" to a shared inbox, and the staff
 * sync deactivating it for not being on the HR registry.
 *
 * ONE flag (`User.isCentreAccount`), set automatically when the user's email
 * matches a centre's `Service.email`, and read everywhere below — never
 * re-derive "is this a centre mailbox" from the email at a call site.
 *
 * Where it is applied (keep this list current):
 *   - induction: isInductionLocked (never locked), assertUserCleared (can't be
 *     ROSTERED or CLOCK IN — a shared mailbox isn't a person; ratios,
 *     timesheets and payroll would be corrupted), recompute, backfill,
 *     training-monthly, induction-grace
 *   - onboarding todos (seedOnboardingPackage), onboarding packs
 *     (assignOnboardingPack), 90-day ramp (createStaffRamp + ramp-daily
 *     sweep), retention check-ins
 *   - required certificates (getRequiredCertTypes → none)
 *   - staff sync (never deactivated or re-roled), user creation (auto-flag)
 *   - roster staff pickers (useServiceStaff source)
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/** Prisma `where` fragment: people only, never centre mailboxes. */
export const NOT_CENTRE_ACCOUNT = { isCentreAccount: false } as const;

export function isCentreAccount(
  user: { isCentreAccount?: boolean | null } | null | undefined,
): boolean {
  return user?.isCentreAccount === true;
}

/**
 * The centre whose mailbox this is, or null. Case- and whitespace-
 * insensitive. Ambiguous (two centres sharing an address) returns the
 * first by name — the account still gets flagged, staff fix the centre.
 */
export async function findCentreForEmail(
  db: Pick<PrismaClient, "service"> | Prisma.TransactionClient,
  email: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return null;
  return db.service.findFirst({
    where: { email: { equals: normalised, mode: "insensitive" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Fields to stamp on a user being CREATED with a centre mailbox: flagged,
 * cleared (never a new starter), attached to the centre, and given
 * Director-of-Service access unless a more senior role was chosen.
 */
export function centreAccountCreateFields(
  centre: { id: string },
  requestedRole: string,
  requestedServiceId?: string | null,
) {
  return {
    isCentreAccount: true,
    inductionStatus: "cleared" as const,
    inductionClearedAt: new Date(),
    serviceId: requestedServiceId || centre.id,
    role: (requestedRole === "staff" ? "member" : requestedRole) as never,
  };
}

/**
 * A centre's email was just saved: if a user already logs in with that
 * address, make them the centre account now — the same conversion the
 * 20261006120000 migration applied to existing accounts. Without this, a
 * coordinator whose mailbox differed from the centre record stayed a "new
 * employee" until someone remembered to fix it by hand.
 *
 * Swallow-and-log: a failure here must never fail the centre save.
 */
export async function convertCentreMailboxUser(
  db: PrismaClient,
  serviceId: string,
  email: string | null | undefined,
): Promise<{ converted: string | null }> {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return { converted: null };
  try {
    const user = await db.user.findFirst({
      where: {
        email: { equals: normalised, mode: "insensitive" },
        isCentreAccount: false,
      },
      select: { id: true, role: true, serviceId: true },
    });
    if (!user) return { converted: null };

    await db.user.update({
      where: { id: user.id },
      data: {
        isCentreAccount: true,
        inductionStatus: "cleared",
        inductionClearedAt: new Date(),
        inductionGraceUntil: null,
        serviceId: user.serviceId ?? serviceId,
        // Educator → Director of Service; every other role is kept.
        ...(user.role === "staff" ? { role: "member" as const } : {}),
      },
    });
    // Stop any 90-day ramp emails to the shared inbox.
    await db.staffRamp.updateMany({
      where: { userId: user.id, status: { in: ["active", "extended"] } },
      data: { status: "ended", completedAt: new Date() },
    });
    return { converted: user.id };
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.warn("Centre account conversion failed", {
      serviceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { converted: null };
  }
}
