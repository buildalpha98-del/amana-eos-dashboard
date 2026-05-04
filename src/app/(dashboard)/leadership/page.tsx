"use client";

import dynamic from "next/dynamic";
import { useLeadershipOverview } from "@/hooks/useLeadership";
import { LeaderboardContent } from "@/components/contact-centre/LeaderboardContent";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Crown, Users, Building2, AlertCircle, MessageSquare, Mountain } from "lucide-react";
import { LeadershipRecentIncidentsCard } from "@/components/leadership/LeadershipRecentIncidentsCard";
import { LeadershipCertExpiryCard } from "@/components/leadership/LeadershipCertExpiryCard";
import { cn } from "@/lib/utils";

const SentimentTrendChart = dynamic(
  () => import("recharts").then((mod) => {
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = mod;
    return {
      default: ({ data }: { data: { weekOf: string; avgMood: number }[] }) => (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="weekOf"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
            />
            <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: "#6B7280" }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(v) => new Date(String(v)).toLocaleDateString("en-AU")}
              formatter={(v) => [Number(v).toFixed(1), "Avg mood"]}
            />
            <Line type="monotone" dataKey="avgMood" stroke="#004E64" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      ),
    };
  }),
  { loading: () => <Skeleton className="h-60 w-full" /> }
);

function Kpi({ icon: Icon, value, label, iconClass }: { icon: typeof Users; value: number; label: string; iconClass: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn("rounded-full p-2.5", iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

export default function LeadershipPage() {
  const { data, isLoading, error, refetch } = useLeadershipOverview();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Leadership Team Centre"
        description="Org-wide visibility: KPIs, quarterly rocks, pulse sentiment, coordinator leaderboard"
        badge="Admin"
      />

      {error ? (
        <ErrorState title="Failed to load leadership overview" error={error as Error} onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          {/* Section 1: Org KPIs */}
          <section>
            <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-3">Org KPIs</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi icon={Users} value={data.staffCount} label="Active staff" iconClass="bg-blue-100 text-blue-600" />
              <Kpi icon={Building2} value={data.serviceCount} label="Active services" iconClass="bg-emerald-100 text-emerald-600" />
              <Kpi icon={AlertCircle} value={data.openIssueCount} label="Open issues" iconClass="bg-amber-100 text-amber-600" />
              <Kpi icon={MessageSquare} value={data.openTicketCount} label="Open tickets" iconClass="bg-purple-100 text-purple-600" />
            </div>
          </section>

          {/* Section 1.5: Recent incidents — quiet by default, only
               renders when there are incidents in the lookback window.
               Replaces the cross-service `/incidents` page as the main
               leadership triage surface (the page itself is still
               accessible for filtering / CSV export). */}
          <LeadershipRecentIncidentsCard />

          {/* Section 1.6: Org-wide compliance cert expiry rollup —
               quiet by default; lists every centre with at least one
               expired/expiring cert sorted worst-first. Companion to
               the per-service ServiceCertExpiryCard on each centre's
               Compliance tab. */}
          <LeadershipCertExpiryCard />

          {/* Section 2: Quarterly Rocks Rollup */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mountain className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold text-foreground">Quarterly Rocks — {data.rocksRollup.quarter}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
              <div className="text-center p-3 rounded-lg bg-surface">
                <p className="text-2xl font-bold text-foreground">{data.rocksRollup.total}</p>
                <p className="text-xs text-muted">Total</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50">
                <p className="text-2xl font-bold text-emerald-700">{data.rocksRollup.onTrack}</p>
                <p className="text-xs text-emerald-700/80">On track</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-red-700">{data.rocksRollup.offTrack}</p>
                <p className="text-xs text-red-700/80">Off track</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-700">{data.rocksRollup.complete}</p>
                <p className="text-xs text-blue-700/80">Complete</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/10">
                <p className="text-2xl font-bold text-muted-foreground">{data.rocksRollup.dropped}</p>
                <p className="text-xs text-muted">Dropped</p>
              </div>
            </div>
            {data.rocksRollup.byService.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-2 font-medium">Service</th>
                      <th className="py-2 font-medium text-right">Total</th>
                      <th className="py-2 font-medium text-right">On track</th>
                      <th className="py-2 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rocksRollup.byService.map((row) => (
                      <tr key={row.serviceId} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{row.serviceName}</td>
                        <td className="py-2 text-right text-foreground">{row.total}</td>
                        <td className="py-2 text-right text-emerald-700">{row.onTrack}</td>
                        <td className="py-2 text-right text-muted">
                          {row.total > 0 ? `${Math.round((row.onTrack / row.total) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted italic">No service-scoped rocks this quarter.</p>
            )}
          </section>

          {/* Section 3: Pulse Sentiment Trend */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold text-foreground">Pulse sentiment — last 8 weeks</h3>
            </div>
            {data.sentimentTrend.length > 0 ? (
              <SentimentTrendChart data={data.sentimentTrend} />
            ) : (
              <p className="text-sm text-muted italic">No pulse data for the last 8 weeks.</p>
            )}
          </section>

          {/* Section 4: Coordinator Leaderboard */}
          <section className="rounded-xl border border-border bg-card p-6 space-y-4">
            <LeaderboardContent embedded />
          </section>
        </>
      )}
    </div>
  );
}
