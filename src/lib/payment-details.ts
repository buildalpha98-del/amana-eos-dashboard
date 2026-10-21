/**
 * Family payment details — bank (direct debit) ONLY. Security brief
 * 2026-10-21, batch 2 (S04).
 *
 * Enrolment has collected bank details only since 2026-10-06, but two
 * legacy write paths (staff edit, parent self-service) still accepted a
 * card number and CCV, encrypted both, and the reveal decrypted and returned
 * them. Retaining a card security code after authorisation is not
 * acceptable even encrypted. So:
 *
 *   - every write goes through `bankDetailsSchema`: STRICT — any card or
 *     security-code field is rejected, even beside `method: "bank_account"`
 *     (never spread a request body into storage);
 *   - default reads go through `maskedPaymentView` — an allow-list of mask
 *     fields; the encrypted blob never leaves the server;
 *   - the audited reveal goes through `revealBankDetails` — bank fields only.
 *     A historical card record reveals nothing but its mask; cleanup of those
 *     records is a separate, reviewed plan (docs/security/payment-card-cleanup.md).
 *
 * Future card payments belong with a payment provider's hosted fields and
 * tokens — never in this table.
 */
import { z } from "zod";

/**
 * Who may see a family's bank details AT ALL — masks included (Daniel,
 * 2026-10-21: "unless it's an admin or an owner, they should not be able to
 * view the bank details"). State Managers (head_office), coordinators and
 * educators see the method only. Shared centre logins never, whatever role.
 */
export const BANK_DETAILS_ROLES = ["owner", "admin"] as const;

export function canSeeBankDetails(user: { role?: string | null; isCentreAccount?: boolean | null } | null | undefined): boolean {
  return !!user && !user.isCentreAccount && (BANK_DETAILS_ROLES as readonly string[]).includes(user.role ?? "");
}

/** Every card-ish key seen in either stored shape (plus common spellings). */
export const CARD_FIELD_KEYS = [
  "cardName",
  "cardNumber",
  "cardType",
  "expiryMonth",
  "expiryYear",
  "cardExpiryMonth",
  "cardExpiryYear",
  "cardExpiry",
  "ccv",
  "cvv",
  "cvc",
  "cardCcv",
  "cardCvv",
  "securityCode",
  "pan",
] as const;

const CARD_KEYS = new Set<string>(CARD_FIELD_KEYS);

export const CARD_REJECTED_MESSAGE =
  "We only take direct debit from a bank account. Card details can't be stored here.";

const digits = (v: string) => v.replace(/[\s-]/g, "");

/**
 * The only accepted payment write. `.strict()` rejects unknown keys, and the
 * explicit card check gives a clear message rather than "Unrecognized key".
 */
export const bankDetailsSchema = z
  .object({
    method: z.literal("bank_account", { message: CARD_REJECTED_MESSAGE }),
    accountName: z.string().trim().min(1, "Account name is required.").max(120),
    bsb: z
      .string()
      .transform(digits)
      .refine((v) => /^\d{6}$/.test(v), "BSB must be 6 digits."),
    accountNumber: z
      .string()
      .transform(digits)
      .refine((v) => /^\d{5,10}$/.test(v), "Account number should be 5 to 10 digits."),
  })
  .strict();

export type BankDetails = z.infer<typeof bankDetailsSchema>;

/**
 * Split card keys off a write body. ANY non-empty card or security-code value
 * is a rejection. Empty placeholders are dropped, never stored: the live
 * enrolment form's state object still carries blank card fields, and tabs
 * already open in parents' browsers will keep sending them after this ships.
 */
export function stripCardPlaceholders(body: unknown): { ok: true; rest: Record<string, unknown> } | { ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: true, rest: {} };
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (CARD_KEYS.has(k)) {
      if (v == null || (typeof v === "string" && v.trim() === "")) continue;
      return { ok: false };
    }
    rest[k] = v;
  }
  return { ok: true, rest };
}

/** Parse a write body; a card value anywhere fails with one clear message. */
export function parseBankDetails(body: unknown): { ok: true; data: BankDetails } | { ok: false; error: string } {
  const stripped = stripCardPlaceholders(body);
  if (!stripped.ok || (stripped.rest as { method?: unknown }).method === "credit_card") {
    return { ok: false, error: CARD_REJECTED_MESSAGE };
  }
  const parsed = bankDetailsSchema.safeParse(stripped.rest);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid bank details" };
  return { ok: true, data: parsed.data };
}

/** What's stored: the mask beside the encrypted canonical bank shape. */
export function bankMask(d: BankDetails) {
  return { bsbLastThree: d.bsb.slice(-3), accountLastFour: d.accountNumber.slice(-4) };
}

/** The canonical plaintext that gets encrypted — bank fields only. */
export function bankPlaintext(d: BankDetails): string {
  return JSON.stringify({ method: "bank_account", accountName: d.accountName, bsb: d.bsb, accountNumber: d.accountNumber });
}

const MASK_KEYS = ["bsbLastThree", "accountLastFour", "lastFour", "cardType", "expiryMonth", "expiryYear"] as const;

/**
 * Default-read view of a stored `paymentDetails` JSON: mask fields only, plus
 * whether an encrypted copy exists. Never the ciphertext, never a full value
 * that a degraded legacy write might have left in the open object.
 */
export function maskedPaymentView(stored: unknown): Record<string, unknown> | null {
  if (!stored || typeof stored !== "object") return null;
  const s = stored as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of MASK_KEYS) {
    const v = s[k];
    if (v == null) continue;
    // A mask is short by definition — refuse anything that looks like a full number.
    const str = String(v);
    if ((k === "lastFour" || k === "accountLastFour") && str.replace(/\D/g, "").length > 4) continue;
    if (k === "bsbLastThree" && str.replace(/\D/g, "").length > 3) continue;
    out[k] = v;
  }
  out.hasEncryptedDetails = typeof s.raw === "string";
  return out;
}

/** The default-read view for THIS viewer: masks for owner/admin, nothing for anyone else. */
export function paymentViewFor(
  user: Parameters<typeof canSeeBankDetails>[0],
  stored: unknown,
): Record<string, unknown> | null {
  return canSeeBankDetails(user) ? maskedPaymentView(stored) : null;
}

/**
 * Bank fields from a decrypted record, in either historical shape
 * (public form: accountName/bsb/accountNumber; parent portal: bankAccountName/
 * bankBsb/bankAccountNumber). Card and security-code values are never read.
 */
export function revealBankDetails(decrypted: unknown): { accountName?: string; bsb?: string; accountNumber?: string } {
  const p = (decrypted ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return undefined;
  };
  return {
    accountName: pick("accountName", "bankAccountName"),
    bsb: pick("bsb", "bankBsb"),
    accountNumber: pick("accountNumber", "bankAccountNumber"),
  };
}

/** True when a decrypted legacy record holds any card field (for the cleanup inventory). */
export function hasCardFields(decrypted: unknown): boolean {
  if (!decrypted || typeof decrypted !== "object") return false;
  return Object.entries(decrypted as Record<string, unknown>).some(
    ([k, v]) => CARD_KEYS.has(k) && k !== "cardType" && typeof v === "string" && v.trim() !== "",
  );
}
