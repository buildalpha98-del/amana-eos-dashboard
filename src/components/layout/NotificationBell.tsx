"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { NotificationPopover } from "./NotificationPopover";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useUnreadNotificationCount({ refetchInterval: POLL_INTERVAL_MS });
  const count = data?.count ?? 0;

  const badgeLabel = count > 9 ? "9+" : String(count);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors relative"
        aria-label={
          count > 0 ? `Notifications (${count} unread)` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            data-testid="notification-badge"
            className={cn(
              "absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white bg-red-500",
            )}
          >
            {badgeLabel}
          </span>
        )}
      </button>
      <NotificationPopover open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
