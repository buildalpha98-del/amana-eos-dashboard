"use client";

/**
 * Program → Resources & stock (Daniel, 21 Oct 2026). The centre keeps its
 * own stock list here instead of emailing it to head office: change a
 * quantity as things run out, add what's new, and "Send stocktake" when
 * everything's been counted — head office is told, with what's running low.
 * The same list shows in Amana HQ (src/lib/service-stock.ts).
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Package, Plus, Send, Trash2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { needsReorder } from "@/lib/service-stock";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface StockItem {
  id: string;
  item: string;
  category: string | null;
  type: "consumable" | "durable";
  qtyOnHand: number | null;
  unit: string | null;
  reorderAt: number | null;
  lastCounted: string | null;
  notes: string | null;
}

const CATEGORIES = ["Art & craft", "Stationery", "Sport & outdoor", "Games & puzzles", "Kitchen", "Cleaning & hygiene", "First aid", "Other"];
const BLANK = { item: "", category: "Art & craft", type: "consumable" as const, qtyOnHand: "", unit: "", reorderAt: "" };

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function ServiceStockTab({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const key = ["service-stock", serviceId];
  const [show, setShow] = useState<"all" | "low">("all");
  const [draft, setDraft] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const itemInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => fetchApi<{ items: StockItem[] }>(`/api/services/${serviceId}/stock`),
    retry: 2,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const low = items.filter(needsReorder);
  const lastCount = items.map((i) => i.lastCounted).filter((d): d is string => !!d).sort().pop() ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const onError = (err: Error) => toast({ variant: "destructive", description: err.message });

  const add = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/stock`, {
        method: "POST",
        body: {
          item: draft.item,
          category: draft.category,
          type: draft.type,
          qtyOnHand: num(draft.qtyOnHand),
          unit: draft.unit || null,
          reorderAt: num(draft.reorderAt),
        },
      }),
    onSuccess: () => {
      toast({ description: `${draft.item} added` });
      // Back to the name box, same category: a stocktake is a long list.
      setDraft({ ...BLANK, category: draft.category, type: draft.type });
      itemInput.current?.focus();
      invalidate();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<StockItem>) =>
      mutateApi(`/api/services/${serviceId}/stock/${id}`, { method: "PATCH", body }),
    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<{ items: StockItem[] }>(key, (old) =>
        old ? { items: old.items.map((i) => (i.id === id ? { ...i, ...body } : i)) } : old,
      );
    },
    onError: (err: Error) => {
      onError(err);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => mutateApi(`/api/services/${serviceId}/stock/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError,
  });
  const submit = useMutation({
    mutationFn: () => mutateApi<{ counted: number; toReorder: number }>(`/api/services/${serviceId}/stock/submit`, { method: "POST" }),
    onSuccess: (r) => {
      toast({
        description: r.toReorder
          ? `Stocktake sent to head office — ${r.toReorder} item${r.toReorder === 1 ? "" : "s"} to reorder.`
          : "Stocktake sent to head office — nothing to reorder.",
      });
      invalidate();
    },
    onError,
  });

  const groups = useMemo(() => {
    const shown = show === "low" ? items.filter(needsReorder) : items;
    const m = new Map<string, StockItem[]>();
    for (const i of shown) {
      const c = i.category || "Other";
      m.set(c, [...(m.get(c) ?? []), i]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, show]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError)
    return (
      <EmptyState
        icon={Package}
        title="Couldn't load the stock list"
        description="Check your connection and try again."
        action={{ label: "Try again", onClick: () => refetch() }}
      />
    );

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="font-heading text-lg font-semibold text-foreground">Resources &amp; stock</h2>
          <p className="mt-1 text-sm text-muted">
            Keep your centre&apos;s list up to date here instead of emailing it in. When you&apos;ve counted everything, send the
            stocktake and head office will see what needs reordering.
          </p>
          <p className="mt-2 text-xs text-muted">
            {items.length} item{items.length === 1 ? "" : "s"} · {low.length} to reorder ·{" "}
            {lastCount ? `last stocktake ${fmtDate(lastCount)}` : "no stocktake sent yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={() => setAdding((v) => !v)}>
            Add item
          </Button>
          <Button
            size="sm"
            iconLeft={<Send className="h-4 w-4" />}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={items.length === 0}
          >
            Send stocktake
          </Button>
        </div>
      </section>

      {adding && (
        <form
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.item.trim()) add.mutate();
          }}
        >
          <label className="col-span-2 text-xs text-muted">
            Item
            <input
              ref={itemInput}
              value={draft.item}
              onChange={(e) => setDraft({ ...draft, item: e.target.value })}
              placeholder="e.g. Glue sticks"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              autoFocus
            />
          </label>
          <label className="text-xs text-muted">
            Category
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Type
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as "consumable" })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              <option value="consumable">Runs out</option>
              <option value="durable">Lasts (equipment)</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            How many now
            <input
              inputMode="decimal"
              value={draft.qtyOnHand}
              onChange={(e) => setDraft({ ...draft, qtyOnHand: e.target.value.replace(/[^\d.]/g, "") })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted">
            Reorder at
            <input
              inputMode="decimal"
              value={draft.reorderAt}
              onChange={(e) => setDraft({ ...draft, reorderAt: e.target.value.replace(/[^\d.]/g, "") })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="col-span-2 text-xs text-muted sm:col-span-2">
            Unit (optional)
            <input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="packs, sheets, balls…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="col-span-2 flex items-end justify-end gap-2 sm:col-span-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Done
            </Button>
            <Button type="submit" size="sm" loading={add.isPending} disabled={!draft.item.trim()}>
              Add to list
            </Button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <div className="flex gap-1.5">
          {(["all", "low"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                show === k ? "border-brand bg-brand text-white" : "border-border bg-card text-muted hover:text-foreground",
              )}
            >
              {k === "all" ? `Everything (${items.length})` : `To reorder (${low.length})`}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock list yet"
          description="Add the resources your centre has — art supplies, sports gear, games — and how many. Then send the stocktake."
          action={{ label: "Add the first item", onClick: () => setAdding(true) }}
        />
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">Nothing needs reordering.</p>
      ) : (
        groups.map(([category, rows]) => (
          <section key={category} className="overflow-hidden rounded-xl border border-border bg-card">
            <h3 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {category}
            </h3>
            <ul className="divide-y divide-border">
              {rows.map((i) => (
                <StockRow
                  key={i.id}
                  item={i}
                  onChange={(body) => update.mutate({ id: i.id, ...body })}
                  onDelete={() => {
                    if (window.confirm(`Take ${i.item} off the list?`)) remove.mutate(i.id);
                  }}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function StockRow({
  item,
  onChange,
  onDelete,
}: {
  item: StockItem;
  onChange: (body: Partial<StockItem>) => void;
  onDelete: () => void;
}) {
  const low = needsReorder(item);
  const qty = item.qtyOnHand ?? 0;
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", low && "bg-amber-50/70 dark:bg-amber-950/30")}>
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium text-foreground">{item.item}</p>
        <p className="text-2xs text-muted">
          {item.type === "durable" ? "Equipment" : "Runs out"}
          {item.lastCounted ? ` · counted ${fmtDate(item.lastCounted)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`One less ${item.item}`}
          onClick={() => onChange({ qtyOnHand: Math.max(0, qty - 1) })}
          className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          key={`q-${item.qtyOnHand}`}
          aria-label={`How many ${item.item}`}
          inputMode="decimal"
          defaultValue={item.qtyOnHand ?? ""}
          onBlur={(e) => {
            const v = num(e.target.value.replace(/[^\d.]/g, ""));
            if (v !== item.qtyOnHand) onChange({ qtyOnHand: v });
          }}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground"
        />
        <button
          type="button"
          aria-label={`One more ${item.item}`}
          onClick={() => onChange({ qtyOnHand: qty + 1 })}
          className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {item.unit && <span className="text-xs text-muted">{item.unit}</span>}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Reorder at
        <input
          key={`r-${item.reorderAt}`}
          aria-label={`Reorder ${item.item} at`}
          inputMode="decimal"
          defaultValue={item.reorderAt ?? ""}
          onBlur={(e) => {
            const v = num(e.target.value.replace(/[^\d.]/g, ""));
            if (v !== item.reorderAt) onChange({ reorderAt: v });
          }}
          className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground"
        />
      </label>
      {low ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
          Reorder
        </span>
      ) : (
        <span className="w-14" />
      )}
      <button
        type="button"
        aria-label={`Remove ${item.item}`}
        onClick={onDelete}
        className="rounded-lg p-1.5 text-muted hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
