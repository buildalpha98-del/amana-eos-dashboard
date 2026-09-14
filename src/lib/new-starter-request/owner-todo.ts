/**
 * The onboarding owner's to-do.
 *
 * Before 2026-09-14 a new starter's paperwork was announced to every
 * admin-tier user by email and belonged to nobody in particular — the work
 * (Employment Hero setup, drafting the contract) had no owner and no
 * trackable item. `onboarding.ownerUserId` in org settings names the person
 * who owns it, and this creates them an assigned To-Do they can tick off.
 *
 * The owner is stored as a userId, not an email, so the assignment survives
 * someone changing their address — and so the setting is a person picker
 * rather than a free-text field that can silently point at nobody.
 *
 * Side-effect-free on failure, like the rest of the new-starter fan-out:
 * the request row and the user account are already committed by the time
 * this runs, and a missing to-do must never fail an onboarding.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

type Db = PrismaClient | Prisma.TransactionClient;

/** Days the owner gets to complete the paperwork. */
const DUE_IN_DAYS = 3;

/**
 * Monday of the current week — `Todo.weekOf` is required and the weekly
 * to-do views bucket on it. Inlined because there is no shared helper:
 * /api/todos/bulk and /api/team/action-counts each carry their own copy.
 */
function mondayOfThisWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

export interface OwnerTodoInput {
  requestId: string;
  fullName: string;
  /** Who owns onboarding — from `onboarding.ownerUserId` in org settings. */
  ownerUserId: string | null;
  /** Submitter, recorded as the to-do's creator. */
  createdById: string;
  serviceId: string | null;
  expectedStartDate: Date;
}

export async function createOnboardingOwnerTodo(
  db: Db,
  input: OwnerTodoInput,
): Promise<void> {
  // No owner configured — the admin emails stay the only signal, which is
  // exactly the pre-2026-09-14 behaviour. Not an error.
  if (!input.ownerUserId) return;

  try {
    const owner = await db.user.findUnique({
      where: { id: input.ownerUserId },
      select: { id: true, active: true },
    });
    if (!owner || !owner.active) {
      logger.warn("Onboarding owner is missing or deactivated — no to-do created", {
        ownerUserId: input.ownerUserId,
        requestId: input.requestId,
      });
      return;
    }

    // Due the sooner of "3 days from now" and the start date — paperwork
    // after someone has already started is paperwork that was late.
    const now = new Date();
    const threeDays = new Date(now);
    threeDays.setDate(threeDays.getDate() + DUE_IN_DAYS);
    const dueDate =
      input.expectedStartDate < threeDays ? input.expectedStartDate : threeDays;

    await db.todo.create({
      data: {
        title: `Onboard ${input.fullName} — Employment Hero + contract`,
        description:
          `${input.fullName} has been added to the onboarding list and their dashboard account is created.\n\n` +
          `- Set them up in Employment Hero payroll\n` +
          `- Prepare and issue their employment contract\n\n` +
          `Start date: ${input.expectedStartDate.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`,
        assigneeId: owner.id,
        createdById: input.createdById,
        serviceId: input.serviceId,
        dueDate,
        weekOf: mondayOfThisWeek(),
      },
    });

    await notifyUsers(db, [owner.id], {
      type: NOTIFICATION_TYPES.NEW_STARTER_REQUEST_SUBMITTED,
      title: "New starter to onboard",
      body: `${input.fullName} is starting — Employment Hero + contract are yours`,
      link: `/team?tab=onboarding&open=${input.requestId}`,
    });
  } catch (err) {
    logger.error("Onboarding owner to-do failed", {
      err,
      requestId: input.requestId,
      ownerUserId: input.ownerUserId,
    });
  }
}
