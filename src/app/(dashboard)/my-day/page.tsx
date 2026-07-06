"use client";

/**
 * /my-day — educator field-mode (2026-07-06).
 *
 * The three things floor staff do standing up — clock in/out, tick the
 * session checklist, open Roll Call — in one thumb-reach column, plus
 * today's brief and claimable shifts. Everything here is composed from
 * existing self-scoping cards; the page adds no new data paths.
 *
 * My Portal remains the full self-service hub (payslips, leave,
 * compliance, policies); this is the during-a-session surface.
 */

import { useSession } from "next-auth/react";
import Link from "next/link";
import { ClipboardCheck, ChevronRight, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MorningBriefCard } from "@/components/dashboard/MorningBriefCard";
import { MyClockCard } from "@/components/my-portal/MyClockCard";
import { TodayChecklistCard } from "@/components/my-portal/TodayChecklistCard";
import { OpenShiftsCard } from "@/components/my-portal/OpenShiftsCard";
import { MyUpcomingShiftsCard } from "@/components/my-portal/MyUpcomingShiftsCard";

export default function MyDayPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const serviceId = (session?.user as { serviceId?: string | null } | undefined)
    ?.serviceId;

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="My Day" description={today} />

      {/* Morning brief — quiet until the 6am cron has run. */}
      <MorningBriefCard />

      {/* Clock in/out — the primary field action. */}
      {userId && <MyClockCard userId={userId} />}

      {/* Roll Call shortcut — lives inside the service detail page;
          this is the one-tap path to it. */}
      {serviceId && (
        <Link
          href={`/services/${serviceId}?tab=daily&sub=roll-call`}
          className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
              <ClipboardCheck className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Roll Call</p>
              <p className="text-xs text-muted">Sign children in and out</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>
      )}

      {/* Today's session checklists — tap to tick. */}
      {serviceId && <TodayChecklistCard serviceId={serviceId} />}

      {/* Claimable open shifts — quiet by default. */}
      <OpenShiftsCard />

      {/* The week ahead. */}
      {userId && <MyUpcomingShiftsCard userId={userId} />}

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
