"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell, MessageCircle, Calendar, Megaphone, CheckCheck } from "lucide-react";
import { useParentNotifications, useMarkNotificationsRead, type ParentNotificationItem } from "@/hooks/useParentNotifications";

const typeIcons: Record<string, typeof Bell> = {
  post: Megaphone,
  booking: Calendar,
  message: MessageCircle,
  attendance: Bell,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data } = useParentNotifications();
  const markRead = useMarkNotificationsRead();

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  // Close on click outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-[#e8e4df] z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e4df]">
            <h3 className="text-sm font-semibold text-[#1a1a2e]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markRead.mutate({ markAllRead: true })}
                className="flex items-center gap-1 text-xs text-[#004E64] hover:text-[#006B87] font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-[#e8e4df] mx-auto mb-2" />
                <p className="text-sm text-[#7c7c8a]">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onRead={() => {
                    if (!n.read) markRead.mutate({ notificationIds: [n.id] });
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onRead,
}: {
  notification: ParentNotificationItem;
  onRead: () => void;
}) {
  const Icon = typeIcons[n.type] ?? Bell;

  return (
    <Link
      href={n.link}
      onClick={onRead}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-[#f8f5f2] transition-colors border-b border-[#e8e4df]/50 ${
        !n.read ? "bg-[#004E64]/5" : ""
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-[#004E64]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm truncate ${!n.read ? "font-semibold text-[#1a1a2e]" : "text-[#1a1a2e]"}`}>
            {n.title}
          </p>
          {!n.read && <span className="w-2 h-2 rounded-full bg-[#004E64] shrink-0" />}
        </div>
        <p className="text-xs text-[#7c7c8a] truncate mt-0.5">{n.body}</p>
        <p className="text-[10px] text-[#7c7c8a] mt-1">{timeAgo(n.createdAt)}</p>
      </div>
    </Link>
  );
}
