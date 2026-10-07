import { describe, it, expect } from "vitest";
import {
  bankAccountInputSchema,
  maskAccountNumber,
  maskBankAccount,
  formatBsb,
} from "@/lib/payroll-details";

describe("payroll-details", () => {
  it("never returns more than the last 3 digits of an account number", () => {
    expect(maskAccountNumber("12345678")).toBe("•••• 678");
    expect(maskAccountNumber("12")).toBe("•••");
  });

  it("formats a BSB", () => {
    expect(formatBsb("062000")).toBe("062-000");
  });

  it("masks a whole EH bank account and describes splits", () => {
    const m = maskBankAccount({
      id: 1, employeeId: 9, bsb: "062000", accountName: "A Person", accountNumber: "11112222",
      allocatedPercentage: null, fixedAmount: 100, allocateBalance: false,
    });
    expect(m).toEqual({
      id: 1, bsb: "062-000", accountName: "A Person", accountNumberMasked: "•••• 222",
      isMain: false, split: "$100 each pay",
    });
    expect(JSON.stringify(m)).not.toContain("11112222");
  });

  it("validates and normalises bank input", () => {
    const ok = bankAccountInputSchema.safeParse({ accountName: "A", bsb: "062-000", accountNumber: "1234 5678" });
    expect(ok.success && ok.data).toEqual({ accountName: "A", bsb: "062000", accountNumber: "12345678" });
    expect(bankAccountInputSchema.safeParse({ accountName: "A", bsb: "06200", accountNumber: "12345678" }).success).toBe(false);
    expect(bankAccountInputSchema.safeParse({ accountName: "A", bsb: "062000", accountNumber: "123" }).success).toBe(false);
  });
});
