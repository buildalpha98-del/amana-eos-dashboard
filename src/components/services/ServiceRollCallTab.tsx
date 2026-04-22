"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LogIn,
  LogOut,
  UserX,
  Undo2,
  Search,
  Users,
  UserCheck,
  Clock,
  MoreVertical,
  StickyNote,
  Loader2,
} from "lucide-react";
import { useRollCall, useUpdateRollCall, type RollCallEntry } from "@/hooks/useRollCall";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { MedicalAlertBadge } from "@/components/children/MedicalAlertBadge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { ServiceWeeklyRollCallGrid } from "./ServiceWeeklyRollCallGrid";
import { cn } from "@/lib/utils";

type RollCallView = "daily" | "weekly" | "monthly";

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

function ChildAvatar({ child }: { child: RollCallEntry["child"] }) {
  if (child.photo) {
    return (
      <img
        src={child.photo}
        alt={`${child.firstName} ${child.surname}`}
        className="w-12 h-12 rounded-full object-cover shrink-0"
      />
    );
  }
  const initials = `${child.firstName[0] ?? ""}${child.surname[0] ?? ""}`.toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-bold text-sm shrink-0">
      {initials}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export function ServiceRollCallTab({ serviceId }: ServiceRollCallTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawView = searchParams?.get("rollCallView") ?? "daily";
  const view: RollCallView =
    rawView === "weekly" ? "weekly" :
    rawView === "monthly" ? "monthly" :
    "daily";

  const setView = (next: RollCallView) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("rollCallView", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const [date, setDate] = useState(todayDateString);
  const [sessionType, setSessionType] = useState("asc");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useRollCall(serviceId, date, sessionType);
  const updateRollCall = useUpdateRollCall();

  const entries = data?.records ?? [];
  const summary = data?.summary ?? { total: 0, present: 0, absent: 0, notMarked: 0 };

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.child.firstName.toLowerCase().includes(q) ||
        e.child.surname.toLowerCase().includes(q),
    );
  }, [entries, search]);

  function handleAction(
    childId: string,
    action: "sign_in" | "sign_out" | "mark_absent" | "undo",
    extra?: { absenceReason?: string; notes?: string },
  ) {
    updateRollCall.mutate({
      childId,
      serviceId,
      date,
      sessionType,
      action,
      ...extra,
    });
  }

  return (
    <div className="space-y-4">
      {/* ── View Toggle (Daily / Weekly / Monthly) ─────── */}
      <div className="flex gap-2">
        {(["daily", "weekly", "monthly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
              view === v
                ? "bg-brand text-white"
                : "bg-card text-muted border border-border hover:bg-surface",
            )}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === "daily" && (
        <>
          {/* ── Date & Session Picker ──────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
            />

            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["bsc", "asc", "vc"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setSessionType(st)}
                  className={`px-5 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
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
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-foreground bg-card text-sm focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
              />
            </div>
          </div>

          {/* ── Summary Cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard icon={Users} label="Total Enrolled" value={summary.total} color="text-foreground" bgColor="bg-surface" />
            <SummaryCard icon={UserCheck} label="Present" value={summary.present} color="text-green-600" bgColor="bg-green-50" />
            <SummaryCard icon={UserX} label="Absent" value={summary.absent} color="text-red-600" bgColor="bg-red-50" />
            <SummaryCard icon={Clock} label="Not Yet Marked" value={summary.notMarked} color="text-amber-600" bgColor="bg-amber-50" />
          </div>

          {/* ── Roll Call List ─────────────────────────────── */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={entries.length === 0 ? "No children booked for this session" : "No matching children"}
              description={
                entries.length === 0
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
        </>
      )}

      {view === "weekly" && <ServiceWeeklyRollCallGrid serviceId={serviceId} />}

      {view === "monthly" && (
        <div className="text-sm text-muted">Monthly view — ships in next commit</div>
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
  onAction: (childId: string, action: "sign_in" | "sign_out" | "mark_absent" | "undo", extra?: { absenceReason?: string; notes?: string }) => void;
  isPending: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");
  const [note, setNote] = useState("");

  const hasMedFlags =
    entry.child.medicalConditions.length > 0 ||
    entry.child.dietaryRequirements.length > 0 ||
    entry.child.anaphylaxisActionPlan;

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
        {/* Avatar */}
        <ChildAvatar child={entry.child} />

        {/* Child info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-base">
              {entry.child.firstName} {entry.child.surname}
            </p>
            {entry.bookingType === "casual" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                Casual
              </span>
            )}
          </div>
          {entry.child.yearLevel && (
            <p className="text-xs text-muted">{entry.child.yearLevel}</p>
          )}
          {hasMedFlags && (
            <div className="mt-1">
              <MedicalAlertBadge child={entry.child} compact />
            </div>
          )}
          {entry.child.anaphylaxisActionPlan && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide">
              Anaphylaxis
            </span>
          )}

          {/* Time info */}
          {entry.status === "present" && (
            <p className="text-xs text-green-600 mt-1 font-medium">
              Signed in {formatTime(entry.signInTime)}
              {entry.signOutTime && (
                <span className="text-muted font-normal"> → Signed out {formatTime(entry.signOutTime)}</span>
              )}
            </p>
          )}
          {entry.status === "absent" && entry.absenceReason && (
            <p className="text-xs text-muted mt-1">Reason: {entry.absenceReason}</p>
          )}
        </div>

        {/* Action area */}
        <div className="flex items-center gap-2 shrink-0">
          {entry.status === "booked" && (
            <button
              disabled={isPending}
              onClick={() => onAction(entry.childId, "sign_in")}
              className="min-h-[44px] min-w-[120px] px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}

          {entry.status === "present" && !entry.signOutTime && (
            <button
              disabled={isPending}
              onClick={() => onAction(entry.childId, "sign_out")}
              className="min-h-[44px] min-w-[120px] px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}

          {entry.status === "present" && entry.signOutTime && (
            <span className="text-xs text-muted italic">Complete</span>
          )}

          {entry.status === "absent" && (
            <span className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-red-600 bg-red-50 rounded-xl flex items-center">
              Absent
            </span>
          )}

          {/* Three-dot menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
                  {entry.status === "booked" && (
                    <button
                      onClick={() => {
                        setShowAbsentDialog(true);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface flex items-center gap-2 min-h-[44px]"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Mark Absent
                    </button>
                  )}
                  {entry.status !== "booked" && (
                    <button
                      onClick={() => {
                        onAction(entry.childId, "undo");
                        setShowMenu(false);
                      }}
                      disabled={isPending}
                      className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface flex items-center gap-2 min-h-[44px]"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowNoteDialog(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface flex items-center gap-2 min-h-[44px]"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    Add Note
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mark Absent Dialog */}
      {showAbsentDialog && (
        <Dialog open onOpenChange={() => setShowAbsentDialog(false)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Mark {entry.child.firstName} as Absent
            </DialogTitle>
            <div className="space-y-3 mt-3">
              <div>
                <label className="text-sm font-medium text-foreground">Reason *</label>
                <input
                  type="text"
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="e.g. Sick, Family holiday"
                  className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAbsentDialog(false)}
                  className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onAction(entry.childId, "mark_absent", { absenceReason: absenceReason.trim() });
                    setShowAbsentDialog(false);
                    setAbsenceReason("");
                  }}
                  disabled={!absenceReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  Mark Absent
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Note Dialog */}
      {showNoteDialog && (
        <Dialog open onOpenChange={() => setShowNoteDialog(false)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Add Note for {entry.child.firstName}
            </DialogTitle>
            <div className="space-y-3 mt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter a note..."
                rows={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNoteDialog(false)}
                  className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Re-submit current status with added note
                    const action = entry.status === "absent" ? "mark_absent" : entry.status === "present" ? "sign_in" : "sign_in";
                    onAction(entry.childId, action, { notes: note.trim() });
                    setShowNoteDialog(false);
                    setNote("");
                  }}
                  disabled={!note.trim()}
                  className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  Save Note
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
