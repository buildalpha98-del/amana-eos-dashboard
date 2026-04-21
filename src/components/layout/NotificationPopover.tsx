"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type UserNotificationItem,
} from "@/hooks/useNotifications";

interface NotificationPopoverProps {
  open: boolean;
  onClose: () => void;
}

function timeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function NotificationPopover({ open, onClose }: NotificationPopoverProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // Only fetch when the popover is open.
  const { data, isLoading } = useNotifications({ enabled: open });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const notifications: UserNotificationItem[] = data?.notifications ?? [];
  // Show unread first, then most recent read (up to 10).
  const items = [...notifications]
    .sort((a, b) => Number(a.read) - Number(b.read))
    .slice(0, 10);

  // Close on Escape + click outside.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) onClose();
    }

    document.addEventListener("keydown", onKey);
    // Defer to avoid catching the click that opened the popover.
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleItemClick = (n: UserNotificationItem) => {
    if (!n.read) markRead.mutate(n.id);
    onClose();
    if (n.link) router.push(n.link);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-16px)] sm:w-[380px] bg-card rounded-xl shadow-xl border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-surface/30">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        {items.some((n) => !n.read) && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50"
            title="Mark all as read"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-muted animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium text-foreground">You&apos;re all caught up!</p>
            <p className="text-xs text-muted mt-1">No new notifications</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-surface transition-colors cursor-pointer",
                    !n.read && "bg-accent/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold text-foreground",
                        !n.read && "text-brand",
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="text-[10px] text-muted flex-shrink-0">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
