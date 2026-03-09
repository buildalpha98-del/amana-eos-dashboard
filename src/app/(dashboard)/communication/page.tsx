"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Bell, MessageCircle, HeartPulse } from "lucide-react";
import { AnnouncementsTab } from "@/components/communication/AnnouncementsTab";
import { CascadeBoardTab } from "@/components/communication/CascadeBoardTab";
import { WeeklyPulseTab } from "@/components/communication/WeeklyPulseTab";

const tabs = [
  { key: "announcements", label: "Announcements", icon: Bell },
  { key: "cascade", label: "Cascade Board", icon: MessageCircle },
  { key: "pulse", label: "Weekly Pulse", icon: HeartPulse },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("announcements");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Communication</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Stay aligned with announcements, cascade messages, and team pulse check-ins
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
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
        {activeTab === "announcements" && <AnnouncementsTab />}
        {activeTab === "cascade" && <CascadeBoardTab />}
        {activeTab === "pulse" && <WeeklyPulseTab />}
      </div>
    </div>
  );
}
