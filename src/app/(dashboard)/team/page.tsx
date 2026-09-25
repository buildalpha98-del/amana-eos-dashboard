"use client";

import { Suspense, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, ClipboardList } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { EmployeeListView } from "@/components/team/EmployeeListView";
import { OnboardingRequestsPanel } from "@/components/team/OnboardingRequestsPanel";
import { isAdminRole } from "@/lib/role-permissions";
import { cn } from "@/lib/utils";

const TAB_IDS = ["directory", "onboarding"] as const;
type TabId = (typeof TAB_IDS)[number];
function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}

function TeamPageInner() {
  const { data: session } = useSession();
  const { data: services } = useServices();
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = session?.user?.role ?? "";
  // 2026-09-08: the Onboarding sub-tab is leadership-only (state manager /
  // admin / owner) — a new-starter request notifies admin to set up the
  // real account, so nobody else should be able to raise one.
  const canSeeOnboarding = isAdminRole(role);

  // The URL is the single source of truth for which tab is active — no
  // local state to keep in sync, so there's nothing to desync on
  // back/forward navigation or a role that arrives after first render.
  const activeTab = useMemo<TabId>(() => {
    const tab = searchParams?.get("tab");
    if (tab && isTabId(tab) && (tab !== "onboarding" || canSeeOnboarding)) {
      return tab;
    }
    return "directory";
  }, [searchParams, canSeeOnboarding]);

  function changeTab(tab: TabId) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (tab === "directory") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `/team?${qs}` : "/team", { scroll: false });
  }

  if (!session?.user) return null;

  const serviceOptions = services?.map((s) => ({ id: s.id, name: s.name })) ?? [];

  return (
    <div className="space-y-4">
      {canSeeOnboarding && (
        <div className="max-w-7xl mx-auto flex gap-1 bg-surface rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => changeTab("directory")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === "directory" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            <Users className="w-4 h-4" />
            Directory
          </button>
          <button
            type="button"
            onClick={() => changeTab("onboarding")}
            data-testid="team-tab-onboarding"
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === "onboarding" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            <ClipboardList className="w-4 h-4" />
            Onboarding
          </button>
        </div>
      )}

      {activeTab === "onboarding" && canSeeOnboarding ? (
        <div className="max-w-7xl mx-auto">
          <OnboardingRequestsPanel services={serviceOptions} />
        </div>
      ) : (
        <EmployeeListView
          viewerRole={session.user.role ?? ""}
          viewerId={session.user.id}
          services={serviceOptions}
        />
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageInner />
    </Suspense>
  );
}
