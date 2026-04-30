"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Inbox,
  PlusCircle,
  Bell,
  Menu,
  AlertTriangle,
  CheckSquare,
  UserPlus,
  ClipboardList,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { useQuickAdd } from "@/components/quick-add/QuickAddProvider";

interface MobileBottomNavProps {
  onOpenSidebar: () => void;
}

export function MobileBottomNav({ onOpenSidebar }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: unreadData } = useUnreadNotificationCount({ refetchInterval: 60_000 });
  const { openTodoModal, openIssueModal } = useQuickAdd();
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  const unreadCount = unreadData?.count ?? 0;

  const navItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/queue", label: "Queue", icon: Inbox },
    { href: "__quick_add__", label: "Add", icon: PlusCircle },
    { href: "/notifications", label: "Alerts", icon: Bell },
    { href: "__menu__", label: "Menu", icon: Menu },
  ];

  const quickActions = [
    {
      label: "Log Incident",
      icon: AlertTriangle,
      color: "text-red-500 bg-red-50",
      action: () => {
        setQuickActionOpen(false);
        router.push("/incidents?create=true");
      },
    },
    {
      label: "Create Todo",
      icon: CheckSquare,
      color: "text-blue-500 bg-blue-50",
      action: () => {
        setQuickActionOpen(false);
        openTodoModal();
      },
    },
    {
      label: "New Enquiry",
      icon: UserPlus,
      color: "text-emerald-500 bg-emerald-50",
      action: () => {
        setQuickActionOpen(false);
        router.push("/enquiries?create=true");
      },
    },
    {
      label: "Record Attendance",
      icon: ClipboardList,
      color: "text-amber-500 bg-amber-50",
      action: () => {
        setQuickActionOpen(false);
        router.push("/services?tab=attendance");
      },
    },
  ];

  return (
    <>
      {/* Quick Action Bottom Sheet */}
      {quickActionOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setQuickActionOpen(false)}
          />

          {/* Bottom sheet */}
          <div role="dialog" aria-modal="true" aria-label="Quick actions" className="absolute bottom-0 inset-x-0 bg-card rounded-t-2xl p-4 pb-6 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">
                Quick Actions
              </h3>
              <button
                onClick={() => setQuickActionOpen(false)}
                aria-label="Close quick actions"
                className="p-1.5 rounded-full text-muted-foreground hover:bg-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={action.action}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-surface transition-colors"
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        action.color
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Home indicator safe area */}
            <div className="h-2" />
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav aria-label="Mobile navigation" className="fixed bottom-0 inset-x-0 z-40 md:hidden">
        {/* Top border */}
        <div className="h-px bg-border" />

        <div className="bg-card h-16 flex items-center justify-around px-2 safe-area-bottom">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href !== "__quick_add__" &&
              item.href !== "__menu__" &&
              (pathname === item.href ||
                pathname.startsWith(item.href + "/"));

            // Quick Add center button
            if (item.href === "__quick_add__") {
              return (
                <button
                  key={item.href}
                  onClick={() => setQuickActionOpen(true)}
                  aria-label="Open quick actions"
                  className="flex flex-col items-center gap-0.5 -mt-3"
                >
                  <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-brand/25">
                    <PlusCircle className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {item.label}
                  </span>
                </button>
              );
            }

            // Menu button (opens sidebar)
            if (item.href === "__menu__") {
              return (
                <button
                  key={item.href}
                  onClick={onOpenSidebar}
                  aria-label="Open navigation menu"
                  className="flex flex-col items-center gap-0.5 py-1 px-3"
                >
                  <Icon className="w-6 h-6 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {item.label}
                  </span>
                </button>
              );
            }

            // Notifications with badge
            if (item.href === "/notifications") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
                >
                  <div className="relative">
                    <Icon
                      className={cn(
                        "w-6 h-6 transition-colors",
                        isActive ? "text-brand" : "text-muted-foreground"
                      )}
                    />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium transition-colors",
                      isActive ? "text-brand" : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            }

            // Regular nav item
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-0.5 py-1 px-3"
              >
                <Icon
                  className={cn(
                    "w-6 h-6 transition-colors",
                    isActive ? "text-brand" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    isActive ? "text-brand" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
