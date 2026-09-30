"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Construction,
  BookOpen,
  Receipt,
  UserCog,
  Mail,
} from "lucide-react";
import {
  useParentProfile,
  useParentBookings,
  type BookingRecord,
  useParentEnrolmentApplications,
} from "@/hooks/useParentPortal";
import { DailyInfoWidgets } from "@/components/parent/DailyInfoWidgets";
import { OwnaTransitionNotice } from "@/components/parent/OwnaTransitionNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { programmeName } from "@/lib/programme-names";
import { AddToPhoneCard } from "@/components/parent/AddToPhoneCard";
import { ParentFeed } from "@/components/parent/ParentFeed";
import { MarkAbsentSheet } from "@/components/parent/MarkAbsentSheet";
import { TodayStrip } from "@/components/parent/TodayStrip";

export default function ParentHomeV1() {
  const { data: profile, isLoading, error } = useParentProfile();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-sm">
          We couldn&apos;t load your details just now — pull down to refresh, or try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-brand/95 to-brand-dark/95 p-4 overflow-y-auto">
      <div className="w-full max-w-lg mx-auto my-8">
        <div className="bg-card rounded-2xl shadow-2xl p-8 sm:p-10 text-center space-y-6">
          {/* Icon */}
          <div className="w-20 h-20 bg-brand/10 rounded-full flex items-center justify-center mx-auto">
            <Construction className="h-10 w-10 text-brand" />
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
              We&apos;re Working On Something Special!
            </h1>
            <p className="text-muted text-sm leading-relaxed">
              Assalamu Alaikum{profile.firstName ? `, ${profile.firstName}` : ""}! Thank you for completing your enrolment with Amana OSHC.
            </p>
          </div>

          {/* OWNA notice */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-left">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Our parent app is currently under development, inshallah.
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              In the meantime, you will receive your OWNA login details via email within 24 hours.
            </p>
          </div>

          {/* OWNA features */}
          <div className="text-left space-y-3">
            <p className="text-sm font-semibold text-foreground">With OWNA, you can:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4.5 w-4.5 text-brand" />
                </div>
                <p className="text-sm text-muted">Manage your bookings</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Receipt className="h-4.5 w-4.5 text-brand" />
                </div>
                <p className="text-sm text-muted">View invoices and fees</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <UserCog className="h-4.5 w-4.5 text-brand" />
                </div>
                <p className="text-sm text-muted">Update your family details</p>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-border pt-5">
            <p className="text-sm text-muted mb-3">
              If you need any assistance, please contact us:
            </p>
            <a
              href="mailto:enrolment@amanaoshc.com.au"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              <Mail className="h-4 w-4" />
              enrolment@amanaoshc.com.au
            </a>
          </div>

          {/* Closing */}
          <p className="text-xs text-muted">
            We look forward to launching our app for you soon, inshallah!
          </p>
        </div>
      </div>
    </div>
  );
}

/** Today or tomorrow — the window where "not coming" is urgent enough
 *  to deserve a spot on the row rather than a trip to Bookings. */
function isSoon(iso: string): boolean {
  const d = new Date(iso);
  const limit = new Date();
  limit.setDate(limit.getDate() + 2);
  limit.setHours(0, 0, 0, 0);
  return d < limit;
}

function UpcomingSessionsWidget() {
  const { data } = useParentBookings("upcoming");
  /**
   * "He's sick, we're not coming" is the most common urgent job in the
   * app, and it used to live three screens deep. Today's and tomorrow's
   * sessions carry a "Not coming?" action right here — two taps from
   * opening the app to told-the-centre.
   */
  const [absentTarget, setAbsentTarget] = useState<BookingRecord | null>(null);

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
              {isSoon(b.date) && b.status === "confirmed" && (
                <button
                  type="button"
                  onClick={() => setAbsentTarget(b)}
                  className="text-xs font-medium text-muted underline underline-offset-2 shrink-0 min-h-11"
                >
                  Not coming?
                </button>
              )}
            </div>
          );
        })}
        <MarkAbsentSheet
          booking={absentTarget}
          onClose={() => setAbsentTarget(null)}
        />
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
