"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Shield, Calendar, Clock, RefreshCw, HeartPulse } from "lucide-react";
import Link from "next/link";

interface ActionCounts {
  certsExpiring: number;
  leavePending: number;
  timesheetsPending: number;
  shiftSwapsPending: number;
  pulsesConcerning: number;
}

/**
 * Action Required widget displayed at the top of the /team page.
 *
 * Shows three cards linking to compliance, leave, and timesheets with the
 * number of items awaiting action. Hidden for roles that shouldn't see
 * org-wide counts (staff / member / marketing) and auto-hides when all
 * counts are zero. Polls every 60s for freshness.
 *
 * Server-side scoping: coordinators see counts for their own serviceId;
 * admin/owner/head_office see org-wide.
 */
export function ActionRequiredWidget({ userRole }: { userRole: string }) {
  // Hide for roles that shouldn't see org-wide counts
  const hidden =
    userRole === "staff" ||
    userRole === "member" ||
    userRole === "marketing";

  const { data } = useQuery({
    queryKey: ["team", "action-counts"],
    queryFn: () => fetchApi<ActionCounts>("/api/team/action-counts"),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !hidden,
  });

  if (hidden) return null;
  if (!data) return null;

  const { certsExpiring, leavePending, timesheetsPending, shiftSwapsPending, pulsesConcerning } =
    data;
  if (
    certsExpiring === 0 &&
    leavePending === 0 &&
    timesheetsPending === 0 &&
    shiftSwapsPending === 0 &&
    pulsesConcerning === 0
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <Link
        href="/compliance?filter=expiring"
        className="border rounded-lg p-4 bg-white hover:bg-amber-50 transition flex items-center gap-3"
      >
        <Shield className="h-8 w-8 text-amber-600" />
        <div>
          <div className="text-2xl font-semibold">{certsExpiring}</div>
          <div className="text-sm text-gray-600">
            certs expiring within 30 days
          </div>
        </div>
      </Link>
      <Link
        href="/leave?filter=pending"
        className="border rounded-lg p-4 bg-white hover:bg-blue-50 transition flex items-center gap-3"
      >
        <Calendar className="h-8 w-8 text-blue-600" />
        <div>
          <div className="text-2xl font-semibold">{leavePending}</div>
          <div className="text-sm text-gray-600">
            leave requests pending approval
          </div>
        </div>
      </Link>
      <Link
        href="/timesheets?filter=pending"
        className="border rounded-lg p-4 bg-white hover:bg-green-50 transition flex items-center gap-3"
      >
        <Clock className="h-8 w-8 text-green-600" />
        <div>
          <div className="text-2xl font-semibold">{timesheetsPending}</div>
          <div className="text-sm text-gray-600">
            timesheets awaiting review
          </div>
        </div>
      </Link>
      <Link
        href="/roster/swaps?filter=pending"
        className="border rounded-lg p-4 bg-white hover:bg-orange-50 transition flex items-center gap-3"
      >
        <RefreshCw className="h-8 w-8 text-orange-600" />
        <div>
          <div className="text-2xl font-semibold">{shiftSwapsPending}</div>
          <div className="text-sm text-gray-600">
            shift swaps pending approval
          </div>
        </div>
      </Link>
      <Link
        href="/communication?tab=pulse"
        className="border rounded-lg p-4 bg-white hover:bg-rose-50 transition flex items-center gap-3"
      >
        <HeartPulse className="h-8 w-8 text-rose-600" />
        <div>
          <div className="text-2xl font-semibold">{pulsesConcerning}</div>
          <div className="text-sm text-gray-600">
            concerning pulse responses this week
          </div>
        </div>
      </Link>
    </div>
  );
}
