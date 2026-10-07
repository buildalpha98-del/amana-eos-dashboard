/**
 * Shared shapes for the staff "Bank & super" section (2026-10-07). Bank and
 * super live in Employment Hero ONLY — the dashboard reads them live and
 * writes changes straight back; nothing is stored on our side. These
 * helpers keep account numbers masked on the way out and validate input on
 * the way in. Pure, so both are unit-tested.
 */
import { z } from "zod";
import type { EhBankAccount, EhSuperFund } from "@/lib/eh-payroll";

export interface MaskedBankAccount {
  id: number;
  bsb: string;
  accountName: string;
  /** Last 3 digits only, e.g. "•••• 321". */
  accountNumberMasked: string;
  isMain: boolean;
  split: string | null;
}

export function maskAccountNumber(n: string): string {
  const digits = (n ?? "").replace(/\D/g, "");
  return digits.length <= 3 ? "•••" : `•••• ${digits.slice(-3)}`;
}

export function formatBsb(bsb: string): string {
  const d = (bsb ?? "").replace(/\D/g, "");
  return d.length === 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : bsb;
}

export function maskBankAccount(a: EhBankAccount): MaskedBankAccount {
  return {
    id: a.id,
    bsb: formatBsb(a.bsb),
    accountName: a.accountName,
    accountNumberMasked: maskAccountNumber(a.accountNumber),
    isMain: a.allocateBalance,
    split: a.allocateBalance
      ? null
      : a.fixedAmount
        ? `$${a.fixedAmount} each pay`
        : a.allocatedPercentage
          ? `${a.allocatedPercentage}% of each pay`
          : null,
  };
}

export interface SuperFundSummary {
  id: number;
  name: string;
  memberNumber: string | null;
  isEmployerNominatedFund: boolean;
}

export function summariseSuperFund(f: EhSuperFund): SuperFundSummary {
  return {
    id: f.id,
    name: f.superProduct?.productName || f.name,
    memberNumber: f.memberNumber,
    isEmployerNominatedFund: f.isEmployerNominatedFund,
  };
}

export const bankAccountInputSchema = z.object({
  accountName: z.string().trim().min(1, "Enter the name on the account").max(32, "Account name is too long"),
  bsb: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "A BSB is 6 digits")),
  accountNumber: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{5,9}$/, "An account number is 5 to 9 digits")),
});

export const superFundInputSchema = z.object({
  productCode: z.string().trim().min(1, "Choose your fund from the list"),
  fundName: z.string().trim().min(1).max(200),
  memberNumber: z.string().trim().min(1, "Enter your member number").max(30),
});
