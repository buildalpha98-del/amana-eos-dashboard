"use client";

import { useState, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import {
  BarChart3,
  FolderOpen,
  FileText,
  Calendar,
  TrendingUp,
  CheckSquare,
  Flame,
  Wrench,
  Workflow,
} from "lucide-react";
import { MarketingCockpit } from "@/components/marketing/MarketingCockpit";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { CampaignsTab } from "@/components/marketing/CampaignsTab";
import { CampaignDetailPanel } from "@/components/marketing/CampaignDetailPanel";
import { PostsTab } from "@/components/marketing/PostsTab";
import { PostDetailPanel } from "@/components/marketing/PostDetailPanel";
import { TasksTab } from "@/components/marketing/TasksTab";
import { TaskDetailPanel } from "@/components/marketing/TaskDetailPanel";
import { CalendarTab } from "@/components/marketing/CalendarTab";
import { AnalyticsTab } from "@/components/marketing/AnalyticsTab";
import { KPIsTab } from "@/components/marketing/KPIsTab";
import { AssetsTab } from "@/components/marketing/AssetsTab";
import { TemplatesTab } from "@/components/marketing/TemplatesTab";
import { HashtagsTab } from "@/components/marketing/HashtagsTab";
import { OccupancyHeatmap } from "@/components/marketing/OccupancyHeatmap";
import { CentreWorkloadDashboard } from "@/components/marketing/CentreWorkloadDashboard";
import { LaunchTracker } from "@/components/marketing/LaunchTracker";
import { ReferralsTab } from "@/components/marketing/ReferralsTab";
import { BSCGrowthTracker } from "@/components/marketing/BSCGrowthTracker";
import { ServiceFilter } from "@/components/marketing/ServiceFilter";
import { QuickAddFAB } from "@/components/marketing/QuickAddFAB";
import { EmailComposer } from "@/components/email/EmailComposer";
import { CreatePostModal } from "@/components/marketing/CreatePostModal";
import { CreateCampaignModal } from "@/components/marketing/CreateCampaignModal";
import { CreateTaskModal } from "@/components/marketing/CreateTaskModal";
import { SequencesTab } from "@/components/marketing/SequencesTab";
import { PageHeader } from "@/components/layout/PageHeader";

/* ------------------------------------------------------------------ */
/* Tab definitions — Tasks and Growth are hidden for the marketing    */
/* role (see Sprint 1 plan). Overview content is a placeholder until  */
/* Sprint 2 ships the cockpit.                                        */
/* ------------------------------------------------------------------ */

const ALL_TABS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "campaigns", label: "Campaigns", icon: FolderOpen },
  { key: "sequences", label: "Sequences", icon: Workflow },
  { key: "posts", label: "Posts", icon: FileText },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "growth", label: "Growth", icon: Flame },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "toolkit", label: "Toolkit", icon: Wrench },
];

const MARKETING_HIDDEN_TABS = new Set(["tasks", "growth"]);

