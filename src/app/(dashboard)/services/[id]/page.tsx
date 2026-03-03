"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useService } from "@/hooks/useServices";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Building2,
  BarChart3,
  Mountain,
  CheckSquare,
  AlertCircle,
  CalendarDays,
  DollarSign,
  Loader2,
  Radio,
} from "lucide-react";
import { ServiceOverviewTab } from "@/components/services/ServiceOverviewTab";
import { ServiceScorecardTab } from "@/components/services/ServiceScorecardTab";
import { ServiceRocksTab } from "@/components/services/ServiceRocksTab";
import { ServiceTodosTab } from "@/components/services/ServiceTodosTab";
import { ServiceIssuesTab } from "@/components/services/ServiceIssuesTab";
import { WeeklyDataEntry } from "@/components/services/WeeklyDataEntry";
import { ServiceCommTab } from "@/components/services/ServiceCommTab";

const tabs = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "scorecard", label: "Scorecard", icon: BarChart3 },
  { key: "rocks", label: "Rocks", icon: Mountain },
  { key: "todos", label: "To-Dos", icon: CheckSquare },
  { key: "issues", label: "Issues", icon: AlertCircle },
  { key: "weekly", label: "Weekly Data", icon: CalendarDays },
  { key: "comms", label: "Comms", icon: Radio },
  { key: "financials", label: "Financials", icon: DollarSign },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const statusBadgeStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  onboarding: "bg-blue-100 text-blue-700 border-blue-300",
  closing: "bg-amber-100 text-amber-700 border-amber-300",
  closed: "bg-gray-100 text-gray-500 border-gray-300",
};

export default function ServiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: service, isLoading, isError } = useService(id);
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#004E64] animate-spin" />
      </div>
    );
  }

  // 404 / not found state
  if (isError || !service) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Building2 className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Service Not Found
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          The service centre you are looking for does not exist or has been
          removed.
        </p>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </Link>
      </div>
    );
  }

  const statusStyle =
    statusBadgeStyles[service.status] || statusBadgeStyles.closed;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href="/services"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#004E64] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Services
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#004E64]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {service.name}
              </h1>
              <span className="px-2 py-0.5 text-xs font-mono font-medium bg-gray-100 text-gray-600 rounded-md border border-gray-200">
                {service.code}
              </span>
            </div>
            {service.suburb && (
              <p className="text-sm text-gray-500 mt-0.5">
                {service.suburb}
                {service.state ? `, ${service.state}` : ""}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-full border capitalize",
            statusStyle
          )}
        >
          {service.status}
        </span>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-[#004E64] text-[#004E64]"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[40vh]">
        {activeTab === "overview" && (
          <ServiceOverviewTab service={service} users={users || []} />
        )}

        {activeTab === "scorecard" && (
          <ServiceScorecardTab serviceId={service.id} />
        )}

        {activeTab === "rocks" && (
          <ServiceRocksTab serviceId={service.id} />
        )}

        {activeTab === "todos" && (
          <ServiceTodosTab serviceId={service.id} />
        )}

        {activeTab === "issues" && (
          <ServiceIssuesTab serviceId={service.id} />
        )}

        {activeTab === "weekly" && (
          <WeeklyDataEntry
            serviceId={service.id}
            bscRate={service.bscDailyRate || 0}
            ascRate={service.ascDailyRate || 0}
            vcRate={service.vcDailyRate || 0}
          />
        )}

        {activeTab === "comms" && (
          <ServiceCommTab serviceId={service.id} />
        )}

        {activeTab === "financials" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-[#004E64]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Financial Dashboard
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              Financial summary for {service.name} is available on the Financial
              Dashboard page filtered to this centre.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
