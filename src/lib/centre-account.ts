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
