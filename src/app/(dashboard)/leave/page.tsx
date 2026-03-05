"use client";

import { useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  useLeaveRequests,
  useCreateLeaveRequest,
  useUpdateLeaveRequest,
  useCancelLeaveRequest,
  useLeaveBalances,
  useLeaveCalendar,
  type LeaveRequestData,
  type LeaveBalanceData,
} from "@/hooks/useLeave";
import { hasMinRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import {
  CalendarDays,
  Plus,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Palmtree,
  Thermometer,
  User,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Send,
  FileText,
  Filter,
  Calendar,
  Ban,
  MessageSquare,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const leaveTypeLabels: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  personal: "Personal Leave",
  unpaid: "Unpaid Leave",
  long_service: "Long Service",
  parental: "Parental Leave",
  compassionate: "Compassionate",
};

const leaveTypeOptions = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "long_service", label: "Long Service Leave" },
  { value: "parental", label: "Parental Leave" },
  { value: "compassionate", label: "Compassionate Leave" },
];

const leaveTypeIcons: Record<string, typeof Palmtree> = {
  annual: Palmtree,
  sick: Thermometer,
  personal: User,
  unpaid: Ban,
  long_service: CalendarDays,
  parental: User,
  compassionate: User,
};

const leaveTypeBadgeColors: Record<string, string> = {
  annual: "bg-blue-100 text-blue-700",
  sick: "bg-red-100 text-red-700",
  personal: "bg-purple-100 text-purple-700",
  unpaid: "bg-gray-100 text-gray-700",
  long_service: "bg-teal-100 text-teal-700",
  parental: "bg-pink-100 text-pink-700",
  compassionate: "bg-amber-100 text-amber-700",
};

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function statusBadge(status: string) {
  switch (status) {
    case "leave_pending":
      return {
        label: "Pending",
        className: "bg-amber-100 text-amber-700",
        icon: Clock,
      };
    case "leave_approved":
      return {
        label: "Approved",
        className: "bg-emerald-100 text-emerald-700",
        icon: CheckCircle2,
      };
    case "leave_rejected":
      return {
        label: "Rejected",
        className: "bg-red-100 text-red-700",
        icon: XCircle,
      };
    case "leave_cancelled":
      return {
        label: "Cancelled",
        className: "bg-gray-100 text-gray-500",
        icon: Ban,
      };
    default:
      return {
        label: status,
        className: "bg-gray-100 text-gray-600",
        icon: AlertCircle,
      };
  }
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
  return { daysInMonth, startDayOfWeek };
}

function isDateInRange(date: Date, start: string, end: string) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return d >= s && d <= e;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const badge = statusBadge(status);
  const Icon = badge.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        badge.className
      )}
    >
      <Icon className="w-3 h-3" />
      {badge.label}
    </span>
  );
}

function LeaveTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        leaveTypeBadgeColors[type] || "bg-gray-100 text-gray-700"
      )}
    >
      {leaveTypeLabels[type] || type}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Balance Cards                                                       */
/* ------------------------------------------------------------------ */

