"use client";

/**
 * The centre's budget bank (Daniel, 21 Oct 2026): unspent purchase and
 * grocery budget banked at month end, spent on bigger things later.
 * Coordinators see it; head office can spend from it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, PiggyBank } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  kind: string;
  budget: string;
  month: string | null;
  amount: number;
  description: string;
  createdAt: string;
}
interface Bank {
  balance: number;
  entries: Entry[];
  thisMonth: { month: string; purchaseBudget: number; purchaseSpent: number; groceryBudget: number; grocerySpent: number; onTrackToBank: number };
  canSpend: boolean;
}

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const CATEGORIES: [string, string][] = [
  ["kitchen", "Kitchen"],
  ["furniture", "Furniture"],
  ["technology", "Technology"],
  ["sports", "Sports"],
  ["art_craft", "Art & Craft"],
  ["program_materials", "Program materials"],
  ["cleaning", "Cleaning"],
  ["safety", "Safety"],
  ["other", "Other"],
];

export function BudgetBankCard({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [spending, setSpending] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("kitchen");
  const q = useQuery<Bank>({
    queryKey: ["budget-bank", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/budget-bank`),
    retry: 2,
  });
  const spend = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/budget-bank`, {
        method: "POST",
        body: { amount: Number(amount), description, category },
      }),
    onSuccess: () => {
      toast({ description: "Paid from the bank and added to the centre's purchases." });
      setSpending(false);
      setAmount("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["budget-bank", serviceId] });
      qc.invalidateQueries({ queryKey: ["equipment-items", serviceId] });
      qc.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (q.isPending) return <div className="h-24 rounded-xl border border-border bg-card animate-pulse" />;
  if (q.isError) return null;
  const b = q.data;
  const m = b.thisMonth;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <PiggyBank className="h-6 w-6 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Budget bank</p>
          <p className="text-2xl font-semibold text-foreground">{money(b.balance)}</p>
          <p className="text-xs text-muted">
            Unspent budget is banked at the end of each month — save it up for something bigger.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>This month so far</p>
          <p className="text-sm font-semibold text-foreground">{money(m.onTrackToBank)} to bank</p>
          <p>
            Purchases {money(m.purchaseSpent)} of {money(m.purchaseBudget)}
            {m.groceryBudget > 0 ? ` · groceries ${money(m.grocerySpent)} of ${money(m.groceryBudget)}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {b.canSpend && !spending && (
          <Button size="sm" disabled={b.balance <= 0} onClick={() => setSpending(true)}>
            Spend from the bank
          </Button>
        )}
        {b.entries.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            History ({b.entries.length})
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      {spending && (
        <div className="grid gap-2 rounded-lg bg-surface p-3 sm:grid-cols-[1fr_8rem_10rem_auto]">
          <input
            aria-label="What it's for"
            placeholder="What it's for, e.g. New microwave"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            aria-label="Amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" disabled={spend.isPending || !Number(amount) || description.trim().length < 2} onClick={() => spend.mutate()}>
              Pay from bank
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSpending(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && (
        <ul className="divide-y divide-border text-sm">
          {b.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-foreground">{e.description}</span>
                <span className="block text-xs text-muted">
                  {new Date(e.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </span>
              <span className={cn("shrink-0 font-medium", e.amount < 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-300")}>
                {e.amount > 0 ? "+" : ""}
                {money(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
