/**
 * Card expiry checks for the payment-reminder job.
 *
 * Pure so the rules can be tested without a database or a mail server —
 * this decides who gets emailed about their card, and getting it wrong
 * either spams families or lets a payment fail silently.
 *
 * Reads the MASKED payment blob, never the encrypted one. A month and
 * year alone aren't PCI-sensitive without the PAN, so expiry is stored
 * readable specifically to avoid decrypting card numbers on a schedule.
 */

export interface MaskedCard {
  expiryMonth?: string | number | null;
  expiryYear?: string | number | null;
}

/**
 * Last moment a card is valid.
 *
 * A card expiring "05/2030" is good through the END of May, not the 1st —
 * treating it as the 1st would tell families their card had expired while
 * it was still working for most of a month.
 */
export function cardExpiresAt(card: MaskedCard): Date | null {
  const m = Number(card.expiryMonth);
  const y = Number(card.expiryYear);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  // First instant of the NEXT month = the moment it stops being valid.
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
}

export function isExpired(card: MaskedCard, asOf: Date = new Date()): boolean {
  const at = cardExpiresAt(card);
  if (!at) return false; // unknown expiry is not evidence of expiry
  return at.getTime() <= asOf.getTime();
}

/** Whole days until the card stops working. Negative once expired. */
export function daysUntilExpiry(
  card: MaskedCard,
  asOf: Date = new Date(),
): number | null {
  const at = cardExpiresAt(card);
  if (!at) return null;
  return Math.floor((at.getTime() - asOf.getTime()) / 86_400_000);
}

/**
 * When to nudge a family.
 *
 * Two reminders, not a daily nag: one with a month's notice so there's
 * time to act, and one in the final week. A third would train people to
 * ignore them.
 */
export const REMINDER_WINDOWS = [
  { key: "30_day", minDays: 25, maxDays: 35 },
  { key: "7_day", minDays: 3, maxDays: 10 },
] as const;

export type ReminderKey = (typeof REMINDER_WINDOWS)[number]["key"] | "expired";

/**
 * Which reminder (if any) is due for this card today.
 *
 * Returns null when nothing is due — including for a card with no expiry
 * recorded, and for bank accounts, which don't expire.
 *
 * `alreadySent` carries the keys already sent for THIS expiry date, so a
 * job that runs daily doesn't email the same family every day for a week.
 */
export function reminderDue(
  card: MaskedCard,
  alreadySent: string[] = [],
  asOf: Date = new Date(),
): ReminderKey | null {
  const days = daysUntilExpiry(card, asOf);
  if (days === null) return null;

  // Already lapsed — chase once, not repeatedly.
  if (days <= 0) {
    return alreadySent.includes("expired") ? null : "expired";
  }

  for (const w of REMINDER_WINDOWS) {
    if (days >= w.minDays && days <= w.maxDays) {
      return alreadySent.includes(w.key) ? null : w.key;
    }
  }
  return null;
}

/** Human phrasing for the email subject and body. */
export function expiryPhrase(days: number): string {
  if (days <= 0) return "has expired";
  if (days === 1) return "expires tomorrow";
  if (days <= 10) return `expires in ${days} days`;
  return "expires next month";
}
