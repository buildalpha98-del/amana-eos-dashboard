"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Phone,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Analytics {
  days: number;
  total: number;
  actioned: number;
  enquiriesCreated: number;
  todosCreated: number;
  repeatCallers: number;
  slaBreaches: number;
  successfulCalls: number;
  successRate: number | null;
  avgTimeToAction: number | null;
  conversionRate: number | null;
  slaComplianceRate: number | null;
  byType: Record<string, number>;
  byCentre: Record<string, number>;
  byUrgency: Record<string, number>;
  dailyVolume: { date: string; count: number }[];
}

const TYPE_LABELS: Record<string, string> = {
  new_enquiry: "Enquiry",
  booking_change: "Booking",
  billing_issue: "Billing",
  escalation: "Escalation",
  holiday_quest: "Holiday",
  general_message: "General",
};

const TYPE_COLORS: Record<string, string> = {
  new_enquiry: "#10B981",
  booking_change: "#004E64",
  billing_issue: "#F59E0B",
  escalation: "#EF4444",
  holiday_quest: "#8B5CF6",
  general_message: "#6B7280",
};

export function CallAnalytics() {
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["call-analytics"],
    queryFn: () => fetchApi("/api/calls/analytics?days=30"),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-border border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="text-center py-20 text-muted">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No call data yet</p>
        <p className="text-sm mt-1">Analytics will appear once calls start flowing in.</p>
      </div>
    );
  }

  const typeData = Object.entries(data.byType)
    .map(([key, value]) => ({
      name: TYPE_LABELS[key] ?? key,
      value,
      fill: TYPE_COLORS[key] ?? "#6B7280",
    }))
    .sort((a, b) => b.value - a.value);

  const centreData = Object.entries(data.byCentre)
    .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Phone} label="Total Calls" value={data.total} color="text-[#004E64]" sub={`Last ${data.days} days`} />
        <Stat icon={TrendingUp} label="Conversion Rate" value={data.conversionRate != null ? `${data.conversionRate}%` : "—"} color="text-emerald-600" sub="Enquiry → pipeline" />
        <Stat icon={Clock} label="Avg Response" value={data.avgTimeToAction != null ? `${data.avgTimeToAction}m` : "—"} color="text-blue-600" sub="Time to action" />
        <Stat icon={Shield} label="SLA Compliance" value={data.slaComplianceRate != null ? `${data.slaComplianceRate}%` : "—"} color="text-purple-600" sub="Urgent/critical" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={CheckCircle} label="Success Rate" value={data.successRate != null ? `${data.successRate}%` : "—"} color="text-emerald-600" sub="Key details captured" />
        <Stat icon={UserPlus} label="Enquiries Created" value={data.enquiriesCreated} color="text-[#004E64]" sub="Auto + manual" />
        <Stat icon={RefreshCw} label="Repeat Callers" value={data.repeatCallers} color="text-orange-600" sub="Called twice in 7 days" />
        <Stat icon={AlertTriangle} label="SLA Breaches" value={data.slaBreaches} color="text-red-600" sub="Escalated" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily volume */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Call Volume (Daily)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dailyVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#004E64" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* By type */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Calls by Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {typeData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By centre */}
        <div className="bg-card border border-border rounded-xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Calls by Centre</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={centreData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#9ca3af" angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#004E64" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
  sub: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-muted font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}
