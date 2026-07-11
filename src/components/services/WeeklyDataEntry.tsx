"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWeekStart } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Save, ChevronLeft, ChevronRight, DollarSign } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface WeeklyRecord {
  id: string;
  periodStart: string;
  bscRevenue: number;
  ascRevenue: number;
  vcRevenue: number;
  totalRevenue: number;
  staffCosts: number;
  foodCosts: number;
  suppliesCosts: number;
  otherCosts: number;
  totalCosts: number;
  grossProfit: number;
  margin: number;
  bscAttendance: number;
  ascAttendance: number;
  vcAttendance: number;
  bscEnrolments: number;
  ascEnrolments: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function WeeklyDataEntry({
  serviceId,
  bscRate,
  ascRate,
  vcRate,
}: {
  serviceId: string;
  bscRate: number;
  ascRate: number;
  vcRate: number;
}) {
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeek = getWeekStart();
  const selectedWeek = new Date(currentWeek);
  selectedWeek.setDate(selectedWeek.getDate() - weekOffset * 7);
  const weekKey = selectedWeek.toISOString().split("T")[0];

  // Attendance state — split per session into permanent (recurring)
  // + casual. Server stores totals + permanent counts where the
  // column exists.
  const [bscRecurring, setBscRecurring] = useState(0);
  const [bscCasual, setBscCasual] = useState(0);
  const [ascRecurring, setAscRecurring] = useState(0);
  const [ascCasual, setAscCasual] = useState(0);
  // 2026-06-05: Holiday Quest (Vacation Care) gets the same
  // recurring + casual split as the BSC/ASC sessions so coordinators
  // can forecast permanent bookings vs walk-ins separately.
  const [vcRecurring, setVcRecurring] = useState(0);
  const [vcCasual, setVcCasual] = useState(0);

  // Costs state
  const [staffCosts, setStaffCosts] = useState(0);
  const [foodCosts, setFoodCosts] = useState(0);
  const [suppliesCosts, setSuppliesCosts] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);

  // Fetch existing data
  const { data: records } = useQuery<WeeklyRecord[]>({
    queryKey: ["weekly-data", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/weekly-data`),
    retry: 2,
    staleTime: 30_000,
  });

  // Live calculation
  const bscTotal = bscRecurring + bscCasual;
  const ascTotal = ascRecurring + ascCasual;
  const vcTotal = vcRecurring + vcCasual;
  const estBscRevenue = bscTotal * bscRate * 5;
  const estAscRevenue = ascTotal * ascRate * 5;
  const estVcRevenue = vcTotal * vcRate * 5;
  const estTotalRevenue = estBscRevenue + estAscRevenue + estVcRevenue;
  const totalCostsVal = staffCosts + foodCosts + suppliesCosts + otherCosts;
  const estProfit = estTotalRevenue - totalCostsVal;
  const estMargin = estTotalRevenue > 0 ? (estProfit / estTotalRevenue) * 100 : 0;

  const submitWeekly = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/weekly-data`, {
        method: "POST",
        body: {
          weekOf: selectedWeek.toISOString(),
          bscRecurring,
          bscCasual,
          ascRecurring,
          ascCasual,
          // 2026-06-05: VC (Holiday Quest) now splits into
          // recurring + casual to match the BSC/ASC fields. The
          // server sums these into vcAttendance for storage.
          vcRecurring,
          vcCasual,
          staffCosts,
          foodCosts,
          suppliesCosts,
          otherCosts,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-data", serviceId] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
      queryClient.invalidateQueries({ queryKey: ["service", serviceId] });
      // 2026-06-05: refresh the Finance → Budget tab so the grocery
      // spend + monthly budget cards reflect the new attendance.
      queryClient.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const weekLabel = selectedWeek.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Week Selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="p-1.5 rounded-lg border border-border text-muted hover:text-muted hover:border-border"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            Week of {weekLabel}
          </p>
          {weekOffset === 0 && (
            <p className="text-2xs text-brand font-medium">Current Week</p>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
          disabled={weekOffset === 0}
          className={cn(
            "p-1.5 rounded-lg border border-border",
            weekOffset === 0 ? "text-border cursor-not-allowed" : "text-muted hover:text-muted hover:border-border"
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Attendance Grid — labels use the friendly session names
          (Rise and Shine / Amana Afternoons / Holiday Quest) so the
          form reads the same way Daniel describes sessions out loud.
          Each session splits into permanent (recurring) + casual. */}
      {/* 2026-06-05 (revised): per session, inputs are per-day averages
          (permanent + casual) and a "Weekly total bookings" line is
          shown directly beneath so coordinators see exactly what the
          Finance → Budget breakdown will read. Weekly total =
          (permanent + casual) × 5 weekdays. */}
      <div>
        <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Bookings (avg per day → weekly total)
        </h4>

        {/* Rise and Shine (BSC) */}
        <p className="text-[11px] font-semibold text-foreground/80 mt-1 mb-1.5">
          Rise and Shine
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Permanent (per day)
            </label>
            <input
              type="number"
              min={0}
              value={bscRecurring === 0 ? "" : bscRecurring}
              onChange={(e) => setBscRecurring(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Casual (per day)
            </label>
            <input
              type="number"
              min={0}
              value={bscCasual === 0 ? "" : bscCasual}
              onChange={(e) => setBscCasual(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <p
          className="text-[11px] text-muted mt-1 mb-3"
          data-testid="weekly-total-bsc"
        >
          Weekly total bookings:{" "}
          <span className="font-semibold text-foreground">
            {bscTotal * 5}
          </span>{" "}
          <span className="text-muted/70">
            ({bscRecurring} permanent + {bscCasual} casual × 5 days)
          </span>
        </p>

        {/* Amana Afternoons (ASC) */}
        <p className="text-[11px] font-semibold text-foreground/80 mt-1 mb-1.5">
          Amana Afternoons
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Permanent (per day)
            </label>
            <input
              type="number"
              min={0}
              value={ascRecurring === 0 ? "" : ascRecurring}
              onChange={(e) => setAscRecurring(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Casual (per day)
            </label>
            <input
              type="number"
              min={0}
              value={ascCasual === 0 ? "" : ascCasual}
              onChange={(e) => setAscCasual(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <p
          className="text-[11px] text-muted mt-1 mb-3"
          data-testid="weekly-total-asc"
        >
          Weekly total bookings:{" "}
          <span className="font-semibold text-foreground">
            {ascTotal * 5}
          </span>{" "}
          <span className="text-muted/70">
            ({ascRecurring} permanent + {ascCasual} casual × 5 days)
          </span>
        </p>

        {/* Holiday Quest (VC) — new 2026-06-05. Mirrors BSC/ASC so
            coordinators can forecast permanent vs walk-in bookings
            for school-holiday weeks. */}
        <p className="text-[11px] font-semibold text-foreground/80 mt-1 mb-1.5">
          Holiday Quest
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Permanent (per day)
            </label>
            <input
              type="number"
              min={0}
              value={vcRecurring === 0 ? "" : vcRecurring}
              onChange={(e) => setVcRecurring(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">
              Casual (per day)
            </label>
            <input
              type="number"
              min={0}
              value={vcCasual === 0 ? "" : vcCasual}
              onChange={(e) => setVcCasual(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <p
          className="text-[11px] text-muted mt-1"
          data-testid="weekly-total-vc"
        >
          Weekly total bookings:{" "}
          <span className="font-semibold text-foreground">
            {vcTotal * 5}
          </span>{" "}
          <span className="text-muted/70">
            ({vcRecurring} permanent + {vcCasual} casual × 5 days)
          </span>
        </p>
      </div>

      {/* Costs Grid */}
      <div>
        <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Weekly Costs ($)
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-2xs text-muted block mb-0.5">Staff</label>
            <input
              type="number"
              min={0}
              value={staffCosts === 0 ? "" : staffCosts}
              onChange={(e) => setStaffCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">Food</label>
            <input
              type="number"
              min={0}
              value={foodCosts === 0 ? "" : foodCosts}
              onChange={(e) => setFoodCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">Supplies</label>
            <input
              type="number"
              min={0}
              value={suppliesCosts === 0 ? "" : suppliesCosts}
              onChange={(e) => setSuppliesCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-2xs text-muted block mb-0.5">Other</label>
            <input
              type="number"
              min={0}
              value={otherCosts === 0 ? "" : otherCosts}
              onChange={(e) => setOtherCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Revenue Preview */}
      <div className="bg-brand/5 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-brand" />
          <h4 className="text-xs font-semibold text-brand uppercase">Revenue Preview</h4>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">Rise &amp; Shine ({bscTotal} × ${bscRate} × 5d)</span>
          <span className="font-medium text-foreground/80">{formatCurrency(estBscRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">Afternoons ({ascTotal} × ${ascRate} × 5d)</span>
          <span className="font-medium text-foreground/80">{formatCurrency(estAscRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">Holiday Quest ({vcTotal} × ${vcRate} × 5d)</span>
          <span className="font-medium text-foreground/80">{formatCurrency(estVcRevenue)}</span>
        </div>
        <div className="border-t border-brand/10 pt-1.5 mt-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-brand">Total Revenue</span>
            <span className="text-brand">{formatCurrency(estTotalRevenue)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Total Costs</span>
            <span className="text-red-600">{formatCurrency(totalCostsVal)}</span>
          </div>
          <div className="flex justify-between text-xs font-semibold mt-1">
            <span className={estProfit >= 0 ? "text-emerald-700" : "text-red-700"}>
              Profit
            </span>
            <span className={estProfit >= 0 ? "text-emerald-700" : "text-red-700"}>
              {formatCurrency(estProfit)} ({estMargin.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={() => submitWeekly.mutate()}
        disabled={submitWeekly.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {submitWeekly.isPending ? "Saving..." : "Save Weekly Data"}
      </button>

      {/* History */}
      {records && records.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Recent Weeks
          </h4>
          <div className="space-y-1">
            {records.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-surface/50 rounded-lg text-xs">
                <span className="text-muted">
                  {new Date(r.periodStart).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
                <span className="font-medium text-foreground">
                  {formatCurrency(r.totalRevenue)}
                </span>
                <span className={cn(
                  "font-medium",
                  r.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {formatCurrency(r.grossProfit)}
                </span>
                <span className={cn(
                  "font-medium",
                  r.margin >= 15 ? "text-emerald-600" : r.margin > 0 ? "text-amber-600" : "text-red-600"
                )}>
                  {r.margin.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
