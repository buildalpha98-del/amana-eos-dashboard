/**
 * "Never too many emails" (Daniel, 16 Oct 2026). A scheduled parent email
 * (the nurture series) waits a day when the family already had an email from
 * us in the last 20 hours — welcome, OWNA guide, another nurture step, a
 * campaign. Read from the MarketingSendRecipient ledger, which every journey
 * email now writes to.
 *
 * Never held:
 *   - session_reminder — "see you tomorrow" is useless the day after;
 *   - anything already 3+ days past when it was meant to go (a family on a
 *     busy campaign list must still get their check-in eventually).
 * Emails triggered by something the family or staff just did (receipt,
 * welcome, OWNA guide, first day) are sent by their own routes and are never
 * held. Night-time is covered by schedule: nurture-send only runs ~6am–6pm
 * Sydney, and the journey crons run mid-morning.
 */
import { prisma } from "@/lib/prisma";

const H = 3_600_000;
export const PACE_WINDOW_HOURS = 20;
const NEVER_HOLD = new Set(["session_reminder"]);
const MAX_LATE_DAYS = 3;

export async function paceNurtureSend(
  email: string,
  templateKey: string,
  originallyDue: Date | null,
  now = new Date(),
): Promise<"send" | "hold"> {
  if (NEVER_HOLD.has(templateKey)) return "send";
  if (originallyDue && now.getTime() - originallyDue.getTime() > MAX_LATE_DAYS * 24 * H) return "send";
  const recent = await prisma.marketingSendRecipient.count({
    where: { email: email.trim().toLowerCase(), sentAt: { gte: new Date(now.getTime() - PACE_WINDOW_HOURS * H) } },
  });
  return recent > 0 ? "hold" : "send";
}
