"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ChevronDown,
  ChevronUp,
  Users,
  CheckSquare,
  Ticket,
  ClipboardList,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface AttendanceSession {
  enrolled: number;
  attended: number;
  capacity: number;
}

interface TodayData {
  attendance: {
    bsc: AttendanceSession | null;
    asc: AttendanceSession | null;
    vc: AttendanceSession | null;
  };
  staffOnDuty: { id: string; name: string; avatar: string | null }[];
  todosToday: {
    id: string;
    title: string;
    assigneeName: string;
    dueDate: string;
    status: string;
  }[];
  openTickets: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }[];
  expiringCerts: {
    id: string;
    userName: string;
    type: string;
    expiryDate: string;
    daysLeft: number;
  }[];
}

const sessionLabels: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

const certTypeLabels: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  other: "Other",
};

function AttendanceBar({
  label,
  session,
}: {
  label: string;
  session: AttendanceSession | null;
}) {
  if (!session) return null;

  const pct =
    session.capacity > 0
      ? Math.min(100, Math.round((session.attended / session.capacity) * 100))
      : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {session.attended}/{session.enrolled} enrolled
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 90
              ? "bg-emerald-500"
              : pct >= 60
                ? "bg-brand"
                : "bg-amber-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400">
        {pct}% of {session.capacity} capacity
      </p>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ServiceTodayPanel({ serviceId }: { serviceId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  const { data, isLoading } = useQuery<TodayData>({
    queryKey: ["service-today", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceId}/today`);
      if (!res.ok) throw new Error("Failed to fetch today data");
      return res.json();
    },
  });

  function navigateToTab(tab: string, sub?: string) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (sub) params.set("sub", sub);
    router.push(`/services/${serviceId}?${params}`, { scroll: false });
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-2 h-2 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg p-4 space-y-3 bg-gray-50">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasAttendance =
    data.attendance.bsc || data.attendance.asc || data.attendance.vc;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Today&apos;s Snapshot
          </h3>
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="px-5 pb-5 space-y-4">
          {/* Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* Attendance Today */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-brand" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Attendance Today
                </h4>
              </div>
              {hasAttendance ? (
                <div className="space-y-2.5">
                  {(["bsc", "asc", "vc"] as const).map((key) => (
                    <AttendanceBar
                      key={key}
                      label={sessionLabels[key]}
                      session={data.attendance[key]}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No attendance recorded today
                </p>
              )}
            </div>

            {/* Staff On Duty */}
            <div className="bg-blue-50/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Staff On Duty
                </h4>
                <span className="ml-auto text-xs font-medium text-gray-500 bg-white px-1.5 py-0.5 rounded">
                  {data.staffOnDuty.length}
                </span>
              </div>
              {data.staffOnDuty.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.staffOnDuty.map((staff) => (
                    <div
                      key={staff.id}
                      className="flex items-center gap-1.5"
                      title={staff.name}
                    >
                      {staff.avatar ? (
                        <img
                          src={staff.avatar}
                          alt={staff.name}
                          className="w-7 h-7 rounded-full object-cover border border-white shadow-sm"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center text-white text-[10px] font-medium border border-white shadow-sm">
                          {getInitials(staff.name)}
                        </div>
                      )}
                      <span className="text-xs text-gray-600 max-w-[80px] truncate">
                        {staff.name.split(" ")[0]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No staff assigned
                </p>
              )}
            </div>

            {/* To-Dos Due */}
            <div className="bg-amber-50/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-brand" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  To-Dos Due
                </h4>
                <span
                  className={cn(
                    "ml-auto text-xs font-medium px-1.5 py-0.5 rounded",
                    data.todosToday.length > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-white text-gray-500"
                  )}
                >
                  {data.todosToday.length}
                </span>
              </div>
              {data.todosToday.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.todosToday.slice(0, 3).map((todo) => (
                    <li key={todo.id} className="flex items-start gap-1.5">
                      <div
                        className={cn(
                          "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                          todo.status === "in_progress"
                            ? "bg-blue-500"
                            : "bg-amber-500"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-800 truncate leading-tight">
                          {todo.title}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {todo.assigneeName}
                        </p>
                      </div>
                    </li>
                  ))}
                  {data.todosToday.length > 3 && (
                    <li>
                      <button
                        onClick={() => navigateToTab("eos", "todos")}
                        className="text-[10px] text-brand hover:underline font-medium"
                      >
                        +{data.todosToday.length - 3} more &rarr; View all
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  All caught up!
                </p>
              )}
            </div>

            {/* Open Tickets */}
            <div className="bg-rose-50/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-brand" />
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Open Tickets
                </h4>
                <span
                  className={cn(
                    "ml-auto text-xs font-medium px-1.5 py-0.5 rounded",
                    data.openTickets.length > 0
                      ? "bg-rose-100 text-rose-700"
                      : "bg-white text-gray-500"
                  )}
                >
                  {data.openTickets.length}
                </span>
              </div>
              {data.openTickets.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.openTickets.slice(0, 3).map((ticket) => (
                    <li key={ticket.id} className="flex items-start gap-1.5">
                      <div
                        className={cn(
                          "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                          ticket.status === "new"
                            ? "bg-rose-500"
                            : "bg-orange-400"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-800 truncate leading-tight">
                          {ticket.title}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(ticket.createdAt).toLocaleDateString(
                            "en-AU",
                            { day: "numeric", month: "short" }
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                  {data.openTickets.length > 3 && (
                    <li>
                      <button
                        onClick={() => navigateToTab("eos", "issues")}
                        className="text-[10px] text-brand hover:underline font-medium"
                      >
                        +{data.openTickets.length - 3} more &rarr; View all
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No open tickets
                </p>
              )}
            </div>
          </div>

          {/* Expiring Compliance Certs Warning */}
          {data.expiringCerts.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-amber-800">
                  {data.expiringCerts.length} compliance cert
                  {data.expiringCerts.length !== 1 ? "s" : ""} expiring within
                  30 days
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {data.expiringCerts.map((cert) => (
                    <span key={cert.id} className="text-[11px] text-amber-700">
                      {cert.userName} &mdash;{" "}
                      {certTypeLabels[cert.type] || cert.type} ({cert.daysLeft}d
                      left)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
