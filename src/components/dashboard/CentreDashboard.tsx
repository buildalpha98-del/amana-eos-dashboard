"use client";

/**
 * The centre view — what an Educator or Director of Service sees when
 * they log in.
 *
 * Shaped around the question those two roles actually open the laptop
 * to answer: who is here right now, who is running each programme, and
 * what needs doing before the session ends. Everything above the fold
 * is today at THIS centre; the org-wide command centre stays with State
 * Managers and above.
 *
 * All of it reads /api/services/[id]/dashboard — one call, because this
 * is the first screen after login, often on centre wifi.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  Megaphone,
  Pill,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import type { ServiceDashboardResponse } from "@/app/api/services/[id]/dashboard/route";

function useCentreDay(serviceId: string | null | undefined) {
  return useQuery<ServiceDashboardResponse>({
    queryKey: ["centre-day", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/dashboard`),
    enabled: Boolean(serviceId),
    // The floor changes minute to minute; a stale "in care" count is
    // worse than a spinner.
    refetchInterval: 60_000,
    retry: 2,
  });
}

/** Big number, small label — the top strip. */
function StatCard({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "warn";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={`mt-2 text-3xl font-heading font-semibold tracking-tight ${
          tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
    >
      <Icon className="h-4 w-4 text-brand" />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-2xs font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function CentreDashboard({
  serviceId,
  userName,
}: {
  serviceId: string | null | undefined;
  userName?: string | null;
}) {
  const { data, isLoading, isError } = useCentreDay(serviceId);

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const firstName = userName?.split(" ")[0];

  // No centre on the account is a real state — a new starter before
  // their placement is set. Say so rather than rendering empty cards.
  if (!serviceId) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted" />
          <p className="text-sm font-medium text-foreground">
            You&apos;re not assigned to a centre yet
          </p>
          <p className="mt-1 text-sm text-muted">
            Once your centre is set on your account, your day will show up
            here. Your manager can do that from Settings.
          </p>
          <Link
            href="/my-portal"
            className="mt-3 inline-block text-sm text-brand underline underline-offset-2"
          >
            Go to My Portal
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-muted" />
        <p className="text-sm text-foreground">
          Couldn&apos;t load today. Refresh, or open{" "}
          <Link href="/my-day" className="text-brand underline underline-offset-2">
            My Day
          </Link>{" "}
          to clock in and take the roll.
        </p>
      </div>
    );
  }

  const { service, totals, programmes, staff, attention } = data;
  const svc = `/services/${service.id}`;

  return (
    <div className="space-y-5">
      {/* ── Who and where ── */}
      <div>
        <h1 className="text-xl font-heading font-semibold tracking-tight text-foreground">
          {firstName ? `Good day, ${firstName}` : service.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {service.name} · {today}
        </p>
      </div>

      {/* ── Today at a glance ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="In care now"
          value={totals.inCare}
          sub={`${totals.booked} booked today${
            service.capacity ? ` · ${service.capacity} places` : ""
          }`}
        />
        <StatCard
          icon={UserCheck}
          label="Educators on shift"
          value={staff.onDuty.length}
          sub={
            staff.rosteredToday === 0
              ? "No roster published for today"
              : `${staff.rosteredToday} rostered today`
          }
        />
        <StatCard
          icon={CalendarPlus}
          label="Absent today"
          value={totals.absent}
          sub={totals.casual > 0 ? `${totals.casual} casual bookings` : "No casuals"}
        />
        <StatCard
          icon={Pill}
          label="Medication given"
          value={attention.medicationsGivenToday}
          sub="Logged today"
        />
      </div>

      {/* ── The things that need a person ── */}
      {(staff.notCheckedIn.length > 0 ||
        attention.checklistsOutstanding > 0 ||
        attention.pendingBookingRequests > 0 ||
        attention.openIncidents > 0 ||
        attention.expiringCerts > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Needs attention
          </p>
          <ul className="space-y-1.5 text-sm text-amber-900 dark:text-amber-100">
            {staff.notCheckedIn.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong> hasn&apos;t clocked in — shift started{" "}
                {s.shiftStart}
              </li>
            ))}
            {attention.checklistsOutstanding > 0 && (
              <li>
                <Link
                  href={`${svc}?tab=daily&sub=checklists`}
                  className="underline underline-offset-2"
                >
                  {attention.checklistsOutstanding} session{" "}
                  {attention.checklistsOutstanding === 1
                    ? "checklist"
                    : "checklists"}{" "}
                  still open
                </Link>
              </li>
            )}
            {attention.pendingBookingRequests > 0 && (
              <li>
                <Link
                  href={`${svc}?tab=daily&sub=casual-bookings`}
                  className="underline underline-offset-2"
                >
                  {attention.pendingBookingRequests} casual booking{" "}
                  {attention.pendingBookingRequests === 1
                    ? "request"
                    : "requests"}{" "}
                  waiting on a decision
                </Link>
              </li>
            )}
            {attention.openIncidents > 0 && (
              <li>
                <Link
                  href={`${svc}?tab=safety&sub=incidents`}
                  className="underline underline-offset-2"
                >
                  {attention.openIncidents} incident{" "}
                  {attention.openIncidents === 1 ? "needs" : "need"} follow-up
                </Link>
              </li>
            )}
            {attention.expiringCerts > 0 && (
              <li>
                <Link
                  href={`${svc}?tab=people&sub=compliance`}
                  className="underline underline-offset-2"
                >
                  {attention.expiringCerts} staff{" "}
                  {attention.expiringCerts === 1
                    ? "certificate expires"
                    : "certificates expire"}{" "}
                  within 30 days
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── One tap to the things done every session ── */}
      <div className="flex flex-wrap gap-2">
        <QuickAction
          href={`${svc}?tab=daily&sub=roll-call`}
          label="Roll call"
          icon={ClipboardCheck}
        />
        <QuickAction
          href={`${svc}?tab=daily&sub=checklists`}
          label="Checklists"
          icon={ClipboardList}
          badge={attention.checklistsOutstanding}
        />
        <QuickAction
          href={`${svc}?tab=safety&sub=incidents`}
          label="Incidents"
          icon={ShieldAlert}
          badge={attention.openIncidents}
        />
        <QuickAction
          href={`${svc}?tab=daily&sub=medications`}
          label="Medication"
          icon={Pill}
        />
        <QuickAction href="/communication" label="Post to families" icon={Megaphone} />
        <QuickAction
          href={`${svc}?tab=daily&sub=casual-bookings`}
          label="Bookings"
          icon={CalendarPlus}
          badge={attention.pendingBookingRequests}
        />
        <QuickAction
          href={`${svc}?tab=people&sub=compliance`}
          label="Expiring docs"
          icon={FileWarning}
          badge={attention.expiringCerts}
        />
      </div>

      {/* ── Today's snapshot, one card per programme ── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Today&apos;s snapshot
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {programmes.map((p) => (
            <div key={p.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.inCare} in care · {p.booked} booked
                    {p.absent > 0 && ` · ${p.absent} absent`}
                    {p.wentHome > 0 && ` · ${p.wentHome} signed out`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-heading font-semibold text-foreground">
                    {p.inCare}
                  </p>
                  <p className="text-2xs text-muted">in care</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  Responsible person:{" "}
                  {p.leader ? (
                    <strong className="text-foreground">{p.leader}</strong>
                  ) : (
                    <Link
                      href={`${svc}?tab=daily&sub=responsible-person`}
                      className="text-brand underline underline-offset-2"
                    >
                      not set
                    </Link>
                  )}
                </span>
                <span>
                  {p.educatorsOnFloor} educator
                  {p.educatorsOnFloor === 1 ? "" : "s"} rostered on now
                </span>
              </div>

              {p.children.length > 0 ? (
                <p className="mt-2 border-t border-border pt-2 text-xs text-foreground/80">
                  {p.children.map((c) => c.name).join(", ")}
                </p>
              ) : (
                <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
                  {p.booked > 0
                    ? "Nobody signed in yet."
                    : "No bookings for this programme today."}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Who's on the floor ── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          On the floor
        </h2>
        {staff.onDuty.length === 0 ? (
          <p className="text-sm text-muted">
            Nobody is clocked in right now.{" "}
            <Link href="/my-day" className="text-brand underline underline-offset-2">
              Clock in from My Day
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.onDuty.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                  {s.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {s.name}
                  </p>
                  {s.role && <p className="text-xs text-muted">{s.role}</p>}
                </div>
                {s.since && (
                  <p className="text-xs text-muted">
                    since{" "}
                    {new Date(s.since).toLocaleTimeString("en-AU", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted">
        Educator counts come from today&apos;s published roster, not live
        clock-ins — treat them as a guide, not a ratio check.{" "}
        <Link
          href={`${svc}?tab=daily&sub=ratios`}
          className="text-brand underline underline-offset-2"
        >
          Open ratios
        </Link>
      </p>
    </div>
  );
}

export default function CentreDashboardBoundary(props: {
  serviceId: string | null | undefined;
  userName?: string | null;
}) {
  return (
    <WidgetErrorBoundary widgetName="Centre dashboard">
      <CentreDashboard {...props} />
    </WidgetErrorBoundary>
  );
}
