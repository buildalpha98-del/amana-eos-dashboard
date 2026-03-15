"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useUpdateTodo } from "@/hooks/useTodos";
import { getWeekStart, formatDateAU } from "@/lib/utils";
import Link from "next/link";
import {
  Loader2,
  ShieldCheck,
  CheckSquare,
  GraduationCap,
  Bell,
  Calendar,
  Megaphone,
  ChevronRight,
  Check,
  Square,
  Clock,
  AlertCircle,
  AlertTriangle,
  FileSignature,
  ClipboardCheck,
  UserCircle,
} from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";

// ─── Types ──────────────────────────────────────────────────

interface CertData {
  type: string;
  label: string;
  expiryDate: string | null;
  daysLeft: number | null;
  status: "valid" | "expiring" | "expired" | "missing";
}

interface MyHubData {
  compliance: {
    overallPct: number;
    certs: CertData[];
  };
  todos: {
    total: number;
    pending: number;
    complete: number;
    overdue: number;
  };
  training: {
    total: number;
    completed: number;
    inProgress: number;
    pct: number;
  };
  upcomingMeetings: { id: string; title: string; date: string }[];
  unreadAnnouncements: {
    id: string;
    title: string;
    createdAt: string;
    content: string;
  }[];
  pendingPolicies: number;
  pendingSurvey: boolean;
  upcomingShifts: {
    id: string;
    date: string;
    sessionType: string;
    shiftStart: string;
    shiftEnd: string;
    serviceName: string;
  }[];
}

interface TodoItem {
  id: string;
  title: string;
  status: string;
  dueDate: string;
}

// ─── Circular Progress ──────────────────────────────────────

function CircularProgress({
  pct,
  size = 80,
  strokeWidth = 8,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  let strokeColor = "#ef4444"; // red
  if (pct >= 80) strokeColor = "#22c55e"; // green
  else if (pct >= 50) strokeColor = "#f59e0b"; // amber

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-sm font-bold text-gray-900">
        {pct}%
      </span>
    </div>
  );
}

// ─── Small Progress Bar ─────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Cert Status Badge ──────────────────────────────────────

function CertBadge({ status }: { status: CertData["status"] }) {
  const config = {
    valid: {
      bg: "bg-green-50",
      text: "text-green-700",
      border: "border-green-200",
      label: "Valid",
    },
    expiring: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      label: "Expiring",
    },
    expired: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      label: "Expired",
    },
    missing: {
      bg: "bg-gray-50",
      text: "text-gray-500",
      border: "border-gray-200",
      label: "Missing",
    },
  };

  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text} border ${c.border}`}
    >
      {c.label}
    </span>
  );
}

// ─── Cert Card ──────────────────────────────────────────────

function CertCard({ cert }: { cert: CertData }) {
  const borderColor = {
    valid: "border-green-300",
    expiring: "border-amber-300",
    expired: "border-red-300",
    missing: "border-dashed border-gray-300",
  };

  return (
    <div
      className={`rounded-lg border-2 p-4 bg-white ${borderColor[cert.status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900">{cert.label}</h4>
        <CertBadge status={cert.status} />
      </div>
      <p className="text-xs text-gray-500">
        {cert.expiryDate
          ? `Expires: ${formatDateAU(cert.expiryDate)}`
          : "No certificate on file"}
      </p>
      {cert.daysLeft !== null && cert.status !== "missing" && (
        <p
          className={`text-xs mt-1 font-medium ${
            cert.daysLeft < 0
              ? "text-red-600"
              : cert.daysLeft <= 30
                ? "text-amber-600"
                : "text-green-600"
          }`}
        >
          {cert.daysLeft < 0
            ? `Expired ${Math.abs(cert.daysLeft)} days ago`
            : `${cert.daysLeft} days remaining`}
        </p>
      )}
    </div>
  );
}

// ─── Todo Item Row ──────────────────────────────────────────

