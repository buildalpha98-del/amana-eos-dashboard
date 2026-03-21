"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  Bell,
  CheckCircle,
  CheckSquare,
  Mountain,
  MessageSquare,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Loader2,
  X,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useDismissNotifications,
  type NotificationItem,
} from "@/hooks/useNotifications";

const typeConfig: Record<
  NotificationItem["type"],
  { icon: React.ElementType; color: string }
> = {
  overdue_todo: { icon: CheckSquare, color: "text-amber-500" },
  overdue_rock: { icon: Mountain, color: "text-amber-500" },
  unassigned_ticket: { icon: MessageSquare, color: "text-blue-500" },
  critical_issue: { icon: AlertTriangle, color: "text-red-500" },
  sla_warning: { icon: Clock, color: "text-red-500" },
  low_compliance: { icon: ShieldAlert, color: "text-red-500" },
  compliance_expiring: { icon: ShieldAlert, color: "text-orange-600" },
  new_todo_assigned: { icon: CheckSquare, color: "text-blue-600" },
  new_issue_assigned: { icon: AlertTriangle, color: "text-amber-600" },
  new_rock_assigned: { icon: Mountain, color: "text-purple-600" },
};

const severityBorder: Record<NotificationItem["severity"], string> = {
  critical: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
};

function timeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

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

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data, isLoading } = useNotifications();
  const dismiss = useDismissNotifications();

  const total = data?.total ?? 0;
  const critical = data?.critical ?? 0;
  const notifications = data?.notifications ?? [];

  const handleNotificationClick = (notification: NotificationItem) => {
    dismiss.mutate([notification.id]);
    setOpen(false);
    router.push(notification.link);
  };

  const handleDismiss = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    dismiss.mutate([notificationId]);
  };

  const handleDismissAll = () => {
    dismiss.mutate(notifications.map((n) => n.id));
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors relative"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {total > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white",
                critical > 0 ? "bg-red-500" : "bg-accent text-gray-900"
              )}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          className="z-50 w-[calc(100vw-16px)] sm:w-[380px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in-0 zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Notifications
              </h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-600">
                {total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {critical > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                  {critical} critical
                </span>
              )}
              {total > 0 && (
                <button
                  onClick={handleDismissAll}
                  disabled={dismiss.isPending}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  You&apos;re all caught up!
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  No new notifications
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map((notification) => {
                  const config = typeConfig[notification.type];
                  const Icon = config.icon;

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        "relative group w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-l-[3px] cursor-pointer",
                        severityBorder[notification.severity]
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        <div
                          className={cn(
                            "mt-0.5 flex-shrink-0",
                            config.color
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-900">
                              {notification.title}
                            </span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {timeAgo(notification.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        {/* Dismiss button */}
                        <button
                          onClick={(e) => handleDismiss(e, notification.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-200 transition-all flex-shrink-0 self-center"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
