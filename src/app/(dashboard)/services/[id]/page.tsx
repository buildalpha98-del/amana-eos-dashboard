"use client";

import { resolveSectionLink, tabGroups, visibleServiceSections } from "@/lib/service-sections";
import { ServiceDocumentsTab } from "@/components/services/ServiceDocumentsTab";
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useService } from "@/hooks/useServices";
import { hasMinRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Building2,
  Loader2,
  LayoutList,
  ExternalLink,
} from "lucide-react";
import { mergeServiceContent } from "@/lib/service-content-shared";
import { ServiceOverviewTab } from "@/components/services/ServiceOverviewTab";
import { ServiceContentTab } from "@/components/services/ServiceContentTab";
import { ServiceStaffTab } from "@/components/services/ServiceStaffTab";
import { ServiceScorecardTab } from "@/components/services/ServiceScorecardTab";
import { ServiceRocksTab } from "@/components/services/ServiceRocksTab";
import { ServiceTodosTab } from "@/components/services/ServiceTodosTab";
import { ServiceIssuesTab } from "@/components/services/ServiceIssuesTab";
import { ServiceProjectsTab } from "@/components/services/ServiceProjectsTab";
import { WeeklyDataEntry } from "@/components/services/WeeklyDataEntry";
import { ServiceCommTab } from "@/components/services/ServiceCommTab";
import { ServiceAttendanceTab } from "@/components/services/ServiceAttendanceTab";
import { ServiceBudgetTab } from "@/components/services/ServiceBudgetTab";
import { FamilyBillingSection } from "@/components/billing/FamilyBillingSection";
import { ServicePurchaseApprovalsTab } from "@/components/services/ServicePurchaseApprovalsTab";
import { ServiceProgramTab } from "@/components/services/ServiceProgramTab";
import { ServiceMenuTab } from "@/components/services/ServiceMenuTab";
import { ServiceAuditsTab } from "@/components/services/ServiceAuditsTab";
import { ServiceQIPTab } from "@/components/services/ServiceQIPTab";
import { ServiceChecklistsTab } from "@/components/services/ServiceChecklistsTab";
import { ServiceRollCallTab } from "@/components/services/ServiceRollCallTab";
import { ParentCommunicationPanel } from "./parent-communication/page";
import { ServiceFamiliesTab } from "@/components/services/ServiceFamiliesTab";
import { MessagingInbox } from "@/components/messaging/MessagingInbox";
import { ServiceHazardsTab } from "@/components/services/ServiceHazardsTab";
import { ServiceChildrenTab } from "@/components/services/ServiceChildrenTab";
import { ServiceWeeklyRosterTab } from "@/components/services/ServiceWeeklyRosterTab";
import { ServiceTodayTab } from "@/components/services/ServiceTodayTab";
import { ServiceCasualBookingsTab } from "@/components/services/ServiceCasualBookingsTab";
import { ServiceReflectionsTab } from "@/components/services/ServiceReflectionsTab";
import { ServiceIncidentsTab } from "@/components/services/ServiceIncidentsTab";
import { ServiceObservationsTab } from "@/components/services/ServiceObservationsTab";
import { ServiceMedicationTab } from "@/components/services/ServiceMedicationTab";
import { ServiceRegistersTab } from "@/components/services/ServiceRegistersTab";
import { ServiceHeadcountsTab } from "@/components/services/ServiceHeadcountsTab";
import { ServiceRiskTab } from "@/components/services/ServiceRiskTab";
import { ServiceCertExpiryCard } from "@/components/services/ServiceCertExpiryCard";
import { ServiceRatiosTab } from "@/components/services/RatioWidget";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import ActivityLibraryPage from "@/app/(dashboard)/activity-library/page";
import { ServiceInfoCard } from "@/components/services/overview/ServiceInfoCard";
import { ServiceNavTree } from "@/components/services/ServiceNavTree";
import { ServiceTabBarV2 } from "@/components/services/ServiceTabBarV2";
import { isAdminRole } from "@/lib/role-permissions";
import { useNavLayout } from "@/hooks/useNavLayout";

