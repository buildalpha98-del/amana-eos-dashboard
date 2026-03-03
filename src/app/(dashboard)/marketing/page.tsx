"use client";

import { useState } from "react";
import {
  Megaphone,
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
} from "lucide-react";
import { MarketingTabs } from "@/components/marketing/MarketingTabs";
import { OverviewTab } from "@/components/marketing/OverviewTab";
import { CampaignsTab } from "@/components/marketing/CampaignsTab";
import { CampaignDetailPanel } from "@/components/marketing/CampaignDetailPanel";
import { PostsTab } from "@/components/marketing/PostsTab";
import { PostDetailPanel } from "@/components/marketing/PostDetailPanel";
import { CalendarTab } from "@/components/marketing/CalendarTab";
import { AnalyticsTab } from "@/components/marketing/AnalyticsTab";
import { KPIsTab } from "@/components/marketing/KPIsTab";
import { AssetsTab } from "@/components/marketing/AssetsTab";
import { TemplatesTab } from "@/components/marketing/TemplatesTab";
import { HashtagsTab } from "@/components/marketing/HashtagsTab";
import { ImportCalendarModal } from "@/components/marketing/ImportCalendarModal";

const tabs = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "campaigns", label: "Campaigns", icon: FolderOpen },
  { key: "posts", label: "Posts", icon: FileText },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "kpis", label: "KPIs", icon: Target },
  { key: "assets", label: "Assets", icon: Image },
  { key: "templates", label: "Templates", icon: Layout },
  { key: "hashtags", label: "Hashtags", icon: Hash },
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-[#004E64]" />
            <h2 className="text-xl font-semibold text-gray-900">Marketing</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage campaigns, posts, and content across all platforms
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#004E64] px-4 py-2 text-sm font-medium text-[#004E64] hover:bg-[#004E64] hover:text-white transition-colors"
        >
          <Upload className="h-4 w-4" />
          Import Content Calendar
        </button>
      </div>

      {/* Tabs */}
      <MarketingTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "campaigns" && (
          <CampaignsTab onSelectCampaign={setSelectedCampaignId} />
        )}
        {activeTab === "posts" && (
          <PostsTab onSelectPost={setSelectedPostId} />
        )}
        {activeTab === "calendar" && (
          <CalendarTab onSelectPost={setSelectedPostId} />
        )}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "kpis" && <KPIsTab />}
        {activeTab === "assets" && <AssetsTab />}
        {activeTab === "templates" && <TemplatesTab />}
        {activeTab === "hashtags" && <HashtagsTab />}
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

      {/* Import Content Calendar Modal */}
      <ImportCalendarModal
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}
