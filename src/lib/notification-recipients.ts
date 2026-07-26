/**
 * Centralised recipient resolver for cron/system nudge emails.
 *
 * 2026-07-24: staff were getting ~5 nudge emails/day (overdue-todo,
 * compliance, meeting reminders, digests, etc.). Daniel's brief:
 * "narrow it down to just the centre emails and a select few people".
 *
 * The rule this file enforces:
 *   - System/cron emails NEVER go to individual staff or coordinators
 *     unless they opt in via `User.receivesNudges = true`.
 *   - They ALWAYS go to leadership-tier users (owner/head_office/admin/eos)
 *     — those are the "select people" by default.
 *   - When the event is centre-scoped, they ALSO go to that Service's
 *     shared inbox (Service.email) if set.
 *
 * Personal transactional emails (contract issued to YOU, YOUR password
 * reset, YOUR timesheet approved, etc.) bypass this helper — they still
 * go to the individual user via sendEmail() directly. This helper is
 * only for nudges/system alerts.
 */

import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

// Leadership-tier roles that always receive nudges regardless of the
// `receivesNudges` opt-in. Kept in sync with EOS_ASSIGNEE_ROLES conceptually
// but excludes `marketing` — marketing has never wanted the compliance/todo
// nudge stream.
export const NUDGE_LEADERSHIP_ROLES: readonly Role[] = [
  "owner",
  "head_office",
  "admin",
  "eos",
];

export interface NudgeRecipients {
  /** Distinct list of email addresses to `to:` on the outbound email. */
  emails: string[];
  /**
   * The service's shared inbox, if the event is service-scoped and the
   * service has an email set. Included in `emails` too — surfaced separately
   * so callers can log whether a centre inbox was reachable.
   */
  serviceEmail: string | null;
  /**
   * True when the service is provided but has no `email` set — callers
   * may want to log this so the missing-inbox banner on the service page
   * is meaningful. Always false when serviceId is not provided.
   */
  missingServiceInbox: boolean;
  /** User rows that will receive the email, for personalisation/logging. */
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    role: Role;
  }>;
}

/**
 * Resolve the recipients for a nudge email.
 *
 * When `serviceId` is provided, the service's shared inbox (if set) is
 * added to the recipient list. Users are always fetched from the DB so
 * deactivated/muted users are excluded live.
 *
 * @param serviceId  optional — provide for service-scoped nudges
 *                   (compliance-per-centre, checklist-per-centre, etc.)
 */
export async function resolveNudgeRecipients(
  serviceId?: string | null,
): Promise<NudgeRecipients> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      notificationsMuted: false,
      OR: [
        { role: { in: NUDGE_LEADERSHIP_ROLES as Role[] } },
        { receivesNudges: true },
      ],
    },
    select: { id: true, name: true, email: true, role: true },
  });

  let serviceEmail: string | null = null;
  let missingServiceInbox = false;
  if (serviceId) {
    const svc = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { email: true },
    });
    serviceEmail = svc?.email?.trim() || null;
    missingServiceInbox = !serviceEmail;
  }

  const set = new Set<string>();
  for (const u of users) {
    if (u.email) set.add(u.email.toLowerCase());
  }
  if (serviceEmail) set.add(serviceEmail.toLowerCase());

  return {
    emails: Array.from(set),
    serviceEmail,
    missingServiceInbox,
    users,
  };
}

/**
 * True when this user is a valid direct recipient for a nudge email.
 *
 * Use this to gate transactional emails that COULD go to a staff member
 * (e.g. "you were assigned a todo"). Personal receipts — password reset,
 * their own contract issued — should NOT use this gate; those are always
 * sent regardless of the nudge policy.
 */
export function shouldReceiveNudge(user: {
  role: Role;
  receivesNudges?: boolean | null;
  notificationsMuted?: boolean | null;
  active?: boolean | null;
}): boolean {
  if (user.active === false) return false;
  if (user.notificationsMuted) return false;
  if (NUDGE_LEADERSHIP_ROLES.includes(user.role)) return true;
  return user.receivesNudges === true;
}