function TodoRow({ todo }: { todo: TodoItem }) {
  const updateTodo = useUpdateTodo();
  const queryClient = useQueryClient();
  const isComplete = todo.status === "complete";
  const isOverdue =
    !isComplete && new Date(todo.dueDate) < new Date();

  function handleToggle() {
    const newStatus = isComplete ? "pending" : "complete";
    updateTodo.mutate(
      { id: todo.id, status: newStatus as "pending" | "complete" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["my-hub"] });
        },
      }
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 group">
      <button
        onClick={handleToggle}
        disabled={updateTodo.isPending}
        className="flex-shrink-0 text-gray-400 hover:text-brand transition-colors disabled:opacity-50"
        aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
      >
        {isComplete ? (
          <CheckSquare className="w-4.5 h-4.5 text-brand" />
        ) : (
          <Square className="w-4.5 h-4.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm truncate ${
            isComplete
              ? "line-through text-gray-400"
              : "text-gray-900"
          }`}
        >
          {todo.title}
        </p>
      </div>
      <span
        className={`flex-shrink-0 text-xs ${
          isOverdue ? "text-red-500 font-medium" : "text-gray-400"
        }`}
      >
        {formatDateAU(todo.dueDate)}
      </span>
    </div>
  );
}

// ─── Main StaffDashboard ────────────────────────────────────

export function StaffDashboard() {
  const { data: session } = useSession();
  const weekStart = getWeekStart();

  // Fetch hub data
  const { data, isLoading } = useQuery<MyHubData>({
    queryKey: ["my-hub"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/my-hub");
      if (!res.ok) throw new Error("Failed to load hub data");
      return res.json();
    },
  });

  // Fetch actual todo items for the list (with details)
  const { data: todosRaw } = useQuery<TodoItem[]>({
    queryKey: [
      "todos",
      {
        weekOf: weekStart.toISOString(),
        assigneeId: session?.user?.id,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        weekOf: weekStart.toISOString(),
        assigneeId: session?.user?.id || "",
      });
      const res = await fetch(`/api/todos?${params}`);
      if (!res.ok) throw new Error("Failed to fetch todos");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  const todos = (todosRaw ?? []).slice(0, 8);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <span className="ml-3 text-gray-500">
            Loading your dashboard...
          </span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Unable to load dashboard"
          error={new Error("Failed to load your dashboard data. Please try again.")}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const todoPct =
    data.todos.total > 0
      ? Math.round((data.todos.complete / data.todos.total) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Welcome Header ─────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Hub</h2>
        <p className="text-gray-500 mt-1">
          Welcome back, {session?.user?.name?.split(" ")[0] || "there"}{" "}
          &mdash; here is your personal overview.
        </p>
      </div>

      {/* Action Required Banner */}
      {(() => {
        const actions: { label: string; href: string; icon: React.ReactNode }[] = [];
        const expiredCerts = data.compliance.certs.filter(c => c.status === "expired" || c.status === "missing").length;
        if (expiredCerts > 0) actions.push({ label: `${expiredCerts} certificate${expiredCerts !== 1 ? "s" : ""} need attention`, href: "/compliance", icon: <ShieldCheck className="w-3.5 h-3.5" /> });
        if (data.todos.overdue > 0) actions.push({ label: `${data.todos.overdue} overdue to-do${data.todos.overdue !== 1 ? "s" : ""}`, href: "/todos", icon: <CheckSquare className="w-3.5 h-3.5" /> });
        if (data.pendingPolicies > 0) actions.push({ label: `${data.pendingPolicies} polic${data.pendingPolicies !== 1 ? "ies" : "y"} to acknowledge`, href: "/my-portal", icon: <FileSignature className="w-3.5 h-3.5" /> });
        if (data.pendingSurvey) actions.push({ label: "Monthly pulse survey", href: "/my-portal", icon: <ClipboardCheck className="w-3.5 h-3.5" /> });

        if (actions.length === 0) return null;

        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800 mb-1">Action required</p>
                <div className="flex flex-wrap gap-2">
                  {actions.map((a, i) => (
                    <Link
                      key={i}
                      href={a.href}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs font-medium text-amber-700 hover:bg-white transition-colors border border-amber-200"
                    >
                      {a.icon}
                      {a.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Quick Stats Row ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance */}
        <StatCard
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Compliance"
        >
          <div className="flex items-center gap-4">
            <CircularProgress pct={data.compliance.overallPct} />
            <div>
              <p className="text-lg font-bold text-gray-900">
                {data.compliance.certs.filter(
                  (c) => c.status === "valid" || c.status === "expiring"
                ).length}
                /
                {data.compliance.certs.length}
              </p>
              <p className="text-xs text-gray-500">certs valid</p>
            </div>
          </div>
        </StatCard>

        {/* Weekly To-Dos */}
        <StatCard
          icon={<CheckSquare className="w-4 h-4" />}
          label="Weekly To-Dos"
        >
          <div>
            <p className="text-lg font-bold text-gray-900">
              {data.todos.complete}/{data.todos.total}{" "}
              <span className="text-sm font-normal text-gray-500">
                complete
              </span>
            </p>
            {data.todos.overdue > 0 && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-0.5">
                <AlertCircle className="w-3 h-3" />
                {data.todos.overdue} overdue
              </p>
            )}
            <div className="mt-2">
              <ProgressBar pct={todoPct} color="#004E64" />
            </div>
          </div>
        </StatCard>

        {/* Training */}
        <StatCard
          icon={<GraduationCap className="w-4 h-4" />}
          label="Training"
        >
          <div>
            <p className="text-lg font-bold text-gray-900">
              {data.training.completed}/{data.training.total}{" "}
              <span className="text-sm font-normal text-gray-500">
                courses
              </span>
            </p>
            {data.training.inProgress > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                {data.training.inProgress} in progress
              </p>
            )}
            <div className="mt-2">
              <ProgressBar pct={data.training.pct} color="#004E64" />
            </div>
          </div>
        </StatCard>

        {/* Unread Announcements */}
        <StatCard
          icon={<Bell className="w-4 h-4" />}
          label="Announcements"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-10 h-10 text-brand" />
              {data.unreadAnnouncements.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {data.unreadAnnouncements.length}
                </span>
              )}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">
                {data.unreadAnnouncements.length}
              </p>
              <p className="text-xs text-gray-500">unread</p>
            </div>
          </div>
        </StatCard>
      </div>

      {/* ── Quick Links ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/compliance" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 hover:shadow-sm transition-all group">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
            <ShieldCheck className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">My Compliance</p>
            <p className="text-[10px] text-gray-500">Upload certificates</p>
          </div>
        </Link>
        <Link href="/leave" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 hover:shadow-sm transition-all group">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
            <Calendar className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Leave</p>
            <p className="text-[10px] text-gray-500">Request time off</p>
          </div>
        </Link>
        <Link href="/my-portal" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 hover:shadow-sm transition-all group">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
            <UserCircle className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">My Portal</p>
            <p className="text-[10px] text-gray-500">Profile & payslips</p>
          </div>
        </Link>
        <Link href="/onboarding" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-brand/30 hover:shadow-sm transition-all group">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
            <GraduationCap className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Training</p>
            <p className="text-[10px] text-gray-500">Courses & modules</p>
          </div>
        </Link>
      </div>

      {/* ── Compliance Detail ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            Compliance Detail
          </h3>
          <Link
            href="/compliance"
            className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.compliance.certs.map((cert) => (
            <CertCard key={cert.type} cert={cert} />
          ))}
        </div>
      </div>

      {/* ── Two-Column: Todos + Upcoming ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My To-Dos This Week */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-brand" />
              My To-Dos This Week
            </h3>
            <Link
              href="/todos"
              className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="px-5 py-2 divide-y divide-gray-100">
            {todos.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                <Check className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No to-dos this week. You are all caught up!
              </div>
            ) : (
              todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} />
              ))
            )}
          </div>
        </div>

        {/* Upcoming */}
        <div className="space-y-6">
          {/* Upcoming Meetings */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand" />
                Upcoming Meetings
              </h3>
              <Link
                href="/meetings"
                className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-5 py-2">
              {data.upcomingMeetings.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No upcoming meetings
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.upcomingMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {meeting.title}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateAU(meeting.date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* My Next Shifts */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand" />
                My Next Shifts
              </h3>
            </div>
            <div className="px-5 py-2">
              {(!data.upcomingShifts || data.upcomingShifts.length === 0) ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No upcoming shifts
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.upcomingShifts.map((shift) => (
                    <div key={shift.id} className="flex items-center gap-3 py-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {shift.sessionType === "before_school" ? "BSC" : shift.sessionType === "after_school" ? "ASC" : shift.sessionType === "vacation" ? "VAC" : shift.sessionType} — {shift.shiftStart}–{shift.shiftEnd}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateAU(shift.date)} · {shift.serviceName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Unread Announcements */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-brand" />
                Unread Announcements
              </h3>
              <Link
                href="/communication"
                className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-5 py-2">
              {data.unreadAnnouncements.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  <Megaphone className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  All caught up!
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.unreadAnnouncements.slice(0, 3).map((ann) => (
                    <div key={ann.id} className="py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {ann.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {ann.content}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateAU(ann.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
