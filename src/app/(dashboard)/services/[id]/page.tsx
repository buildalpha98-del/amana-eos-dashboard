"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useService } from "@/hooks/useServices";
import { hasMinRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import {
  ArrowLeft,
  Building2,
  BarChart3,
  Mountain,
  CheckSquare,
  AlertCircle,
  CalendarDays,
  DollarSign,
  FolderKanban,
  Loader2,
  Radio,
  ClipboardList,
  Wallet,
  LayoutList,
  UtensilsCrossed,
  ShieldCheck,
} from "lucide-react";
import { ServiceOverviewTab } from "@/components/services/ServiceOverviewTab";
import { ServiceScorecardTab } from "@/components/services/ServiceScorecardTab";
import { ServiceRocksTab } from "@/components/services/ServiceRocksTab";
import { ServiceTodosTab } from "@/components/services/ServiceTodosTab";
import { ServiceIssuesTab } from "@/components/services/ServiceIssuesTab";
import { ServiceProjectsTab } from "@/components/services/ServiceProjectsTab";
import { WeeklyDataEntry } from "@/components/services/WeeklyDataEntry";
import { ServiceCommTab } from "@/components/services/ServiceCommTab";
import { ServiceAttendanceTab } from "@/components/services/ServiceAttendanceTab";
import { ServiceBudgetTab } from "@/components/services/ServiceBudgetTab";
import { ServiceProgramTab } from "@/components/services/ServiceProgramTab";
import { ServiceMenuTab } from "@/components/services/ServiceMenuTab";
import { ServiceAuditsTab } from "@/components/services/ServiceAuditsTab";
import { ServiceTodayPanel } from "@/components/services/ServiceTodayPanel";

const tabs = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "attendance", label: "Attendance", icon: ClipboardList },
  { key: "scorecard", label: "Scorecard", icon: BarChart3 },
  { key: "rocks", label: "Rocks", icon: Mountain },
  { key: "todos", label: "To-Dos", icon: CheckSquare },
  { key: "issues", label: "Issues", icon: AlertCircle },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "weekly", label: "Weekly Data", icon: CalendarDays },
  { key: "comms", label: "Comms", icon: Radio },
  { key: "program", label: "Program", icon: LayoutList },
  { key: "menu", label: "Menu", icon: UtensilsCrossed },
  { key: "audits", label: "Audits", icon: ShieldCheck },
  { key: "budget", label: "Budget", icon: Wallet },
  { key: "financials", label: "Financials", icon: DollarSign },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const statusBadgeStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  onboarding: "bg-blue-100 text-blue-700 border-blue-300",
  pipeline: "bg-purple-100 text-purple-700 border-purple-300",
  closing: "bg-amber-100 text-amber-700 border-amber-300",
  closed: "bg-gray-100 text-gray-500 border-gray-300",
};

export default function ServiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
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

  // Hide financials tab for non-admin users
  const visibleTabs = useMemo(
    () => tabs.filter((t) => (t.key !== "financials" && t.key !== "budget") || hasMinRole(role, "admin")),
    [role]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
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
      <Breadcrumb
        items={[
          { label: "Services", href: "/services" },
          { label: service.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-brand" />
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

      {/* Today Panel */}
      <ServiceTodayPanel serviceId={id} />

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand text-brand"
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

        {activeTab === "attendance" && (
          <ServiceAttendanceTab
            serviceId={service.id}
            capacity={service.capacity}
          />
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

        {activeTab === "projects" && (
          <ServiceProjectsTab serviceId={service.id} />
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

        {activeTab === "program" && (
          <ServiceProgramTab serviceId={service.id} />
        )}

        {activeTab === "menu" && (
          <ServiceMenuTab serviceId={service.id} />
        )}

        {activeTab === "audits" && (
          <ServiceAuditsTab serviceId={service.id} />
        )}

        {activeTab === "budget" && (
          <ServiceBudgetTab serviceId={service.id} />
        )}

        {activeTab === "financials" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-brand" />
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
