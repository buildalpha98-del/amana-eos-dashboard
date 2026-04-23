"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowLeft,
  AlertCircle,
  CalendarDays,
  MessageCircle,
  Plus,
  ChevronRight,
  Utensils,
} from "lucide-react";
import {
  useParentChildren,
  useChildAttendance,
  type ParentChild,
  type AttendanceDay,
} from "@/hooks/useParentPortal";
import {
  Avatar,
  SectionLabel,
  StatusBadge,
  type StatusVariant,
} from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export default function ChildDetailV2() {
  const { id } = useParams<{ id: string }>();
  const { data: children, isLoading: childrenLoading } = useParentChildren();
  const { data: attendance, isLoading: attLoading } = useChildAttendance(id);

  if (childrenLoading) return <DetailSkeleton />;

  const child = children?.find((c) => c.id === id);
  if (!child) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="warm-card text-center py-8">
          <p className="text-sm text-[color:var(--color-muted)]">Child not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-6">
      <BackLink />

      {/* ─── Hero ──────────────────────────────────────── */}
      <Hero child={child} />

      {/* ─── 14-day attendance strip ──────────────────── */}
      <section aria-label="Recent attendance">
        <SectionLabel
          label="Last 14 days"
          action={{ href: `/parent/children/${child.id}?tab=attendance`, text: "View all" }}
        />
        {attLoading ? (
          <Skeleton className="h-[76px] rounded-[var(--radius-lg)]" />
        ) : (
          <AttendanceStrip days={attendance ?? []} />
        )}
      </section>

      {/* ─── Medical card ─────────────────────────────── */}
      <MedicalCard child={child} />

      {/* ─── This week's menu (compact link to children page) ─── */}
      {child.serviceId && (
        <Link
          href={`/parent/children?service=${child.serviceId}`}
          className="warm-card flex items-center gap-3 hover:shadow-[var(--shadow-warm-md)] transition-shadow"
        >
          <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0">
            <Utensils className="w-5 h-5 text-[color:var(--color-brand)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">This week&apos;s menu</p>
            <p className="text-xs text-[color:var(--color-muted)] mt-0.5">
              {child.allergies.length > 0
                ? `Allergens flagged for ${child.firstName}: ${child.allergies.slice(0, 2).join(", ")}${child.allergies.length > 2 ? "…" : ""}`
                : "See today's meal and the full week"}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" />
        </Link>
      )}

      {/* ─── Sticky action bar ────────────────────────── */}
      <StickyActionBar childId={child.id} />
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────

function Hero({ child }: { child: ParentChild }) {
  const inCareToday = isInCare(child);
  const subtitle = [child.yearLevel, child.serviceName].filter(Boolean).join(" · ");
  return (
    <section className="warm-card flex items-center gap-4">
      <Avatar
        name={`${child.firstName} ${child.lastName}`}
        seed={child.id}
        size="xl"
      />
      <div className="flex-1 min-w-0">
        <h1 className="text-[22px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight">
          {child.firstName} {child.lastName}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-[color:var(--color-muted)] mt-0.5 truncate">
            {subtitle}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {inCareToday ? (
            <span className="relative inline-flex items-center">
              <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[color:var(--color-status-in-care-fg)] rounded-full animate-pulse-subtle" />
              <StatusBadge variant="in-care" />
            </span>
          ) : (
            <span className="text-xs text-[color:var(--color-muted)]">Not in today</span>
          )}
        </div>
      </div>
    </section>
  );
}

function isInCare(child: ParentChild): boolean {
  const attended = child.attendanceThisWeek?.attended ?? 0;
  // Rough heuristic — v1 (service-level) doesn't have per-kid live signin state.
  // A precise in-care flag would need a child-specific attendanceToday field.
  return attended > 0 && new Date().getHours() >= 15 && new Date().getHours() < 19;
}

// ─── Attendance strip ────────────────────────────────────

function AttendanceStrip({ days }: { days: AttendanceDay[] }) {
  const last14 = useMemo(() => buildLast14Days(days), [days]);
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {last14.map((day) => (
        <DayTile key={day.date} day={day} />
      ))}
    </div>
  );
}

function buildLast14Days(data: AttendanceDay[]): AttendanceDay[] {
  const map = new Map<string, AttendanceDay>();
  for (const d of data) map.set(d.date, d);

  const out: AttendanceDay[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(
      map.get(key) ?? {
        date: key,
        status: "no_session",
        signInTime: null,
        signOutTime: null,
      },
    );
  }
  return out;
}

