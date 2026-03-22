"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Save,
  Send,
  Users,
  BarChart3,
  AlertTriangle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePulses,
  useSubmitPulse,
  usePulseSummary,
} from "@/hooks/useCommunication";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("en-AU", opts)} - ${end.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

const MOOD_EMOJIS: { emoji: string; label: string }[] = [
  { emoji: "\uD83D\uDE2B", label: "Struggling" },
  { emoji: "\uD83D\uDE15", label: "Tough" },
  { emoji: "\uD83D\uDE10", label: "Okay" },
  { emoji: "\uD83D\uDE42", label: "Good" },
  { emoji: "\uD83D\uDE04", label: "Great" },
];

function getMoodEmoji(rating: number): string {
  if (rating < 1 || rating > 5) return "\uD83D\uDE10";
  return MOOD_EMOJIS[rating - 1].emoji;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WeeklyPulseTab() {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id;
  const userRole = (session?.user as any)?.role;
  const isLeader = userRole === "owner" || userRole === "admin";

  const [view, setView] = useState<"my" | "team">("my");
  const [weekOffset, setWeekOffset] = useState(0);

  const weekOf = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return getMonday(now);
  }, [weekOffset]);

  // ── My Pulse state ──────────────────────────────────────────────────────
  const [wins, setWins] = useState("");
  const [priorities, setPriorities] = useState("");
  const [blockers, setBlockers] = useState("");
  const [mood, setMood] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: myPulses } = usePulses(weekOf, userId);
  const myPulse: any = myPulses?.[0];
  const isSubmitted = !!myPulse?.submittedAt;

  // Track which weekOf we've already loaded data for to prevent re-setting
  // form state on every refetch (which was clearing user input mid-typing)
  const loadedWeekRef = useRef<string | null>(null);

  useEffect(() => {
    // Only populate form from server data on initial load or week change
    if (loadedWeekRef.current === weekOf) return;

    if (myPulse) {
      setWins(myPulse.wins ?? "");
      setPriorities(myPulse.priorities ?? "");
      setBlockers(myPulse.blockers ?? "");
      setMood(myPulse.mood ?? 0);
      setNotes(myPulse.notes ?? "");
      loadedWeekRef.current = weekOf;
    } else if (myPulses && myPulses.length === 0) {
      // No pulse for this week — clear form
      setWins("");
      setPriorities("");
      setBlockers("");
      setMood(0);
      setNotes("");
      loadedWeekRef.current = weekOf;
    }
  }, [myPulse, myPulses, weekOf]);

  // Reset loaded tracking when week changes so we re-populate from server
  useEffect(() => {
    loadedWeekRef.current = null;
  }, [weekOf]);

  const submitPulse = useSubmitPulse();

  function handleSaveDraft() {
    if (!weekOf) return;
    submitPulse.mutate({
      weekOf,
      wins,
      priorities,
      blockers,
      mood: mood || undefined,
      notes: notes || undefined,
      submitted: false,
    });
  }

  function handleSubmit() {
    if (!weekOf || !wins.trim() || !priorities.trim() || mood === 0) return;
    submitPulse.mutate({
      weekOf,
      wins,
      priorities,
      blockers,
      mood,
      notes: notes || undefined,
      submitted: true,
    });
  }

  // ── Team Pulse state ────────────────────────────────────────────────────
  const { data: summary } = usePulseSummary(weekOf);

  // ── Week Selector ─────────────────────────────────────────────────────

  function WeekSelector() {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1.5 rounded-md hover:bg-surface transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-muted" />
        </button>
        <div className="text-sm font-medium text-foreground/80 min-w-[200px] text-center">
          {formatWeekLabel(weekOf)}
          {weekOffset === 0 && (
            <span className="ml-2 text-xs text-brand font-semibold">(Current)</span>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((o) => Math.min(o + 1, 0))}
          disabled={weekOffset >= 0}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            weekOffset >= 0 ? "text-muted/50 cursor-not-allowed" : "hover:bg-surface text-muted"
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // ── My Pulse View ───────────────────────────────────────────────────────

  function MyPulseView() {
    const canSubmit = wins.trim().length > 0 && priorities.trim().length > 0 && mood > 0;

    return (
      <div className="space-y-6">
        {isSubmitted && (
          <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">
              Pulse submitted for this week
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            What went well this week? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            placeholder="Share your wins and achievements..."
            rows={3}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Top priorities for next week? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={priorities}
            onChange={(e) => setPriorities(e.target.value)}
            placeholder="What are you focusing on next..."
            rows={3}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Any blockers or challenges?
          </label>
          <textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Anything blocking your progress..."
            rows={2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-2">
            How are you feeling? <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            {MOOD_EMOJIS.map((m, i) => {
              const value = i + 1;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMood(value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 transition-all",
                    mood === value
                      ? "border-brand bg-brand/5 scale-110"
                      : "border-border hover:border-border"
                  )}
                  title={m.label}
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-[10px] text-muted">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Anything else to share? <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional thoughts, shout-outs, or feedback..."
            rows={2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={submitPulse.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitPulse.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
              canSubmit && !submitPulse.isPending
                ? "bg-brand hover:bg-brand/90"
                : "bg-gray-300 cursor-not-allowed"
            )}
          >
            <Send className="h-4 w-4" />
            Submit Pulse
          </button>
          {submitPulse.isSuccess && (
            <span className="text-sm text-green-600 font-medium">Saved!</span>
          )}
          {submitPulse.isError && (
            <span className="text-sm text-red-600 font-medium">Error saving pulse</span>
          )}
        </div>
      </div>
    );
  }

  // ── Team Pulse View ─────────────────────────────────────────────────────

  function TeamPulseView() {
    const totalUsers = summary?.totalUsers ?? 0;
    const submitted = summary?.submitted ?? 0;
    const avgMood = summary?.avgMood ?? 0;
    const blockerCount = summary?.blockerCount ?? 0;
    const pulses: any[] = summary?.pulses ?? [];
    const submissionRate = totalUsers > 0 ? Math.round((submitted / totalUsers) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{submitted} / {totalUsers}</p>
                <p className="text-xs text-muted">Responses submitted</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-accent/20 p-2">
                <BarChart3 className="h-5 w-5 text-brand" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {avgMood > 0 ? (
                    <>
                      {getMoodEmoji(Math.round(avgMood))}{" "}
                      <span className="text-lg">{avgMood.toFixed(1)}</span>
                    </>
                  ) : (
                    "\u2014"
                  )}
                </p>
                <p className="text-xs text-muted">Average mood</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{blockerCount}</p>
                <p className="text-xs text-muted">Blockers flagged</p>
              </div>
            </div>
          </div>
        </div>

        {totalUsers > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted">Submission progress</span>
              <span className="text-xs text-muted">{submitted} of {totalUsers}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${submissionRate}%` }}
              />
            </div>
          </div>
        )}

        {pulses.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No pulses submitted for this week yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pulses.map((pulse: any) => (
              <div
                key={pulse.id}
                className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {pulse.user?.avatar ? (
                      <img
                        src={pulse.user.avatar}
                        alt={pulse.user.name ?? ""}
                        className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-brand flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {pulse.user?.name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase() ?? <User className="h-4 w-4" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {pulse.user?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted truncate">{pulse.user?.email}</p>
                    </div>
                  </div>
                  <span className="text-xl flex-shrink-0" title={`Mood: ${pulse.mood}`}>
                    {getMoodEmoji(pulse.mood ?? 3)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pulse.wins && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted mb-0.5">Wins</p>
                      <p className="text-sm text-foreground/80 line-clamp-2">{pulse.wins}</p>
                    </div>
                  )}
                  {pulse.priorities && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted mb-0.5">Priorities</p>
                      <p className="text-sm text-foreground/80 line-clamp-2">{pulse.priorities}</p>
                    </div>
                  )}
                </div>

                {pulse.blockers && pulse.blockers.trim() && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted mb-0.5">Blockers</p>
                    <p className="text-sm text-red-700 bg-red-50 rounded px-2 py-1 line-clamp-2">{pulse.blockers}</p>
                  </div>
                )}

                {pulse.notes && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted mb-0.5">Notes</p>
                    <p className="text-sm text-muted line-clamp-2">{pulse.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="inline-flex rounded-lg border border-border bg-surface/50 p-0.5">
          <button
            onClick={() => setView("my")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "my" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            My Pulse
          </button>
          {isLeader && (
            <button
              onClick={() => setView("team")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                view === "team" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              Team Pulse
            </button>
          )}
        </div>
        <WeekSelector />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {view === "my" ? <MyPulseView /> : <TeamPulseView />}
      </div>
    </div>
  );
}
