"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import {
  Bell,
  UserPlus,
  ShieldAlert,
  Megaphone,
  CalendarDays,
  Clock,
  Mountain,
  Mail,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NotificationPrefs {
  overdueTodos: boolean;
  newAssignments: boolean;
  complianceAlerts: boolean;
  announcements: boolean;
  leaveUpdates: boolean;
  meetingReminders: boolean;
  rockUpdates: boolean;
  emailNotifications: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  overdueTodos: true,
  newAssignments: true,
  complianceAlerts: true,
  announcements: true,
  leaveUpdates: true,
  meetingReminders: true,
  rockUpdates: true,
  emailNotifications: true,
};

interface PrefItem {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  icon: LucideIcon;
}

const PREF_ITEMS: PrefItem[] = [
  {
    key: "overdueTodos",
    label: "Overdue To-Dos",
    description: "Get notified when your to-dos are past due",
    icon: Bell,
  },
  {
    key: "newAssignments",
    label: "New Assignments",
    description: "When you're assigned a new Rock, To-Do, or Issue",
    icon: UserPlus,
  },
  {
    key: "complianceAlerts",
    label: "Compliance Alerts",
    description: "Certificate expiry warnings",
    icon: ShieldAlert,
  },
  {
    key: "announcements",
    label: "Announcements",
    description: "New company announcements",
    icon: Megaphone,
  },
  {
    key: "leaveUpdates",
    label: "Leave Updates",
    description: "Approval/rejection of leave requests",
    icon: CalendarDays,
  },
  {
    key: "meetingReminders",
    label: "Meeting Reminders",
    description: "Upcoming L10 meeting reminders",
    icon: Clock,
  },
  {
    key: "rockUpdates",
    label: "Rock Updates",
    description: "Progress changes on your Rocks",
    icon: Mountain,
  },
  {
    key: "emailNotifications",
    label: "Email Notifications",
    description: "Also send notifications via email",
    icon: Mail,
  },
];

export function NotificationPreferences() {
  const queryClient = useQueryClient();
  const [showSaved, setShowSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/notification-preferences");
      if (!res.ok) throw new Error("Failed to load preferences");
      const json = await res.json();
      return json.prefs;
    },
  });

  const prefs = data ?? DEFAULT_PREFS;

  const mutation = useMutation({
    mutationFn: async (updated: NotificationPrefs) => {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: updated }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save preferences");
      }
      return res.json();
    },
    onSuccess: (json) => {
      queryClient.setQueryData(["notification-preferences"], json.prefs);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });

  const handleToggle = useCallback(
    (key: keyof NotificationPrefs) => {
      const updated = { ...prefs, [key]: !prefs[key] };
      // Optimistic update
      queryClient.setQueryData(["notification-preferences"], updated);
      // Debounce the PUT request
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        mutation.mutate(updated);
      }, 400);
    },
    [prefs, queryClient, mutation],
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-border" />
          <div className="h-4 w-64 rounded bg-surface" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-surface" />
                <div className="space-y-1">
                  <div className="h-4 w-32 rounded bg-border" />
                  <div className="h-3 w-48 rounded bg-surface" />
                </div>
              </div>
              <div className="h-6 w-11 rounded-full bg-border" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Notification Preferences
          </h3>
          <p className="text-sm text-muted">
            Control what notifications you receive
          </p>
        </div>
        {showSaved && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 animate-in fade-in">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>

      {/* Toggle list */}
      <div className="divide-y divide-gray-50 px-6">
        {PREF_ITEMS.map((item) => {
          const Icon = item.icon;
          const enabled = prefs[item.key];

          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    enabled
                      ? "bg-brand/10 text-brand"
                      : "bg-surface text-muted",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted">{item.description}</p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => handleToggle(item.key)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
                  enabled ? "bg-brand" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out",
                    enabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
