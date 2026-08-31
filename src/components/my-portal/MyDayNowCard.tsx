"use client";

/**
 * "Right now" at the centre, plus the four things an educator does with
 * a phone in their hand.
 *
 * This exists so the phone answer to "what's happening" is My Day, not a
 * nine-group management page squeezed onto a 390px screen. The service
 * page stays the laptop and iPad surface; this is the floor.
 *
 * Reads the same /api/services/[id]/dashboard call the centre dashboard
 * uses, so the numbers can't disagree with each other.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  ClipboardCheck,
  ShieldAlert,
  Users,
  UserCheck,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ServiceDashboardResponse } from "@/app/api/services/[id]/dashboard/route";

export function MyDayNowCard({ serviceId }: { serviceId: string }) {
  const { data, isLoading, isError } = useQuery<ServiceDashboardResponse>({
    queryKey: ["centre-day", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/dashboard`),
    refetchInterval: 60_000,
    retry: 2,
  });

  const svc = `/services/${serviceId}`;

  const actions = [
    {
      href: `${svc}?tab=daily&sub=roll-call`,
      label: "Roll call",
      icon: ClipboardCheck,
    },
    {
      href: `${svc}?tab=daily&sub=posts`,
      label: "Post a photo",
      icon: Camera,
    },
    {
      href: `${svc}?tab=compliance&sub=headcounts`,
      label: "Headcount",
      icon: Users,
    },
    {
      href: `${svc}?tab=compliance&sub=incidents`,
      label: "Incident",
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : isError || !data ? null : (
        // Quiet on failure rather than an error box: My Day still has a
        // clock and a roll call link, and those matter more than this.
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-muted">
              <Users className="h-3.5 w-3.5" />
              <p className="text-2xs font-medium uppercase tracking-wide">
                In care now
              </p>
            </div>
            <p className="mt-1 text-2xl font-heading font-semibold text-foreground">
              {data.totals.inCare}
            </p>
            <p className="text-xs text-muted">of {data.totals.booked} booked</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-muted">
              <UserCheck className="h-3.5 w-3.5" />
              <p className="text-2xs font-medium uppercase tracking-wide">
                On shift
              </p>
            </div>
            <p className="mt-1 text-2xl font-heading font-semibold text-foreground">
              {data.staff.onDuty.length}
            </p>
            <p className="text-xs text-muted">
              {data.staff.onDuty.length === 1 ? "educator" : "educators"} clocked
              in
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-[64px] flex-col justify-center gap-1 rounded-xl border border-border bg-card p-3 transition-colors active:bg-surface"
          >
            <a.icon className="h-5 w-5 text-brand" />
            <span className="text-sm font-medium text-foreground">
              {a.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
