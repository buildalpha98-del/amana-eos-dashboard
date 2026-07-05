"use client";

/**
 * /workforce-reports — consolidated workforce reporting hub (nav
 * consolidation phase 1). Two tabs, URL-synced via ?tab=diversity|wgea:
 *   - Diversity & Inclusion (the old /diversity-dashboard)
 *   - WGEA Report (the old /wgea-report)
 * Both old routes redirect here. Owner / State Manager / Admin only.
 */

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Heart, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { DiversityDashboardContent } from "@/components/people/DiversityDashboardContent";
import { WgeaReportContent } from "@/components/people/WgeaReportContent";

const TABS = [
  { key: "diversity", label: "Diversity & Inclusion", icon: Heart },
  { key: "wgea", label: "WGEA Report", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function WorkforceReportsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "diversity";

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`/workforce-reports?${params.toString()}`, {
      scroll: false,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Workforce Reports"
        description="Aggregated diversity & inclusion stats and WGEA workforce-composition reporting"
      />

      {/* Tab Bar */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px" aria-label="Workforce report tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-foreground hover:border-border",
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
        {activeTab === "diversity" ? (
          <DiversityDashboardContent />
        ) : (
          <WgeaReportContent />
        )}
      </div>
    </div>
  );
}

export default function WorkforceReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WorkforceReportsInner />
    </Suspense>
  );
}
