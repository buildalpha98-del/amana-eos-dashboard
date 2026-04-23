"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, AlertTriangle, CalendarPlus } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useApplyTemplateToServices,
  type AuditTemplateSummary,
} from "@/hooks/useAudits";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface ServiceOption {
  id: string;
  name: string;
  code: string;
  status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  template: AuditTemplateSummary | null;
}

export function ApplyToServicesModal({ open, onClose, template }: Props) {
  const applyMut = useApplyTemplateToServices();

  const { data: services = [], isLoading: servicesLoading } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const payload = await fetchApi<{ services?: ServiceOption[] } | ServiceOption[]>(
        "/api/services?limit=100",
      );
      return Array.isArray(payload) ? payload : payload.services ?? [];
    },
    staleTime: 60_000,
    retry: 2,
  });

  const now = new Date();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [year, setYear] = useState(now.getFullYear());
  const [overrideMonths, setOverrideMonths] = useState(false);
  const [months, setMonths] = useState<number[]>([]);

  useEffect(() => {
    if (!open || !template) return;
    setSelectedIds([]);
    setYear(now.getFullYear());
    setOverrideMonths(false);
    setMonths([...template.scheduledMonths].sort((a, b) => a - b));
  }, [open, template]);

  const activeServices = useMemo(
    () => services.filter((s) => (s.status ?? "active") === "active"),
    [services],
  );

  if (!open || !template) return null;

  const effectiveMonths = overrideMonths ? months : template.scheduledMonths;

  const toggleService = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleMonth = (m: number) => {
    setMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  };

  const selectAll = () => setSelectedIds(activeServices.map((s) => s.id));
  const clearAll = () => setSelectedIds([]);

  const canSubmit =
    selectedIds.length > 0 &&
    effectiveMonths.length > 0 &&
    !applyMut.isPending;

  const projected = selectedIds.length * effectiveMonths.length;

  // Warn if any selected month is in the past of the selected year
  const hasBackfill = useMemo(() => {
    if (year > now.getFullYear()) return false;
    if (year < now.getFullYear()) return true;
    const currentMonth = now.getMonth() + 1;
    return effectiveMonths.some((m) => m < currentMonth);
  }, [year, effectiveMonths, now]);

  const handleApply = async () => {
    try {
      const result = await applyMut.mutateAsync({
        templateId: template.id,
        serviceIds: selectedIds,
        year,
        ...(overrideMonths ? { months } : {}),
      });
      const parts = [
        `Created ${result.created} instance${result.created === 1 ? "" : "s"}`,
        result.skipped > 0 ? `${result.skipped} skipped (duplicates)` : null,
        result.unknownServiceIds && result.unknownServiceIds.length > 0
          ? `${result.unknownServiceIds.length} service(s) unknown`
          : null,
      ].filter(Boolean);
      toast({ description: parts.join(", ") + "." });
      onClose();
    } catch {
      // toast handled by mutation onError
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-brand" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Apply to services</h2>
              <p className="text-xs text-muted">{template.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Template's default scheduled months */}
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
              Template&apos;s scheduled months
            </p>
            <div className="flex flex-wrap gap-1">
              {template.scheduledMonths.length === 0 ? (
                <span className="text-sm text-amber-600">
                  Template has no scheduled months — override required.
                </span>
              ) : (
                template.scheduledMonths.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-0.5 text-xs font-medium rounded-full bg-brand/10 text-brand"
                  >
                    {monthNames[m - 1]}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground/80">
                Services ({selectedIds.length} of {activeServices.length} selected)
              </p>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-brand hover:underline"
                >
                  Select all
                </button>
                <span className="text-border">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-muted hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            {servicesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-brand animate-spin" />
              </div>
            ) : activeServices.length === 0 ? (
              <p className="text-sm text-muted py-3">No active services found.</p>
            ) : (
              <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
                {activeServices.map((svc) => {
                  const checked = selectedIds.includes(svc.id);
                  return (
                    <label
                      key={svc.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-surface",
                        checked && "bg-brand/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleService(svc.id)}
                        className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                      />
                      <span className="text-foreground flex-1">{svc.name}</span>
                      <span className="text-xs text-muted font-mono">{svc.code}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Year */}
          <div>
            <p className="text-sm font-medium text-foreground/80 mb-1.5">Year</p>
            <div className="flex items-center gap-2">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                    year === y
                      ? "bg-brand text-white border-brand"
                      : "bg-card text-foreground/80 border-border hover:bg-surface",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Months override */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={overrideMonths}
                onChange={(e) => setOverrideMonths(e.target.checked)}
                className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="text-sm font-medium text-foreground/80">
                Use custom months
              </span>
            </label>
            {!overrideMonths ? (
              <p className="text-xs text-muted ml-6">
                Will use the template&apos;s scheduled months shown above.
              </p>
            ) : (
              <div className="ml-6 grid grid-cols-6 gap-1.5">
                {monthNames.map((label, idx) => {
                  const monthNum = idx + 1;
                  const active = months.includes(monthNum);
                  return (
                    <button
                      key={monthNum}
                      type="button"
                      onClick={() => toggleMonth(monthNum)}
                      className={cn(
                        "text-xs font-medium py-1.5 rounded-lg border transition-colors",
                        active
                          ? "bg-brand text-white border-brand"
                          : "bg-card text-foreground/80 border-border hover:bg-surface",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview strip */}
          <div className="flex items-start gap-2 px-3 py-2 bg-surface/50 rounded-lg">
            <CalendarPlus className="w-4 h-4 text-muted mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <p className="text-foreground/80">
                Will create up to <strong>{projected}</strong> instance
                {projected === 1 ? "" : "s"}
                {selectedIds.length > 0 && effectiveMonths.length > 0 && (
                  <span className="text-muted"> ({selectedIds.length} × {effectiveMonths.length})</span>
                )}
                . Duplicates will be skipped.
              </p>
              {hasBackfill && (
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle className="w-3 h-3" />
                  Backfilling past months
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-surface/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleApply}
            className="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 flex items-center gap-1.5"
          >
            {applyMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Apply to {selectedIds.length} service{selectedIds.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
