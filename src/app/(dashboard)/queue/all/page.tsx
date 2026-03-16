"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAllQueues, useQueue, type QueueUserSummary } from "@/hooks/useQueue";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Inbox, Users, FileText, CheckCircle2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

function statusIndicator(total: number) {
  if (total === 0) return { color: "bg-gray-300", label: "Clear" };
  if (total <= 5) return { color: "bg-emerald-500", label: "Low" };
  if (total <= 15) return { color: "bg-amber-500", label: "Medium" };
  return { color: "bg-red-500", label: "High" };
}

function QueueRow({
  summary,
  onClick,
}: {
  summary: QueueUserSummary;
  onClick: () => void;
}) {
  const status = statusIndicator(summary.total);
  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-medium text-brand">
            {summary.user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {summary.user.name}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {summary.user.role.replace(/_/g, " ")}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          <FileText className="w-3.5 h-3.5 text-gray-400" />
          {summary.reports}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
          {summary.todos}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full", status.color)} />
          <span className="text-xs text-gray-500">{status.label}</span>
        </span>
      </td>
    </tr>
  );
}

export default function AllQueuesPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useAllQueues();

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <ErrorState
          title="Failed to load queues"
          error={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  const queues = data?.queues || [];
  const unassigned = data?.unassigned || { reports: 0, todos: 0 };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-brand" />
          All Queues
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Overview of pending reports and tasks across all team members
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : queues.length === 0 && unassigned.reports === 0 && unassigned.todos === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending items"
          description="All queues are clear. Nothing needs attention right now."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                  User
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                  Reports
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                  Tasks
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-2 px-4">
                  Load
                </th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <QueueRow
                  key={q.user.id}
                  summary={q}
                  onClick={() => router.push(`/queue?userId=${q.user.id}`)}
                />
              ))}
              {(unassigned.reports > 0 || unassigned.todos > 0) && (
                <tr className="border-b border-gray-100 last:border-0 bg-gray-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                        ?
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">
                          Unassigned
                        </p>
                        <p className="text-xs text-gray-400">
                          Needs routing
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      {unassigned.reports}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                      <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
                      {unassigned.todos}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                      <span className="text-xs text-gray-400">—</span>
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
