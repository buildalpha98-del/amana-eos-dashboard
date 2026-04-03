"use client";

import { useState, useMemo } from "react";
import {
  LogIn,
  LogOut,
  UserX,
  Undo2,
  Search,
  AlertTriangle,
  UtensilsCrossed,
  Users,
  UserCheck,
  Clock,
  ChevronDown,
} from "lucide-react";
import { useRollCall, useUpdateRollCall, type RollCallEntry } from "@/hooks/useRollCall";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

// ── Types & Constants ────────────────────────────────────

interface ServiceRollCallTabProps {
  serviceId: string;
  serviceName?: string;
}

const SESSION_LABELS: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function formatTime(dt: string | null): string {
  if (!dt) return "";
  return new Date(dt).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function todayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function hasMedical(child: RollCallEntry["child"]): boolean {
  if (!child.medical) return false;
  const m = child.medical as Record<string, unknown>;
  const conditions = m.conditions ?? m.medicalConditions ?? [];
  const allergies = m.allergies ?? [];
  return (
    (Array.isArray(conditions) && conditions.length > 0) ||
    (Array.isArray(allergies) && allergies.length > 0)
  );
}

function hasDietary(child: RollCallEntry["child"]): boolean {
  if (!child.dietary) return false;
  const d = child.dietary as Record<string, unknown>;
  const restrictions = d.restrictions ?? d.dietaryRequirements ?? [];
  return Array.isArray(restrictions) && restrictions.length > 0;
}

// ── Main Component ───────────────────────────────────────

export function ServiceRollCallTab({ serviceId }: ServiceRollCallTabProps) {
  const [date, setDate] = useState(todayDateString);
  const [sessionType, setSessionType] = useState("asc");
  const [search, setSearch] = useState("");

  const { data: entries, isLoading, error } = useRollCall(serviceId, date, sessionType);
  const updateRollCall = useUpdateRollCall();

  // Filter by search
  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.child.firstName.toLowerCase().includes(q) ||
        e.child.surname.toLowerCase().includes(q),
    );
  }, [entries, search]);

  // Summary counts
  const summary = useMemo(() => {
    if (!entries) return { total: 0, signedIn: 0, absent: 0, toArrive: 0 };
    const total = entries.length;
    const signedIn = entries.filter((e) => e.status === "present").length;
    const absent = entries.filter((e) => e.status === "absent").length;
    const toArrive = entries.filter((e) => e.status === "booked").length;
    return { total, signedIn, absent, toArrive };
  }, [entries]);

  function handleAction(
    childId: string,
    action: "sign_in" | "sign_out" | "mark_absent" | "undo",
  ) {
    updateRollCall.mutate({
      childId,
      serviceId,
      date,
      sessionType,
      action,
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Date & Session Picker ──────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
        />

        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["bsc", "asc", "vc"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSessionType(st)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                sessionType === st
                  ? "bg-brand text-white"
                  : "bg-card text-muted hover:bg-surface"
              }`}
            >
              {SESSION_LABELS[st]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Total Booked" value={summary.total} color="text-foreground" bgColor="bg-surface" />
        <SummaryCard icon={UserCheck} label="Signed In" value={summary.signedIn} color="text-green-600" bgColor="bg-green-50" />
        <SummaryCard icon={UserX} label="Absent" value={summary.absent} color="text-red-600" bgColor="bg-red-50" />
        <SummaryCard icon={Clock} label="To Arrive" value={summary.toArrive} color="text-amber-600" bgColor="bg-amber-50" />
      </div>

      {/* ── Roll Call List ─────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={entries?.length === 0 ? "No bookings for this session" : "No matching children"}
          description={
            entries?.length === 0
              ? "There are no confirmed bookings for this date and session type."
              : "Try a different search term."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <RollCallRow
              key={entry.childId}
              entry={entry}
              onAction={handleAction}
              isPending={updateRollCall.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary Card ─────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`${bgColor} rounded-xl p-3 flex items-center gap-3`}>
      <Icon className={`w-5 h-5 ${color} shrink-0`} />
      <div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

// ── Individual Roll Call Row ─────────────────────────────

function RollCallRow({
  entry,
  onAction,
  isPending,
}: {
  entry: RollCallEntry;
  onAction: (childId: string, action: "sign_in" | "sign_out" | "mark_absent" | "undo") => void;
  isPending: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const medical = hasMedical(entry.child);
  const dietary = hasDietary(entry.child);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Child info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-foreground">
            {entry.child.firstName} {entry.child.surname}
          </p>
          {medical && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
              <AlertTriangle className="w-3 h-3" />
              Medical
            </span>
          )}
          {dietary && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold">
              <UtensilsCrossed className="w-3 h-3" />
              Dietary
            </span>
          )}
          {entry.bookingType === "casual" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
              Casual
            </span>
          )}
        </div>

        {/* Time info when signed in/out */}
        {entry.status === "present" && (
          <p className="text-xs text-muted mt-1">
            Signed in {formatTime(entry.signInTime)}
            {entry.signOutTime && ` · Out ${formatTime(entry.signOutTime)}`}
          </p>
        )}
        {entry.status === "absent" && entry.absenceReason && (
          <p className="text-xs text-muted mt-1">Reason: {entry.absenceReason}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {entry.status === "booked" && (
          <>
            <Button
              size="sm"
              variant="primary"
              iconLeft={<LogIn className="w-4 h-4" />}
              disabled={isPending}
              onClick={() => onAction(entry.childId, "sign_in")}
            >
              Sign In
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<UserX className="w-4 h-4" />}
              disabled={isPending}
              onClick={() => onAction(entry.childId, "mark_absent")}
            >
              Absent
            </Button>
          </>
        )}

        {entry.status === "present" && !entry.signOutTime && (
          <>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              {formatTime(entry.signInTime)}
            </span>
            <Button
              size="sm"
              variant="destructive"
              iconLeft={<LogOut className="w-4 h-4" />}
              disabled={isPending}
              onClick={() => onAction(entry.childId, "sign_out")}
            >
              Sign Out
            </Button>
          </>
        )}

        {entry.status === "present" && entry.signOutTime && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="bg-green-50 text-green-600 px-2 py-1 rounded-full font-medium">
              In {formatTime(entry.signInTime)}
            </span>
            <span className="bg-surface px-2 py-1 rounded-full font-medium">
              Out {formatTime(entry.signOutTime)}
            </span>
          </div>
        )}

        {entry.status === "absent" && (
          <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
            Absent
          </span>
        )}

        {/* Undo dropdown — only show if not in "booked" state */}
        {entry.status !== "booked" && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="More actions"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                  <button
                    onClick={() => {
                      onAction(entry.childId, "undo");
                      setShowMenu(false);
                    }}
                    disabled={isPending}
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface flex items-center gap-2"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
