/**
 * Bank-only payment details (security brief 2026-10-21, batch 2 — S04).
 * Synthetic values only: 4111… is the published Visa test PAN.
 */
import { describe, expect, it } from "vitest";
import {
  CARD_REJECTED_MESSAGE,
  bankPlaintext,
  hasCardFields,
  maskedPaymentView,
  parseBankDetails,
  revealBankDetails,
  stripCardPlaceholders,
} from "@/lib/payment-details";

const BANK = { method: "bank_account", accountName: "Synthetic Family", bsb: "062-000", accountNumber: "1234 5678" };
const PAN = "4111111111111111";

describe("parseBankDetails — every write path", () => {
  it("accepts a valid bank-only update and normalises digits", () => {
    const r = parseBankDetails(BANK);
    expect(r).toEqual({ ok: true, data: { method: "bank_account", accountName: "Synthetic Family", bsb: "062000", accountNumber: "12345678" } });
  });

  it.each([
    ["a card number beside bank_account", { ...BANK, cardNumber: PAN }],
    ["a security code beside bank_account", { ...BANK, ccv: "123" }],
    ["the portal's security-code key", { ...BANK, cardCcv: "123" }],
    ["a cvv spelling", { ...BANK, cvv: "123" }],
    ["method credit_card", { method: "credit_card", cardNumber: PAN, ccv: "123", cardName: "X" }],
  ])("refuses %s", (_label, body) => {
    expect(parseBankDetails(body)).toEqual({ ok: false, error: CARD_REJECTED_MESSAGE });
  });

  it("drops blank card placeholders (open tabs still send them) and keeps nothing card-shaped", () => {
    const r = parseBankDetails({ ...BANK, cardName: "", cardNumber: "", cardCcv: "", cardExpiryMonth: "", ccv: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.data).sort()).toEqual(["accountName", "accountNumber", "bsb", "method"]);
  });

  it("is strict about any other unknown key", () => {
    expect(parseBankDetails({ ...BANK, raw: "attacker-supplied" }).ok).toBe(false);
  });

  it("the encrypted plaintext holds bank fields only", () => {
    const r = parseBankDetails({ ...BANK, cardNumber: "" });
    expect(r.ok && JSON.parse(bankPlaintext(r.data))).toEqual({ method: "bank_account", accountName: "Synthetic Family", bsb: "062000", accountNumber: "12345678" });
  });

  it("stripCardPlaceholders refuses any non-empty card value", () => {
    expect(stripCardPlaceholders({ bankBsb: "062000", cardCcv: " 1 " }).ok).toBe(false);
    expect(stripCardPlaceholders({ bankBsb: "062000", cardCcv: "  " })).toEqual({ ok: true, rest: { bankBsb: "062000" } });
  });
});

describe("maskedPaymentView — default reads", () => {
  it("never returns the encrypted copy, only whether it exists", () => {
    expect(maskedPaymentView({ bsbLastThree: "000", accountLastFour: "5678", raw: "v1:ciphertext" })).toEqual({
      bsbLastThree: "000",
      accountLastFour: "5678",
      hasEncryptedDetails: true,
    });
  });

  it("drops anything in a mask slot that is really a full number, and unknown keys", () => {
    expect(maskedPaymentView({ lastFour: PAN, accountLastFour: "12345678", cardNumber: PAN, ccv: "123" })).toEqual({ hasEncryptedDetails: false });
  });

  it("handles empty and junk input", () => {
    expect(maskedPaymentView(null)).toBeNull();
    expect(maskedPaymentView("x")).toBeNull();
  });
});

describe("revealBankDetails — the audited reveal", () => {
  it("reads the public-form shape", () => {
    expect(revealBankDetails({ accountName: "A", bsb: "062000", accountNumber: "12345678" })).toEqual({ accountName: "A", bsb: "062000", accountNumber: "12345678" });
  });

  it("reads the parent-portal shape — the case that once rendered blank", () => {
    expect(revealBankDetails({ bankAccountName: "A", bankBsb: "062000", bankAccountNumber: "12345678" })).toEqual({ accountName: "A", bsb: "062000", accountNumber: "12345678" });
  });

  it("prefers the canonical key and skips blanks", () => {
    expect(revealBankDetails({ bsb: "", bankBsb: "062000", accountName: "A", bankAccountName: "B" })).toMatchObject({ bsb: "062000", accountName: "A" });
  });

  it("never releases card or security-code fields from a legacy record", () => {
    const out = revealBankDetails({ method: "credit_card", cardName: "X", cardNumber: PAN, ccv: "123", cardCcv: "123", expiryMonth: "01" });
    expect(JSON.stringify(out)).not.toContain(PAN);
    expect(JSON.stringify(out)).not.toContain("123");
    expect(out).toEqual({ accountName: undefined, bsb: undefined, accountNumber: undefined });
  });

  it("returns empty fields rather than throwing on junk", () => {
    expect(revealBankDetails(null)).toEqual({ accountName: undefined, bsb: undefined, accountNumber: undefined });
  });
});

describe("hasCardFields — cleanup inventory", () => {
  it("flags records holding a card value, not a bare cardType or blanks", () => {
    expect(hasCardFields({ cardNumber: PAN })).toBe(true);
    expect(hasCardFields({ cardCcv: "123" })).toBe(true);
    expect(hasCardFields({ cardType: "Visa", cardNumber: "" })).toBe(false);
    expect(hasCardFields({ bsb: "062000" })).toBe(false);
  });
});
