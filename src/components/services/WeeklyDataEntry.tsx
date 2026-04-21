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

  // Attendance state
  const [bscRecurring, setBscRecurring] = useState(0);
  const [bscCasual, setBscCasual] = useState(0);
  const [ascRecurring, setAscRecurring] = useState(0);
  const [ascCasual, setAscCasual] = useState(0);
  const [vcAttendance, setVcAttendance] = useState(0);

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
  const estBscRevenue = bscTotal * bscRate * 5;
  const estAscRevenue = ascTotal * ascRate * 5;
  const estVcRevenue = vcAttendance * vcRate * 5;
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
          vcAttendance,
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
            <p className="text-[10px] text-brand font-medium">Current Week</p>
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

      {/* Attendance Grid */}
      <div>
        <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Daily Attendance (avg per day)
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC Recurring</label>
            <input
              type="number"
              min={0}
              value={bscRecurring === 0 ? "" : bscRecurring}
              onChange={(e) => setBscRecurring(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC Casual</label>
            <input
              type="number"
              min={0}
              value={bscCasual === 0 ? "" : bscCasual}
              onChange={(e) => setBscCasual(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC Recurring</label>
            <input
              type="number"
              min={0}
              value={ascRecurring === 0 ? "" : ascRecurring}
              onChange={(e) => setAscRecurring(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC Casual</label>
            <input
              type="number"
              min={0}
              value={ascCasual === 0 ? "" : ascCasual}
              onChange={(e) => setAscCasual(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-muted block mb-0.5">Vacation Care</label>
            <input
              type="number"
              min={0}
              value={vcAttendance === 0 ? "" : vcAttendance}
              onChange={(e) => setVcAttendance(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Costs Grid */}
      <div>
        <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Weekly Costs ($)
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">Staff</label>
            <input
              type="number"
              min={0}
              value={staffCosts === 0 ? "" : staffCosts}
              onChange={(e) => setStaffCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">Food</label>
            <input
              type="number"
              min={0}
              value={foodCosts === 0 ? "" : foodCosts}
              onChange={(e) => setFoodCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">Supplies</label>
            <input
              type="number"
              min={0}
              value={suppliesCosts === 0 ? "" : suppliesCosts}
              onChange={(e) => setSuppliesCosts(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">Other</label>
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
          <span className="text-muted">BSC ({bscTotal} × ${bscRate} × 5d)</span>
          <span className="font-medium text-foreground/80">{formatCurrency(estBscRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">ASC ({ascTotal} × ${ascRate} × 5d)</span>
          <span className="font-medium text-foreground/80">{formatCurrency(estAscRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted">VC ({vcAttendance} × ${vcRate} × 5d)</span>
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