function BalanceCards({ balances }: { balances: LeaveBalanceData[] }) {
  // Consolidate balances by type — show Annual, Sick, Personal, Other
  const balanceMap = useMemo(() => {
    const map: Record<
      string,
      { accrued: number; taken: number; pending: number; balance: number }
    > = {
      annual: { accrued: 0, taken: 0, pending: 0, balance: 0 },
      sick: { accrued: 0, taken: 0, pending: 0, balance: 0 },
      personal: { accrued: 0, taken: 0, pending: 0, balance: 0 },
      other: { accrued: 0, taken: 0, pending: 0, balance: 0 },
    };

    balances.forEach((b) => {
      const key =
        b.leaveType === "annual" ||
        b.leaveType === "sick" ||
        b.leaveType === "personal"
          ? b.leaveType
          : "other";
      map[key].accrued += b.accrued;
      map[key].taken += b.taken;
      map[key].pending += b.pending;
      map[key].balance += b.balance;
    });

    return map;
  }, [balances]);

  const cards = [
    {
      key: "annual",
      label: "Annual Leave",
      icon: Palmtree,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      key: "sick",
      label: "Sick Leave",
      icon: Thermometer,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      key: "personal",
      label: "Personal Leave",
      icon: User,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      key: "other",
      label: "Other Leave",
      icon: MoreHorizontal,
      color: "text-gray-600",
      bg: "bg-gray-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const data = balanceMap[card.key];
        return (
          <div
            key={card.key}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  card.bg
                )}
              >
                <Icon className={cn("w-5 h-5", card.color)} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {card.label}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.balance.toFixed(1)}
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    days
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                Accrued:{" "}
                <span className="font-medium text-gray-700">
                  {data.accrued.toFixed(1)}
                </span>
              </span>
              <span className="text-gray-300">|</span>
              <span>
                Taken:{" "}
                <span className="font-medium text-gray-700">
                  {data.taken.toFixed(1)}
                </span>
              </span>
              {data.pending > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>
                    Pending:{" "}
                    <span className="font-medium text-amber-600">
                      {data.pending.toFixed(1)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Request Leave Modal                                                 */
/* ------------------------------------------------------------------ */

function RequestLeaveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const createRequest = useCreateLeaveRequest();

  const resetForm = useCallback(() => {
    setLeaveType("annual");
    setStartDate("");
    setEndDate("");
    setIsHalfDay(false);
    setReason("");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    try {
      await createRequest.mutateAsync({
        leaveType,
        startDate,
        endDate,
        isHalfDay,
        reason: reason || undefined,
      });
      resetForm();
      onClose();
    } catch {
      // error shown in UI via createRequest.error
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">
            Request Leave
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Leave Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Leave Type
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              {leaveTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Half Day */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isHalfDay}
              onChange={(e) => setIsHalfDay(e.target.checked)}
              className="w-4 h-4 text-[#004E64] border-gray-300 rounded focus:ring-[#004E64]"
            />
            <span className="text-sm text-gray-700">Half day only</span>
          </label>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Brief reason for leave..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {createRequest.isError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">
                {createRequest.error?.message || "Failed to submit request"}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRequest.isPending || !startDate || !endDate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#004E64] text-white rounded-lg hover:bg-[#003344] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {createRequest.isPending ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My Requests Tab                                                     */
/* ------------------------------------------------------------------ */

function MyRequestsTab({
  requests,
  isLoading,
  userId,
}: {
  requests: LeaveRequestData[] | undefined;
  isLoading: boolean;
  userId?: string;
}) {
  const cancelRequest = useCancelLeaveRequest();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const myRequests = useMemo(() => {
    if (!requests || !userId) return [];
    return requests.filter((r) => r.userId === userId);
  }, [requests, userId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
      </div>
    );
  }

  if (myRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <div className="w-16 h-16 rounded-2xl bg-[#004E64]/5 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-[#004E64]/30" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          No leave requests
        </h3>
        <p className="text-gray-500 mt-2 max-w-md text-sm">
          You have not submitted any leave requests yet. Click "Request Leave" to
          get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {myRequests.map((req) => (
        <div
          key={req.id}
          className="bg-white rounded-xl border border-gray-200 p-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 mt-0.5">
                <LeaveTypeBadge type={req.leaveType} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(req.startDate)}
                    {req.startDate !== req.endDate &&
                      ` — ${formatDate(req.endDate)}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {req.isHalfDay
                      ? "0.5 day"
                      : `${req.totalDays} day${req.totalDays !== 1 ? "s" : ""}`}
                  </span>
                </div>
                {req.reason && (
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-md">
                    {req.reason}
                  </p>
                )}
                {req.reviewNotes && (
                  <div className="flex items-start gap-1.5 mt-2">
                    <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500 italic">
                      {req.reviewedBy?.name}: {req.reviewNotes}
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Submitted {formatDate(req.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={req.status} />
              {req.status === "leave_pending" && (
                <button
                  onClick={async () => {
                    setCancellingId(req.id);
                    try {
                      await cancelRequest.mutateAsync(req.id);
                    } finally {
                      setCancellingId(null);
                    }
                  }}
                  disabled={cancellingId === req.id}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                >
                  {cancellingId === req.id ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Approvals Tab (admin/owner)                                         */
/* ------------------------------------------------------------------ */

function ApprovalsTab({
  requests,
  isLoading,
  statusFilter,
  serviceFilter,
  typeFilter,
  services,
}: {
  requests: LeaveRequestData[] | undefined;
  isLoading: boolean;
  statusFilter: string;
  serviceFilter: string;
  typeFilter: string;
  services: ServiceOption[];
}) {
  const updateRequest = useUpdateLeaveRequest();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (serviceFilter && r.serviceId !== serviceFilter) return false;
      if (typeFilter && r.leaveType !== typeFilter) return false;
      return true;
    });
  }, [requests, statusFilter, serviceFilter, typeFilter]);

  const handleAction = async (
    id: string,
    action: "leave_approved" | "leave_rejected"
  ) => {
    setProcessingId(id);
    try {
      await updateRequest.mutateAsync({
        id,
        status: action,
        reviewNotes: reviewNotes[id] || undefined,
      });
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
      </div>
    );
  }

  if (filteredRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-300" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">All caught up</h3>
        <p className="text-gray-500 mt-2 max-w-md text-sm">
          {statusFilter === "leave_pending"
            ? "No pending leave requests to review."
            : "No leave requests match your current filters."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredRequests.map((req) => {
        const isPending = req.status === "leave_pending";
        return (
          <div
            key={req.id}
            className={cn(
              "bg-white rounded-xl border p-4",
              isPending ? "border-amber-200" : "border-gray-200"
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              {/* Left side */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#004E64]/10 flex items-center justify-center text-sm font-semibold text-[#004E64] shrink-0">
                  {req.user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {req.user.name}
                    </span>
                    <LeaveTypeBadge type={req.leaveType} />
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-gray-600">
                      {formatDate(req.startDate)}
                      {req.startDate !== req.endDate &&
                        ` — ${formatDate(req.endDate)}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      {req.isHalfDay
                        ? "0.5 day"
                        : `${req.totalDays} day${req.totalDays !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  {req.reason && (
                    <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
                  )}
                  {req.service && (
                    <p className="text-xs text-gray-400 mt-1">
                      Centre: {req.service.name}
                    </p>
                  )}
                  {req.reviewNotes && !isPending && (
                    <div className="flex items-start gap-1.5 mt-2">
                      <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-500 italic">
                        {req.reviewedBy?.name}: {req.reviewNotes}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Submitted {formatDate(req.createdAt)}
                  </p>
                </div>
              </div>

              {/* Right side — approval actions */}
              {isPending && (
                <div className="flex flex-col gap-2 shrink-0 sm:w-52">
                  <input
                    type="text"
                    placeholder="Add a note (optional)"
                    value={reviewNotes[req.id] || ""}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({
                        ...prev,
                        [req.id]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(req.id, "leave_approved")}
                      disabled={processingId === req.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(req.id, "leave_rejected")}
                      disabled={processingId === req.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team Calendar Tab (admin/owner)                                     */
/* ------------------------------------------------------------------ */

function TeamCalendarTab({
  serviceFilter,
  services,
}: {
  serviceFilter: string;
  services: ServiceOption[];
}) {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [selectedService, setSelectedService] = useState(serviceFilter || "");

  const { data: calendar, isLoading } = useLeaveCalendar(
    selectedService || undefined,
    calYear,
    calMonth
  );

  const { daysInMonth, startDayOfWeek } = useMemo(
    () => getMonthDays(calYear, calMonth),
    [calYear, calMonth]
  );

  const monthLabel = useMemo(
    () =>
      new Date(calYear, calMonth - 1).toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
      }),
    [calYear, calMonth]
  );

  const goToPrevMonth = () => {
    if (calMonth === 1) {
      setCalMonth(12);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (calMonth === 12) {
      setCalMonth(1);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  // Build a map: dayNumber -> list of people on leave
  const dayMap = useMemo(() => {
    const map: Record<number, { name: string; type: string; status: string }[]> =
      {};
    if (!calendar) return map;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(calYear, calMonth - 1, day);
      const entries = calendar.filter((entry) =>
        isDateInRange(date, entry.startDate, entry.endDate)
      );
      if (entries.length > 0) {
        map[day] = entries.map((e) => ({
          name: e.userName,
          type: e.leaveType,
          status: e.status,
        }));
      }
    }
    return map;
  }, [calendar, calYear, calMonth, daysInMonth]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === calYear && today.getMonth() + 1 === calMonth;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[160px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={goToNextMonth}
            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
        >
          <option value="">All Centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {dayNames.map((d) => (
              <div
                key={d}
                className="px-1 py-2 text-center text-xs font-medium text-gray-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for offset */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-100 bg-gray-50/50"
              />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const entries = dayMap[day] || [];
              const isToday = isCurrentMonth && today.getDate() === day;
              const isWeekend =
                (startDayOfWeek + i) % 7 === 0 ||
                (startDayOfWeek + i) % 7 === 6;

              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-100 p-1",
                    isWeekend && "bg-gray-50/50",
                    isToday && "bg-[#004E64]/5"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-0.5",
                      isToday
                        ? "bg-[#004E64] text-white"
                        : "text-gray-600"
                    )}
                  >
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {entries.slice(0, 3).map((entry, j) => (
                      <div
                        key={j}
                        className={cn(
                          "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                          entry.status === "leave_approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                        title={`${entry.name} - ${leaveTypeLabels[entry.type] || entry.type}`}
                      >
                        {entry.name.split(" ")[0]}
                      </div>
                    ))}
                    {entries.length > 3 && (
                      <span className="text-[10px] text-gray-400 px-1">
                        +{entries.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
              <span className="text-xs text-gray-500">Approved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
              <span className="text-xs text-gray-500">Pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function LeavePage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const userId = session?.user?.id;
  const isAdmin = hasMinRole(role, "admin");

  // State
  const [activeTab, setActiveTab] = useState<
    "my_requests" | "approvals" | "calendar"
  >("my_requests");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Data
  const {
    data: requests,
    isLoading: requestsLoading,
    isError: requestsError,
  } = useLeaveRequests(
    isAdmin
      ? {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(serviceFilter ? { serviceId: serviceFilter } : {}),
          ...(typeFilter ? { leaveType: typeFilter } : {}),
        }
      : { userId: userId || "" }
  );

  const { data: balances = [], isLoading: balancesLoading } = useLeaveBalances(
    userId || undefined
  );

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Stats
  const stats = useMemo(() => {
    if (!requests) return { total: 0, pending: 0, approved: 0, rejected: 0 };
    const list = isAdmin ? requests : requests.filter((r) => r.userId === userId);
    return {
      total: list.length,
      pending: list.filter((r) => r.status === "leave_pending").length,
      approved: list.filter((r) => r.status === "leave_approved").length,
      rejected: list.filter((r) => r.status === "leave_rejected").length,
    };
  }, [requests, isAdmin, userId]);

  const tabs = useMemo(() => {
    const t: { key: typeof activeTab; label: string; icon: typeof Calendar }[] =
      [{ key: "my_requests", label: "My Requests", icon: FileText }];
    if (isAdmin) {
      t.push({ key: "calendar", label: "Team Calendar", icon: Calendar });
      t.push({ key: "approvals", label: "Approvals", icon: CheckCircle2 });
    }
    return t;
  }, [isAdmin]);

  // Pending count for badge on Approvals tab
  const pendingCount = useMemo(() => {
    if (!requests || !isAdmin) return 0;
    return requests.filter((r) => r.status === "leave_pending").length;
  }, [requests, isAdmin]);

  const hasActiveFilters = statusFilter || serviceFilter || typeFilter;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Leave Management
          </h2>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? "Review, approve, and track team leave across all centres"
              : "View your leave balances and submit leave requests"}
          </p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003344] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Request Leave
        </button>
      </div>

      {/* Leave Balance Cards */}
      {balancesLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100" />
                <div>
                  <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
                  <div className="h-6 w-16 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : balances.length > 0 ? (
        <BalanceCards balances={balances} />
      ) : (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
          <p className="text-sm text-gray-500">
            No leave balance data available. Balances will appear once synced
            from your payroll system.
          </p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.key === "approvals" && pendingCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters toggle (admin only, on approvals tab) */}
        {isAdmin && activeTab === "approvals" && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "ml-2 p-2 rounded-lg border transition-colors",
              showFilters || hasActiveFilters
                ? "bg-[#004E64] text-white border-[#004E64]"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters Bar (admin/approvals) */}
      {isAdmin && activeTab === "approvals" && showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="leave_pending">Pending</option>
            <option value="leave_approved">Approved</option>
            <option value="leave_rejected">Rejected</option>
            <option value="leave_cancelled">Cancelled</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Centres</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Types</option>
            {leaveTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setStatusFilter("");
                setServiceFilter("");
                setTypeFilter("");
              }}
              className="text-xs text-[#004E64] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {requests && requests.length > 0 && activeTab !== "calendar" && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 px-1">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{stats.total}</span>{" "}
            requests
          </span>
          {stats.pending > 0 && (
            <span className="text-sm text-amber-600">
              <span className="font-semibold">{stats.pending}</span> pending
            </span>
          )}
          {stats.approved > 0 && (
            <span className="text-sm text-emerald-600">
              <span className="font-semibold">{stats.approved}</span> approved
            </span>
          )}
          {stats.rejected > 0 && (
            <span className="text-sm text-red-600">
              <span className="font-semibold">{stats.rejected}</span> rejected
            </span>
          )}
        </div>
      )}

      {/* Error State */}
      {requestsError && (
        <div className="flex items-center gap-2 p-4 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            Failed to load leave requests. Please try refreshing the page.
          </p>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === "my_requests" && (
        <MyRequestsTab
          requests={requests}
          isLoading={requestsLoading}
          userId={userId}
        />
      )}

      {activeTab === "approvals" && isAdmin && (
        <ApprovalsTab
          requests={requests}
          isLoading={requestsLoading}
          statusFilter={statusFilter}
          serviceFilter={serviceFilter}
          typeFilter={typeFilter}
          services={services}
        />
      )}

      {activeTab === "calendar" && isAdmin && (
        <TeamCalendarTab serviceFilter={serviceFilter} services={services} />
      )}

      {/* Request Leave Modal */}
      <RequestLeaveModal
        open={showRequestModal}
        onClose={() => setShowRequestModal(false)}
      />
    </div>
  );
}
