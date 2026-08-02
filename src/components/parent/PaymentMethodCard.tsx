"use client";

/**
 * The family's payment method, with self-service editing.
 *
 * 2026-08-01. This section previously rendered HARDCODED placeholder text
 * — "Direct Debit — BSB 000-000, account ending 1234" — to every parent,
 * regardless of what they'd actually given us, alongside "to update, please
 * contact the centre". So it was both wrong and a dead end.
 *
 * Details are shown MASKED and never decrypted for a parent session: they
 * already know their own account number, so returning plaintext buys
 * nothing and turns a hijacked session into a data leak. To correct a
 * mistake they re-enter the whole thing, which is what every bank does.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { SectionLabel } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";

interface MaskedPayment {
  method: string | null;
  lastFour: string | null;
  cardType: string | null;
  bsbLastThree: string | null;
  accountLastFour: string | null;
}

const field =
  "w-full px-3 py-2.5 border border-[color:var(--color-border)] rounded-lg text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/30";

export function PaymentMethodCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"bank_account" | "credit_card">(
    "bank_account",
  );
  const [form, setForm] = useState({
    accountName: "",
    bsb: "",
    accountNumber: "",
    cardName: "",
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
  });

  const { data, isLoading } = useQuery<{ payment: MaskedPayment | null }>({
    queryKey: ["parent", "payment"],
    queryFn: () => fetchApi("/api/parent/payment"),
    retry: 1,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi("/api/parent/payment", { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parent", "payment"] });
      setEditing(false);
      // Clear the form immediately — there's no reason for a full card
      // number to sit in browser memory once it's been sent.
      setForm({
        accountName: "",
        bsb: "",
        accountNumber: "",
        cardName: "",
        cardNumber: "",
        expiryMonth: "",
        expiryYear: "",
        ccv: "",
      });
      toast({ description: "Payment method updated." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const p = data?.payment ?? null;
  const thisYear = new Date().getFullYear();

  const set = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <section>
      <SectionLabel label="Payment Method" />
      <div className="warm-card">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : editing ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Your details are encrypted. We only ever show you the last few
                digits afterwards, so please enter them in full.
              </p>
            </div>

            <div>
              <label htmlFor="pm-method" className="block text-sm font-medium mb-1">
                Payment method
              </label>
              <select
                id="pm-method"
                className={field}
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as "bank_account" | "credit_card")
                }
              >
                <option value="bank_account">Bank account (direct debit)</option>
                <option value="credit_card">Credit or debit card</option>
              </select>
            </div>

            {method === "bank_account" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="pm-accname" className="block text-sm font-medium mb-1">
                    Account name
                  </label>
                  <input
                    id="pm-accname"
                    className={field}
                    value={form.accountName}
                    onChange={(e) => set("accountName", e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="pm-bsb" className="block text-sm font-medium mb-1">
                    BSB
                  </label>
                  <input
                    id="pm-bsb"
                    className={field}
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="000-000"
                    value={form.bsb}
                    onChange={(e) => set("bsb", e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="pm-accnum" className="block text-sm font-medium mb-1">
                    Account number
                  </label>
                  <input
                    id="pm-accnum"
                    className={field}
                    inputMode="numeric"
                    value={form.accountNumber}
                    onChange={(e) => set("accountNumber", e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="pm-cardname" className="block text-sm font-medium mb-1">
                    Name on card
                  </label>
                  <input
                    id="pm-cardname"
                    className={field}
                    value={form.cardName}
                    onChange={(e) => set("cardName", e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="pm-cardnum" className="block text-sm font-medium mb-1">
                    Card number
                  </label>
                  <input
                    id="pm-cardnum"
                    className={field}
                    inputMode="numeric"
                    value={form.cardNumber}
                    onChange={(e) => set("cardNumber", e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <div>
                    <label htmlFor="pm-mm" className="block text-sm font-medium mb-1">
                      Month
                    </label>
                    <select
                      id="pm-mm"
                      className={field}
                      value={form.expiryMonth}
                      onChange={(e) => set("expiryMonth", e.target.value)}
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) =>
                        String(i + 1).padStart(2, "0"),
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pm-yy" className="block text-sm font-medium mb-1">
                      Year
                    </label>
                    <select
                      id="pm-yy"
                      className={field}
                      value={form.expiryYear}
                      onChange={(e) => set("expiryYear", e.target.value)}
                    >
                      <option value="">YYYY</option>
                      {Array.from({ length: 12 }, (_, i) =>
                        String(thisYear + i),
                      ).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pm-ccv" className="block text-sm font-medium mb-1">
                      CCV
                    </label>
                    <input
                      id="pm-ccv"
                      className={field}
                      inputMode="numeric"
                      maxLength={4}
                      value={form.ccv}
                      onChange={(e) => set("ccv", e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => save.mutate({ method, ...form })}
                disabled={save.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-3 min-h-11 rounded-lg bg-[color:var(--color-brand)] text-white font-medium disabled:opacity-40"
              >
                {save.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save payment method"
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-[color:var(--color-muted)] min-h-11"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0">
                {p?.method === "credit_card" ? (
                  <CreditCard className="w-5 h-5 text-[color:var(--color-brand)]" />
                ) : (
                  <Building2 className="w-5 h-5 text-[color:var(--color-brand)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {!p ? (
                  <>
                    <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      No payment method on file
                    </p>
                    <p className="text-xs text-[color:var(--color-muted)]">
                      Add one so your fees can be paid automatically.
                    </p>
                  </>
                ) : p.method === "credit_card" ? (
                  <>
                    <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      {p.cardType ?? "Card"} ending {p.lastFour ?? "••••"}
                    </p>
                    <p className="text-xs text-[color:var(--color-muted)]">
                      Card payment
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      Direct debit — BSB •••{p.bsbLastThree ?? "•••"}
                    </p>
                    <p className="text-xs text-[color:var(--color-muted)]">
                      Account ending {p.accountLastFour ?? "••••"}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
              <button
                type="button"
                onClick={() => {
                  setMethod(
                    p?.method === "credit_card" ? "credit_card" : "bank_account",
                  );
                  setEditing(true);
                }}
                className="text-sm font-semibold text-[color:var(--color-brand)] min-h-11"
              >
                {p ? "Update payment method" : "Add payment method"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
