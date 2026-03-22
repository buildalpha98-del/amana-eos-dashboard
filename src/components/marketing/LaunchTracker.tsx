"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Milestone,
} from "lucide-react";

interface LaunchCentre {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  state: string | null;
  schoolPopulation: number;
  launchDate: string;
  currentWeek: number;
  ascEnrolled: number;
  bscEnrolled: number;
  ascTarget: number;
  bscTarget: number;
  weeklyTrend: number[];
  enquiryCount: number;
  enrolmentCount: number;
  plannedActivities: number;
  completedActivities: number;
  npsAverage: number | null;
  npsFeedbackCount: number;
  status: "On Track" | "Needs Attention" | "At Risk";
}

interface LaunchData {
  services: LaunchCentre[];
  hasLaunchCentres: boolean;
  currentWeek: number;
}

const STATUS_STYLES = {
  "On Track": { bg: "bg-green-50", border: "border-green-300", text: "text-green-700", icon: CheckCircle },
  "Needs Attention": { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", icon: AlertTriangle },
  "At Risk": { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: XCircle },
};

const MILESTONES = [
  { week: 4, label: "First Feedback", description: "Collect initial parent feedback" },
  { week: 8, label: "Mid-Programme Review", description: "Review attendance trends & activities" },
  { week: 12, label: "Transition to BAU", description: "Move from launch to business-as-usual" },
];

export function LaunchTracker() {
  const [data, setData] = useState<LaunchData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/launch-tracker")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  if (!data || !data.hasLaunchCentres) {
    return (
      <div className="text-center py-8 text-muted text-sm">
        No centres currently in launch phase
      </div>
    );
  }

  const { currentWeek, services } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Melbourne Launch Programme — Week {currentWeek} of 12
        </h3>
        <p className="text-sm text-muted mb-4">
          Tracking trust-building progress across new Melbourne centres
        </p>

        {/* 12-week timeline */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 12 }, (_, i) => {
            const week = i + 1;
            const isCurrent = week === currentWeek;
            const isPast = week < currentWeek;
            const isMilestone = MILESTONES.some((m) => m.week === week);
            return (
              <div key={week} className="flex-1 relative">
                <div
                  className={`h-3 rounded-sm ${
                    isCurrent
                      ? "bg-brand"
                      : isPast
                      ? "bg-brand/30"
                      : "bg-surface"
                  }`}
                  title={`Week ${week}`}
                />
                {isMilestone && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                    <Milestone className="h-3 w-3 text-brand" />
                  </div>
                )}
                <span className="text-[8px] text-muted block text-center mt-0.5">
                  {week}
                </span>
              </div>
            );
          })}
        </div>

        {/* Milestones */}
        <div className="flex gap-4 mt-4">
          {MILESTONES.map((m) => (
            <div
              key={m.week}
              className={`flex-1 p-2 rounded text-xs border ${
                m.week <= currentWeek
                  ? "border-brand/20 bg-brand/5"
                  : "border-border bg-surface/50"
              }`}
            >
              <span className="font-medium text-foreground/80">
                Wk {m.week}: {m.label}
              </span>
              <p className="text-muted mt-0.5">{m.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Centre Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {services.map((centre) => (
          <CentreCard key={centre.serviceId} centre={centre} />
        ))}
      </div>
    </div>
  );
}

function CentreCard({ centre }: { centre: LaunchCentre }) {
  const statusStyle = STATUS_STYLES[centre.status];
  const StatusIcon = statusStyle.icon;
  const conversionRate =
    centre.enquiryCount > 0
      ? Math.round((centre.enrolmentCount / centre.enquiryCount) * 100)
      : 0;
  const activityProgress =
    centre.plannedActivities > 0
      ? Math.round((centre.completedActivities / centre.plannedActivities) * 100)
      : 0;

  // Simple sparkline from weeklyTrend
  const maxTrend = Math.max(...centre.weeklyTrend, 1);

  return (
    <div className={`rounded-lg border-2 ${statusStyle.border} ${statusStyle.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-foreground">{centre.serviceName}</h4>
          <p className="text-xs text-muted">
            Pop: {centre.schoolPopulation.toLocaleString()} · Week {centre.currentWeek}
          </p>
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${statusStyle.text} ${statusStyle.bg}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {centre.status}
        </span>
      </div>

      {/* ASC / BSC */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card/60 rounded p-2">
          <div className="text-[10px] text-muted uppercase">ASC</div>
          <div className="text-lg font-bold text-foreground">
            {centre.ascEnrolled}
            <span className="text-sm text-muted font-normal"> / {centre.ascTarget}</span>
          </div>
        </div>
        <div className="bg-card/60 rounded p-2">
          <div className="text-[10px] text-muted uppercase">BSC</div>
          <div className="text-lg font-bold text-foreground">
            {centre.bscEnrolled}
            <span className="text-sm text-muted font-normal"> / {centre.bscTarget}</span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div>
        <div className="text-[10px] text-muted mb-1">Weekly Attendance Trend</div>
        <div className="flex items-end gap-px h-8">
          {centre.weeklyTrend.map((val, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${
                i < centre.currentWeek ? "bg-brand/60" : "bg-border"
              }`}
              style={{ height: `${Math.max((val / maxTrend) * 100, 4)}%` }}
              title={`Wk ${i + 1}: ${val}`}
            />
          ))}
        </div>
      </div>

      {/* Enquiry Funnel */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5 text-muted" />
          <span className="text-muted">
            {centre.enquiryCount} enquiries → {centre.enrolmentCount} enrolled
          </span>
          <span className="text-muted">({conversionRate}%)</span>
        </div>
      </div>

      {/* Activities Progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted">Activities</span>
          <span className="text-muted">
            {centre.completedActivities} / {centre.plannedActivities} completed
          </span>
        </div>
        <div className="w-full bg-card/60 rounded-full h-2">
          <div
            className="bg-brand h-2 rounded-full"
            style={{ width: `${Math.min(activityProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="flex items-center gap-3 text-xs text-muted">
        {centre.npsAverage !== null && (
          <span>NPS: {centre.npsAverage}</span>
        )}
        <span>Feedback: {centre.npsFeedbackCount}</span>
        {centre.weeklyTrend[Math.min(centre.currentWeek - 1, 11)] >
          centre.weeklyTrend[Math.max(centre.currentWeek - 2, 0)] ? (
          <span className="flex items-center gap-0.5 text-green-600">
            <TrendingUp className="h-3 w-3" /> Trending up
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-red-600">
            <TrendingDown className="h-3 w-3" /> Trending down
          </span>
        )}
      </div>
    </div>
  );
}
