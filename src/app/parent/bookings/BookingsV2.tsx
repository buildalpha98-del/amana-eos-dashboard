"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import {
  useParentBookings,
  useParentChildren,
  useRequestBooking,
  useCancelBooking,
  type BookingRecord,
  type ParentChild,
} from "@/hooks/useParentPortal";
import {
  SessionCard,
  SectionLabel,
  PullSheet,
  SwipeActions,
} from "@/components/parent/ui";
import { MarkAbsentSheet } from "@/components/parent/MarkAbsentSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { isTodayOrFutureInServiceTz } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "past" | "requests";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "requests", label: "Requests" },
];

export default function BookingsV2() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "upcoming";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sheetOpen, setSheetOpen] = useState(
    searchParams.get("new") === "1",
  );
  const [absentBooking, setAbsentBooking] = useState<BookingRecord | null>(null);

  const period: "upcoming" | "past" = tab === "past" ? "past" : "upcoming";
  const { data, isLoading } = useParentBookings(period);

  const bookings = data?.bookings ?? [];
  const filtered = useMemo(() => {
    if (tab === "upcoming")
      return bookings.filter(
        (b) => b.status === "confirmed" || b.status === "waitlisted",
      );
    if (tab === "past") return bookings;
    if (tab === "requests")
      return bookings.filter((b) => b.status === "requested");
    return bookings;
  }, [bookings, tab]);

  const grouped = useMemo(() => groupByWeek(filtered), [filtered]);

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="mb-5">
        <h1 className="text-[24px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight">
          Bookings
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">
          Sessions, requests and past attendance.
        </p>
      </header>

      {/* Segmented control */}
      <div className="flex border-b border-[color:var(--color-border)] mb-4 sticky top-14 bg-[#FFFAE6] z-10 -mx-4 px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors relative min-h-[44px]",
              tab === t.key
                ? "text-[color:var(--color-brand)]"
                : "text-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]",
            )}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[color:var(--color-brand)] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        grouped.map((group) => (
          <section key={group.label} aria-label={group.label} className="mb-5">
            <SectionLabel label={group.label} />
            <div className="space-y-2.5">
              {group.items.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  allowModify={tab === "upcoming"}
                  onMarkAbsent={() => setAbsentBooking(b)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed right-4 bottom-20 sm:bottom-6 z-20 h-14 pl-4 pr-5 rounded-full bg-[color:var(--color-accent)] text-[color:var(--color-foreground)] font-semibold shadow-[var(--shadow-warm-lg)] hover:shadow-xl transition-shadow flex items-center gap-2 min-h-[56px]"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Book a casual session"
      >
        <Plus className="w-5 h-5" />
        <span>Book</span>
      </button>

      {/* Fast-book sheet */}
      <FastBookSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Mark Absent sheet */}
      <MarkAbsentSheet
        booking={absentBooking}
        onClose={() => setAbsentBooking(null)}
      />
    </div>
  );
}

// ─── Week grouping ───────────────────────────────────────

interface WeekGroup {
  label: string;
  items: BookingRecord[];
}

function groupByWeek(bookings: BookingRecord[]): WeekGroup[] {
  const map = new Map<string, BookingRecord[]>();
  for (const b of bookings) {
    const key = weekStartKey(new Date(b.date));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  const now = new Date();
  const thisWeek = weekStartKey(now);
  const nextWeek = weekStartKey(new Date(now.getTime() + 7 * 86400000));

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      label:
        key === thisWeek
          ? "This week"
          : key === nextWeek
            ? "Next week"
            : `Week of ${new Date(key).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
              })}`,
      items: items.sort((x, y) => x.date.localeCompare(y.date)),
    }));
}

function weekStartKey(d: Date): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // Monday = start
  copy.setDate(copy.getDate() - diff);
  return copy.toISOString().slice(0, 10);
}

// ─── Booking row with swipe actions ──────────────────────

const SESSION_LABELS: Record<"bsc" | "asc" | "vc", string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VC",
};

