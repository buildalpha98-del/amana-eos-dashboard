"use client";

import { useState } from "react";
import { Workflow, Pause, Play, XCircle } from "lucide-react";
import {
  useSequenceEnrolments,
  usePauseEnrolment,
  useResumeEnrolment,
  useCancelEnrolment,
} from "@/hooks/useSequences";
import type { SequenceEnrolmentData } from "@/hooks/useSequences";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "parent_nurture", label: "Parent Nurture" },
  { value: "crm_outreach", label: "CRM Outreach" },
] as const;

const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "", label: "All" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  }) +
    ", " +
    d.toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
}

export function ActiveSequencesView() {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const { data, isLoading } = useSequenceEnrolments({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  });
  const pauseMutation = usePauseEnrolment();
  const resumeMutation = useResumeEnrolment();
  const cancelMutation = useCancelEnrolment();

  const enrolments = data?.enrolments ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type pills */}
        <div className="flex items-center gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? "bg-brand text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Status pills */}
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-brand text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && enrolments.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/30 py-16">
          <Workflow className="h-10 w-10 text-foreground/20" />
          <p className="mt-3 text-sm font-medium text-foreground/50">
            No active sequences
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            Enrolments will appear here when contacts enter a sequence
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && enrolments.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-foreground/50">
                  Contact / Lead
                </th>
                <th className="px-4 py-3 text-left font-medium text-foreground/50">
                  Sequence
                </th>
                <th className="px-4 py-3 text-left font-medium text-foreground/50">
                  Progress
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-foreground/50 sm:table-cell">
                  Next Send
                </th>
                <th className="px-4 py-3 text-left font-medium text-foreground/50">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-foreground/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrolments.map((enrolment) => {
                const totalSteps = enrolment.executions?.length ?? 0;
                const currentStep = enrolment.currentStepNumber ?? 1;
                const progress =
                  totalSteps > 0
                    ? (currentStep / totalSteps) * 100
                    : 0;
                const contactName = enrolment.contact
                  ? `${enrolment.contact.firstName ?? ""} ${enrolment.contact.lastName ?? ""}`.trim()
                  : enrolment.lead?.schoolName ?? "--";

                return (
                  <tr
                    key={enrolment.id}
                    className="transition-colors hover:bg-surface/30"
                  >
                    {/* Contact / Lead */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {contactName}
                      </span>
                    </td>

                    {/* Sequence */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">
                          {enrolment.sequence?.name ?? "--"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            enrolment.sequence?.type === "parent_nurture"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700",
                          )}
                        >
                          {enrolment.sequence?.type === "parent_nurture"
                            ? "Parent"
                            : "CRM"}
                        </span>
                      </div>
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs text-foreground/50">
                          Step {currentStep} of {totalSteps}
                        </span>
                        <div className="h-1.5 w-16 rounded bg-surface">
                          <div
                            className="h-full rounded bg-brand transition-all"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Next Send */}
                    <td className="hidden px-4 py-3 text-xs text-foreground/50 sm:table-cell">
                      {formatDate(enrolment.executions?.find((e) => e.status === "pending")?.scheduledFor)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_BADGE[enrolment.status] ??
                            "bg-gray-100 text-gray-700",
                        )}
                      >
                        {enrolment.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {enrolment.status === "active" && (
                          <button
                            onClick={() =>
                              pauseMutation.mutate(enrolment.id)
                            }
                            disabled={pauseMutation.isPending}
                            className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-amber-50 hover:text-amber-600"
                            title="Pause"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}
                        {enrolment.status === "paused" && (
                          <button
                            onClick={() =>
                              resumeMutation.mutate(enrolment.id)
                            }
                            disabled={resumeMutation.isPending}
                            className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-green-50 hover:text-green-600"
                            title="Resume"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {(enrolment.status === "active" ||
                          enrolment.status === "paused") && (
                          <button
                            onClick={() =>
                              cancelMutation.mutate(enrolment.id)
                            }
                            disabled={cancelMutation.isPending}
                            className="rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-red-50 hover:text-red-500"
                            title="Cancel"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
