"use client";

import { useSession } from "next-auth/react";
import { useRocks, useUpdateRock, type RockData } from "@/hooks/useRocks";
import { getCurrentQuarter, cn } from "@/lib/utils";
import { useState } from "react";
import {
  Mountain,
  Building2,
  User,
  ChevronRight,
  ArrowRight,
  Target,
} from "lucide-react";
import Link from "next/link";
import { RockDetailPanel } from "@/components/rocks/RockDetailPanel";

const statusColors: Record<string, string> = {
  on_track: "#10B981",
  off_track: "#EF4444",
  complete: "#004E64",
  dropped: "#9CA3AF",
};

const statusLabels: Record<string, string> = {
  on_track: "On Track",
  off_track: "Off Track",
  complete: "Complete",
  dropped: "Dropped",
};

const priorityConfig: Record<string, { label: string; bg: string; text: string }> = {
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700" },
  high: { label: "High", bg: "bg-amber-50", text: "text-amber-700" },
  medium: { label: "Medium", bg: "bg-blue-50", text: "text-blue-700" },
};

function RockRow({ rock, onClick }: { rock: RockData; onClick: () => void }) {
  const priority = priorityConfig[rock.priority] || priorityConfig.medium;
  const color = statusColors[rock.status] || "#9CA3AF";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface transition-colors text-left group"
    >
      {/* Progress circle */}
      <div className="relative w-9 h-9 flex-shrink-0">
        <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${(rock.percentComplete / 100) * 94.2} 94.2`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground/80">
          {rock.percentComplete}%
        </span>
      </div>

      {/* Rock info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {rock.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
              priority.bg,
              priority.text
            )}
          >
            {priority.label}
          </span>
          <span className="text-xs text-muted">{rock.owner?.name ?? "Unassigned"}</span>
        </div>
      </div>

      {/* Status badge */}
      <span
        className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {statusLabels[rock.status] || rock.status}
      </span>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-muted/50 group-hover:text-brand transition-colors flex-shrink-0" />
    </button>
  );
}

function RockSection({
  title,
  icon: Icon,
  rocks,
  emptyText,
  onRockClick,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rocks: RockData[];
  emptyText: string;
  onRockClick: (id: string) => void;
}) {
  // Show stats
  const onTrack = rocks.filter((r) => r.status === "on_track").length;
  const offTrack = rocks.filter((r) => r.status === "off_track").length;
  const complete = rocks.filter((r) => r.status === "complete").length;

  return (
    <div className="bg-card rounded-xl border border-border">
      {/* Section header */}
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-brand" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-xs text-muted ml-1">({rocks.length})</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium">
          {onTrack > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted">{onTrack} on track</span>
            </span>
          )}
          {offTrack > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted">{offTrack} off track</span>
            </span>
          )}
          {complete > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-muted">{complete} done</span>
            </span>
          )}
        </div>
      </div>

      {/* Rocks list */}
      <div className="divide-y divide-gray-50">
        {rocks.length > 0 ? (
          rocks.map((rock) => (
            <RockRow
              key={rock.id}
              rock={rock}
              onClick={() => onRockClick(rock.id)}
            />
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <Target className="w-8 h-8 text-muted/50 mx-auto mb-2" />
            <p className="text-sm text-muted">{emptyText}</p>
          </div>
        )}
      </div>

      {/* Footer link */}
      <div className="px-5 py-2.5 border-t border-border/50">
        <Link
          href="/rocks"
          className="flex items-center justify-center gap-1 text-xs font-medium text-brand hover:text-brand-hover transition-colors"
        >
          View all rocks
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function DashboardRocks() {
  const { data: session } = useSession();
  const quarter = getCurrentQuarter();
  const { data: allRocks, isLoading } = useRocks(quarter);
  const [selectedRockId, setSelectedRockId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-card rounded-xl border border-border h-48 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const rocks = allRocks || [];
  const companyRocks = rocks.filter((r) => r.rockType === "company");
  const myRocks = rocks.filter(
    (r) => r.rockType === "personal" && r.ownerId === session?.user?.id
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RockSection
          title="Company Rocks"
          icon={Building2}
          rocks={companyRocks}
          emptyText="No company rocks this quarter"
          onRockClick={setSelectedRockId}
        />
        <RockSection
          title="My Rocks"
          icon={User}
          rocks={myRocks}
          emptyText="No personal rocks this quarter"
          onRockClick={setSelectedRockId}
        />
      </div>

      <RockDetailPanel
        open={!!selectedRockId}
        rockId={selectedRockId ?? ""}
        onClose={() => setSelectedRockId(null)}
      />
    </>
  );
}