function BookingRow({
  booking,
  allowModify,
  onMarkAbsent,
}: {
  booking: BookingRecord;
  allowModify: boolean;
  onMarkAbsent: () => void;
}) {
  const cancel = useCancelBooking();
  const statusVariant =
    booking.status === "confirmed"
      ? "confirmed"
      : booking.status === "requested"
        ? "requested"
        : booking.status === "waitlisted"
          ? "waitlisted"
          : booking.status === "cancelled"
            ? "declined"
            : "overdue";

  const card = (
    <SessionCard
      date={new Date(booking.date)}
      label={`${booking.child.firstName} — ${SESSION_LABELS[booking.sessionType]}`}
      sublabel={booking.service.name}
      status={statusVariant}
    />
  );

  if (!allowModify) return card;

  const canMarkAbsent =
    booking.status === "confirmed" && isTodayOrFutureInServiceTz(booking.date);

  const actions: Parameters<typeof SwipeActions>[0]["actions"] = [];
  if (canMarkAbsent) {
    actions.push({ label: "Mark absent", tone: "neutral", onPress: onMarkAbsent });
  }
  actions.push({
    label: "Cancel",
    tone: "danger",
    onPress: () => {
      if (
        typeof window !== "undefined" &&
        window.confirm(
          `Cancel ${booking.child.firstName}'s session on ${new Date(booking.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}?`,
        )
      ) {
        cancel.mutate(booking.id);
      }
    },
  });

  return <SwipeActions actions={actions}>{card}</SwipeActions>;
}

// ─── Empty state ─────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  const message =
    tab === "upcoming"
      ? "No upcoming sessions yet. Tap Book to request one."
      : tab === "past"
        ? "No past bookings to show."
        : "No pending requests.";
  return (
    <div className="warm-card text-center py-10">
      <p className="text-sm text-[color:var(--color-muted)]">{message}</p>
    </div>
  );
}

// ─── Fast-book sheet ─────────────────────────────────────

function FastBookSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: children } = useParentChildren();
  const request = useRequestBooking();

  const [step, setStep] = useState(1);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [sessionType, setSessionType] = useState<"bsc" | "asc" | "vc">("asc");

  const selectedChild =
    (children ?? []).find((c) => c.id === selectedChildId) ?? null;

  const reset = () => {
    setStep(1);
    setSelectedChildId(null);
    setDates([]);
    setSessionType("asc");
  };

  const handleSubmit = async () => {
    if (!selectedChild || dates.length === 0) return;
    const serviceId = selectedChild.serviceId;
    try {
      for (const date of dates) {
        await request.mutateAsync({
          childId: selectedChild.id,
          serviceId,
          date,
          sessionType,
        });
      }
      reset();
      onOpenChange(false);
    } catch {
      // useRequestBooking already toasts on error
    }
  };

  return (
    <PullSheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <div className="space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-heading font-bold text-[color:var(--color-foreground)]">
            Book a casual
          </h2>
          <span className="text-xs text-[color:var(--color-muted)]">Step {step} of 3</span>
        </header>

        {step === 1 && (
          <Step1PickChild
            children={children ?? []}
            selected={selectedChildId}
            onSelect={(id) => {
              setSelectedChildId(id);
              setStep(2);
            }}
          />
        )}

        {step === 2 && selectedChild && (
          <Step2PickDates
            child={selectedChild}
            dates={dates}
            setDates={setDates}
            sessionType={sessionType}
            setSessionType={setSessionType}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && selectedChild && (
          <Step3Review
            child={selectedChild}
            dates={dates}
            sessionType={sessionType}
            onBack={() => setStep(2)}
            submitting={request.isPending}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </PullSheet>
  );
}

function Step1PickChild({
  children,
  selected,
  onSelect,
}: {
  children: ParentChild[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (children.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)] text-center py-8">
        No children on your account.
      </p>
    );
  }
  if (children.length === 1) {
    // Auto-advance when single child
    setTimeout(() => onSelect(children[0].id), 0);
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-[color:var(--color-foreground)]/80 mb-2">
        Which child is this for?
      </p>
      {children.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            "w-full warm-card text-left flex items-center gap-3 transition-all",
            selected === c.id &&
              "border-[color:var(--color-brand)] shadow-[var(--shadow-warm-md)]",
          )}
        >
          <span className="font-semibold">
            {c.firstName} {c.lastName}
          </span>
          <span className="text-xs text-[color:var(--color-muted)] ml-auto">
            {c.serviceName}
          </span>
        </button>
      ))}
    </div>
  );
}

