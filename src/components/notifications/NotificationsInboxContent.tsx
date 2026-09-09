"use client";

/**
 * NotificationsInboxContent — the /notifications inbox (Staff Portal v2
 * Task 3.2).
 *
 * Rows come from `useInfiniteNotifications` (cursor-paginated — "Load
 * more" is `fetchNextPage`), grouped into Today / Earlier. "Mark all
 * read" wires to the EXISTING /api/notifications/mark-all-read endpoint
 * via `useMarkAllNotificationsRead`; both mark mutations invalidate the
 * ["notifications"] key, which refetches every loaded page.
 *
 * Dismiss decision (Task 3.2 "decide and note"): the existing
 * /api/notifications/dismiss endpoint writes `NotificationDismissal`
 * rows for the daily-digest's SYNTHETIC notifications (see
 * src/lib/daily-digest.ts) — GET /api/notifications never consults that
 * table, so dismissing a `UserNotification` through it would be a silent
 * no-op (the row would stay in this inbox). No per-row dismiss is
 * offered; per-row "mark as read" is the row-level affordance instead.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useInfiniteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type UserNotificationItem,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

export function NotificationsInboxContent() {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const items = useMemo(() => {
    const pages = data?.pages ?? [];
    const seen = new Set<string>();
    const merged: UserNotificationItem[] = [];
    for (const page of pages) {
      for (const n of page.notifications) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          merged.push(n);
        }
      }
    }
    return merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data]);

  const unreadCount = items.filter((n) => !n.read).length;

  const { today, earlier } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const t: UserNotificationItem[] = [];
    const e: UserNotificationItem[] = [];
    for (const n of items) {
      (new Date(n.createdAt) >= startOfToday ? t : e).push(n);
    }
    return { today: t, earlier: e };
  }, [items]);

  const handleMarkOne = (n: UserNotificationItem) => {
    if (!n.read) markOne.mutate(n.id);
  };

  return (
    <div className="max-w-3xl mx-auto" data-testid="notifications-page">
      <PageHeader
        title="Notifications"
        description="Everything sent to you — assignments, approvals and reminders."
      />

      {/* Toolbar — PageHeader's primaryAction can't carry disabled/testid,
          and its label collapses to icon-only on mobile, so the action
          renders here instead. */}
      <div className="flex items-center justify-between gap-3 mb-4 -mt-2">
        <p className="text-sm text-muted" aria-live="polite">
          {unreadCount === 0
            ? "No unread notifications"
            : `${unreadCount} unread`}
        </p>
        <Button
          variant="secondary"
          onClick={() => markAll.mutate()}
          loading={markAll.isPending}
          disabled={unreadCount === 0}
          iconLeft={<CheckCheck className="w-4 h-4" aria-hidden="true" />}
          data-testid="mark-all-read"
        >
          Mark all read
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <p className="text-sm text-red-600 dark:text-red-400">
            Unable to load notifications. Please refresh the page.
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="Notifications about assignments, approvals and reminders will land here."
        />
      ) : (
        <div className="space-y-6">
          {today.length > 0 && (
            <NotificationGroup
              label="Today"
              items={today}
              onMarkRead={handleMarkOne}
            />
          )}
          {earlier.length > 0 && (
            <NotificationGroup
              label="Earlier"
              items={earlier}
              onMarkRead={handleMarkOne}
            />
          )}

          {hasNextPage && (
            <div className="flex justify-center pb-2">
              <Button
                variant="secondary"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function NotificationGroup({
  label,
  items,
  onMarkRead,
}: {
  label: string;
  items: UserNotificationItem[];
  onMarkRead: (n: UserNotificationItem) => void;
}) {
  return (
    <section aria-label={label}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
        {label}
      </h2>
      <ul className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        {items.map((n) => (
          <NotificationRow key={n.id} notification={n} onMarkRead={onMarkRead} />
        ))}
      </ul>
    </section>
  );
}

function NotificationRow({
  notification: n,
  onMarkRead,
}: {
  notification: UserNotificationItem;
  onMarkRead: (n: UserNotificationItem) => void;
}) {
  const body = (
    <>
      {/* Unread dot */}
      <span className="w-5 shrink-0 flex items-center justify-center pt-1.5">
        {!n.read && (
          <>
            <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
            <span className="sr-only">Unread — </span>
          </>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-sm truncate text-foreground",
            n.read ? "font-normal" : "font-semibold",
          )}
        >
          {n.title}
        </span>
        {n.body && (
          <span className="block text-sm text-muted line-clamp-2 mt-0.5">
            {n.body}
          </span>
        )}
        <span className="block text-2xs text-muted mt-1">
          {formatWhen(n.createdAt)}
        </span>
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "flex items-start gap-1 px-3 py-1.5",
        !n.read && "bg-brand/[0.04]",
      )}
      data-testid="notification-row"
    >
      {n.link ? (
        // Whole row navigates; navigating also marks it read.
        <Link
          href={n.link}
          onClick={() => onMarkRead(n)}
          className="flex items-start gap-1 flex-1 min-w-0 py-2 rounded-lg hover:bg-surface -mx-1 px-1"
        >
          {body}
        </Link>
      ) : (
        // Linkless rows deliberately don't navigate.
        <span className="flex items-start gap-1 flex-1 min-w-0 py-2">
          {body}
        </span>
      )}
      {!n.read && (
        <button
          type="button"
          onClick={() => onMarkRead(n)}
          aria-label={`Mark "${n.title}" as read`}
          className="shrink-0 self-center min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (d >= startOfToday) {
    return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === startOfToday.getFullYear() ? undefined : "numeric",
  });
}
