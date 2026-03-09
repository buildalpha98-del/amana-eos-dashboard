"use client";

import { useState } from "react";
import {
  BarChart3,
  FolderOpen,
  FileText,
  Calendar,
  TrendingUp,
  Target,
  Image,
  Layout,
  Hash,
  Upload,
  MapPin,
  CheckSquare,
  CalendarDays,
} from "lucide-react";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { OverviewTab } from "@/components/marketing/OverviewTab";
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
import { ImportCalendarModal } from "@/components/marketing/ImportCalendarModal";
import { CoverageTab } from "@/components/marketing/CoverageTab";
import { TermCalendarTab } from "@/components/marketing/TermCalendarTab";
import { ServiceFilter } from "@/components/marketing/ServiceFilter";
import { QuickAddFAB } from "@/components/marketing/QuickAddFAB";
import { CreatePostModal } from "@/components/marketing/CreatePostModal";
import { CreateCampaignModal } from "@/components/marketing/CreateCampaignModal";
import { CreateTaskModal } from "@/components/marketing/CreateTaskModal";

const tabs = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "campaigns", label: "Campaigns", icon: FolderOpen },
  { key: "posts", label: "Posts", icon: FileText },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "coverage", label: "Coverage", icon: MapPin },
  { key: "kpis", label: "KPIs", icon: Target },
  { key: "assets", label: "Assets", icon: Image },
  { key: "templates", label: "Templates", icon: Layout },
  { key: "hashtags", label: "Hashtags", icon: Hash },
  { key: "termCalendar", label: "Term Plan", icon: CalendarDays },
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [showQuickPost, setShowQuickPost] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [showQuickCampaign, setShowQuickCampaign] = useState(false);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Marketing</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Manage campaigns, posts, and content across all platforms
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ServiceFilter
            value={selectedServiceId}
            onChange={setSelectedServiceId}
          />
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand hover:text-white transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import Content Calendar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <MarketingTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <OverviewTab serviceId={selectedServiceId} onSelectTask={setSelectedTaskId} />
        )}
        {activeTab === "tasks" && (
          <TasksTab
            onSelectTask={setSelectedTaskId}
            serviceId={selectedServiceId}
          />
        )}
        {activeTab === "campaigns" && (
          <CampaignsTab
            onSelectCampaign={setSelectedCampaignId}
            serviceId={selectedServiceId}
          />
        )}
        {activeTab === "posts" && (
          <PostsTab
            onSelectPost={setSelectedPostId}
            serviceId={selectedServiceId}
          />
        )}
        {activeTab === "calendar" && (
          <CalendarTab
            onSelectPost={setSelectedPostId}
            onSelectCampaign={setSelectedCampaignId}
            onSelectTask={setSelectedTaskId}
            serviceId={selectedServiceId}
          />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab
            serviceId={selectedServiceId}
            onCentreClick={(id) => {
              setSelectedServiceId(id);
              setActiveTab("overview");
            }}
          />
        )}
        {activeTab === "coverage" && (
          <CoverageTab
            onSelectService={(id) => {
              setSelectedServiceId(id);
              setActiveTab("overview");
            }}
          />
        )}
        {activeTab === "kpis" && <KPIsTab />}
        {activeTab === "assets" && <AssetsTab />}
        {activeTab === "templates" && <TemplatesTab />}
        {activeTab === "hashtags" && <HashtagsTab />}
        {activeTab === "termCalendar" && (
          <TermCalendarTab serviceId={selectedServiceId} />
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

      {/* Import Content Calendar Modal */}
      <ImportCalendarModal
        open={showImport}
        onClose={() => setShowImport(false)}
      />

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
