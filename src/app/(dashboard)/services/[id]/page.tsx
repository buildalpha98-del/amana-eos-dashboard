"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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
  CalendarClock,
  DollarSign,
  FolderKanban,
  Loader2,
  Radio,
  ClipboardList,
  Wallet,
  LayoutList,
  UtensilsCrossed,
  ShieldCheck,
  ClipboardCheck,
  Activity,
  BookOpen,
  Target,
  ChevronDown,
  Users,
  Sunrise,
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
import { ServiceQIPTab } from "@/components/services/ServiceQIPTab";
import { ServiceChecklistsTab } from "@/components/services/ServiceChecklistsTab";
import { ServiceRollCallTab } from "@/components/services/ServiceRollCallTab";
import { ServiceChildrenTab } from "@/components/services/ServiceChildrenTab";
import { ServiceWeeklyRosterTab } from "@/components/services/ServiceWeeklyRosterTab";
import { ServiceTodayTab } from "@/components/services/ServiceTodayTab";
import { ServiceCasualBookingsTab } from "@/components/services/ServiceCasualBookingsTab";
import { ServiceTabBarV2 } from "@/components/services/ServiceTabBarV2";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";
import { isAdminRole } from "@/lib/role-permissions";

/* ------------------------------------------------------------------ */
/* Grouped tab definitions — 16 tabs consolidated into 6 groups       */
/* ------------------------------------------------------------------ */
interface SubTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  subTabs: SubTab[];
}

// Base Daily Ops sub-tabs always visible. `casual-bookings` is appended
// at render-time for admin/coord only (see `visibleGroups` below).
const DAILY_OPS_BASE_SUBTABS: SubTab[] = [
  { key: "attendance", label: "Attendance", icon: ClipboardList },
  { key: "roll-call", label: "Roll Call", icon: ClipboardCheck },
  { key: "children", label: "Children", icon: Users },
  { key: "roster", label: "Weekly Roster", icon: CalendarDays },
  { key: "checklists", label: "Checklists", icon: ClipboardCheck },
];

const CASUAL_BOOKINGS_SUBTAB: SubTab = {
  key: "casual-bookings",
  label: "Casual Bookings",
  icon: CalendarClock,
};

