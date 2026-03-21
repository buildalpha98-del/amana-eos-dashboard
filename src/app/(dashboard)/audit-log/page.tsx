"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { exportToCSV, formatDateCSV } from "@/lib/csv-export";
import {
  Shield,
  ShieldCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/* ── Types ────────────────────────────────────────────────────── */

interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  targetId: string | null;
  targetType: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* ── Constants ────────────────────────────────────────────────── */

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "user.login", label: "User Login" },
  { value: "user.logout", label: "User Logout" },
  { value: "user.password_reset", label: "Password Reset" },
  { value: "user.role_change", label: "Role Change" },
  { value: "user.created", label: "User Created" },
  { value: "user.deleted", label: "User Deleted" },
  { value: "user.mfa_enabled", label: "MFA Enabled" },
  { value: "user.mfa_disabled", label: "MFA Disabled" },
  { value: "api_key.created", label: "API Key Created" },
  { value: "api_key.revoked", label: "API Key Revoked" },
  { value: "cron.executed", label: "Cron Executed" },
  { value: "session.revoked", label: "Session Revoked" },
];

const ACTION_COLORS: Record<string, string> = {
  "user.login": "bg-blue-100 text-blue-700",
  "user.logout": "bg-gray-100 text-gray-700",
  "user.password_reset": "bg-amber-100 text-amber-700",
  "user.role_change": "bg-purple-100 text-purple-700",
  "user.created": "bg-teal-100 text-teal-700",
  "user.deleted": "bg-red-100 text-red-700",
  "user.mfa_enabled": "bg-emerald-100 text-emerald-700",
  "user.mfa_disabled": "bg-orange-100 text-orange-700",
  "api_key.created": "bg-emerald-100 text-emerald-700",
  "api_key.revoked": "bg-rose-100 text-rose-700",
  "cron.executed": "bg-indigo-100 text-indigo-700",
  "session.revoked": "bg-pink-100 text-pink-700",
};

const LIMIT = 50;

/* ── Helpers ──────────────────────────────────────────────────── */

function formatAUDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function metadataPreview(meta: Record<string, unknown> | null): string {
  if (!meta) return "-";
  const str = JSON.stringify(meta);
  return str.length > 80 ? str.slice(0, 77) + "..." : str;
}

function actionBadge(action: string) {
  const color = ACTION_COLORS[action] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {action}
    </span>
  );
}

/* ── Component ────────────────────────────────────────────────── */

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useQuery<AuditResponse>({
    queryKey: ["audit-log", page, actionFilter, emailSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  // Client-side email filter (API doesn't support it directly)
  const filteredEntries = emailSearch
    ? (data?.entries ?? []).filter((e) =>
        e.actorEmail?.toLowerCase().includes(emailSearch.toLowerCase()),
      )
    : (data?.entries ?? []);

  const handleEmailSearch = useCallback(() => {
    setEmailSearch(emailInput.trim());
    setPage(1);
  }, [emailInput]);

  const handleExportCSV = useCallback(() => {
    if (!filteredEntries.length) return;
    exportToCSV(
      filteredEntries as unknown as Record<string, unknown>[],
      `audit-log-${new Date().toISOString().slice(0, 10)}`,
      [
        {
          key: "createdAt",
          header: "Timestamp",
          formatter: (v: unknown) => formatDateCSV(v as string),
        },
        { key: "action", header: "Action" },
        { key: "actorEmail", header: "Actor Email" },
        { key: "actorId", header: "Actor ID" },
        { key: "targetType", header: "Target Type" },
        { key: "targetId", header: "Target ID" },
        { key: "ip", header: "IP Address" },
        {
          key: "metadata",
          header: "Metadata",
          formatter: (v: unknown) =>
            v ? JSON.stringify(v) : "",
        },
      ],
    );
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Security Audit Log
            </h1>
            <p className="text-sm text-gray-500">
              Track all security-related events across the platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            onClick={handleExportCSV}
            disabled={!filteredEntries.length}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Action filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action Type
              </label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Email search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Actor Email
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEmailSearch()}
                  placeholder="Search by email..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  onClick={handleEmailSearch}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-gray-600 hover:bg-gray-50"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Clear */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setActionFilter("");
                  setEmailSearch("");
                  setEmailInput("");
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load audit log. You may not have permission to view this
          page.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Actor
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Target
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  IP
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                  </tr>
                ))}

              {!isLoading && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4">
                    <EmptyState
                      icon={ShieldCheck}
                      title="No audit log entries found"
                      description="Security events will appear here as they occur. Try adjusting your filters."
                      variant="inline"
                    />
                  </td>
                </tr>
              )}

              {!isLoading &&
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatAUDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {actionBadge(entry.action)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                      {entry.actorEmail ?? entry.actorId ?? "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {entry.targetType
                        ? `${entry.targetType}${entry.targetId ? `: ${entry.targetId.slice(0, 8)}...` : ""}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500">
                      {entry.ip ?? "-"}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-gray-500 font-mono text-xs">
                      {metadataPreview(entry.metadata)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 bg-gray-50/50">
            <p className="text-sm text-gray-600">
              Showing{" "}
              <span className="font-medium">
                {(data.page - 1) * data.limit + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium">
                {Math.min(data.page * data.limit, data.total)}
              </span>{" "}
              of <span className="font-medium">{data.total}</span> entries
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <span className="text-sm text-gray-600">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages, p + 1))
                }
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {data && (
        <p className="text-xs text-gray-400 text-center">
          Total entries: {data.total}
        </p>
      )}
    </div>
  );
}
