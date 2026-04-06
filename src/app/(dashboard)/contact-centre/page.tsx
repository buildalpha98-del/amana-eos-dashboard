"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserPlus, MessageSquare, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

// Lazy-load heavy tab content
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

const EnquiriesContent = dynamic(() => import("@/components/contact-centre/EnquiriesContent"), {
  loading: () => <Skeleton className="h-96 w-full" />,
});
const TicketsContent = dynamic(() => import("@/components/contact-centre/TicketsContent"), {
  loading: () => <Skeleton className="h-96 w-full" />,
});
const CallsTab = dynamic(() => import("@/components/calls/CallsTab").then((m) => ({ default: m.CallsTab })), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

const TABS = [
  { key: "enquiries", label: "Enquiries", icon: UserPlus },
  { key: "tickets", label: "Tickets", icon: MessageSquare },
  { key: "calls", label: "Calls", icon: Phone },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ContactCentreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "enquiries",
  );

  // Sync URL when tab changes
  useEffect(() => {
    const current = searchParams.get("tab");
    if (current !== activeTab) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", activeTab);
      // Preserve id param only for calls tab
      if (activeTab !== "calls") params.delete("id");
      router.replace(`/contact-centre?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, searchParams, router]);

  // Sync tab from URL changes (e.g. back/forward navigation)
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.key === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam as TabKey);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Contact Centre"
        description="Enquiries, support tickets, and VAPI call logs in one place"
      />

      {/* Tab Switcher */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
        <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "enquiries" && <EnquiriesContent />}
      {activeTab === "tickets" && <TicketsContent />}
      {activeTab === "calls" && <CallsTab />}
    </div>
  );
}

export default function ContactCentrePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ContactCentreContent />
    </Suspense>
  );
}
