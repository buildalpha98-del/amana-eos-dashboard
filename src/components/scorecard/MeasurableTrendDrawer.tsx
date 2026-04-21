"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useMeasurableHistory } from "@/hooks/useMeasurableHistory";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  measurableId: string | null;
  onClose: () => void;
}

export function MeasurableTrendDrawer({ measurableId, onClose }: Props) {
  const { data, isLoading, error, refetch } = useMeasurableHistory(measurableId, 12);

  useEffect(() => {
    if (!measurableId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [measurableId, onClose]);

  if (!measurableId) return null;

  const chartData = data?.entries.map((e) => ({
    label: new Date(e.weekOf).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }),
    value: e.value,
    onTrack: e.onTrack,
  })) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close trend"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl h-full bg-card border-l border-border shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {data?.measurable.title ?? "Loading…"}
            </h3>
            {data?.measurable && (
              <p className="text-xs text-muted">
                Goal: {data.measurable.goalDirection === "above" ? "≥" : data.measurable.goalDirection === "below" ? "≤" : "="} {data.measurable.goalValue}
                {data.measurable.unit ?? ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface" aria-label="Close">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : error ? (
            <ErrorState title="Failed to load trend" error={error as Error} onRetry={refetch} />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted italic">No entries yet for this measurable.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip formatter={(v) => Number(v).toString()} />
                  {data?.measurable.goalValue != null && (
                    <ReferenceLine
                      y={data.measurable.goalValue}
                      stroke="#10B981"
                      strokeDasharray="4 4"
                      label={{ value: "Goal", fontSize: 10, fill: "#10B981", position: "right" }}
                    />
                  )}
                  <Line type="monotone" dataKey="value" stroke="#004E64" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted">
                Showing last {chartData.length} week{chartData.length === 1 ? "" : "s"}.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
