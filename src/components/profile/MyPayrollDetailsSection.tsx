"use client";

/**
 * "Bank, super & tax" on My Details (2026-10-07). Everything here lives in
 * Employment Hero Payroll: we read it live and write changes straight back
 * (src/app/api/my-portal/payroll/*). Nothing is stored in this dashboard,
 * and the tax file declaration never passes through it at all — that's
 * completed in Employment Hero's own setup, where the ATO rules for TFNs
 * are already handled.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Landmark, PiggyBank, ReceiptText, Search } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/Button";
import type { MaskedBankAccount, SuperFundSummary } from "@/lib/payroll-details";

interface PayrollDetails {
  configured: boolean;
  linked: boolean;
  setupComplete?: boolean;
  bankAccounts?: MaskedBankAccount[];
  superFunds?: SuperFundSummary[];
}

const QUERY_KEY = ["my-payroll-details"];
const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand";

export function MyPayrollDetailsSection() {
  const { data, isLoading, isError } = useQuery<PayrollDetails>({
    queryKey: QUERY_KEY,
    queryFn: () => fetchApi<PayrollDetails>("/api/my-portal/payroll"),
    staleTime: 60_000,
    retry: 1,
    meta: { suppressGlobalErrorToast: true },
  });

  if (isLoading || (data && !data.configured)) return null;

  return (
    <section
      id="payroll"
      className="bg-card rounded-xl border border-border p-6 space-y-5 scroll-mt-24"
      data-testid="my-payroll-details"
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">Bank, super &amp; tax</h3>
        <p className="text-xs text-muted mt-1">
          Saved straight to Employment Hero, our payroll system — this is exactly what payroll uses.
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-muted">
          Couldn&apos;t reach Employment Hero just now. Please try again in a minute.
        </p>
      ) : !data?.linked ? (
        <div className="rounded-lg bg-surface/60 p-4 text-sm text-foreground/80">
          Your payroll account is being set up. You&apos;ll get an email from Employment Hero
          with a link to add your tax file declaration, bank account and super — once
          that&apos;s done, you can change them here any time.
        </div>
      ) : (
        <>
          {!data.setupComplete && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong>Finish your Employment Hero setup.</strong> Open the email from Employment
                Hero and complete your tax file declaration — we can&apos;t pay you until it&apos;s done.
              </span>
            </div>
          )}
          <BankBlock accounts={data.bankAccounts ?? []} />
          <SuperBlock funds={data.superFunds ?? []} />
          <TaxBlock complete={!!data.setupComplete} />
        </>
      )}
    </section>
  );
}

function BankBlock({ accounts }: { accounts: MaskedBankAccount[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountName: "", bsb: "", accountNumber: "", confirm: "" });

  const save = useMutation({
    mutationFn: () =>
      mutateApi<{ warning: string | null }>("/api/my-portal/payroll/bank", {
        method: "PUT",
        body: { accountName: form.accountName, bsb: form.bsb, accountNumber: form.accountNumber },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditing(false);
      setForm({ accountName: "", bsb: "", accountNumber: "", confirm: "" });
      toast({
        description: res.warning
          ? `Saved — Employment Hero notes: ${res.warning}`
          : "Bank account updated. We've emailed you a confirmation.",
      });
    },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
  });

  const mismatch = form.confirm.length > 0 && form.confirm !== form.accountNumber;
  const main = accounts.find((a) => a.isMain) ?? accounts[0];

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Landmark className="w-4 h-4 text-muted" aria-hidden />
        Bank account
      </h4>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">No bank account yet.</p>
      ) : (
        <ul className="space-y-1">
          {accounts.map((a) => (
            <li key={a.id} className="text-sm text-foreground">
              {a.accountName} · BSB {a.bsb} · Acc {a.accountNumberMasked}
              <span className="text-xs text-muted"> — {a.split ?? "the rest of your pay"}</span>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) save.mutate();
          }}
        >
          <label className="sm:col-span-2 text-xs font-medium text-muted">
            Name on the account
            <input
              className={inputClass}
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              autoComplete="name"
              required
            />
          </label>
          <label className="text-xs font-medium text-muted">
            BSB
            <input
              className={inputClass}
              value={form.bsb}
              onChange={(e) => setForm({ ...form, bsb: e.target.value })}
              inputMode="numeric"
              placeholder="062-000"
              required
            />
          </label>
          <label className="text-xs font-medium text-muted">
            Account number
            <input
              className={inputClass}
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </label>
          <label className="sm:col-span-2 text-xs font-medium text-muted">
            Account number again
            <input
              className={inputClass}
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              inputMode="numeric"
              autoComplete="off"
              required
            />
            {mismatch && <span className="text-red-600 dark:text-red-400">The account numbers don&apos;t match</span>}
          </label>
          <p className="sm:col-span-2 text-xs text-muted">
            {main?.split === null && accounts.length > 1
              ? "This replaces the account that gets the rest of your pay. Splits you set up in Employment Hero stay as they are. "
              : ""}
            For your security we&apos;ll email you whenever this changes.
          </p>
          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending || mismatch}>
              {save.isPending ? "Saving…" : "Save bank account"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          {accounts.length ? "Change bank account" : "Add bank account"}
        </Button>
      )}
    </div>
  );
}

function SuperBlock({ funds }: { funds: SuperFundSummary[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<{ productCode: string; name: string } | null>(null);
  const [memberNumber, setMemberNumber] = useState("");
  const debounced = useDebouncedValue(term, 350);

  const search = useQuery<{ funds: { productCode: string; name: string }[] }>({
    queryKey: ["super-search", debounced],
    queryFn: () =>
      fetchApi(`/api/my-portal/payroll/super-search?term=${encodeURIComponent(debounced)}`),
    enabled: editing && !picked && debounced.trim().length >= 3,
    staleTime: 5 * 60_000,
    meta: { suppressGlobalErrorToast: true },
  });

  const save = useMutation({
    mutationFn: () =>
      mutateApi("/api/my-portal/payroll/super", {
        method: "PUT",
        body: { productCode: picked!.productCode, fundName: picked!.name, memberNumber },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditing(false);
      setPicked(null);
      setTerm("");
      setMemberNumber("");
      toast({ description: "Super fund updated" });
    },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <PiggyBank className="w-4 h-4 text-muted" aria-hidden />
        Super
      </h4>
      {funds.length === 0 ? (
        <p className="text-sm text-muted">No super fund chosen yet — you&apos;ll go into our default fund until you pick one.</p>
      ) : (
        <ul className="space-y-1">
          {funds.map((f) => (
            <li key={f.id} className="text-sm text-foreground">
              {f.name}
              {f.memberNumber ? ` · member ${f.memberNumber}` : ""}
              {f.isEmployerNominatedFund && <span className="text-xs text-muted"> — our default fund</span>}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="space-y-3 pt-1">
          {!picked ? (
            <label className="block text-xs font-medium text-muted">
              Find your fund
              <span className="relative block">
                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                <input
                  className={`${inputClass} pl-9`}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g. AustralianSuper, Hostplus, REST"
                  autoFocus
                />
              </span>
              {term.trim().length >= 3 && (
                <ul className="mt-2 max-h-56 overflow-auto rounded-lg border border-border divide-y divide-border">
                  {search.isLoading && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
                  {search.data?.funds.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted">No funds found — try a shorter name.</li>
                  )}
                  {search.data?.funds.map((f) => (
                    <li key={f.productCode}>
                      <button
                        type="button"
                        onClick={() => setPicked(f)}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface"
                      >
                        {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <p className="text-sm text-foreground">
                {picked.name}{" "}
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => setPicked(null)}>
                  change
                </button>
              </p>
              <label className="block text-xs font-medium text-muted">
                Your member number
                <input
                  className={inputClass}
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  required
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save super fund"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          {funds.length ? "Change super fund" : "Choose a super fund"}
        </Button>
      )}
    </div>
  );
}

function TaxBlock({ complete }: { complete: boolean }) {
  const portal = process.env.NEXT_PUBLIC_EH_PORTAL_URL;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ReceiptText className="w-4 h-4 text-muted" aria-hidden />
        Tax file declaration
      </h4>
      <p className="text-sm text-foreground/80 flex items-start gap-1.5">
        {complete && <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden />}
        <span>
          {complete
            ? "Done. Your tax file number is held securely by Employment Hero, not in this dashboard."
            : "This is completed in Employment Hero's setup — check your email for their link."}
          {" "}To change it later, use the Employment Hero app
          {portal ? (
            <>
              {" "}(
              <a href={portal} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                open Employment Hero
              </a>
              )
            </>
          ) : null}
          .
        </span>
      </p>
    </div>
  );
}
