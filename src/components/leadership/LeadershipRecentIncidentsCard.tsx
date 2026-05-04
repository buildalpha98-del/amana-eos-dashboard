"use client";

/**
 * LeadershipRecentIncidentsCard — top-N most leadership-relevant
 * incidents across services. Lives on the leadership page; replaces
 * the org-wide `/incidents` triage page that was the historical home
 * for cross-service incident review.
 *
 * Quiet by default: hides itself when there are zero incidents in
 * the window. The full `/incidents` page is still accessible for now
 * (deprecated, with banner) for admins who need filters / CSV export
 * / bulk operations.
 *
 * 2026-05-04: introduced.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Flag,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { useRecentIncidents, type RecentIncident } from "@/hooks/useRecentIncidents";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<string, string> = {
  serious: "bg-red-100 text-red-800 border-red-300",
  reportable: "bg-orange-100 text-orange-800 border-orange-300",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-300",
  minor: "bg-gray-100 text-gray-700 border-gray-300",
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  injury: "Injury",
  illness: "Illness",
  behaviour: "Behaviour",
  missing_child: "Missing Child",
  near_miss: "Near Miss",
  medication_error: "Medication Error",
  property_damage: "Property Damage",
  complaint: "Complaint",
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function LeadershipRecentIncidentsCard({
  limit = 5,
  days = 14,
}: {
  limit?: number;
  days?: number;
} = {}) {
  const { data, isLoading, error } = useRecentIncidents({ limit, days });

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }
  if (error || !data) return null;
  if (data.incidents.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-6"
      data-testid="leadership-recent-incidents-card"
    >
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-semibold text-foreground">
            Recent Incidents
          </h3>
          <span className="text-xs text-muted">
            (last {days} days · top {data.incidents.length})
          </span>
        </div>
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View all
          <ExternalLink className="h-3 w-3" />
        </Link>
      </header>

      <ul className="space-y-2">
        {data.incidents.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
      </ul>
    </section>
  );
}

function IncidentRow({ incident }: { incident: RecentIncident }) {
  const tone = SEVERITY_TONE[incident.severity] ?? SEVERITY_TONE.minor;
  const typeLabel =
    INCIDENT_TYPE_LABELS[incident.incidentType] ?? incident.incidentType;
  return (
    <Link
      href={`/services/${incident.serviceId}?tab=compliance&sub=incidents`}
      className={cn(
        "block rounded-lg border border-border p-3 hover:bg-surface/30 transition-colors",
        "group",
      )}
      data-testid={`recent-incident-${incident.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center min-w-[3.5rem] flex-shrink-0">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold uppercase",
              tone,
            )}
          >
            {incident.severity}
          </span>
          <span className="text-[10px] text-muted mt-1">
            {formatRelativeDate(incident.incidentDate)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {typeLabel}
            </span>
            {incident.reportableToAuthority ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 rounded-full px-1.5 py-0">
                <Flag className="h-2.5 w-2.5" />
                Reportable
              </span>
            ) : null}
            {incident.followUpRequired ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-800 bg-amber-100 rounded-full px-1.5 py-0">
                <AlertTriangle className="h-2.5 w-2.5" />
                Follow-up
              </span>
            ) : null}
            <span className="text-xs text-muted ml-auto truncate max-w-[12rem]">
              {incident.service.name}
            </span>
          </div>
          <p className="text-xs text-muted mt-1 line-clamp-2">
            {incident.description}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted/40 self-center group-hover:text-muted transition-colors" />
      </div>
    </Link>
  );
}
