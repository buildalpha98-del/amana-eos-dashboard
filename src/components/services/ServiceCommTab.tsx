"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Bell,
  MessageCircle,
  Pin,
  CheckCircle2,
  Eye,
  AlertTriangle,
  AlertCircle,
  Info,
  Megaphone,
  ArrowDownCircle,
  Users,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAnnouncements,
  useMarkAnnouncementRead,
  useCascadeMessages,
  useAcknowledgeCascade,
} from "@/hooks/useCommunication";

function getPriorityConfig(priority: string) {
  switch (priority) {
    case "urgent":
      return { bg: "bg-red-100", text: "text-red-700", icon: AlertTriangle, label: "Urgent" };
    case "important":
      return { bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle, label: "Important" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600", icon: Info, label: "Normal" };
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ServiceCommTab({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id;

  // Fetch org-wide announcements + service-specific ones
  const { data: announcements, isLoading: announcementsLoading } = useAnnouncements();
  const { data: cascadeMessages, isLoading: cascadeLoading } = useCascadeMessages();
  const markRead = useMarkAnnouncementRead();
  const acknowledgeCascade = useAcknowledgeCascade();

  const [markedReadIds, setMarkedReadIds] = useState<Set<string>>(new Set());

  // Filter announcements to show: all org-wide + those specific to this service
  const filteredAnnouncements = announcements?.filter(
    (a: any) => !a.serviceId || a.serviceId === serviceId
  ) ?? [];

  const handleMarkRead = (id: string) => {
    markRead.mutate(id, {
      onSuccess: () => setMarkedReadIds((prev) => new Set(prev).add(id)),
    });
  };

  const handleAcknowledge = (id: string) => {
    acknowledgeCascade.mutate(id);
  };

  const isLoading = announcementsLoading || cascadeLoading;

  // Build a combined feed sorted by date
  const feedItems: any[] = [];

  filteredAnnouncements.forEach((a: any) => {
    feedItems.push({
      type: "announcement",
      id: a.id,
      date: a.publishedAt || a.createdAt,
      data: a,
    });
  });

  (cascadeMessages ?? []).forEach((c: any) => {
    feedItems.push({
      type: "cascade",
      id: c.id,
      date: c.publishedAt,
      data: c,
    });
  });

  feedItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Megaphone className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-base font-medium">No communications yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Announcements and cascade messages will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Recent announcements and cascade messages relevant to this centre
      </p>

      {feedItems.map((item) => {
        if (item.type === "announcement") {
          const a = item.data;
          const priority = getPriorityConfig(a.priority);
          const PriorityIcon = priority.icon;
          const readCount = a._count?.readReceipts ?? 0;
          const isRead = markedReadIds.has(a.id);

          return (
            <div
              key={`a-${a.id}`}
              className={cn(
                "rounded-xl border bg-white p-4",
                a.priority === "urgent" && "border-red-200",
                a.priority === "important" && "border-amber-200"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-3.5 h-3.5 text-[#004E64]" />
                <span className="text-xs font-medium text-[#004E64]">Announcement</span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", priority.bg, priority.text)}>
                  <PriorityIcon className="h-3 w-3" />
                  {priority.label}
                </span>
                {a.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FECE00]/20 px-2 py-0.5 text-xs font-medium text-[#004E64]">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">{timeAgo(a.publishedAt || a.createdAt)}</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-900">{a.title}</h4>
              <p className="text-sm text-gray-600 line-clamp-2 mt-1">{a.body}</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {readCount} read
                </span>
                <span className="text-xs text-gray-400">by {a.author?.name}</span>
                {!isRead && (
                  <button
                    onClick={() => handleMarkRead(a.id)}
                    disabled={markRead.isPending}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Mark Read
                  </button>
                )}
                {isRead && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Read
                  </span>
                )}
              </div>
            </div>
          );
        }

        if (item.type === "cascade") {
          const c = item.data;
          const hasAcked = c.acknowledgments && c.acknowledgments.length > 0;
          const ackCount = c._count?.acknowledgments ?? 0;

          return (
            <div
              key={`c-${c.id}`}
              className={cn(
                "rounded-xl border bg-white p-4",
                hasAcked ? "border-emerald-200" : "border-gray-200"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownCircle className="w-3.5 h-3.5 text-[#004E64]" />
                <span className="text-xs font-medium text-[#004E64]">Cascade Message</span>
                {c.meeting && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <CalendarDays className="h-3 w-3" />
                    {c.meeting.title}
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">{timeAgo(c.publishedAt)}</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.message}</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="h-3 w-3" /> {ackCount} acknowledged
                </span>
                {hasAcked ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> Acknowledged
                  </span>
                ) : (
                  <button
                    onClick={() => handleAcknowledge(c.id)}
                    disabled={acknowledgeCascade.isPending}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#004E64]/20 bg-[#004E64]/5 px-2 py-1 text-xs font-medium text-[#004E64] hover:bg-[#004E64]/10 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