function DayTile({ day }: { day: AttendanceDay }) {
  const d = new Date(day.date);
  const dayName = d.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase();
  const dayNum = d.getDate();
  const isToday = day.date === new Date().toISOString().slice(0, 10);

  const dotClass =
    day.status === "present"
      ? "bg-[color:var(--color-success)]"
      : day.status === "absent"
        ? "bg-[color:var(--color-danger)]/70"
        : "bg-[color:var(--color-border)]";

  return (
    <div
      className={cn(
        "min-w-[54px] rounded-[var(--radius-sm)] p-2 text-center shrink-0",
        isToday
          ? "bg-[color:var(--color-brand-soft)] border border-[color:var(--color-brand)]/20"
          : "bg-[color:var(--color-cream-soft)] border border-[color:var(--color-border)]",
      )}
    >
      <div
        className={cn(
          "text-[9px] font-bold tracking-wider",
          isToday ? "text-[color:var(--color-brand)]" : "text-[color:var(--color-muted)]",
        )}
      >
        {dayName}
      </div>
      <div
        className={cn(
          "text-sm font-bold leading-none mt-0.5",
          isToday ? "text-[color:var(--color-brand)]" : "text-[color:var(--color-foreground)]",
        )}
      >
        {dayNum}
      </div>
      <div className="mt-2 flex items-center justify-center">
        <span className={cn("w-2 h-2 rounded-full", dotClass)} />
      </div>
    </div>
  );
}

// ─── Medical card ────────────────────────────────────────

function MedicalCard({ child }: { child: ParentChild }) {
  const hasAny =
    child.medicalConditions.length > 0 ||
    child.allergies.length > 0 ||
    child.medications.length > 0;

  if (!hasAny) {
    return (
      <Link
        href={`/parent/children/${child.id}?tab=medical`}
        className="warm-card flex items-center justify-between hover:shadow-[var(--shadow-warm-md)] transition-shadow"
      >
        <div>
          <p className="text-sm font-semibold">Medical & allergies</p>
          <p className="text-xs text-[color:var(--color-muted)] mt-0.5">
            No notes on file · Update
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      href={`/parent/children/${child.id}?tab=medical`}
      className="warm-card block hover:shadow-[var(--shadow-warm-md)] transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[color:var(--color-status-alert-fg)]" />
          <p className="text-sm font-semibold">Medical & allergies</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {child.medicalConditions.map((c) => (
          <Chip key={`cond-${c}`} label={c} />
        ))}
        {child.allergies.map((c) => (
          <Chip key={`alg-${c}`} label={c} tone="alert" />
        ))}
        {child.medications.map((c) => (
          <Chip key={`med-${c}`} label={c} />
        ))}
      </div>
    </Link>
  );
}

function Chip({ label, tone }: { label: string; tone?: "alert" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "alert"
          ? "bg-[color:var(--color-status-alert-bg)] text-[color:var(--color-status-alert-fg)]"
          : "bg-[color:var(--color-cream-deep)] text-[color:var(--color-foreground)]/80",
      )}
    >
      {label}
    </span>
  );
}

// ─── Sticky action bar ───────────────────────────────────

function StickyActionBar({ childId }: { childId: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-16 sm:bottom-0 sm:relative sm:inset-x-auto z-20 mx-auto max-w-2xl px-4 pt-2 pb-2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      aria-label="Quick actions"
    >
      <div className="warm-card !p-2 flex items-stretch gap-2 shadow-[var(--shadow-warm-lg)]">
        <ActionButton
          href={`/parent/messages?to=centre`}
          icon={MessageCircle}
          label="Message"
        />
        <ActionButton
          href={`/parent/bookings?new=1&child=${childId}`}
          icon={Plus}
          label="Book"
        />
        <ActionButton
          href={`/parent/bookings?child=${childId}`}
          icon={CalendarDays}
          label="Change"
        />
      </div>
    </nav>
  );
}

function ActionButton({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-[var(--radius-md)] text-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)] hover:bg-[color:var(--color-brand-soft)]/80 transition-colors min-h-[44px]"
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}

// ─── Misc ────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/parent/children"
      className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-light)] min-h-[44px]"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to children
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-[88px] rounded-[var(--radius-lg)]" />
      <Skeleton className="h-[76px] rounded-[var(--radius-lg)]" />
      <Skeleton className="h-[60px] rounded-[var(--radius-lg)]" />
    </div>
  );
}