const tabGroups: TabGroup[] = [
  {
    key: "today",
    label: "Today",
    icon: Sunrise,
    subTabs: [],
  },
  {
    key: "overview",
    label: "Overview",
    icon: Building2,
    subTabs: [],
  },
  {
    key: "daily",
    label: "Daily Ops",
    icon: Activity,
    subTabs: DAILY_OPS_BASE_SUBTABS,
  },
  {
    key: "program",
    label: "Program",
    icon: BookOpen,
    subTabs: [
      { key: "activities", label: "Activities", icon: LayoutList },
      { key: "menu", label: "Menu", icon: UtensilsCrossed },
    ],
  },
  {
    key: "eos",
    label: "EOS",
    icon: Target,
    subTabs: [
      { key: "scorecard", label: "Scorecard", icon: BarChart3 },
      { key: "rocks", label: "Rocks", icon: Mountain },
      { key: "todos", label: "To-Dos", icon: CheckSquare },
      { key: "issues", label: "Issues", icon: AlertCircle },
      { key: "projects", label: "Projects", icon: FolderKanban },
      { key: "weekly", label: "Weekly Data", icon: CalendarDays },
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    subTabs: [
      { key: "audits", label: "Audits", icon: ShieldCheck },
      { key: "qip", label: "QIP", icon: ClipboardCheck },
      { key: "comms", label: "Comms", icon: Radio },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    subTabs: [
      { key: "budget", label: "Budget", icon: Wallet },
      { key: "financials", label: "Financials", icon: DollarSign },
    ],
  },
];

const statusBadgeStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  onboarding: "bg-blue-100 text-blue-700 border-blue-300",
  pipeline: "bg-purple-100 text-purple-700 border-purple-300",
  closing: "bg-amber-100 text-amber-700 border-amber-300",
  closed: "bg-surface text-muted border-border",
};

export default function ServiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const { data: service, isLoading, isError } = useService(id);
  const v2 = useStaffV2Flag();
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Read initial tab from URL ?tab=eos&sub=todos
  const urlTab = searchParams.get("tab");
  const urlSub = searchParams.get("sub");

  const [activeGroup, setActiveGroup] = useState(urlTab || "today");
  const [activeSubTab, setActiveSubTab] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {
      daily: "attendance",
      program: "activities",
      eos: "todos",
      compliance: "audits",
      finance: "budget",
    };
    if (urlTab && urlSub) defaults[urlTab] = urlSub;
    return defaults;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync tab state to URL
  useEffect(() => {
    const currentSub = activeSubTab[activeGroup];
    const group = tabGroups.find((g) => g.key === activeGroup);
    const hasSubTabs = group && group.subTabs.length > 0;
    const params = new URLSearchParams();
    if (activeGroup !== "today") {
      params.set("tab", activeGroup);
      if (hasSubTabs && currentSub) params.set("sub", currentSub);
    }
    const qs = params.toString();
    router.replace(`/services/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [activeGroup, activeSubTab, id, router]);

  // Notification badge data from service detail
  const todoBadge = service?.todos?.filter((t) => t.status !== "done").length || 0;
  const issueBadge = service?.issues?.filter((i) => i.status === "open").length || 0;

  // Filter admin-only groups and inject role-gated sub-tabs
  const sessionServiceId =
    (session?.user as { serviceId?: string | null } | undefined)?.serviceId ??
    null;
  const canSeeCasualBookings =
    isAdminRole(role) ||
    (role === "coordinator" && sessionServiceId === id);

  const visibleGroups = useMemo(() => {
    return tabGroups
      .filter((g) => !g.adminOnly || hasMinRole(role, "admin"))
      .map((g) => {
        // Append Casual Bookings sub-tab for admin/coord on this service only
        if (g.key === "daily" && canSeeCasualBookings) {
          return { ...g, subTabs: [...g.subTabs, CASUAL_BOOKINGS_SUBTAB] };
        }
        return g;
      });
  }, [role, canSeeCasualBookings]);

  const currentGroup = visibleGroups.find((g) => g.key === activeGroup) || visibleGroups[0];
  const currentSubKey = activeSubTab[activeGroup] || currentGroup?.subTabs[0]?.key;

  function handleGroupChange(groupKey: string) {
    setActiveGroup(groupKey);
    setMobileMenuOpen(false);
  }

  function handleSubTabChange(subKey: string) {
    setActiveSubTab((prev) => ({ ...prev, [activeGroup]: subKey }));
  }

  // Badge counts per group
  function getBadge(groupKey: string): number {
    if (groupKey === "eos") return todoBadge + issueBadge;
    return 0;
  }

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
        <Building2 className="w-16 h-16 text-muted/50 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Service Not Found
        </h2>
        <p className="text-muted text-sm mb-6">
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
    <div
      {...(v2 ? { "data-v2": "staff" } : {})}
      className="max-w-7xl mx-auto space-y-6"
    >
      <Breadcrumb
        items={[
          { label: "Services", href: "/services" },
          { label: service.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-brand" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
                {service.name}
              </h1>
              <span className="px-2 py-0.5 text-xs font-mono font-medium bg-surface text-muted rounded-md border border-border shrink-0">
                {service.code}
              </span>
            </div>
            {service.suburb && (
              <p className="text-sm text-muted mt-0.5">
                {service.suburb}
                {service.state ? `, ${service.state}` : ""}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-full border capitalize shrink-0",
            statusStyle
          )}
        >
          {service.status}
        </span>
      </div>

      {v2 ? (
        <ServiceTabBarV2
          groups={visibleGroups}
          activeGroup={activeGroup}
          onGroupChange={handleGroupChange}
          activeSub={currentSubKey}
          onSubChange={handleSubTabChange}
          badgeFor={getBadge}
        />
      ) : (
        <>
          {/* ── Mobile Tab Dropdown (< sm) ───────────────────────── */}
          <div className="sm:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-foreground"
            >
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = currentGroup.icon;
                  return <Icon className="w-4 h-4 text-brand" />;
                })()}
                <span>{currentGroup.label}</span>
                {getBadge(activeGroup) > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                    {getBadge(activeGroup)}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted transition-transform",
                  mobileMenuOpen && "rotate-180"
                )}
              />
            </button>
            {mobileMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-20 py-1">
                {visibleGroups.map((g) => {
                  const Icon = g.icon;
                  const badge = getBadge(g.key);
                  return (
                    <button
                      key={g.key}
                      onClick={() => handleGroupChange(g.key)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                        activeGroup === g.key
                          ? "text-brand bg-brand/5"
                          : "text-muted hover:bg-surface/50"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1 text-left">{g.label}</span>
                      {badge > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Desktop Tab Bar (≥ sm) ───────────────────────────── */}
          <div className="hidden sm:block border-b border-border">
            <nav className="flex gap-0 -mb-px">
              {visibleGroups.map((g) => {
                const Icon = g.icon;
                const isActive = activeGroup === g.key;
                const badge = getBadge(g.key);
                return (
                  <button
                    key={g.key}
                    onClick={() => handleGroupChange(g.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                      isActive
                        ? "border-brand text-brand"
                        : "border-transparent text-muted hover:text-foreground/80 hover:border-border"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {g.label}
                    {badge > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white ml-1">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ── Sub-Tab Pills (when group has subtabs) ───────────── */}
          {currentGroup.subTabs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {currentGroup.subTabs.map((sub) => {
                const SubIcon = sub.icon;
                const isActive = currentSubKey === sub.key;
                return (
                  <button
                    key={sub.key}
                    onClick={() => handleSubTabChange(sub.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors",
                      isActive
                        ? "bg-brand text-white border-brand"
                        : "bg-card text-muted border-border hover:bg-surface/50"
                    )}
                  >
                    <SubIcon className="w-3.5 h-3.5" />
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Tab Content ──────────────────────────────────────── */}
      <div className="min-h-[40vh]">
        {/* Today group (no subtabs) — live ops snapshot */}
        {activeGroup === "today" && (
          <ServiceTodayTab serviceId={service.id} serviceName={service.name} />
        )}

        {/* Overview group (no subtabs) */}
        {activeGroup === "overview" && (
          <ServiceOverviewTab service={service} users={users || []} />
        )}

        {/* Daily Ops group */}
        {activeGroup === "daily" && currentSubKey === "attendance" && (
          <ServiceAttendanceTab
            serviceId={service.id}
            serviceName={service.name}
          />
        )}
        {activeGroup === "daily" && currentSubKey === "roll-call" && (
          <ServiceRollCallTab serviceId={service.id} serviceName={service.name} />
        )}
        {activeGroup === "daily" && currentSubKey === "children" && (
          <ServiceChildrenTab serviceId={service.id} serviceName={service.name} />
        )}
        {activeGroup === "daily" && currentSubKey === "roster" && (
          <ServiceWeeklyRosterTab serviceId={service.id} serviceName={service.name} />
        )}
        {activeGroup === "daily" && currentSubKey === "checklists" && (
          <ServiceChecklistsTab serviceId={service.id} serviceName={service.name} />
        )}
        {activeGroup === "daily" &&
          currentSubKey === "casual-bookings" &&
          canSeeCasualBookings && (
            <ServiceCasualBookingsTab service={service} />
          )}

        {/* Program group */}
        {activeGroup === "program" && currentSubKey === "activities" && (
          <ServiceProgramTab serviceId={service.id} />
        )}
        {activeGroup === "program" && currentSubKey === "menu" && (
          <ServiceMenuTab serviceId={service.id} />
        )}

        {/* EOS group */}
        {activeGroup === "eos" && currentSubKey === "scorecard" && (
          <ServiceScorecardTab serviceId={service.id} />
        )}
        {activeGroup === "eos" && currentSubKey === "rocks" && (
          <ServiceRocksTab serviceId={service.id} />
        )}
        {activeGroup === "eos" && currentSubKey === "todos" && (
          <ServiceTodosTab serviceId={service.id} />
        )}
        {activeGroup === "eos" && currentSubKey === "issues" && (
          <ServiceIssuesTab serviceId={service.id} />
        )}
        {activeGroup === "eos" && currentSubKey === "projects" && (
          <ServiceProjectsTab serviceId={service.id} />
        )}
        {activeGroup === "eos" && currentSubKey === "weekly" && (
          <WeeklyDataEntry
            serviceId={service.id}
            bscRate={service.bscDailyRate || 0}
            ascRate={service.ascDailyRate || 0}
            vcRate={service.vcDailyRate || 0}
          />
        )}

        {/* Compliance group */}
        {activeGroup === "compliance" && currentSubKey === "audits" && (
          <ServiceAuditsTab serviceId={service.id} />
        )}
        {activeGroup === "compliance" && currentSubKey === "qip" && (
          <ServiceQIPTab serviceId={service.id} />
        )}
        {activeGroup === "compliance" && currentSubKey === "comms" && (
          <ServiceCommTab serviceId={service.id} />
        )}

        {/* Finance group */}
        {activeGroup === "finance" && currentSubKey === "budget" && (
          <ServiceBudgetTab serviceId={service.id} />
        )}
        {activeGroup === "finance" && currentSubKey === "financials" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-brand" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Financial Dashboard
            </h3>
            <p className="text-sm text-muted max-w-md">
              Financial summary for {service.name} is available on the Financial
              Dashboard page filtered to this centre.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
