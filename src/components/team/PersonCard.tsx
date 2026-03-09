"use client";

import { useState } from "react";
import {
  Mountain,
  CheckSquare,
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/hooks/useTeam";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";

const roleBadge: Record<string, { label: string; className: string }> = {
  owner: {
    label: ROLE_DISPLAY_NAMES.owner,
    className: "bg-amber-100 text-amber-800",
  },
  admin: {
    label: ROLE_DISPLAY_NAMES.admin,
    className: "bg-teal-100 text-teal-800",
  },
  member: {
    label: ROLE_DISPLAY_NAMES.member,
    className: "bg-gray-100 text-gray-700",
  },
  staff: {
    label: ROLE_DISPLAY_NAMES.staff,
    className: "bg-blue-100 text-blue-800",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface PersonCardProps {
  member: TeamMember;
  compact?: boolean;
}

export function PersonCard({ member, compact = false }: PersonCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = roleBadge[member.role] || roleBadge.member;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-md">
      {/* Header */}
      <div
        className={cn(
          "flex items-start gap-3",
          !compact && "cursor-pointer"
        )}
        onClick={() => !compact && setExpanded((e) => !e)}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
          {member.avatar ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-brand">
              {getInitials(member.name)}
            </span>
          )}
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">
              {member.name}
            </span>
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
                badge.className
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{member.email}</p>
        </div>

        {/* Expand indicator */}
        {!compact && (
          <div className="flex-shrink-0 text-gray-400 mt-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      {!compact && (
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-1" title="Active Rocks">
            <Mountain className="w-3.5 h-3.5" />
            <span className="font-medium text-gray-700">
              {member.activeRocks}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Todo Completion">
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="font-medium text-gray-700">
              {member.todoCompletionPct}%
            </span>
          </div>
          <div
            className={cn(
              "flex items-center gap-1",
              member.openIssues > 0 ? "text-red-500" : ""
            )}
            title="Open Issues"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span
              className={cn(
                "font-medium",
                member.openIssues > 0 ? "text-red-600" : "text-gray-700"
              )}
            >
              {member.openIssues}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Managed Centres">
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-medium text-gray-700">
              {member.managedServices}
            </span>
          </div>
        </div>
      )}

      {/* Expanded rocks list */}
      {!compact && expanded && member.rocks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Active Rocks
          </p>
          {member.rocks.map((rock) => (
            <div
              key={rock.id}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  rock.status === "on_track" ? "bg-green-500" : "bg-red-500"
                )}
              />
              <span className="flex-1 text-gray-700 truncate">
                {rock.title}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {rock.percentComplete}%
              </span>
            </div>
          ))}
        </div>
      )}

      {!compact && expanded && member.rocks.length === 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">No active rocks</p>
        </div>
      )}
    </div>
  );
}