/* ------------------------------------------------------------------ */
/* Grouped tab definitions — 16 tabs consolidated into 6 groups       */
/* ------------------------------------------------------------------ */
// Params owned by an individual sub-tab. The URL sync preserves them while
// their owner is active (so deep links like
// ?tab=daily&sub=roll-call&rollCallView=weekly survive mount) and clears
// them the moment the user moves away — otherwise a stale `date` re-seeds
// the roll on the next visit and a shared Finance link carries
// contradictory roll-call state forever. A sub-tab that adds its own query
// param must register it here.
const TAB_OWNED_PARAMS: Record<string, { tab: string; sub: string }> = {
  rollCallView: { tab: "daily", sub: "roll-call" },
  date: { tab: "daily", sub: "roll-call" },
  rosterView: { tab: "daily", sub: "roster" },
};

const statusBadgeStyles: Record<string, string> = {
  active: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  onboarding: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  pipeline: "bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  closing: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
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
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Read initial tab from URL ?tab=eos&sub=todos
  // Retired links (Sign In / Out, the old Families group…) land where that
  // page lives now.
  const { tab: urlTab, sub: urlSub } = resolveSectionLink(
    searchParams.get("tab"),
    searchParams.get("sub"),
  );

  const [activeGroup, setActiveGroup] = useState(urlTab || "today");
  const [navSheetOpen, setNavSheetOpen] = useState(false);
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
  // URL → state: the centre-account SIDEBAR (CentreSidebarNav) navigates by
  // changing ?tab=&sub= on this same page, which doesn't remount it — so
  // follow the URL when it moves (2026-10-08). Adjusted during render, not
  // in an effect (same pattern as TopBar's pathname reset); the state → URL
  // effect below writes the same values back, so it settles in one pass.
  const urlKey = `${urlTab ?? ""}|${urlSub ?? ""}`;
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);
  if (prevUrlKey !== urlKey) {
    setPrevUrlKey(urlKey);
    setActiveGroup(urlTab || "today");
    if (urlTab && urlSub) setActiveSubTab((prev) => ({ ...prev, [urlTab]: urlSub }));
  }

  // Sync tab state to URL
  useEffect(() => {
    const currentSub = activeSubTab[activeGroup];
    const group = tabGroups.find((g) => g.key === activeGroup);
    const hasSubTabs = group && group.subTabs.length > 0;
    // Build from the router's searchParams, not window.location.search:
    // window.location lags uncommitted router.replace() calls from child
    // tabs (roll-call writes rollCallView/date), so a racing snapshot here
    // could resurrect the stale query and drop a just-written param.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.delete("sub");
    for (const [key, owner] of Object.entries(TAB_OWNED_PARAMS)) {
      if (owner.tab !== activeGroup || owner.sub !== currentSub) {
        params.delete(key);
      }
    }
    if (activeGroup !== "today") {
      params.set("tab", activeGroup);
      if (hasSubTabs && currentSub) params.set("sub", currentSub);
    }
    const qs = params.toString();
    // Skip the no-op replace when the URL already matches — this also
    // terminates the loop this effect would otherwise enter now that it
    // depends on searchParams (each replace mints a new searchParams).
    if (qs === searchParams.toString()) return;
    router.replace(`/services/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [activeGroup, activeSubTab, id, router, searchParams]);

  // Notification badge data from service detail
  const todoBadge = service?.todos?.filter((t) => t.status !== "done").length || 0;
  const issueBadge = service?.issues?.filter((i) => i.status === "open").length || 0;

  // Filter admin-only groups and inject role-gated sub-tabs
  const sessionServiceId =
    (session?.user as { serviceId?: string | null } | undefined)?.serviceId ??
    null;
  // Admin tier anywhere, or the Director of this centre. Used for both
  // seeing casual bookings and editing this service's configuration —
  // same rule, two readings, so it's named for the rule.
  const canManageThisService =
    isAdminRole(role) || (role === "member" && sessionServiceId === id);
  const canSeeCasualBookings = canManageThisService;

  const isAdminPlus = hasMinRole(role, "admin");
  const canSeeStaffFiles = isAdminRole(role) || role === "member";
  // The sidebar carries this centre's menu for its own centre login AND for
  // an educator at their own centre (2026-10-08) — no second menu here.
  const ownCentreAccount =
    (session?.user?.isCentreAccount === true || role === "staff") && sessionServiceId === id;

  const isEducator = role === "staff";
  const { layout: navLayout } = useNavLayout();
  const visibleGroups = useMemo(
    () =>
      visibleServiceSections({
        isEducator,
        isAdminPlus,
        canSeeCasualBookings,
        canSeeStaffFiles,
        canSeeMessages: canManageThisService,
      }),
    [isEducator, isAdminPlus, canSeeCasualBookings, canSeeStaffFiles, canManageThisService],
  );

  // Render what is VISIBLE, never what the URL merely asked for: a
  // bookmarked ?tab=eos must not draw EOS for an educator whose menu has
  // no EOS, and a remembered sub-tab that isn't in this viewer's list
  // falls back to the first one they do have.
  const currentGroup = visibleGroups.find((g) => g.key === activeGroup) || visibleGroups[0];
  const shownGroup = currentGroup?.key;
  const rememberedSub = shownGroup ? activeSubTab[shownGroup] : undefined;
  const currentSubKey =
    currentGroup?.subTabs.find((s) => s.key === rememberedSub)?.key ??
    currentGroup?.subTabs[0]?.key;

  // The nav moves group and sub-page in ONE click (group, then sub) —
  // both handlers run before a re-render, so the sub must be filed under
  // the group just chosen, not the one this render still shows.
  const pendingGroup = useRef<string | null>(null);
  function handleGroupChange(groupKey: string) {
    pendingGroup.current = groupKey;
    setActiveGroup(groupKey);
  }

  function handleSubTabChange(subKey: string) {
    const group = pendingGroup.current ?? shownGroup ?? activeGroup;
    pendingGroup.current = null;
    setActiveSubTab((prev) => ({ ...prev, [group]: subKey }));
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
  // Empty when the centre hasn't set one (Content tab → Quick links) —
  // hidden rather than a dead button pointing nowhere.
  const sharepointUrl = mergeServiceContent(service.content).sharepointUrl;

  return (
    <div
      data-v2="staff"
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* Header — back-nav lives in the TopBar breadcrumb (Services > Service
          Detail) + centre switcher; an in-page breadcrumb duplicated both. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-brand" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-heading font-semibold tracking-tight text-foreground truncate">
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
        <div className="flex items-center gap-2 shrink-0">
          {sharepointUrl && (
            <a
              href={sharepointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-surface transition-colors"
              title="Open this centre's SharePoint folder"
            >
              <ExternalLink className="w-3.5 h-3.5 text-brand" />
              SharePoint
            </a>
          )}
          <span
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border capitalize shrink-0",
              statusStyle
            )}
          >
            {service.status}
          </span>
        </div>
      </div>

      {/* Touch devices keep the tab bar for fast switching — a 240px
          rail on a phone is most of the screen — plus a button that
          opens the SAME tree in a sheet, so "see everything at once"
          isn't a desktop-only privilege. iPad portrait is 820px wide,
          which lands here, and it's the device this is used on most. */}
      {/* 2026-10-09 (staff-UX Round 2): ALWAYS shown below desktop width.
          Hiding it for a centre's own staff meant every section past Today
          cost 3–4 taps through More → drawer on a phone — the sidebar
          carrying the same menu is a desktop affordance, not a phone one. */}
      <div className="lg:hidden">
        <ServiceTabBarV2
          groups={visibleGroups}
          activeGroup={shownGroup ?? activeGroup}
          onGroupChange={handleGroupChange}
          activeSub={currentSubKey}
          onSubChange={handleSubTabChange}
          badgeFor={getBadge}
        />
        <button
          type="button"
          onClick={() => setNavSheetOpen(true)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground active:bg-surface"
        >
          <LayoutList className="h-4 w-4 text-brand" />
          All sections
        </button>
      </div>

      <Dialog open={navSheetOpen} onOpenChange={setNavSheetOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>All sections</DialogTitle>
          <div className="mt-3 max-h-[70vh] overflow-y-auto">
            <ServiceNavTree
              groups={visibleGroups}
              activeGroup={shownGroup ?? activeGroup}
              activeSub={currentSubKey}
              onGroupChange={handleGroupChange}
              onSubChange={(k) => {
                handleSubTabChange(k);
                // Choosing a page is the whole reason the sheet is open.
                setNavSheetOpen(false);
              }}
              badgeFor={getBadge}
              className="w-full border-0 pr-0"
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="lg:flex lg:gap-6">
        {/* A centre account viewing its own centre navigates from the main
            sidebar (CentreSidebarNav) — no second menu beside it. */}
        {/* Desktop: the sidebar carries this centre's menu for its own
            staff — unless they use the top-bar layout, where there is no
            sidebar and this tree is their only way between sections. */}
        <div className={cn("hidden", (!ownCentreAccount || navLayout === "topbar") && "lg:block")}>
          <ServiceNavTree
            groups={visibleGroups}
            activeGroup={shownGroup ?? activeGroup}
            activeSub={currentSubKey}
            onGroupChange={handleGroupChange}
            onSubChange={handleSubTabChange}
            badgeFor={getBadge}
          />
        </div>

      {/* ── Tab Content ──────────────────────────────────────── */}
      <div className="min-h-[40vh] lg:min-w-0 lg:flex-1">
        {/* Today group (no subtabs) — live ops snapshot */}
        {shownGroup === "today" && (
          <ServiceTodayTab serviceId={service.id} serviceName={service.name} />
        )}

        {/* Service Information — one subject per sub-tab. */}
        {shownGroup === "overview" && currentSubKey === "info" && (
          <div className="space-y-6">
            <ServiceOverviewTab service={service} users={users || []} />
          </div>
        )}
        {shownGroup === "overview" &&
          (currentSubKey === "settings" ||
            currentSubKey === "rooms" ||
            currentSubKey === "fees" ||
            currentSubKey === "closures" ||
            currentSubKey === "forms") && (
            <div className="space-y-6">
              <ServiceInfoCard
                service={service}
                canEdit={canManageThisService}
                section={currentSubKey}
              />
            </div>
          )}
        {shownGroup === "overview" && currentSubKey === "about" && (
          <ServiceContentTab serviceId={service.id} />
        )}

        {/* Staff group (no subtabs) — assignments management */}
        {shownGroup === "staff" && <ServiceStaffTab serviceId={service.id} />}
        {shownGroup === "documents" && (
          <ServiceDocumentsTab
            serviceId={service.id}
            serviceState={service.state ?? null}
            sub={currentSubKey ?? "policies"}
          />
        )}

        {/* Daily Ops group */}
        {shownGroup === "daily" && currentSubKey === "attendance" && (
          <ServiceAttendanceTab
            serviceId={service.id}
            serviceName={service.name}
          />
        )}
        {shownGroup === "daily" && currentSubKey === "posts" && (
          <ParentCommunicationPanel serviceId={service.id} embedded />
        )}
        {shownGroup === "daily" && currentSubKey === "roll-call" && (
          <ServiceRollCallTab serviceId={service.id} serviceName={service.name} />
        )}
        {shownGroup === "families" && (
          <ServiceFamiliesTab serviceId={service.id} serviceName={service.name} />
        )}
        {shownGroup === "messages" && <MessagingInbox lockedServiceId={service.id} />}
        {shownGroup === "children" && (
          <ServiceChildrenTab serviceId={service.id} serviceName={service.name} />
        )}
        {shownGroup === "daily" && currentSubKey === "roster" && (
          <ServiceWeeklyRosterTab serviceId={service.id} serviceName={service.name} />
        )}
        {shownGroup === "daily" && currentSubKey === "checklists" && (
          <ServiceChecklistsTab serviceId={service.id} serviceName={service.name} />
        )}
        {shownGroup === "daily" && currentSubKey === "medication" && (
          <ServiceMedicationTab serviceId={service.id} />
        )}
        {shownGroup === "daily" && currentSubKey === "ratios" && (
          <ServiceRatiosTab serviceId={service.id} />
        )}
        {shownGroup === "daily" &&
          currentSubKey === "casual-bookings" &&
          canSeeCasualBookings && (
            <ServiceCasualBookingsTab service={service} />
          )}

        {/* Program group */}
        {shownGroup === "program" && currentSubKey === "activities" && (
          <ServiceProgramTab serviceId={service.id} />
        )}
        {shownGroup === "program" && currentSubKey === "library" && (
          <ActivityLibraryPage />
        )}
        {shownGroup === "program" && currentSubKey === "menu" && (
          <ServiceMenuTab serviceId={service.id} />
        )}
        {shownGroup === "program" && currentSubKey === "observations" && (
          <ServiceObservationsTab serviceId={service.id} />
        )}

        {/* EOS group */}
        {shownGroup === "eos" && currentSubKey === "scorecard" && (
          <ServiceScorecardTab serviceId={service.id} />
        )}
        {shownGroup === "eos" && currentSubKey === "rocks" && (
          <ServiceRocksTab serviceId={service.id} />
        )}
        {shownGroup === "eos" && currentSubKey === "todos" && (
          <ServiceTodosTab serviceId={service.id} />
        )}
        {shownGroup === "eos" && currentSubKey === "issues" && (
          <ServiceIssuesTab serviceId={service.id} />
        )}
        {shownGroup === "eos" && currentSubKey === "projects" && (
          <ServiceProjectsTab serviceId={service.id} />
        )}
        {shownGroup === "eos" && currentSubKey === "weekly" && isAdminPlus && (
          <WeeklyDataEntry
            serviceId={service.id}
            bscRate={service.bscDailyRate || 0}
            ascRate={service.ascDailyRate || 0}
            vcRate={service.vcDailyRate || 0}
          />
        )}

        {/* Compliance group */}
        {shownGroup === "compliance" && (
          // Always render the cert-expiry banner above the active
          // compliance sub-tab. The card hides itself when there are
          // no expiring/expired certs at this service, so it's quiet
          // by default and only shouts when there's something to do.
          <ServiceCertExpiryCard serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "audits" && (
          <ServiceAuditsTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "qip" && (
          <ServiceQIPTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "reflections" && (
          <ServiceReflectionsTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "incidents" && (
          <ServiceIncidentsTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "risk" && (
          <ServiceRiskTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "hazards" && (
          <ServiceHazardsTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "headcounts" && (
          <ServiceHeadcountsTab serviceId={service.id} />
        )}
        {shownGroup === "compliance" && currentSubKey === "registers" && (
          <ServiceRegistersTab
            serviceId={service.id}
            /* A staff injury register isn't for the whole floor to read. */
            canSeeStaffIncidents={role === "member" || hasMinRole(role, "admin")}
          />
        )}
        {shownGroup === "compliance" && currentSubKey === "comms" && (
          <ServiceCommTab serviceId={service.id} />
        )}

        {/* Finance group */}
        {shownGroup === "finance" && currentSubKey === "budget" && (
          <ServiceBudgetTab serviceId={service.id} />
        )}
        {shownGroup === "finance" && currentSubKey === "billing" && (
          <FamilyBillingSection
            serviceId={service.id}
            serviceName={service.name}
          />
        )}
        {shownGroup === "finance" && currentSubKey === "approvals" && (
          <ServicePurchaseApprovalsTab
            serviceId={service.id}
            serviceName={service.name}
          />
        )}
      </div>
      </div>
    </div>
  );
}
