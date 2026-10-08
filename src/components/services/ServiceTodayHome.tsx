"use client";

/**
 * The centre's Today screen — the one screen a shift lives on
 * (staff-UX Round 2, 2026-10-09; mock-up in the "Centre Section Review"
 * artifact).
 *
 * Order is the order of a shift: am I clocked in → who is the Responsible
 * Person → who's here vs booked (the door) → what's due → quick ways to log
 * things. Coordinators get a "Needs you" box first. Every number comes from
 * ONE source, /api/services/[id]/dashboard (shared with the Coordinator
 * dashboard via the same query key), so "who's on" can't disagree between
 * screens again.
 *
 * Every tile is a deep link (?tab=&sub=) — the guard test in
 * src/__tests__/lib/service-deep-links.test.ts keeps them pointing at real
 * sections.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  LogIn,
  Megaphone,
  Pill,
  Receipt,
  ShieldAlert,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/role-permissions";
import { Skeleton } from "@/components/ui/Skeleton";
import { MyClockCard } from "@/components/my-portal/MyClockCard";
import { RatioWidget } from "./RatioWidget";
import { ChecklistsTodayWidget } from "./ChecklistsTodayWidget";
import { ShiftHandoverWidget } from "./ShiftHandoverWidget";
import { ServiceTodayPanel } from "./ServiceTodayPanel";
import type { ServiceDashboardResponse } from "@/app/api/services/[id]/dashboard/route";

function useCentreDay(serviceId: string) {
  return useQuery<ServiceDashboardResponse>({
    // Same key as CentreDashboard — one request, one set of numbers.
    queryKey: ["centre-day", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/dashboard`),
    refetchInterval: 60_000,
    retry: 2,
  });
}

function Tile({
  href,
  icon: Icon,
  value,
  label,
  note,
  noteTone = "muted",
}: {
  href: string;
  icon: LucideIcon;
  value?: string | number;
  label: string;
  note?: string;
  noteTone?: "muted" | "warn";
}) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col justify-between gap-1 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-surface active:bg-surface"
    >
      <span className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5 text-brand" aria-hidden />
        {value !== undefined && (
          <span className="text-xl font-heading font-semibold text-foreground tabular-nums">
            {value}
          </span>
        )}
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {note && (
        <span
          className={cn(
            "text-2xs",
            noteTone === "warn" ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted",
          )}
        >
          {note}
        </span>
      )}
    </Link>
  );
}

export function ServiceTodayHome({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const isCentreAccount = session?.user?.isCentreAccount === true;
  const isEducator = role === "staff";
  // Coordinators (at their own centre) and office see the approvals box
  // and the centre to-dos.
  const canManage =
    isAdminRole(role) || (role === "member" && session?.user?.serviceId === serviceId);

  const { data, isLoading } = useCentreDay(serviceId);
  const svc = `/services/${serviceId}`;

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { totals, programmes, staff, attention } = data;
  const toArrive = programmes.reduce(
    (n, p) => n + Math.max(0, p.booked - p.inCare - p.wentHome - p.absent),
    0,
  );
  const leaders = programmes.filter((p) => p.leader);
  const rpMissing = programmes.length > 0 && leaders.length < programmes.length;

  const needs = [
    { n: attention.postsAwaitingApproval, label: "Posts waiting for approval", href: `${svc}?tab=daily&sub=posts`, icon: Megaphone },
    { n: attention.openIncidents, label: "Incidents to complete", href: `${svc}?tab=compliance&sub=incidents`, icon: ShieldAlert },
    { n: attention.pendingBookingRequests, label: "Booking requests", href: "/bookings", icon: CalendarPlus },
    { n: attention.purchaseApprovalsPending, label: "Purchase approvals", href: `${svc}?tab=finance&sub=approvals`, icon: Receipt },
    { n: attention.expiringCerts, label: "Staff documents expiring", href: "/compliance", icon: FileWarning },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-4">
      {/* 1 · Am I clocked in? (A shared centre login isn't a person —
          it can't clock in, so it gets no card.) */}
      {!isCentreAccount && session?.user?.id && <MyClockCard userId={session.user.id} />}

      {/* 2 · Needs you — Coordinators and office only */}
      {canManage && (
        <section aria-labelledby="needs-you" className="rounded-xl border border-border bg-card">
          <h2
            id="needs-you"
            className="flex items-center justify-between px-4 pt-3 pb-2 text-sm font-heading font-semibold text-foreground"
          >
            Needs you
            {needs.length > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-brand tabular-nums">
                {needs.reduce((n, r) => n + r.n, 0)}
              </span>
            )}
          </h2>
          {needs.length === 0 ? (
            <p className="px-4 pb-3 text-sm text-muted">All clear — nothing waiting on you.</p>
          ) : (
            <ul className="divide-y divide-border">
              {needs.map((r) => (
                <li key={r.label}>
                  <Link
                    href={r.href}
                    className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-surface"
                  >
                    <r.icon className="h-4 w-4 text-brand" aria-hidden />
                    <span className="flex-1">{r.label}</span>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-brand tabular-nums">
                      {r.n}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 3 · Responsible Person — regulatory, and educators couldn't see it */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <UserCheck className="h-4 w-4 text-brand" aria-hidden />
          Responsible Person
        </span>
        {leaders.length === 0 && programmes.length === 0 && (
          <span className="text-muted">No sessions today</span>
        )}
        {programmes.map((p) => (
          <span key={p.key} className="text-muted">
            {programmes.length > 1 && <>{p.name}: </>}
            {p.leader ? (
              <strong className="text-foreground">{p.leader}</strong>
            ) : canManage ? (
              <Link href={`${svc}?tab=daily&sub=roster`} className="font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-300">
                not set
              </Link>
            ) : (
              <span className="font-semibold text-amber-700 dark:text-amber-300">not set</span>
            )}
          </span>
        ))}
      </div>
      {rpMissing && isEducator && (
        <p className="-mt-2 px-1 text-2xs text-muted">
          Tell your Coordinator — a Responsible Person must be named for every session.
        </p>
      )}

      {/* 4 · The door — the one number that matters on the floor */}
      <Link
        href={`${svc}?tab=daily&sub=sign-in-out`}
        className="flex items-center gap-4 rounded-xl bg-brand p-4 text-white shadow-sm transition-opacity hover:opacity-95"
      >
        <LogIn className="h-7 w-7 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-heading font-semibold tabular-nums">
            {totals.inCare} in · {totals.booked} booked
          </span>
          <span className="block text-sm text-white/80">
            Sign in / out
            {toArrive > 0 ? ` · ${toArrive} still to arrive` : ""}
            {totals.absent > 0 ? ` · ${totals.absent} absent` : ""}
          </span>
        </span>
      </Link>

      {/* 5 · What's due + quick ways to log things */}
      <nav aria-label="Shift actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          href={`${svc}?tab=daily&sub=checklists`}
          icon={ClipboardCheck}
          value={attention.checklistsOutstanding}
          label="Checklists"
          note={attention.checklistsOutstanding > 0 ? "still to finish today" : "all done"}
          noteTone={attention.checklistsOutstanding > 0 ? "warn" : "muted"}
        />
        <Tile
          href={`${svc}?tab=daily&sub=medication`}
          icon={Pill}
          value={attention.medicationsGivenToday}
          label="Medication"
          note="given today"
        />
        <Tile
          href={`${svc}?tab=daily&sub=ratios`}
          icon={Users}
          value={`${staff.onDuty.length}${staff.rosteredToday ? ` of ${staff.rosteredToday}` : ""}`}
          label="Staff on the floor"
          note={
            staff.notCheckedIn.length > 0
              ? `${staff.notCheckedIn[0].name}${staff.notCheckedIn.length > 1 ? ` +${staff.notCheckedIn.length - 1}` : ""} not clocked in`
              : undefined
          }
          noteTone="warn"
        />
        <Tile href={`${svc}?tab=daily&sub=roll-call`} icon={ClipboardList} label="Roll call" />
        <Tile href={`${svc}?tab=compliance&sub=incidents`} icon={AlertTriangle} label="Log an incident" />
        <Tile href={`${svc}?tab=daily&sub=posts`} icon={Megaphone} label="Post to families" />
        <Tile
          href={`${svc}?tab=compliance&sub=registers`}
          icon={UserCheck}
          value={attention.visitorsOnSite}
          label="Visitors"
          note={attention.visitorsOnSite > 0 ? "on site now" : "sign one in"}
        />
        <Tile href={`${svc}?tab=compliance&sub=headcounts`} icon={Users} label="Headcount" />
      </nav>

      <div>
        <h3 className="mb-2 text-2xs font-heading font-semibold uppercase tracking-[0.08em] text-muted">
          Live ratio
        </h3>
        <RatioWidget serviceId={serviceId} compact />
      </div>
      <ChecklistsTodayWidget serviceId={serviceId} />
      <ShiftHandoverWidget serviceId={serviceId} />

      {/* Centre to-dos and tickets — management work, not the floor's. */}
      {canManage && <ServiceTodayPanel serviceId={serviceId} hideLiveCards />}
    </div>
  );
}
