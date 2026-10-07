/**
 * Put a dashboard user into Employment Hero Payroll and link them —
 * the ONE path for it (2026-10-07).
 *
 * Before this, Daniel created each new starter by hand in EH, copied their
 * EH employee id, and pasted it into the staff profile. Now:
 *   1. already linked            → nothing to do (or re-send setup on request)
 *   2. a live EH record has their email → just link it (no duplicate, no email)
 *   3. otherwise                 → create the EH record via Self Setup, which
 *      emails them EH's own setup link (TFN declaration, bank, super — done in
 *      EH, never in our systems), then link the new record by email.
 *
 * Called automatically for new starters (onboarding request, "New starter"
 * in Add Staff, hired-candidate convert) and from the "Set up in Employment
 * Hero" button on the staff profile. Bulk invite / CSV import / staff sync
 * deliberately DON'T call it: those are mostly people already in EH under
 * whatever email they had there, and a mismatch would create a duplicate.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  findEmployeeByEmail,
  initiateSelfSetup,
  isConfigured,
  isLiveEhStatus,
} from "@/lib/eh-payroll";

export type EhSetupStatus =
  | "already_linked"
  | "resent"
  | "linked_existing"
  | "invited"
  | "not_configured"
  | "skipped";

export interface EhSetupResult {
  status: EhSetupStatus;
  ehEmployeeId: number | null;
  /** Human sentence for toasts / audit. */
  message: string;
}

function splitName(name: string): { firstName: string; surname: string } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? name;
  // EH requires a surname; a one-word name is used for both rather than
  // inventing a placeholder that would print on payslips.
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : firstName;
  return { firstName, surname };
}

async function link(userId: string, ehEmployeeId: number): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { employmentHeroEmployeeId: ehEmployeeId },
    });
    return true;
  } catch (err) {
    // employmentHeroEmployeeId is @unique — another dashboard user already
    // holds this EH record. Don't steal it; an admin has to look.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.warn("EH onboarding: EH record already linked to another user", {
        userId,
        ehEmployeeId,
      });
      return false;
    }
    throw err;
  }
}

export async function setUpInEmploymentHero(
  userId: string,
  opts: { actorId?: string; resendIfLinked?: boolean } = {},
): Promise<EhSetupResult> {
  if (!isConfigured()) {
    return {
      status: "not_configured",
      ehEmployeeId: null,
      message: "Employment Hero isn't connected yet",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      isCentreAccount: true,
      employmentHeroEmployeeId: true,
    },
  });
  if (!user || !user.active || user.isCentreAccount) {
    return { status: "skipped", ehEmployeeId: null, message: "Not a staff member" };
  }

  const { firstName, surname } = splitName(user.name);
  let result: EhSetupResult;

  if (user.employmentHeroEmployeeId !== null) {
    if (opts.resendIfLinked) {
      await initiateSelfSetup({
        id: user.employmentHeroEmployeeId,
        firstName,
        surname,
        email: user.email,
        mobile: user.phone,
      });
      result = {
        status: "resent",
        ehEmployeeId: user.employmentHeroEmployeeId,
        message: `Employment Hero setup email re-sent to ${user.email}`,
      };
    } else {
      return {
        status: "already_linked",
        ehEmployeeId: user.employmentHeroEmployeeId,
        message: "Already linked to Employment Hero",
      };
    }
  } else {
    const existing = await findEmployeeByEmail(user.email);
    if (existing && isLiveEhStatus(existing.status)) {
      const linked = await link(user.id, existing.id);
      result = linked
        ? {
            status: "linked_existing",
            ehEmployeeId: existing.id,
            message: `Linked to their existing Employment Hero record (${existing.id})`,
          }
        : {
            status: "skipped",
            ehEmployeeId: null,
            message: `Employment Hero record ${existing.id} is already linked to another dashboard user`,
          };
    } else {
      await initiateSelfSetup({ firstName, surname, email: user.email, mobile: user.phone });
      // The endpoint returns no body — find what it created.
      const created = await findEmployeeByEmail(user.email);
      const linked =
        created && isLiveEhStatus(created.status) ? await link(user.id, created.id) : false;
      result = {
        status: "invited",
        ehEmployeeId: linked && created ? created.id : null,
        message: linked
          ? `Created in Employment Hero and sent their setup email`
          : `Employment Hero setup email sent — they'll be linked on the next sync`,
      };
    }
  }

  await prisma.activityLog
    .create({
      data: {
        userId: opts.actorId ?? user.id,
        action: `eh_payroll.${result.status}`,
        entityType: "User",
        entityId: user.id,
        details: { ehEmployeeId: result.ehEmployeeId, message: result.message },
      },
    })
    .catch((err) => logger.warn("EH onboarding: activity log failed", { err }));

  return result;
}

/** Swallow-and-log wrapper for account-creation paths: payroll setup must
 *  never stop a new starter's dashboard account from being created. */
export async function setUpInEmploymentHeroSafely(
  userId: string,
  opts: { actorId?: string } = {},
): Promise<EhSetupResult | null> {
  try {
    return await setUpInEmploymentHero(userId, opts);
  } catch (err) {
    logger.error("EH onboarding failed", { userId, err });
    return null;
  }
}
