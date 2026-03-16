"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, X, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendInsight {
  id: string;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  category: string;
  metric: string;
  direction: string;
  severity: string;
  summary: string;
  dataPoints: number[] | null;
  changePercent: number | null;
  periodWeeks: number;
  createdAt: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
};

const SEVERITY_ICON_STYLES: Record<string, string> = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

const DIRECTION_ICON: Record<string, typeof TrendingUp> = {
  increasing: TrendingUp,
  decreasing: TrendingDown,
  stable: Minus,
  volatile: AlertTriangle,
};

interface TrendInsightsWidgetProps {
  serviceId?: string;
  category?: string;
  className?: string;
}

export function TrendInsightsWidget({ serviceId, category, className }: TrendInsightsWidgetProps) {
  const queryClient = useQueryClient();

  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (category) params.set("category", category);

  const { data: trends, isLoading } = useQuery<TrendInsight[]>({
    queryKey: ["trend-insights", serviceId, category],
    queryFn: async () => {
      const res = await fetch(`/api/trends?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch trends");
      return res.json();
    },
  });

  const handleDismiss = async (id: string) => {
    await fetch(`/api/trends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
    queryClient.invalidateQueries({ queryKey: ["trend-insights"] });
  };

  if (isLoading || !trends || trends.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-blue-500" />
        Trend Insights
      </h4>
      {trends.map((t) => {
        const DirIcon = DIRECTION_ICON[t.direction] || Minus;
        const SevIcon = t.severity === "critical" ? AlertCircle : t.severity === "warning" ? AlertTriangle : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-4 py-3 flex items-start gap-3",
              SEVERITY_STYLES[t.severity] || "border-gray-200 bg-gray-50"
            )}
          >
            <SevIcon className={cn("h-4 w-4 mt-0.5 shrink-0", SEVERITY_ICON_STYLES[t.severity])} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <DirIcon className="h-3.5 w-3.5 text-gray-500" />
                {t.changePercent != null && (
                  <span className={cn(
                    "text-xs font-semibold",
                    t.changePercent > 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {t.changePercent > 0 ? "+" : ""}{t.changePercent}%
                  </span>
                )}
                {t.service && (
                  <span className="text-xs text-gray-500">{t.service.name}</span>
                )}
                <span className="text-xs text-gray-400 capitalize">{t.category}</span>
              </div>
              <p className="text-sm text-gray-700">{t.summary}</p>
              {/* Mini sparkline */}
              {t.dataPoints && Array.isArray(t.dataPoints) && t.dataPoints.length > 1 && (
                <div className="flex items-end gap-0.5 mt-2 h-6">
                  {(t.dataPoints as number[]).map((val, i) => {
                    const max = Math.max(...(t.dataPoints as number[]));
                    const min = Math.min(...(t.dataPoints as number[]));
                    const range = max - min || 1;
                    const height = ((val - min) / range) * 100;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "w-2 rounded-t-sm",
                          i >= (t.dataPoints as number[]).length - 2 ? "bg-blue-400" : "bg-gray-300"
                        )}
                        style={{ height: `${Math.max(height, 8)}%` }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDismiss(t.id)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
