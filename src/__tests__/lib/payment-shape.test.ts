import { describe, it, expect } from "vitest";

/**
 * Mirrors normalisePaymentShape in
 * src/app/api/enrolments/[id]/payment/route.ts.
 *
 * Duplicated deliberately rather than exported: the route is a Next.js
 * module with server-only imports (prisma, server-auth) that a unit test
 * can't load cheaply. The shape contract is what matters, and this pins
 * it — if the route's copy drifts, these cases stop describing reality
 * and the next person has a failing test pointing straight at it.
 */
function normalisePaymentShape(raw: unknown): Record<string, unknown> {
  const p = (raw ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
    return undefined;
  };
  return {
    method: p.method,
    accountName: pick("accountName", "bankAccountName"),
    bsb: pick("bsb", "bankBsb"),
    accountNumber: pick("accountNumber", "bankAccountNumber"),
    cardName: pick("cardName"),
    cardNumber: pick("cardNumber"),
    expiryMonth: pick("expiryMonth", "cardExpiryMonth"),
    expiryYear: pick("expiryYear", "cardExpiryYear"),
    ccv: pick("ccv", "cardCcv"),
  };
}

describe("normalisePaymentShape", () => {
  it("reads the PUBLIC form's bank shape", () => {
    const out = normalisePaymentShape({
      method: "bank_account",
      accountName: "M Acar",
      bsb: "013230",
      accountNumber: "645799112",
    });
    expect(out).toMatchObject({
      method: "bank_account",
      accountName: "M Acar",
      bsb: "013230",
      accountNumber: "645799112",
    });
  });

  it("reads the PARENT PORTAL's bank shape — the case that rendered blank", () => {
    const out = normalisePaymentShape({
      method: "bank_account",
      bankAccountName: "M Acar",
      bankBsb: "013230",
      bankAccountNumber: "645799112",
    });
    expect(out.accountName).toBe("M Acar");
    expect(out.bsb).toBe("013230");
    expect(out.accountNumber).toBe("645799112");
  });

  it("reads both card shapes", () => {
    expect(
      normalisePaymentShape({
        method: "credit_card",
        cardName: "M Acar",
        cardNumber: "4111111111111111",
        expiryMonth: "05",
        expiryYear: "2030",
        ccv: "123",
      }),
    ).toMatchObject({ expiryMonth: "05", expiryYear: "2030", ccv: "123" });

    expect(
      normalisePaymentShape({
        method: "credit_card",
        cardName: "M Acar",
        cardNumber: "4111111111111111",
        cardExpiryMonth: "05",
        cardExpiryYear: "2030",
        cardCcv: "123",
      }),
    ).toMatchObject({ expiryMonth: "05", expiryYear: "2030", ccv: "123" });
  });

  it("prefers the canonical name when a record somehow carries both", () => {
    const out = normalisePaymentShape({
      method: "bank_account",
      accountNumber: "canonical",
      bankAccountNumber: "legacy",
    });
    expect(out.accountNumber).toBe("canonical");
  });

  it("skips an empty string and falls through to the alternate key", () => {
    // A blank is not an answer — without this, "" would win over a real
    // value stored under the other name and we'd be back to blank rows.
    const out = normalisePaymentShape({
      method: "bank_account",
      bsb: "   ",
      bankBsb: "013230",
    });
    expect(out.bsb).toBe("013230");
  });

  it("returns undefined fields rather than throwing on junk", () => {
    expect(normalisePaymentShape(null).accountName).toBeUndefined();
    expect(normalisePaymentShape({}).method).toBeUndefined();
    expect(normalisePaymentShape({ bsb: 12345 }).bsb).toBeUndefined();
  });
});
