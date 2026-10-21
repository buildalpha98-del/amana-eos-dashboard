"use client";

/**
 * Amana HQ (Daniel, 21 Oct 2026) — "like OWNA HQ, but Amana HQ": every
 * number head office watches, in one place.
 *
 *   Network   the master accounts tracker's Network Summary — selected
 *             week, term to date, resources month (+ feedback, stock, bank)
 *   Centres   one centre's tab: weekly numbers for the term, resources,
 *             Woolies orders, program feedback, stock, budget bank
 *   Families  the parent journey's follow-ups (replies, first days, quiet
 *             families, OWNA setup)
 *   Materials the term program materials round
 *   Data      what Cowork has sent and when, plus live attendance figures
 *
 * Cowork fills it all (docs/cowork/amana-hq-cowork-setup.md).
 */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { EnrolmentFollowUps } from "@/components/enrolments/EnrolmentFollowUps";
import { BudgetBankCard } from "@/components/services/BudgetBankCard";
import { CentreBreakdown } from "@/components/financials/CentreBreakdown";
import { MaterialsOrdersClient } from "@/app/(dashboard)/materials/MaterialsOrdersClient";
import type { HqMonthRow, HqTermRow, HqWeekRow } from "@/lib/hq-summary";

const TABS = [
  ["network", "Network"],
  ["centres", "Centres"],
  ["families", "Families"],
  ["materials", "Materials"],
  ["data", "Data"],
] as const;
type Tab = (typeof TABS)[number][0];

interface Summary {
  week: string;
  termStart: string;
  month: string;
  weeksAvailable: string[];
  thresholds: { amber: number; red: number };
  weekRows: HqWeekRow[];
  termRows: HqTermRow[];
  monthRows: HqMonthRow[];
}

const $ = (n: number | null | undefined, cents = false) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 1000) / 10}%`);
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

export function HqClient() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "network") as Tab;
  const centre = params.get("centre");
  const go = (next: { tab?: Tab; centre?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    if (next.tab) q.set("tab", next.tab);
    if (next.centre !== undefined) {
      if (next.centre) q.set("centre", next.centre);
      else q.delete("centre");
    }
    router.replace(`/hq?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Amana HQ"
        description="Bookings, revenue, staff cost, food and resources budgets, families and materials — every centre, in one place. Cowork keeps it up to date from OWNA."
      />
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1" role="tablist" aria-label="Amana HQ">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => go({ tab: k })}
            className={cn(
              "min-h-9 shrink-0 rounded-lg px-4 text-sm font-medium",
              tab === k ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </nav>

      {tab === "network" && <NetworkTab onCentre={(id) => go({ tab: "centres", centre: id })} />}
      {tab === "centres" && <CentresTab centre={centre} onCentre={(id) => go({ centre: id })} />}
      {tab === "families" && <EnrolmentFollowUps onOpen={(id) => router.push(`/enrolments?id=${id}`)} />}
      {tab === "materials" && <MaterialsOrdersClient embedded />}
      {tab === "data" && <DataTab />}
    </div>
  );
}

// ── Network ───────────────────────────────────────────────────

function useSummary(week: string | null, month: string | null, termStart: string | null) {
  const q = new URLSearchParams();
  if (week) q.set("week", week);
  if (month) q.set("month", month);
  if (termStart) q.set("termStart", termStart);
  return useQuery<Summary>({ queryKey: ["hq", week, month, termStart], queryFn: () => fetchApi(`/api/hq?${q.toString()}`), retry: 2 });
}

function staffCls(p: number | null, t: Summary["thresholds"]) {
  if (p == null) return "";
  if (p >= t.red) return "text-red-600 dark:text-red-400 font-semibold";
  if (p >= t.amber) return "text-amber-700 dark:text-amber-300 font-semibold";
  return "text-emerald-700 dark:text-emerald-300";
}