export default function MarketingPage() {
  const { data: session } = useSession();
  const isMarketingRole = session?.user?.role === "marketing";

  const tabs = useMemo(
    () =>
      isMarketingRole
        ? ALL_TABS.filter((t) => !MARKETING_HIDDEN_TABS.has(t.key))
        : ALL_TABS,
    [isMarketingRole],
  );

  const [rawActiveTab, setActiveTab] = useState("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [showQuickPost, setShowQuickPost] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [showQuickCampaign, setShowQuickCampaign] = useState(false);

  /* Sub-view state for composite tabs */
  const [toolkitView, setToolkitView] = useState<"assets" | "templates" | "email" | "hashtags" | "kpis" | "workload">("assets");
  const [growthView, setGrowthView] = useState<"occupancy" | "referrals" | "launch">("occupancy");

  // If the stored tab has been hidden for this role, render Overview instead.
  // Derived — avoids setState-in-effect render cascade.
  const activeTab =
    isMarketingRole && MARKETING_HIDDEN_TABS.has(rawActiveTab)
      ? "overview"
      : rawActiveTab;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Marketing"
        description="Manage campaigns, posts, and content across all platforms"
      >
        <ServiceFilter
          value={selectedServiceId}
          onChange={setSelectedServiceId}
          hideStatePills
        />
      </PageHeader>

      {/* Tabs */}
      <MarketingTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {/* ---- Overview: Marketing Cockpit (Sprint 2) ---- */}
        {activeTab === "overview" && <MarketingCockpit />}

        {/* ---- Tasks (hidden for marketing role) ---- */}
        {activeTab === "tasks" && !isMarketingRole && (
          <TasksTab
            onSelectTask={setSelectedTaskId}
            serviceId={selectedServiceId}
          />
        )}

        {/* ---- Campaigns ---- */}
        {activeTab === "campaigns" && (
          <CampaignsTab
            onSelectCampaign={setSelectedCampaignId}
            serviceId={selectedServiceId}
          />
        )}

        {/* ---- Sequences ---- */}
        {activeTab === "sequences" && <SequencesTab />}

        {/* ---- Posts ---- */}
        {activeTab === "posts" && (
          <PostsTab
            onSelectPost={setSelectedPostId}
            serviceId={selectedServiceId}
          />
        )}

        {/* ---- Calendar (with Term Plan toggle inside) ---- */}
        {activeTab === "calendar" && (
          <CalendarTab
            onSelectPost={setSelectedPostId}
            onSelectCampaign={setSelectedCampaignId}
            onSelectTask={setSelectedTaskId}
            serviceId={selectedServiceId}
          />
        )}

        {/* ---- Growth (hidden for marketing role) ---- */}
        {activeTab === "growth" && !isMarketingRole && (
          <div className="space-y-6">
            {/* Sub-nav pills */}
            <div className="flex items-center gap-2">
              {([
                { key: "occupancy", label: "Occupancy" },
                { key: "referrals", label: "Referrals" },
                { key: "launch", label: "Launch Tracker" },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setGrowthView(item.key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                    growthView === item.key
                      ? "bg-brand text-white border-brand"
                      : "bg-card text-muted border-border hover:bg-surface"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {growthView === "occupancy" && (
              <div className="space-y-6">
                <OccupancyHeatmap serviceId={selectedServiceId} />
                <BSCGrowthTracker serviceId={selectedServiceId} />
              </div>
            )}
            {growthView === "referrals" && (
              <ReferralsTab serviceId={selectedServiceId} />
            )}
            {growthView === "launch" && <LaunchTracker />}
          </div>
        )}

        {/* ---- Analytics: includes Coverage ---- */}
        {activeTab === "analytics" && (
          <AnalyticsTab
            serviceId={selectedServiceId}
            onCentreClick={(id) => {
              setSelectedServiceId(id);
              setActiveTab("overview");
            }}
          />
        )}

        {/* ---- Toolkit: Assets / Templates / Hashtags / KPIs ---- */}
        {activeTab === "toolkit" && (
          <div className="space-y-6">
            {/* Sub-nav pills */}
            <div className="flex items-center gap-2">
              {([
                { key: "assets", label: "Assets" },
                { key: "templates", label: "Templates" },
                { key: "email", label: "Email Composer" },
                { key: "hashtags", label: "Hashtags" },
                { key: "kpis", label: "KPIs" },
                { key: "workload", label: "Workload" },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setToolkitView(item.key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                    toolkitView === item.key
                      ? "bg-brand text-white border-brand"
                      : "bg-card text-muted border-border hover:bg-surface"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {toolkitView === "assets" && <AssetsTab />}
            {toolkitView === "templates" && <TemplatesTab />}
            {toolkitView === "email" && (
              <Suspense fallback={<div className="flex items-center justify-center py-16 text-muted">Loading composer...</div>}>
                <EmailComposer />
              </Suspense>
            )}
            {toolkitView === "hashtags" && <HashtagsTab />}
            {toolkitView === "kpis" && <KPIsTab />}
            {toolkitView === "workload" && (
              <CentreWorkloadDashboard
                onCentreClick={(id) => {
                  setSelectedServiceId(id);
                  setActiveTab("overview");
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Detail Panels */}
      {selectedCampaignId && (
        <CampaignDetailPanel
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}
      {selectedPostId && (
        <PostDetailPanel
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
        />
      )}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Quick Add FAB */}
      <QuickAddFAB
        onNewPost={() => setShowQuickPost(true)}
        onNewTask={() => setShowQuickTask(true)}
        onNewCampaign={() => setShowQuickCampaign(true)}
      />

      {/* Quick Create Modals */}
      <CreatePostModal
        open={showQuickPost}
        onClose={() => setShowQuickPost(false)}
      />
      <CreateTaskModal
        open={showQuickTask}
        onClose={() => setShowQuickTask(false)}
      />
      <CreateCampaignModal
        open={showQuickCampaign}
        onClose={() => setShowQuickCampaign(false)}
      />
    </div>
  );
}
