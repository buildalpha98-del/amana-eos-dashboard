"use client";

import { useServiceStaffing } from "@/hooks/useStaffing";
import { cn } from "@/lib/utils";
import {
  Users,
  Loader2,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function StaffingForecastCard({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useServiceStaffing(serviceId);

  if (isLoading) {
    return (
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Staffing Forecast
        </label>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-muted/50 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data?.week) return null;

  const { week, monthlyOverstaffingCost } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Staffing — This Week
        </label>
        {monthlyOverstaffingCost > 0 && (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            ${monthlyOverstaffingCost.toFixed(0)} overstaffing this month
          </span>
        )}
      </div>

      {/* Weekly grid */}
      <div className="space-y-1.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {week.days.map((day: any) => {
          const date = new Date(day.date);
          const dayIndex = date.getDay();
          const label = dayLabels[dayIndex - 1] || date.toLocaleDateString("en-AU", { weekday: "short" });

          return (
            <div key={day.date} className="flex items-center gap-2">
              <span className="text-[10px] text-muted w-7 text-right font-medium">
                {label}
              </span>
              <div className="flex-1 flex gap-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {day.sessions.map((s: any) => {
                  const isOver = s.variance > 0;
                  const isUnder = s.variance < 0;
                  return (
                    <div
                      key={s.sessionType}
                      className={cn(
                        "flex-1 flex items-center justify-between px-2 py-1 rounded text-[10px] border",
                        isUnder
                          ? "bg-red-50 border-red-200 text-red-700"
                          : isOver
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      )}
                    >
                      <span className="font-medium uppercase">
                        {s.sessionType}
                      </span>
                      <span className="flex items-center gap-0.5">
                        {isUnder ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : isOver ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {s.rostered}r / {s.required}req
                        {s.variance !== 0 && (
                          <span className="font-semibold ml-0.5">
                            ({s.variance > 0 ? "+" : ""}
                            {s.variance})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waste / Risk totals for the week */}
      {(week.totalWaste > 0 || week.totalRisk > 0) && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {week.totalWaste > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-sm font-bold text-amber-700">
                ${week.totalWaste.toFixed(0)}
              </p>
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">
                Weekly Waste
              </p>
            </div>
          )}
          {week.totalRisk > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm font-bold text-red-700">
                ${week.totalRisk.toFixed(0)}
              </p>
              <p className="text-[10px] text-red-600 uppercase tracking-wider">
                Revenue at Risk
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