function NetworkTab({ onCentre }: { onCentre: (id: string) => void }) {
  const [week, setWeek] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [termStart, setTermStart] = useState<string | null>(null);
  const q = useSummary(week, month, termStart);
  const d = q.data;
  const names = useMemo(() => new Map((d?.weekRows ?? []).map((r) => [r.serviceId, r])), [d]);

  if (q.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (q.isError || !d) return <p className="text-sm">Couldn&apos;t load: {q.error?.message}</p>;

  const logged = d.weekRows.filter((r) => r.logged);
  const tot = logged.reduce(
    (t, r) => ({
      bsc: t.bsc + r.bscBookings,
      asc: t.asc + r.ascBookings,
      rev: t.rev + r.revenue,
      staff: t.staff + (r.staffCost ?? 0),
      groc: t.groc + r.groceryBudget,
      food: t.food + r.foodSpend,
    }),
    { bsc: 0, asc: 0, rev: 0, staff: 0, groc: 0, food: 0 },
  );
  const bank = d.monthRows.reduce((t, r) => t + r.bank, 0);
  const nameOf = (id: string) => names.get(id)?.name ?? "";
  const stateOf = (id: string) => names.get(id)?.state ?? "";
  const CentreCell = ({ id }: { id: string }) => (
    <td className="p-2.5">
      <button type="button" onClick={() => onCentre(id)} className="text-left font-medium text-brand hover:underline">
        {nameOf(id)}
      </button>
      <span className="ml-1.5 text-xs text-muted">{stateOf(id)}</span>
    </td>
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="text-sm">
          <span className="block text-xs text-muted">Week starting</span>
          <select
            value={d.week}
            onChange={(e) => setWeek(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {[d.week, ...d.weeksAvailable.filter((w) => w !== d.week)].map((w) => (
              <option key={w} value={w}>
                {dayLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">Resources month</span>
          <input type="month" value={d.month} onChange={(e) => setMonth(e.target.value || null)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">Term to date from</span>
          <input type="date" value={d.termStart} onChange={(e) => setTermStart(e.target.value || null)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <p className="ml-auto text-xs text-muted">
          {logged.length} of {d.weekRows.length} centres logged this week
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Bookings", `${tot.bsc + tot.asc}`, `${tot.bsc} Rise and Shine · ${tot.asc} Afternoons`],
          ["Revenue", $(tot.rev), "booked fees before CCS"],
          ["Staff cost", $(tot.staff), `${pct(tot.rev ? tot.staff / tot.rev : null)} of revenue, incl. super`],
          ["Margin after staff", $(tot.rev - tot.staff), "service contribution, not profit"],
          ["Groceries", `${$(tot.food)} of ${$(tot.groc)}`, "Woolies spend vs budget"],
          ["Budget bank", $(bank), "unspent budget, all centres"],
        ].map(([k, v, s]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-lg font-semibold text-foreground">{v}</p>
            <p className="text-2xs text-muted">{s}</p>
          </div>
        ))}
      </div>

      <Table
        title={`Selected week — ${dayLabel(d.week)}`}
        head={["Centre", "Rise and Shine", "Afternoons", "Total", "Change", "Revenue", "Staff (incl. super)", "Staff %", "Margin after staff", "Grocery budget", "Woolies spend", "Over / (under)"]}
      >
        {d.weekRows.map((r) => (
          <tr key={r.serviceId} className={cn("border-b border-border", !r.logged && "text-muted")}>
            <CentreCell id={r.serviceId} />
            <Num v={r.logged ? r.bscBookings : null} />
            <Num v={r.logged ? r.ascBookings : null} />
            <Num v={r.logged ? r.totalBookings : null} bold />
            <td className={cn("p-2.5 text-right", r.changeVsPrev != null && r.changeVsPrev < 0 && "text-red-600 dark:text-red-400")}>
              {r.changeVsPrev == null ? "" : r.changeVsPrev > 0 ? `+${r.changeVsPrev}` : r.changeVsPrev}
            </td>
            <td className="p-2.5 text-right">{r.logged ? $(r.revenue, true) : "not logged"}</td>
            <td className="p-2.5 text-right">{$(r.staffCost, true)}</td>
            <td className={cn("p-2.5 text-right", staffCls(r.staffPct, d.thresholds))}>{pct(r.staffPct)}</td>
            <td className={cn("p-2.5 text-right", r.margin != null && r.margin < 0 && "text-red-600 dark:text-red-400")}>{$(r.margin, true)}</td>
            <td className="p-2.5 text-right">{$(r.groceryBudget, true)}</td>
            <td className="p-2.5 text-right">{$(r.foodSpend, true)}</td>
            <td className={cn("p-2.5 text-right", (r.groceryOverUnder ?? 0) > 0 && "text-red-600 dark:text-red-400")}>{$(r.groceryOverUnder, true)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className="p-2.5">Network total</td>
          <Num v={tot.bsc} />
          <Num v={tot.asc} />
          <Num v={tot.bsc + tot.asc} />
          <td />
          <td className="p-2.5 text-right">{$(tot.rev, true)}</td>
          <td className="p-2.5 text-right">{$(tot.staff, true)}</td>
          <td className={cn("p-2.5 text-right", staffCls(tot.rev ? tot.staff / tot.rev : null, d.thresholds))}>{pct(tot.rev ? tot.staff / tot.rev : null)}</td>
          <td className="p-2.5 text-right">{$(tot.rev - tot.staff, true)}</td>
          <td className="p-2.5 text-right">{$(tot.groc, true)}</td>
          <td className="p-2.5 text-right">{$(tot.food, true)}</td>
          <td />
        </tr>
      </Table>
      {d.weekRows.some((r) => r.notes) && (
        <ul className="space-y-1 text-xs text-muted">
          {d.weekRows
            .filter((r) => r.notes)
            .map((r) => (
              <li key={r.serviceId}>
                <strong className="text-foreground">{r.name}:</strong> {r.notes}
              </li>
            ))}
        </ul>
      )}

      <Table
        title={`Term to date — from ${dayLabel(d.termStart)}`}
        head={["Centre", "Weeks logged", "Avg weekly bookings", "Rise and Shine share", "Revenue", "Staff (incl. super)", "Staff %", "Margin after staff", "Woolies budget", "Woolies spend", "Over / (under)", "Orders over budget"]}
      >
        {d.termRows.map((r) => (
          <tr key={r.serviceId} className="border-b border-border">
            <CentreCell id={r.serviceId} />
            <Num v={r.weeksLogged} />
            <Num v={r.avgWeeklyBookings} />
            <td className="p-2.5 text-right">{pct(r.bscShare)}</td>
            <td className="p-2.5 text-right">{$(r.revenue, true)}</td>
            <td className="p-2.5 text-right">{$(r.staffCost, true)}</td>
            <td className={cn("p-2.5 text-right", staffCls(r.staffPct, d.thresholds))}>{pct(r.staffPct)}</td>
            <td className={cn("p-2.5 text-right", r.margin < 0 && "text-red-600 dark:text-red-400")}>{$(r.margin, true)}</td>
            <td className="p-2.5 text-right">{$(r.wooliesBudget, true)}</td>
            <td className="p-2.5 text-right">{$(r.wooliesSpend, true)}</td>
            <td className={cn("p-2.5 text-right", r.wooliesOverUnder > 0 && "text-red-600 dark:text-red-400")}>{$(r.wooliesOverUnder, true)}</td>
            <Num v={r.ordersOverBudget} />
          </tr>
        ))}
      </Table>

      <Table
        title={`Resources (${new Date(`${d.month}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}) and program feedback (week of ${dayLabel(d.week)})`}
        head={["Centre", "Avg weekly bookings", "Resource budget", "Resource spend", "Remaining / (over)", "Feedback received", "Reflections", "Stock to reorder", "Budget bank", "OWNA data"]}
      >
        {d.monthRows.map((r) => (
          <tr key={r.serviceId} className="border-b border-border">
            <CentreCell id={r.serviceId} />
            <Num v={r.avgWeeklyBookings} />
            <td className="p-2.5 text-right">{$(r.resourceBudget)}</td>
            <td className="p-2.5 text-right">{$(r.resourceSpend, true)}</td>
            <td className={cn("p-2.5 text-right", r.remaining < 0 && "text-red-600 dark:text-red-400")}>{$(r.remaining, true)}</td>
            <td className="p-2.5 text-center">{r.feedbackReceived == null ? "—" : r.feedbackReceived ? "Yes" : "No"}</td>
            <td className="p-2.5 text-center capitalize">{r.reflections ?? "—"}</td>
            <td className={cn("p-2.5 text-right", r.stockToReorder > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>{r.stockToReorder}</td>
            <td className="p-2.5 text-right">{$(r.bank, true)}</td>
            <td className="p-2.5 text-xs text-muted">{ago(r.dataAsOf)}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted">
        Revenue is booked fees from OWNA before CCS (not cash received). Staff cost is OWNA timesheet cost including super —
        head office wages, workers comp, payroll tax and overheads aren&apos;t included, so margin after staff is each
        centre&apos;s contribution, not profit. Staff % is amber from {pct(d.thresholds.amber)} and red from {pct(d.thresholds.red)}.
      </p>
    </div>
  );
}

function Num({ v, bold }: { v: number | null; bold?: boolean }) {
  return <td className={cn("p-2.5 text-right", bold && "font-semibold text-foreground")}>{v ?? ""}</td>;
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border p-3 font-heading text-sm font-semibold text-foreground">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              {head.map((h, i) => (
                <th key={h} className={cn("p-2.5 font-medium", i > 0 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

// ── Centres ───────────────────────────────────────────────────

interface CentreData {
  service: { id: string; name: string; code: string; state: string | null };
  termStart: string;
  weeks: {
    weekStart: string;
    termWeek: string | null;
    bscBookings: number;
    ascBookings: number;
    bscRevenue: number;
    ascRevenue: number;
    otherRevenue: number;
    totalRevenue: number;
    staffCost: number | null;
    notes: string | null;
  }[];
  orders: { id: string; orderNo: string; deliveryDate: string; weekStart: string; weeksCovered: number; budget: number | null; foodSpend: number; totalPaid: number | null; notes: string | null }[];
  resources: { id: string; name: string; amount: number; category: string; date: string; notes: string | null; fundedFromBank: boolean }[];
  feedback: { id: string; weekStart: string; termWeek: string | null; feedbackReceived: boolean; reflections: string; kidsEnjoyed: string | null; didntWork: string | null; childrensIdeas: string | null; resourcesRequested: string | null; notes: string | null }[];
  stock: { id: string; category: string | null; item: string; type: string; qtyOnHand: number | null; unit: string | null; reorderAt: number | null; lastCounted: string | null; timesReplacedThisYear: number; notes: string | null }[];
}

function CentresTab({ centre, onCentre }: { centre: string | null; onCentre: (id: string) => void }) {
  const list = useSummary(null, null, null);
  const centres = list.data?.weekRows ?? [];
  const id = centre ?? centres[0]?.serviceId ?? null;
  const q = useQuery<CentreData>({
    queryKey: ["hq-centre", id],
    queryFn: () => fetchApi(`/api/hq/centres/${id}`),
    enabled: !!id,
    retry: 2,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {centres.map((c) => (
          <button
            key={c.serviceId}
            type="button"
            onClick={() => onCentre(c.serviceId)}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-medium",
              c.serviceId === id ? "border-brand bg-brand text-white" : "border-border text-foreground hover:bg-surface",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      {!id || q.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : q.isError || !q.data ? (
        <p className="text-sm">Couldn&apos;t load: {q.error?.message}</p>
      ) : (
        <CentreDetail d={q.data} />
      )}
    </div>
  );
}

function CentreDetail({ d }: { d: CentreData }) {
  const t = d.weeks.reduce(
    (a, w) => ({
      bsc: a.bsc + w.bscBookings,
      asc: a.asc + w.ascBookings,
      bscR: a.bscR + w.bscRevenue,
      ascR: a.ascR + w.ascRevenue,
      oth: a.oth + w.otherRevenue,
      rev: a.rev + w.totalRevenue,
      staff: a.staff + (w.staffCost ?? 0),
    }),
    { bsc: 0, asc: 0, bscR: 0, ascR: 0, oth: 0, rev: 0, staff: 0 },
  );
  const toReorder = d.stock.filter((s) => s.qtyOnHand != null && s.reorderAt != null && s.qtyOnHand <= s.reorderAt);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">{d.service.name.replace(/^Amana OSHC\s+/i, "")}</h2>
        <span className="text-sm text-muted">{d.service.state} · term from {dayLabel(d.termStart)}</span>
        <Link href={`/services/${d.service.id}`} className="ml-auto text-sm text-brand underline">
          Open the centre →
        </Link>
      </div>

      <Table title="Weekly numbers" head={["Week", "Rise and Shine", "Afternoons", "Total", "R&S revenue", "Afternoons revenue", "Holiday Quest / other", "Total revenue", "Staff (incl. super)", "Staff %", "Margin after staff"]}>
        {d.weeks.map((w) => {
          const total = w.bscBookings + w.ascBookings;
          const p = w.staffCost != null && w.totalRevenue ? w.staffCost / w.totalRevenue : null;
          return (
            <tr key={w.weekStart} className="border-b border-border">
              <td className="p-2.5">
                <span className="font-medium">{w.termWeek ?? ""}</span> <span className="text-xs text-muted">{dayLabel(w.weekStart.slice(0, 10))}</span>
              </td>
              <Num v={w.bscBookings} />
              <Num v={w.ascBookings} />
              <Num v={total} bold />
              <td className="p-2.5 text-right">{$(w.bscRevenue, true)}</td>
              <td className="p-2.5 text-right">{$(w.ascRevenue, true)}</td>
              <td className="p-2.5 text-right">{$(w.otherRevenue, true)}</td>
              <td className="p-2.5 text-right font-medium">{$(w.totalRevenue, true)}</td>
              <td className="p-2.5 text-right">{$(w.staffCost, true)}</td>
              <td className={cn("p-2.5 text-right", staffCls(p, { amber: 0.5, red: 0.7 }))}>{pct(p)}</td>
              <td className="p-2.5 text-right">{w.staffCost != null ? $(w.totalRevenue - w.staffCost, true) : "—"}</td>
            </tr>
          );
        })}
        {d.weeks.length > 0 && (
          <tr className="font-semibold">
            <td className="p-2.5">Term total</td>
            <Num v={t.bsc} />
            <Num v={t.asc} />
            <Num v={t.bsc + t.asc} />
            <td className="p-2.5 text-right">{$(t.bscR, true)}</td>
            <td className="p-2.5 text-right">{$(t.ascR, true)}</td>
            <td className="p-2.5 text-right">{$(t.oth, true)}</td>
            <td className="p-2.5 text-right">{$(t.rev, true)}</td>
            <td className="p-2.5 text-right">{$(t.staff, true)}</td>
            <td className="p-2.5 text-right">{pct(t.rev ? t.staff / t.rev : null)}</td>
            <td className="p-2.5 text-right">{$(t.rev - t.staff, true)}</td>
          </tr>
        )}
        {d.weeks.length === 0 && (
          <tr>
            <td colSpan={11} className="p-4 text-center text-sm text-muted">
              No weeks logged yet — Cowork adds each week on Monday.
            </td>
          </tr>
        )}
      </Table>

      <div className="grid gap-5 lg:grid-cols-2">
        <BudgetBankCard serviceId={d.service.id} />
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">Woolies orders</h3>
          {d.orders.length === 0 ? (
            <p className="text-sm text-muted">No orders logged this term.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                  <span className="font-medium">{dayLabel(o.deliveryDate.slice(0, 10))}</span>
                  <span className="text-muted">#{o.orderNo}{o.weeksCovered > 1 ? ` · ${o.weeksCovered} weeks` : ""}</span>
                  <span className="ml-auto">
                    {$(o.foodSpend, true)} of {$(o.budget, true)}
                  </span>
                  <span className={cn("text-xs font-semibold", o.budget != null && o.foodSpend > o.budget ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300")}>
                    {o.budget == null ? "" : o.foodSpend > o.budget ? "Over" : "Within"}
                  </span>
                  {o.notes && <span className="w-full text-xs text-muted">{o.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">Resource orders</h3>
          {d.resources.length === 0 ? (
            <p className="text-sm text-muted">Nothing bought this term.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {d.resources.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted">{dayLabel(r.date.slice(0, 10))}</span>
                  <span className="ml-auto">{$(r.amount, true)}</span>
                  {r.fundedFromBank && <span className="text-xs text-muted">from the bank</span>}
                  {r.notes && <span className="w-full text-xs text-muted">{r.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">Program feedback</h3>
          {d.feedback.length === 0 ? (
            <p className="text-sm text-muted">No feedback logged this term.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {d.feedback.map((f) => (
                <li key={f.id}>
                  <p className="font-medium">
                    {f.termWeek ?? dayLabel(f.weekStart.slice(0, 10))}{" "}
                    <span className="text-xs font-normal text-muted">
                      feedback {f.feedbackReceived ? "received" : "not received"} · reflections {f.reflections}
                    </span>
                  </p>
                  {f.kidsEnjoyed && <p><span className="text-muted">Kids enjoyed:</span> {f.kidsEnjoyed}</p>}
                  {f.didntWork && <p><span className="text-muted">Didn&apos;t work:</span> {f.didntWork}</p>}
                  {f.childrensIdeas && <p><span className="text-muted">Children&apos;s ideas:</span> {f.childrensIdeas}</p>}
                  {f.resourcesRequested && <p><span className="text-muted">Resources requested:</span> {f.resourcesRequested}</p>}
                  {f.notes && <p className="text-xs text-muted">{f.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Stock list {toReorder.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{toReorder.length} to reorder</span>}
        </h3>
        {d.stock.length === 0 ? (
          <p className="text-sm text-muted">No stocktake logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  {["Item", "Category", "Type", "On hand", "Reorder at", "Last counted", "Replaced this year"].map((h) => (
                    <th key={h} className="p-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.stock.map((s) => {
                  const low = s.qtyOnHand != null && s.reorderAt != null && s.qtyOnHand <= s.reorderAt;
                  return (
                    <tr key={s.id} className={cn("border-b border-border", low && "bg-amber-50 dark:bg-amber-950/30")}>
                      <td className="p-2 font-medium">{s.item}</td>
                      <td className="p-2">{s.category ?? ""}</td>
                      <td className="p-2 capitalize">{s.type}</td>
                      <td className="p-2">
                        {s.qtyOnHand ?? "—"} {s.unit ?? ""}
                      </td>
                      <td className="p-2">{s.reorderAt ?? "—"}</td>
                      <td className="p-2">{s.lastCounted ? dayLabel(s.lastCounted.slice(0, 10)) : ""}</td>
                      <td className="p-2">{s.timesReplacedThisYear}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────

interface DataRuns {
  runs: { id: string; serviceName: string; runType: string | null; createdAt: string; children: number; attendance: number; signedIn: number; matched: number; errors: unknown }[];
  centres: { serviceId: string; name: string; lastOwnaRun: string | null; lastWeekLogged: string | null; accountsUpdatedAt: string | null }[];
}

function DataTab() {
  const q = useQuery<DataRuns>({ queryKey: ["hq-data-runs"], queryFn: () => fetchApi("/api/hq/data-runs"), retry: 2 });
  return (
    <div className="space-y-5">
      {q.data && (
        <Table title="What Cowork has sent" head={["Centre", "Last OWNA data run", "Last week logged", "Accounts updated"]}>
          {q.data.centres.map((c) => (
            <tr key={c.serviceId} className="border-b border-border">
              <td className="p-2.5 font-medium">{c.name}</td>
              <td className="p-2.5 text-right">{ago(c.lastOwnaRun)}</td>
              <td className="p-2.5 text-right">{c.lastWeekLogged ? dayLabel(c.lastWeekLogged.slice(0, 10)) : "—"}</td>
              <td className="p-2.5 text-right">{ago(c.accountsUpdatedAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      {q.data && q.data.runs.length > 0 && (
        <Table title="Recent OWNA data runs" head={["Centre", "When", "Run", "Children", "Sessions", "Signed in", "Matched to enrolments", "Errors"]}>
          {q.data.runs.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="p-2.5 font-medium">{r.serviceName}</td>
              <td className="p-2.5 text-right">{new Date(r.createdAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
              <td className="p-2.5 text-right">{r.runType === "end_of_week" ? "End of week" : r.runType === "midweek" ? "Midweek" : "Ad hoc"}</td>
              <Num v={r.children} />
              <Num v={r.attendance} />
              <Num v={r.signedIn} />
              <Num v={r.matched} />
              <td className="p-2.5 text-right text-xs">{Array.isArray(r.errors) && r.errors.length ? (r.errors as string[]).join("; ") : ""}</td>
            </tr>
          ))}
        </Table>
      )}
      <CentreBreakdown />
    </div>
  );
}
