"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { User, CalendarDays, Users, Heart, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { DetailsTab } from "./tabs/DetailsTab";
import { RoomDaysTab } from "./tabs/RoomDaysTab";
import { RelationshipsTab } from "./tabs/RelationshipsTab";
import { MedicalTab } from "./tabs/MedicalTab";
import { AttendancesTab } from "./tabs/AttendancesTab";
import type { ChildProfileRecord } from "./types";

export type ChildProfileTabKey =
  | "details"
  | "room"
  | "relationships"
  | "medical"
  | "attendances";

interface ChildProfileTabsProps {
  child: ChildProfileRecord;
  activeTab: ChildProfileTabKey;
  canEdit: boolean;
}

const TABS: {
  key: ChildProfileTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "details", label: "Details", icon: User },
  { key: "room", label: "Room / Days", icon: CalendarDays },
  { key: "relationships", label: "Relationships", icon: Users },
  { key: "medical", label: "Medical", icon: Heart },
  { key: "attendances", label: "Attendances", icon: ListChecks },
];

export function ChildProfileTabs({
  child,
  activeTab,
  canEdit,
}: ChildProfileTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = (params?.id as string) || child.id;

  const active: ChildProfileTabKey = useMemo(() => {
    return TABS.some((t) => t.key === activeTab) ? activeTab : "details";
  }, [activeTab]);

  const handleSelect = useCallback(
    (key: ChildProfileTabKey) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "details") next.delete("tab");
      else next.set("tab", key);
      const qs = next.toString();
      router.replace(`/children/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [id, router, searchParams],
  );

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="border-b border-border">
        <nav
          className="flex gap-0 -mb-px overflow-x-auto"
          role="tablist"
          aria-label="Child profile tabs"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-pressed={isActive}
                onClick={() => handleSelect(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-muted hover:text-foreground/80 hover:border-border",
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-[40vh]">
        {active === "details" && <DetailsTab child={child} canEdit={canEdit} />}
        {active === "room" && <RoomDaysTab child={child} canEdit={canEdit} />}
        {active === "relationships" && (
          <RelationshipsTab child={child} canEdit={canEdit} />
        )}
        {active === "medical" && <MedicalTab child={child} canEdit={canEdit} />}
        {active === "attendances" && <AttendancesTab child={child} />}
      </div>
    </div>
  );
}
