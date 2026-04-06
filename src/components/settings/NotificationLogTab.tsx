"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  Mail,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";

interface NotificationLogEntry {
  id: string;
  type: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: string;
  errorMessage: string | null;
  relatedId: string | null;
  relatedType: string | null;
  createdAt: string;
}

interface LogResponse {
  logs: NotificationLogEntry[];
  total: number;
  page: number;
  totalPages: number;
  types: string[];
}

function formatType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  });
}

export function NotificationLogTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "25");
  if (typeFilter) params.set("type", typeFilter);
  if (statusFilter) params.set("status", statusFilter);

  const { data, isLoading, error, refetch } = useQuery<LogResponse>({
    queryKey: ["notification-log", page, typeFilter, statusFilter],
    queryFn: () => fetchApi(`/api/notifications/log?${params.toString()}`),
    retry: 2,
    staleTime: 30_000,
  });

  if (error) {
    return (
      <div className="text-center py-12 text-[#7c7c8a]">
        Failed to load notification logs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#7c7c8a]" />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="text-sm border border-[#e5e7eb] rounded-lg px-3 py-1.5 bg-white text-[#1a1a2e]"
          >
            <option value="">All Types</option>
            {data?.types.map((t) => (
              <option key={t} value={t}>{formatType(t)}</option>
            ))}
          </select>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border border-[#e5e7eb] rounded-lg px-3 py-1.5 bg-white text-[#1a1a2e]"
        >
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={() => refetch()}
          className="ml-auto flex items-center gap-1.5 text-sm text-[#004E64] hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Type</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Recipient</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Related</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b7280]">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e5e7eb]">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#7c7c8a]">
                    <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No notification logs found.
                  </td>
                </tr>
              ) : (
                data?.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-[#e5e7eb] hover:bg-[#f9fafb]/50"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-[#004E64]/10 px-2 py-0.5 text-xs font-medium text-[#004E64]">
                        {formatType(log.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#1a1a2e]">
                      <div>{log.recipientName || "—"}</div>
                      <div className="text-xs text-[#7c7c8a]">{log.recipientEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-[#1a1a2e] max-w-[200px] truncate">
                      {log.subject}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          log.status === "sent"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        )}
                      >
                        {log.status === "sent" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {log.status}
                      </span>
                      {log.errorMessage && (
                        <div className="text-xs text-red-500 mt-1 max-w-[150px] truncate" title={log.errorMessage}>
                          {log.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#7c7c8a]">
                      {log.relatedType || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#7c7c8a] whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#7c7c8a]">
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg border border-[#e5e7eb] disabled:opacity-40 hover:bg-[#f9fafb]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[#1a1a2e]">
              {page} / {data.totalPages}
            </span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg border border-[#e5e7eb] disabled:opacity-40 hover:bg-[#f9fafb]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
