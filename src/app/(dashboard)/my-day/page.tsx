"use client";

/**
 * /my-day — educator field-mode (2026-07-06; on-shift hero 2026-09-04,
 * Staff Portal v2 Phase 2 per MobileMyDay.dc.html).
 *
 * The three things floor staff do standing up — clock in/out, tick the
 * session checklist, open Roll Call — in one thumb-reach column, plus
 * today's brief and claimable shifts. Everything here is composed from
 * existing self-scoping cards; the page adds no new data paths.
 *
 * Layout order follows the mockup: on-shift banner (or the clock card
 * in every non-active state), session snapshot strip, roll-call
 * callout, quick actions, then the longer-form cards.
 *
 * My Portal remains the full self-service hub (payslips, leave,
 * compliance, policies); this is the during-a-session surface.
 */

import { useSession } from "next-auth/react";
import Link from "next/link";
import { UserCircle, Info, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MorningBriefCard } from "@/components/dashboard/MorningBriefCard";
import { OnShiftHero } from "@/components/my-day/OnShiftHero";
import { SessionSnapshot } from "@/components/my-day/SessionSnapshot";
import { RollCallCallout } from "@/components/my-day/RollCallCallout";
import { QuickActions } from "@/components/my-day/QuickActions";
import { TodayChecklistCard } from "@/components/my-portal/TodayChecklistCard";
import { OpenShiftsCard } from "@/components/my-portal/OpenShiftsCard";
import { RosterAckCard } from "@/components/my-portal/RosterAckCard";
import { MyUpcomingShiftsCard } from "@/components/my-portal/MyUpcomingShiftsCard";

export default function MyDayPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const serviceId = (session?.user as { serviceId?: string | null } | undefined)
    ?.serviceId;
  // 2026-10-08, Daniel: for an educator this page is MY SHIFTS — clocking
  // on and the week ahead. The centre's jobs (roll call, headcount,
  // checklists, posting) live in their My Centre menu now; showing them
  // twice is how people stop knowing where anything is.
  const isEducator = session?.user?.role === "staff";

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title={isEducator ? "My Shifts" : "My Day"} description={today} />

      {/* Clock slot — the on-shift banner while clocked in; the clock
          card handles every other state (pre-shift window, ambiguous
          picker, errors, quiet days). */}
      {userId && <OnShiftHero userId={userId} />}

      {/* Right now at the centre — one glanceable strip, same query as
          the roll-call callout below so the numbers can't disagree. */}
      {serviceId && !isEducator && <SessionSnapshot serviceId={serviceId} />}

      {/* Roll Call — loud bg-accent callout when children are not yet
          marked in, quiet row otherwise. */}
      {serviceId && !isEducator && <RollCallCallout serviceId={serviceId} />}

      {/* No centre assigned — explain why the service-scoped cards
          (Now, Roll Call, checklists) are missing instead of silently
          hiding them. */}
      {status === "authenticated" && !serviceId && !isEducator && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
          <p className="text-sm text-muted">
            You&apos;re not assigned to a centre yet, so today&apos;s roll call
            and checklists aren&apos;t available. Your manager can assign you to
            a centre.
          </p>
        </div>
      )}

      {/* The other things done with a phone in hand. */}
      {serviceId && !isEducator && <QuickActions serviceId={serviceId} />}

      {/* Morning brief — quiet until the 6am cron has run. */}
      <MorningBriefCard />

      {/* Today's session checklists — tap to tick. */}
      {serviceId && !isEducator && <TodayChecklistCard serviceId={serviceId} />}

      {/* Claimable open shifts — quiet by default. */}
      {/* New or changed shifts to confirm (2026-10-09). */}
      {userId && <RosterAckCard userId={userId} />}
      <OpenShiftsCard />

      {/* The week ahead. */}
      {userId && <MyUpcomingShiftsCard userId={userId} />}

      {/* The full week grid and swaps. */}
      {isEducator && (
        <Link
          href="/roster/me"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground transition-colors hover:bg-surface"
        >
          <CalendarDays className="h-4 w-4 text-brand" />
          Full roster &amp; shift swaps
        </Link>
      )}

      {/* Escape hatch to the full self-service hub. */}
      <Link
        href="/my-portal"
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted transition-colors hover:bg-surface/50 hover:text-foreground"
      >
        <UserCircle className="h-4 w-4" />
        Everything else — My Portal
      </Link>
    </div>
  );
}
