"use client";

/**
 * Materials Orders (Daniel, 21 Oct 2026) — the dashboard version of the
 * Cowork "Term materials: order tracker" spreadsheet.
 *
 *   Centres:   who has replied, HQ lines ordered/received, local buys,
 *              follow-ups, not yet checked, and each centre's cart.
 *   A centre:  every item by week. The coordinator answers "Centre has it?"
 *              (Yes / No / Check) — the item routes itself (in stock, local
 *              buy, HQ order, follow up). Head office marks HQ lines ordered
 *              and moves the cart along; checking it out records the spend
 *              against the centre's budget. Anyone marks deliveries received.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Package, ShoppingCart } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  CART_LABELS,
  REPLY_LABELS,
  REPLY_STATUSES,
  type Action,
  type CentreSummary,
} from "@/lib/materials-orders";

interface Round {
  id: string;
  title: string;
  term: string | null;
  programStart: string | null;
  programEnd: string | null;
  repliesDueAt: string | null;
  status: string;
  notes: string | null;
}
interface Overview {
  rounds: Round[];
  round: Round | null;
  centres: CentreSummary[];
  canOrder: boolean;
}
interface Line {
  id: string;
  week: number | null;
  item: string;
  qty: number | null;
  unit: string | null;
  purpose: string | null;
  ifMissing: string;
  centreHasIt: string | null;
  action: Action;
  orderedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
}
interface Cart {
  id: string;
  retailer: string;
  status: keyof typeof CART_LABELS;
  lineCount: number;
  total: number;
  buyLocally: string | null;
  otherOrder: string | null;
  notes: string | null;
  checkedOutAt: string | null;
  budgetItemId: string | null;
}
interface CentreDetail {
  centre: { replyStatus: string; notes: string | null };
  lines: Line[];
  carts: Cart[];
}

const money = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";

const ACTION_CLS: Record<Action, string> = {
  in_stock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  local_buy: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  hq_order: "bg-brand/10 text-brand",
  follow_up: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  awaiting_reply: "bg-surface text-muted",
};

export function MaterialsOrdersClient() {
  const [roundId, setRoundId] = useState<string | null>(null);
  const [openCentre, setOpenCentre] = useState<string | null>(null);
  const overview = useQuery<Overview>({
    queryKey: ["materials", roundId],
    queryFn: () => fetchApi(`/api/materials${roundId ? `?roundId=${roundId}` : ""}`),
    retry: 2,
  });
  const data = overview.data;
  const centres = useMemo(() => data?.centres ?? [], [data]);
  // A coordinator sees just their centre — open it straight away.
  const shownCentre = openCentre ?? (centres.length === 1 ? centres[0].serviceId : null);

  const totals = useMemo(
    () =>
      centres.reduce(
        (t, c) => ({
          replied: t.replied + (["replied", "nothing_needed"].includes(c.replyStatus) ? 1 : 0),
          hq: t.hq + c.hqLines,
          ordered: t.ordered + c.hqOrdered,
          received: t.received + c.hqReceived,
          local: t.local + c.localBuys,
          follow: t.follow + c.followUps,
          unchecked: t.unchecked + c.notChecked,
          carts: t.carts + c.carts.reduce((s, k) => s + (k.status === "nothing_needed" ? 0 : k.total), 0),
        }),
        { replied: 0, hq: 0, ordered: 0, received: 0, local: 0, follow: 0, unchecked: 0, carts: 0 },
      ),
    [centres],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Materials Orders"
        description="Term program materials: what each centre has, what they buy locally, and what head office orders."
      />

      {overview.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : overview.isError ? (
        <p role="alert" className="text-sm">
          Couldn&apos;t load materials orders: {overview.error.message}
        </p>
      ) : !data?.round ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-muted" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">No materials rounds yet</p>
          <p className="mt-1 text-sm text-muted">
            Cowork creates a round when it sends the term&apos;s materials emails to the centres.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{data.round.title}</p>
              <p className="text-xs text-muted">
                {data.round.programStart ? `Program ${day(data.round.programStart)}` : ""}
                {data.round.programEnd ? ` – ${day(data.round.programEnd)}` : ""}
                {data.round.repliesDueAt ? ` · replies due ${day(data.round.repliesDueAt)}` : ""}
                {data.round.status === "closed" ? " · closed" : ""}
              </p>
            </div>
            {data.rounds.length > 1 && (
              <select
                aria-label="Materials round"
                value={data.round.id}
                onChange={(e) => {
                  setRoundId(e.target.value);
                  setOpenCentre(null);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {data.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
          </section>

          {data.canOrder && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Replied", `${totals.replied} of ${centres.length}`],
                ["HQ lines", `${totals.hq} · ${totals.ordered} ordered · ${totals.received} in`],
                ["Local buys / follow-ups", `${totals.local} / ${totals.follow}`],
                ["Carts", money(totals.carts)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">{k}</p>
                  <p className="text-sm font-semibold text-foreground">{v}</p>
                </div>
              ))}
            </div>
          )}

          <section className="rounded-xl border border-border bg-card divide-y divide-border">
            {centres.map((c) => {
              const open = shownCentre === c.serviceId;
              const cartTotal = c.carts.reduce((s, k) => s + k.total, 0);
              return (
                <div key={c.serviceId}>
                  <button
                    type="button"
                    onClick={() => setOpenCentre(open ? "none" : c.serviceId)}
                    aria-expanded={open}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left hover:bg-surface"
                  >
                    <span className="min-w-[10rem] flex-1">
                      <span className="block text-sm font-medium text-foreground">{c.serviceName}</span>
                      <span className="block text-xs text-muted">
                        {c.state ?? ""} · {REPLY_LABELS[c.replyStatus as keyof typeof REPLY_LABELS] ?? c.replyStatus}
                      </span>
                    </span>
                    <span className="text-xs text-muted">
                      HQ {c.hqLines}
                      {c.hqLines ? ` (${c.hqOrdered} ordered, ${c.hqReceived} in)` : ""} · local {c.localBuys} · follow-up{" "}
                      {c.followUps}
                      {c.notChecked ? ` · ${c.notChecked} not checked` : ""}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {c.carts.length ? `${money(cartTotal)} · ${c.carts.map((k) => CART_LABELS[k.status as keyof typeof CART_LABELS] ?? k.status).join(", ")}` : "No cart"}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                  {open && <CentrePanel roundId={data.round!.id} serviceId={c.serviceId} canOrder={data.canOrder} />}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function CentrePanel({ roundId, serviceId, canOrder }: { roundId: string; serviceId: string; canOrder: boolean }) {
  const qc = useQueryClient();
  const key = ["materials-centre", roundId, serviceId];
  const q = useQuery<CentreDetail>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/materials/${roundId}/centres/${serviceId}`),
    retry: 2,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["materials"] });
  };
  const onError = (e: Error) => toast({ variant: "destructive", description: e.message });
  const line = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => mutateApi(`/api/materials/lines/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: refresh,
    onError,
  });
  const cart = useMutation({
    mutationFn: (v: { id: string; status: string }) => mutateApi(`/api/materials/carts/${v.id}`, { method: "PATCH", body: { status: v.status } }),
    onSuccess: (_r, v) => {
      if (v.status === "checked_out") toast({ description: "Checked out — the total is recorded against this centre's budget." });
      refresh();
    },
    onError,
  });
  const centre = useMutation({
    mutationFn: (body: Record<string, unknown>) => mutateApi(`/api/materials/${roundId}/centres/${serviceId}`, { method: "PATCH", body }),
    onSuccess: refresh,
    onError,
  });

  if (q.isPending) return <p className="px-4 pb-4 text-sm text-muted">Loading items…</p>;
  if (q.isError) return <p className="px-4 pb-4 text-sm">Couldn&apos;t load: {q.error.message}</p>;
  const { lines, carts } = q.data;
  const weeks = [...new Set(lines.map((l) => l.week ?? 0))].sort((a, b) => a - b);
  const busy = line.isPending || cart.isPending || centre.isPending;

  return (
    <div className="space-y-4 border-t border-border bg-surface/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`reply-${serviceId}`} className="text-sm font-medium">
          Reply
        </label>
        <select
          id={`reply-${serviceId}`}
          value={q.data.centre.replyStatus}
          disabled={busy}
          onChange={(e) => centre.mutate({ replyStatus: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          {REPLY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REPLY_LABELS[s]}
            </option>
          ))}
        </select>
        {q.data.centre.notes && <p className="w-full text-xs text-muted">{q.data.centre.notes}</p>}
      </div>

      {carts.map((k) => (
        <div key={k.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-brand" aria-hidden />
            <span className="text-sm font-semibold">
              {k.retailer} cart · {k.lineCount} line{k.lineCount === 1 ? "" : "s"} · {money(k.total)}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-semibold">{CART_LABELS[k.status] ?? k.status}</span>
            {k.budgetItemId && (
              <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Recorded in the budget
              </span>
            )}
          </div>
          {k.buyLocally && <p className="text-xs text-muted">Buy locally: {k.buyLocally}</p>}
          {k.otherOrder && <p className="text-xs text-muted">Food order: {k.otherOrder}</p>}
          {k.notes && <p className="text-xs text-muted">{k.notes}</p>}
          {canOrder && (
            <div className="flex flex-wrap gap-2 pt-1">
              {k.status !== "checked_out" && k.status !== "received" && k.status !== "nothing_needed" && (
                <Button size="sm" disabled={busy} onClick={() => cart.mutate({ id: k.id, status: "checked_out" })}>
                  Mark checked out
                </Button>
              )}
              {k.status === "checked_out" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => cart.mutate({ id: k.id, status: "received" })}>
                  Mark received
                </Button>
              )}
              {k.status === "draft" && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => cart.mutate({ id: k.id, status: "hold" })}>
                  Hold
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      {weeks.map((w) => (
        <div key={w} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{w ? `Week ${w}` : "Any week"}</h4>
          <ul className="space-y-2">
            {lines
              .filter((l) => (l.week ?? 0) === w)
              .map((l) => (
                <li key={l.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {l.item}
                        {l.qty ? <span className="font-normal text-muted"> · {l.qty}{l.unit ? ` ${l.unit}` : ""}</span> : null}
                      </p>
                      {l.purpose && <p className="text-xs text-muted">For: {l.purpose}</p>}
                      {l.notes && <p className="text-xs text-muted">{l.notes}</p>}
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold", ACTION_CLS[l.action])}>
                      {ACTION_LABELS[l.action] ?? l.action}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">Centre has it?</span>
                    {(["yes", "no", "check"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={busy}
                        aria-pressed={l.centreHasIt === v}
                        onClick={() => line.mutate({ id: l.id, body: { centreHasIt: l.centreHasIt === v ? null : v } })}
                        className={cn(
                          "min-h-8 rounded-md border px-2.5 font-medium",
                          l.centreHasIt === v ? "border-brand bg-brand text-white" : "border-border text-foreground hover:bg-surface",
                        )}
                      >
                        {v === "yes" ? "Yes" : v === "no" ? "No" : "Check"}
                      </button>
                    ))}
                    {l.action === "hq_order" && canOrder && (
                      <label className="ml-2 flex items-center gap-1.5">
                        <input type="checkbox" checked={!!l.orderedAt} disabled={busy} onChange={(e) => line.mutate({ id: l.id, body: { ordered: e.target.checked } })} />
                        Ordered{l.orderedAt ? ` ${day(l.orderedAt)}` : ""}
                      </label>
                    )}
                    {(l.action === "hq_order" || l.action === "local_buy") && (
                      <label className="ml-2 flex items-center gap-1.5">
                        <input type="checkbox" checked={!!l.receivedAt} disabled={busy} onChange={(e) => line.mutate({ id: l.id, body: { received: e.target.checked } })} />
                        {l.action === "local_buy" ? "Bought" : "Received"}
                        {l.receivedAt ? ` ${day(l.receivedAt)}` : ""}
                      </label>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {lines.length === 0 && <p className="text-sm text-muted">No items for this centre in this round.</p>}
    </div>
  );
}
