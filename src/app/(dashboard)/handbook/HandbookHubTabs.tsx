"use client";

/**
 * Client tab shell for the /handbook hub. URL-synced via ?tab= so deep
 * links (and the redirect stubs on the six retired routes) land on the
 * right tab. Tab content components are the EXISTING page bodies —
 * lazy-loaded so the hub doesn't ship all six surfaces in one bundle.
 */

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  BookOpen,
  GraduationCap,
  BookOpenCheck,
  FileText,
  Rocket,
  HelpCircle,
  ExternalLink,
  Download,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

const HandbookContent = dynamic(
  () =>
    import("../tools/handbook/HandbookContentClient").then((m) => ({
      default: m.HandbookContentClient,
    })),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const AmanaWayContent = dynamic(
  () =>
    import("../tools/the-amana-way/AmanaWayContentClient").then((m) => ({
      default: m.AmanaWayContentClient,
    })),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const GuidesContent = dynamic(
  () =>
    import("../guides/GuidesContent").then((m) => ({
      default: m.GuidesContent,
    })),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const HelpContent = dynamic(
  () =>
    import("../help/HelpContent").then((m) => ({ default: m.HelpContent })),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

const TABS = [
  { key: "handbook", label: "Handbook", icon: BookOpen },
  { key: "employee-handbook", label: "Employee Handbook", icon: GraduationCap },
  { key: "amana-way", label: "The Amana Way", icon: BookOpenCheck },
  { key: "one-pager", label: "One-Pager", icon: FileText },
  { key: "guides", label: "Guides", icon: Rocket },
  { key: "help", label: "Help", icon: HelpCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Props {
  handbookOverrides: Record<string, string>;
  amanaWayOverrides: Record<string, string>;
  canEdit: boolean;
}

function HandbookHubInner({
  handbookOverrides,
  amanaWayOverrides,
  canEdit,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "handbook";

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    // `role` only applies to the Guides tab's role switcher.
    if (key !== "guides") params.delete("role");
    router.replace(`/handbook?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tab Bar */}
      <div className="border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <nav className="flex gap-0 -mb-px" aria-label="Handbook & Help tabs">
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
          {/* 2026-07-12 (nav fold): CCS Calculator left the sidebar — it's a
              standalone tool, linked from here like the compliance sub-pages. */}
          <Link
            href="/tools/ccs-calculator"
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-muted hover:text-foreground hover:border-border whitespace-nowrap transition-colors"
          >
            <Wrench className="w-4 h-4" />
            CCS Calculator
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[40vh] pt-4">
        {/* The handbook/Amana Way panels use negative margins to go
            full-bleed as standalone pages; the padded wrapper cancels
            those out so they sit below the tab bar instead of over it. */}
        {activeTab === "handbook" && (
          <div className="px-4 pt-4 pb-20 md:px-8 md:pt-8 md:pb-8">
            <HandbookContent
              initialOverrides={handbookOverrides}
              canEdit={canEdit}
            />
          </div>
        )}
        {activeTab === "employee-handbook" && <EmployeeHandbookTab />}
        {activeTab === "amana-way" && (
          <div className="px-4 pt-4 pb-20 md:px-8 md:pt-8 md:pb-8">
            <AmanaWayContent
              initialOverrides={amanaWayOverrides}
              canEdit={canEdit}
            />
          </div>
        )}
        {activeTab === "one-pager" && <OnePagerTab />}
        {activeTab === "guides" && <GuidesContent />}
        {activeTab === "help" && <HelpContent />}
      </div>
    </div>
  );
}

/** Inlined body of the retired /tools/employee-handbook page. */
function EmployeeHandbookTab() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Employee Handbook"
        description="Educators induction module — policies, procedures, and daily operations"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open("/employee-handbook.html", "_blank"),
          },
        ]}
      />

      <div className="mt-4 rounded-xl border border-border overflow-hidden bg-card shadow-warm-sm">
        <iframe
          src="/employee-handbook.html"
          className="w-full border-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "700px" }}
          title="Amana OSHC Employee Handbook"
        />
      </div>
    </div>
  );
}

/** Inlined body of the retired /tools/amana-way-one-pager page. */
const ONE_PAGER_IMAGE_PATH = "/Amana_PP.png";

function OnePagerTab() {
  return (
    <div className="max-w-7xl mx-auto h-full overflow-hidden">
      <PageHeader
        title="The Amana Way — Proven Process"
        description="Our 7-stage journey from enrolment to ongoing care"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open(ONE_PAGER_IMAGE_PATH, "_blank"),
          },
          {
            label: "Download Image",
            icon: Download,
            onClick: () => {
              const a = document.createElement("a");
              a.href = ONE_PAGER_IMAGE_PATH;
              a.download = "Amana_PP.png";
              a.click();
            },
          },
        ]}
      />

      <div
        className="mt-4 rounded-xl border border-border bg-card shadow-warm-sm"
        style={{
          width: "100%",
          height: "calc(100vh - 200px)",
          minHeight: "600px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          overflow: "auto",
        }}
      >
        <img
          src={ONE_PAGER_IMAGE_PATH}
          alt="Amana OSHC Proven Process"
          style={{ maxWidth: "100%", height: "auto", borderRadius: "12px" }}
        />
      </div>
    </div>
  );
}

export function HandbookHubTabs(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <HandbookHubInner {...props} />
    </Suspense>
  );
}