function Step2PickDates({
  child,
  dates,
  setDates,
  sessionType,
  setSessionType,
  onBack,
  onNext,
}: {
  child: ParentChild;
  dates: string[];
  setDates: (d: string[]) => void;
  sessionType: "bsc" | "asc" | "vc";
  setSessionType: (t: "bsc" | "asc" | "vc") => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const upcoming14 = useMemo(() => {
    const now = new Date();
    const out: { key: string; display: string; day: number; weekday: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
      const key = d.toISOString().slice(0, 10);
      out.push({
        key,
        display: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
        day: d.getDate(),
        weekday: d.toLocaleDateString("en-AU", { weekday: "short" }),
      });
    }
    return out;
  }, []);

  const toggleDate = (key: string) => {
    if (dates.includes(key)) setDates(dates.filter((d) => d !== key));
    else setDates([...dates, key]);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-2">
          Session
        </p>
        <div className="flex gap-2">
          {(["bsc", "asc", "vc"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSessionType(t)}
              className={cn(
                "flex-1 py-2 rounded-[var(--radius-sm)] text-sm font-semibold border transition-all min-h-[44px]",
                sessionType === t
                  ? "bg-[color:var(--color-brand)] border-[color:var(--color-brand)] text-white"
                  : "bg-[color:var(--color-cream-soft)] border-[color:var(--color-border)] text-[color:var(--color-foreground)]/70",
              )}
            >
              {SESSION_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-2">
          Dates <span className="normal-case text-[color:var(--color-muted)]/70">(tap to select)</span>
        </p>
        <div className="grid grid-cols-4 gap-2">
          {upcoming14.map((d) => {
            const active = dates.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDate(d.key)}
                className={cn(
                  "rounded-[var(--radius-sm)] p-2 text-center border transition-all min-h-[60px]",
                  active
                    ? "bg-[color:var(--color-brand)] border-[color:var(--color-brand)] text-white"
                    : "bg-[color:var(--color-cream-soft)] border-[color:var(--color-border)] text-[color:var(--color-foreground)]/80",
                )}
              >
                <div className="text-[10px] font-bold tracking-wider">{d.weekday.toUpperCase()}</div>
                <div className="text-base font-bold leading-none mt-0.5">{d.day}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] font-semibold text-[color:var(--color-foreground)]/70 min-h-[44px]"
        >
          Back
        </button>
        <button
          type="button"
          disabled={dates.length === 0}
          onClick={onNext}
          className="flex-1 py-3 rounded-[var(--radius-md)] bg-[color:var(--color-brand)] text-white font-semibold disabled:opacity-50 min-h-[44px]"
        >
          Review ({dates.length})
        </button>
      </div>
    </div>
  );
}

function Step3Review({
  child,
  dates,
  sessionType,
  onBack,
  onSubmit,
  submitting,
}: {
  child: ParentChild;
  dates: string[];
  sessionType: "bsc" | "asc" | "vc";
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="warm-card space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-[color:var(--color-muted)]">
          Child
        </p>
        <p className="text-base font-semibold">
          {child.firstName} {child.lastName}
        </p>
        <p className="text-xs text-[color:var(--color-muted)]">{child.serviceName}</p>
      </div>

      <div className="warm-card space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-[color:var(--color-muted)]">
          Session
        </p>
        <p className="text-base font-semibold">
          {sessionType === "bsc"
            ? "Before School Care"
            : sessionType === "asc"
              ? "After School Care"
              : "Vacation Care"}
        </p>
      </div>

      <div className="warm-card space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-[color:var(--color-muted)]">
          {dates.length === 1 ? "Date" : `${dates.length} dates`}
        </p>
        <ul className="space-y-0.5">
          {dates.sort().map((d) => (
            <li key={d} className="text-sm">
              {new Date(d).toLocaleDateString("en-AU", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-[color:var(--color-muted)] leading-snug">
        You&apos;ll receive an email confirmation once the centre approves. Rates will be shown in the confirmation.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 py-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] font-semibold text-[color:var(--color-foreground)]/70 disabled:opacity-50 min-h-[44px]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 py-3 rounded-[var(--radius-md)] bg-[color:var(--color-brand)] text-white font-semibold disabled:opacity-50 min-h-[44px]"
        >
          {submitting ? "Sending..." : "Confirm request"}
        </button>
      </div>
    </div>
  );
}
