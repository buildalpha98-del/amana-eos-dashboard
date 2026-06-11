import { describe, it, expect } from "vitest";
import { resolveParentPhone } from "@/lib/vapi/parseTranscript";

/**
 * Phone resolution priority for a VAPI end-of-call report:
 *   1. statedPhone — a number the parent gave verbally during the call
 *      (extracted from analysis.structuredData / transcript)
 *   2. callerPhone — the number they called from (call.customer.number, E.164)
 *   3. null
 */
describe("resolveParentPhone", () => {
  const callFrom = (number: unknown) => ({ customer: { number } });

  it("uses the verbally stated number over the number they called from", () => {
    const call = callFrom("+61400000000");
    expect(resolveParentPhone(call, "0412 345 678")).toBe("0412 345 678");
  });

  it("falls back to the caller's number when no number was stated", () => {
    const call = callFrom("+61412345678");
    expect(resolveParentPhone(call, undefined)).toBe("+61412345678");
  });

  it("returns null when neither a stated nor a caller number is available", () => {
    expect(resolveParentPhone(callFrom(undefined), undefined)).toBeNull();
    expect(resolveParentPhone(undefined, undefined)).toBeNull();
    expect(resolveParentPhone({}, undefined)).toBeNull();
  });

  it("ignores a blank stated number and falls back to the caller's number", () => {
    const call = callFrom("+61412345678");
    expect(resolveParentPhone(call, "   ")).toBe("+61412345678");
  });

  it("trims surrounding whitespace from both sources", () => {
    expect(resolveParentPhone(callFrom("  +61412345678  "), undefined)).toBe("+61412345678");
    expect(resolveParentPhone(callFrom(undefined), "  0412 345 678  ")).toBe("0412 345 678");
  });

  it("ignores a non-string caller number (e.g. anonymous / withheld) and returns null", () => {
    expect(resolveParentPhone(callFrom(null), undefined)).toBeNull();
    expect(resolveParentPhone(callFrom(12345), undefined)).toBeNull();
  });
});
