"use client";

/**
 * ServiceActivityWidget — recent NQS activity feed for a service.
 *
 * Shows the last 25 entries from the activity log filtered to NQS actions
 * (reflections / observations / medications / risk / events / newsletter).
 * Drop into Service Today tab as a sidebar so coordinators see who logged
 * what during the shift.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  Sparkles,
  Pill,
  ShieldCheck,
  Target,
  Megaphone,
  Calendar,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null } | null;
}

const ACTION_ICON: Record<string, LucideIcon> = {
  created_reflection: Target,
  created_observation: Sparkles,
  logged_medication: Pill,
  created_risk_assessment: ShieldCheck,
  approved_risk_assessment: ShieldCheck,
  created_service_event: Calendar,
  published_newsletter: Megaphone,
};

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function ServiceActivityWidget({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["service-activity", serviceId],
    queryFn: () =>
      fetchApi<{ items: ActivityItem[] }>(
        `/api/services/${serviceId}/activity?limit=25`,
      ),
    enabled: !!serviceId,
    retry: 2,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
        Recent activity
      </h3>

      {isLoading ? (
        <div className="warm-card-dense p-3 text-sm text-[color:var(--color-muted)]">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="warm-card-dense p-3 text-sm text-[color:var(--color-muted)] flex items-center gap-2">
          <Activity className="w-4 h-4" />
          No recent NQS activity yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((item) => {
            const Icon = ACTION_ICON[item.action] ?? Activity;
            return (
              <li
                key={item.id}
                className="warm-card-dense p-2.5 flex items-start gap-2.5"
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5",
                    "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[color:var(--color-foreground)]">
                    <span className="font-semibold">
                      {item.user?.name ?? "Someone"}
                    </span>{" "}
                    {item.actionLabel}
                  </p>
                  <p className="text-[11px] text-[color:var(--color-muted)]">
                    {formatRelative(item.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
