"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Send, AlertCircle, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

interface EmailStats {
  totalSends: number;
  totalRecipients: number;
  sent: number;
  failed: number;
  scheduled: number;
}

interface RecentSend {
  id: string;
  channel: string;
  messageType: string | null;
  subject: string | null;
  status: string;
  recipientCount: number;
  serviceCode: string | null;
  entityType: string | null;
  createdAt: string;
}

interface DailyVolume {
  date: string;
  count: number;
}

function useEmailAnalytics(days: number) {
  return useQuery({
    queryKey: ["email-analytics", days],
    queryFn: async () => {
      const res = await fetch(`/api/email/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch email analytics");
      return res.json() as Promise<{
        stats: EmailStats;
        recentSends: RecentSend[];
        dailyVolume: DailyVolume[];
        period: string;
      }>;
    },
  });
}

const statusColors: Record<string, { bg: string; text: string }> = {
  sent: { bg: "bg-green-100", text: "text-green-700" },
  failed: { bg: "bg-red-100", text: "text-red-700" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
};

const channelLabels: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  social: "Social",
};

export function EmailAnalytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useEmailAnalytics(days);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const { stats, recentSends, dailyVolume } = data;
  const maxVolume = Math.max(...dailyVolume.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-brand" />
          Email & Messaging Activity
        </h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 text-xs rounded-lg font-medium transition-colors",
                days === d
                  ? "bg-brand text-white"
                  : "bg-surface text-foreground/60 hover:text-foreground"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Send} label="Total Sends" value={stats.totalSends} />
        <StatCard icon={Users} label="Recipients" value={stats.totalRecipients} />
        <StatCard icon={AlertCircle} label="Failed" value={stats.failed} color={stats.failed > 0 ? "text-red-500" : undefined} />
        <StatCard icon={Clock} label="Scheduled" value={stats.scheduled} />
      </div>

      {/* Daily Volume Chart */}
      {dailyVolume.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <p className="text-xs font-medium text-foreground/50 mb-3">Daily Send Volume</p>
          <div className="flex items-end gap-[2px] h-24">
            {dailyVolume.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-brand/70 hover:bg-brand rounded-t transition-colors group relative"
                style={{ height: `${(d.count / maxVolume) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                title={`${d.date}: ${d.count} sends`}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                  {d.count}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-foreground/30">
            <span>{dailyVolume[0]?.date.slice(5)}</span>
            <span>{dailyVolume[dailyVolume.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Recent Sends */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-foreground/50">Recent Sends</p>
        </div>
        <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
          {recentSends.length === 0 ? (
            <p className="text-center text-xs text-foreground/40 py-8">No sends in this period</p>
          ) : (
            recentSends.slice(0, 20).map((send) => {
              const sc = statusColors[send.status] ?? { bg: "bg-surface", text: "text-muted" };
              return (
                <div key={send.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {send.subject ?? send.messageType?.replace(/_/g, " ") ?? "Untitled"}
                    </p>
                    <p className="text-foreground/40 mt-0.5">
                      {channelLabels[send.channel] ?? send.channel}
                      {send.serviceCode && ` · ${send.serviceCode}`}
                      {send.recipientCount > 0 && ` · ${send.recipientCount} recipients`}
                    </p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", sc.bg, sc.text)}>
                    {send.status}
                  </span>
                  <span className="text-foreground/30 whitespace-nowrap">
                    {new Date(send.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-surface rounded-xl p-3 border border-border">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-3.5 w-3.5", color ?? "text-foreground/40")} />
        <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", color ?? "text-foreground")}>{value.toLocaleString()}</p>
    </div>
  );
}
