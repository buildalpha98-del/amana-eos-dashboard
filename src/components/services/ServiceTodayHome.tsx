"use client";

/**
 * The centre's Today screen — modelled on OWNA's centre home (Daniel's
 * screenshot and approved mock-up, 2026-10-09; first built as Round 2).
 *
 * Top to bottom, the order you scan a centre in: am I clocked in → the
 * Responsible Person / medication / attendances strip → quick buttons with
 * counts → (Coordinators) what's waiting on you → one card per room with
 * in / booked, staff signed in vs required and a green or red ratio badge →
 * staff signed in since when → visitors on site. The live ratio lives here
 * now; its history is Compliance → Ratio log.
 *
 * Every number comes from ONE source, /api/services/[id]/dashboard (same
 * query key as the Coordinator dashboard), so the screens can't disagree.
 * Every link is a deep link checked by src/__tests__/lib/service-deep-links.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarPlus,
  ClipboardCheck,
  FileWarning,
  LogIn,
  Megaphone,
  Pill,
  Receipt,
  ShieldAlert,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/role-permissions";
import { Skeleton } from "@/components/ui/Skeleton";
import { MyClockCard } from "@/components/my-portal/MyClockCard";
import { ChecklistsTodayWidget } from "./ChecklistsTodayWidget";
import { ShiftHandoverWidget } from "./ShiftHandoverWidget";
import { ServiceTodayPanel } from "./ServiceTodayPanel";
import { DoorIpadCard } from "./DoorIpadCard";
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

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A quick-action button with an optional count, like OWNA's top row. */
function Quick({ href, icon: Icon, label, count }: { href: string; icon: LucideIcon; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface active:bg-surface"
    >
      <Icon className="h-4 w-4 text-brand" aria-hidden />
      {label}
      {count ? (
        <span className="rounded-full bg-red-50 px-1.5 text-2xs font-bold text-red-700 tabular-nums dark:bg-red-950/40 dark:text-red-300">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/** A person with a photo or initials and a "since" stamp. */
function Person({ name, avatar, stamp, late }: { name: string; avatar?: string | null; stamp: string; late?: boolean }) {
  return (
    <li className="flex w-20 flex-col items-center gap-1 text-center">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- Blob-hosted avatar
        <img src={avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <span
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full text-sm font-bold text-white",
            late ? "bg-muted" : "bg-brand",
          )}
        >
          {initials(name)}
        </span>
      )}
      <span className="w-full truncate text-xs font-medium text-foreground">{name}</span>
      <span
        className={cn(
          "rounded px-1.5 text-2xs font-bold",
          late ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-green-700 text-white",
        )}
      >
        {stamp}
      </span>
    </li>
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
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { totals, programmes, staff, attention, visitors } = data;
  const toArrive = programmes.reduce(
    (n, p) => n + Math.max(0, p.booked - p.inCare - p.wentHome - p.absent),
    0,
  );
  // Every room, as OWNA shows them; one with no bookings reads "No
  // bookings today" rather than disappearing.
  const rooms = programmes;
  const running = programmes.filter((p) => p.booked > 0 || p.inCare > 0 || p.staffClockedIn > 0);
  const rpMissing = running.some((p) => !p.leader);

  const needs = [
    { n: attention.postsAwaitingApproval, label: "Posts waiting for approval", href: `${svc}?tab=daily&sub=posts`, icon: Megaphone },
    { n: attention.openIncidents, label: "Incidents to complete", href: `${svc}?tab=compliance&sub=incidents`, icon: ShieldAlert },
    { n: attention.pendingBookingRequests, label: "Booking requests", href: "/bookings", icon: CalendarPlus },
    { n: attention.purchaseApprovalsPending, label: "Purchase approvals", href: `${svc}?tab=finance&sub=approvals`, icon: Receipt },
    { n: attention.expiringCerts, label: "Staff documents expiring", href: "/compliance", icon: FileWarning },
    { n: attention.hazardsOpen ?? 0, label: "Hazards to fix", href: `${svc}?tab=compliance&sub=hazards`, icon: Wrench },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-4">
      {/* The door iPad — Coordinators / centre login, on an iPad. */}
      {canManage && <DoorIpadCard serviceId={serviceId} />}

      {/* Am I clocked in? (A shared centre login isn't a person.) */}
      {!isCentreAccount && session?.user?.id && <MyClockCard userId={session.user.id} />}

      {/* ── The strip: Responsible Person · Medication · Attendances ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="rp-h">
          <h2 id="rp-h" className="flex items-center gap-1.5 text-sm font-heading font-semibold text-foreground">
            <UserCheck className="h-4 w-4 text-brand" aria-hidden />
            Responsible Person
          </h2>
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {running.length === 0 && <li className="text-muted">No sessions today</li>}
            {running.map((p) => (
              <li key={p.key} className="text-muted">
                {running.length > 1 && <>{p.name}: </>}
                {p.leader ? (
                  <strong className="text-foreground">{p.leader}</strong>
                ) : canManage ? (
                  <Link
                    href={`${svc}?tab=daily&sub=roster`}
                    className="font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-300"
                  >
                    not set
                  </Link>
                ) : (
                  <span className="font-semibold text-amber-700 dark:text-amber-300">not set</span>
                )}
              </li>
            ))}
          </ul>
          {rpMissing && isEducator && (
            <p className="mt-1 text-2xs text-muted">Tell your Coordinator: every session needs one named.</p>
          )}
        </section>

        <Link
          href={`${svc}?tab=daily&sub=medication`}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface"
        >
          <h2 className="flex items-center gap-1.5 text-sm font-heading font-semibold text-foreground">
            <Pill className="h-4 w-4 text-red-600" aria-hidden />
            Medication today
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {attention.medicationsGivenToday > 0 ? `${attention.medicationsGivenToday} given so far` : "None given yet"}
          </p>
        </Link>

        <Link
          href={`${svc}?tab=daily&sub=roll-call`}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface"
        >
          <h2 className="flex items-center justify-between gap-2 text-sm font-heading font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <LogIn className="h-4 w-4 text-brand" aria-hidden />
              Attendances today
            </span>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-800 tabular-nums dark:bg-green-950/40 dark:text-green-200">
              {totals.inCare} / {totals.booked}
            </span>
          </h2>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div
              className="h-full bg-brand"
              style={{ width: `${totals.booked ? Math.min(100, (totals.inCare / totals.booked) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {[
              toArrive > 0 && `${toArrive} still to arrive`,
              totals.casual > 0 && `${totals.casual} casual`,
              totals.absent > 0 && `${totals.absent} absent`,
            ]
              .filter(Boolean)
              .join(" · ") || "Sign in & out"}
          </p>
        </Link>
      </div>

      {/* ── Quick buttons, with counts ── */}
      <nav aria-label="Shift actions" className="flex flex-wrap gap-2">
        <Quick href={`${svc}?tab=daily&sub=roll-call`} icon={LogIn} label="Sign in & out" />
        <Quick href={`${svc}?tab=daily&sub=posts`} icon={Megaphone} label="Post" />
        <Quick href={`${svc}?tab=compliance&sub=incidents`} icon={AlertTriangle} label="Incidents" count={attention.openIncidents} />
        <Quick href={`${svc}?tab=daily&sub=checklists`} icon={ClipboardCheck} label="Checklists" count={attention.checklistsOutstanding} />
        <Quick href={`${svc}?tab=compliance&sub=hazards`} icon={Wrench} label="Hazards" count={attention.hazardsOpen} />
        <Quick href={`${svc}?tab=compliance&sub=registers`} icon={UserCheck} label="Visitors" />
        <Quick href={`${svc}?tab=compliance&sub=headcounts`} icon={Users} label="Headcount" />
      </nav>

      {/* ── Needs you — Coordinators and office only ── */}
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
                  <Link href={r.href} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-surface">
                    <r.icon className="h-4 w-4 text-brand" aria-hidden />
                    <span className="flex-1">{r.label}</span>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-brand tabular-nums">{r.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── One card per room: in / booked, staff vs required, ratio ── */}
      <div className="grid gap-3 md:grid-cols-3">
        {rooms.map((p) => {
          const empty = p.inCare === 0;
          const noBookings = p.booked === 0 && p.inCare === 0;
          const short = p.staffRequired - p.staffClockedIn;
          return (
            <section
              key={p.key}
              aria-label={`${p.name} ratio`}
              className={cn(
                "rounded-xl border p-4",
                empty
                  ? "border-border bg-card"
                  : p.inRatio
                    ? "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30"
                    : "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30",
              )}
            >
              <h3 className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-heading font-semibold text-brand">
                  {p.name} · <span className="tabular-nums">{p.inCare} in / {p.booked}</span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-2xs font-bold",
                    empty
                      ? "bg-surface text-muted"
                      : p.inRatio
                        ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
                  )}
                >
                  {noBookings
                    ? "No bookings today"
                    : empty
                      ? "No children in yet"
                      : p.inRatio
                        ? `In ratio ${p.minRatio}`
                        : `Need ${short} more staff`}
                </span>
              </h3>
              <p className="mt-2 text-sm text-foreground">
                Staff signed in <b className="tabular-nums">{p.staffClockedIn}</b> · Required{" "}
                <b className="tabular-nums">{p.staffRequired}</b>
                {p.educatorsOnFloor !== p.staffClockedIn && (
                  <span className="text-muted"> · Rostered now {p.educatorsOnFloor}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">Leader: {p.leader ?? "not set"}</p>
            </section>
          );
        })}
      </div>

      {/* ── Staff signed in, since when ── */}
      <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="staff-in-h">
        <h2 id="staff-in-h" className="flex items-center justify-between text-sm font-heading font-semibold text-foreground">
          Staff signed in · {staff.onDuty.length}
          {canManage && (
            <Link href={`${svc}?tab=daily&sub=roster`} className="text-xs font-medium text-brand underline underline-offset-2">
              Roster
            </Link>
          )}
        </h2>
        {staff.onDuty.length === 0 && staff.notCheckedIn.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody signed in yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {staff.onDuty.map((s) => (
              <Person key={s.id} name={s.name} avatar={s.avatar} stamp={s.since ? `since ${s.since}` : "in"} />
            ))}
            {staff.notCheckedIn.map((s) => (
              <Person key={s.id} name={s.name} stamp={`not in · ${s.shiftStart}`} late />
            ))}
          </ul>
        )}
      </section>

      {/* ── Visitors on site ── */}
      <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="visitors-h">
        <h2 id="visitors-h" className="flex items-center justify-between text-sm font-heading font-semibold text-foreground">
          Visitors on site · {visitors.length}
          <Link href={`${svc}?tab=compliance&sub=registers`} className="text-xs font-medium text-brand underline underline-offset-2">
            Sign one in
          </Link>
        </h2>
        {visitors.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No visitors signed in.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {visitors.map((v) => (
              <Person key={v.id} name={v.name} stamp={`since ${v.since}`} />
            ))}
          </ul>
        )}
      </section>

      <ChecklistsTodayWidget serviceId={serviceId} />
      <ShiftHandoverWidget serviceId={serviceId} />

      {/* Centre to-dos and tickets — management work, not the floor's. */}
      {canManage && <ServiceTodayPanel serviceId={serviceId} hideLiveCards />}
    </div>
  );
}
