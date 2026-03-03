"use client";

import { useAnnouncements } from "@/hooks/useCommunication";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  Pin,
  ArrowRight,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function getPriorityConfig(priority: string) {
  switch (priority) {
    case "urgent":
      return {
        bg: "bg-red-100",
        text: "text-red-700",
        icon: AlertTriangle,
        label: "Urgent",
      };
    case "important":
      return {
        bg: "bg-amber-100",
        text: "text-amber-700",
        icon: AlertCircle,
        label: "Important",
      };
    default:
      return {
        bg: "bg-gray-100",
        text: "text-gray-600",
        icon: Info,
        label: "Normal",
      };
  }
}

export function DashboardAnnouncements() {
  const { data: announcements, isLoading } = useAnnouncements();

  // Take the latest 5 published announcements (pinned first, then by date)
  const latest = announcements
    ? [...announcements]
        .filter((a: any) => a.publishedAt)
        .sort((a: any, b: any) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
          );
        })
        .slice(0, 5)
    : [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 h-48 animate-pulse" />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#004E64]" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">
            Announcements
          </h3>
          {latest.length > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              ({latest.length})
            </span>
          )}
        </div>
      </div>

      {/* Announcements list */}
      {latest.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Megaphone className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No announcements yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {latest.map((announcement: any) => {
            const priority = getPriorityConfig(announcement.priority);
            const PriorityIcon = priority.icon;
            const publishedDate = new Date(
              announcement.publishedAt
            ).toLocaleDateString("en-AU", {
              month: "short",
              day: "numeric",
            });

            // Truncate body for a snippet
            const snippet =
              announcement.body.length > 120
                ? announcement.body.substring(0, 120) + "..."
                : announcement.body;

            return (
              <div
                key={announcement.id}
                className={cn(
                  "px-5 py-3.5 hover:bg-gray-50 transition-colors",
                  announcement.priority === "urgent" && "bg-red-50/30",
                  announcement.priority === "important" && "bg-amber-50/30"
                )}
              >
                {/* Title row with badges */}
                <div className="flex items-center gap-2 mb-1">
                  {announcement.pinned && (
                    <Pin className="w-3 h-3 text-[#004E64] flex-shrink-0" />
                  )}
                  <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
                    {announcement.title}
                  </h4>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0",
                      priority.bg,
                      priority.text
                    )}
                  >
                    <PriorityIcon className="h-2.5 w-2.5" />
                    {priority.label}
                  </span>
                </div>

                {/* Snippet */}
                <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">
                  {snippet}
                </p>

                {/* Footer: author + date */}
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  {announcement.author?.avatar ? (
                    <img
                      src={announcement.author.avatar}
                      alt={announcement.author.name}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#004E64] text-[8px] font-medium text-white">
                      {announcement.author?.name?.charAt(0) || "?"}
                    </div>
                  )}
                  <span className="font-medium text-gray-500">
                    {announcement.author?.name || "Unknown"}
                  </span>
                  <span>&middot;</span>
                  <span>{publishedDate}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer link */}
      <div className="px-5 py-2.5 border-t border-gray-100">
        <Link
          href="/communication"
          className="flex items-center justify-center gap-1 text-xs font-medium text-[#004E64] hover:text-[#003D52] transition-colors"
        >
          View all announcements
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
