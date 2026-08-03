"use client";

import Link from "next/link";
import {
  CalendarDays,
  FileEdit,
  MessageCircle,
} from "lucide-react";
import {
  useParentProfile,
  useParentBookings,
  useParentEnrolmentApplications,
} from "@/hooks/useParentPortal";
import { DailyInfoWidgets } from "@/components/parent/DailyInfoWidgets";
import { TimelineWidget } from "@/components/parent/TimelineWidget";
import { OwnaTransitionNotice } from "@/components/parent/OwnaTransitionNotice";
import { ParentFeed } from "@/components/parent/ParentFeed";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { programmeName } from "@/lib/programme-names";
import { AddToPhoneCard } from "@/components/parent/AddToPhoneCard";

export default function ParentHomeV1() {
  const { data: profile, isLoading, error } = useParentProfile();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-sm">
          Unable to load your information. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Temporary: we're still on OWNA day to day. Remove when the
          portal goes fully live. */}
      <OwnaTransitionNotice />

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Welcome back, {profile.firstName}{" "}
          <span aria-hidden="true">&#128075;</span>
        </h1>
      </div>

      {/*
        2026-08-04: Home was carrying six blocks a family never acted on —
        two separate copies of the centre's About content, a setup
        checklist whose items we could do ourselves, a sibling-enrolment
        CTA, a week-of-green-dots that repeated the Children tab, and a
        messages preview that repeated the Messages tab. All removed. The
        centre content now lives on its own My Centre tab, which is where
        someone looks for it.

        What's left is the two things a parent opens the app FOR: getting
        it onto their home screen, and what's on this week.
      */}
      <AddToPhoneCard />

      <UpcomingSessionsWidget />

      {/* Posts from the service. Left in place deliberately: the feed is
          a separate task, and Home is currently the only surface a
          parent can see a post on — removing it here would take the
          feature away rather than move it. */}
      <ParentFeed />

      {/* Today's menu and programme. */}
      <DailyInfoWidgets />

      {/* Only renders when the family has an application in flight. */}
      <EnrolmentApplicationsWidget />

      <TimelineWidget />

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <h2 className="text-sm font-heading font-semibold text-muted uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            href="/parent/account"
            icon={FileEdit}
            label="Update Details"
          />
          <QuickAction
            href="/parent/children"
            icon={CalendarDays}
            label="View Attendance"
          />
          <QuickAction href="/parent/messages" icon={MessageCircle} label="Messages" />
        </div>
      </section>
    </div>
  );
}

// ── Quick action button ──────────────────────────────────

function QuickAction({
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
      className="flex flex-col items-center gap-1.5 bg-card rounded-xl p-4 shadow-sm border border-border hover:shadow-md hover:border-brand/20 transition-all active:scale-[0.98] min-h-[80px] justify-center"
    >
      <Icon className="w-5 h-5 text-brand" />
      <span className="text-xs font-medium text-foreground text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

// ── Upcoming Sessions Widget ────────────────────────────

/**
 * The coming week, across every child, soonest first.
 *
 * A week rather than "the next three": a parent checking on Sunday night
 * wants the shape of the week, and three rows in a two-child family is
 * Monday and half of Tuesday.
 */
function UpcomingSessionsWidget() {
  const { data } = useParentBookings("upcoming");

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const bookings = (data?.bookings ?? [])
    .filter((b) => b.status === "confirmed" || b.status === "requested")
    .filter((b) => new Date(b.date) <= weekEnd)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (bookings.length === 0) {
    return (
      <section aria-label="Upcoming sessions">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-heading font-semibold text-muted uppercase tracking-wider">
            Upcoming Sessions
          </h2>
        </div>
        <div className="bg-card rounded-xl p-6 text-center shadow-sm border border-border">
          <p className="text-sm text-muted">
            Nothing booked in the next week.
          </p>
          <Link
            href="/parent/bookings"
            className="inline-flex items-center justify-center mt-3 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold min-h-11"
          >
            Book a session
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Upcoming sessions">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-heading font-semibold text-muted uppercase tracking-wider">
          Upcoming Sessions
        </h2>
        <Link href="/parent/bookings" className="text-xs font-medium text-brand hover:text-brand-light min-h-[44px] flex items-center">
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {bookings.map((b) => {
          const d = new Date(b.date);
          const dayName = d.toLocaleDateString("en-AU", { weekday: "short" });
          const dateNum = d.getDate();
          const month = d.toLocaleDateString("en-AU", { month: "short" });

          return (
            <div key={b.id} className="flex items-center gap-3 bg-card rounded-xl p-3 shadow-sm border border-border">
              <div className="w-11 h-11 rounded-lg bg-brand/10 flex flex-col items-center justify-center shrink-0">
                <span className="text-2xs font-semibold text-brand uppercase">{dayName}</span>
                <span className="text-sm font-bold text-brand leading-none">{dateNum}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {b.child.firstName} — {programmeName(b.sessionType)}
                </p>
                <p className="text-xs text-muted truncate">{b.service.name} · {month}</p>
              </div>
              <span className={cn(
                "text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0",
                b.status === "confirmed" ? "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300" : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
              )}>
                {b.status === "confirmed" ? "Confirmed" : "Requested"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Enrolment Applications Widget ──────────────────────

function EnrolmentApplicationsWidget() {
  const { data: applications } = useParentEnrolmentApplications();

  if (!applications || applications.length === 0) return null;

  const pending = applications.filter((a) => a.status === "pending");
  const recent = applications.slice(0, 3);

  return (
    <section aria-label="Enrolment applications">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-heading font-semibold text-muted uppercase tracking-wider">
          Enrolment Applications
          {pending.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-2xs font-bold rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
              {pending.length} pending
            </span>
          )}
        </h2>
        <Link
          href="/parent/enrolments"
          className="text-xs font-medium text-brand hover:text-brand-light min-h-[44px] flex items-center"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {recent.map((app) => {
          const statusColor =
            app.status === "pending"
              ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
              : app.status === "approved"
                ? "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
                : app.status === "declined"
                  ? "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                  : "bg-surface text-muted";

          return (
            <Link
              key={app.id}
              href="/parent/enrolments"
              className="flex items-center justify-between gap-3 bg-card rounded-xl p-3 shadow-sm border border-border hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {app.childFirstName} {app.childLastName}
                </p>
                <p className="text-xs text-muted truncate">
                  {app.serviceName}
                </p>
              </div>
              <span
                className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize ${statusColor}`}
              >
                {app.status}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Skeleton ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
