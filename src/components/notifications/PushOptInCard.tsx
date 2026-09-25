"use client";

/**
 * PushOptInCard — push-notification opt-in prompt on /my-portal for the
 * staff-tier roles (Staff Portal v2 Task 3.3c).
 *
 * Renders only when ALL of:
 *  - the session role is staff / member / marketing
 *  - the browser supports push (`isPushSupported`)
 *  - permission is still "default" (never asked)
 *  - `getPushStatus()` reports no existing subscription
 *  - the user hasn't dismissed the card ("Not now" → localStorage)
 *
 * Naming note: the helpers are `registerParentServiceWorker` /
 * `subscribeParentPush` because the parent portal shipped push first.
 * They're deliberately NOT renamed here (smallest change — see the plan);
 * staff share the same service worker + subscription plumbing.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import {
  getPushStatus,
  isPushSupported,
  registerParentServiceWorker,
  subscribeParentPush,
} from "@/lib/push/register";

const DISMISS_KEY = "amana-staff-push-opt-in-dismissed";
const STAFF_TIER_ROLES = new Set(["staff", "member", "marketing"]);

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function PushOptInCard() {
  const { data: session } = useSession();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const role = session?.user?.role;

  useEffect(() => {
    if (!role || !STAFF_TIER_ROLES.has(role)) return;
    if (wasDismissed() || !isPushSupported()) return;
    let cancelled = false;
    getPushStatus()
      .then((status) => {
        if (cancelled) return;
        setVisible(status.permission === "default" && !status.subscribed);
      })
      .catch(() => {
        /* status check failed — stay hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  if (!visible) return null;

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await registerParentServiceWorker();
      await subscribeParentPush();
      toast({ description: "Push notifications enabled" });
      setVisible(false);
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error && err.message
            ? err.message
            : "Couldn't enable push notifications",
      });
    } finally {
      setEnabling(false);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — dismissal just won't persist */
    }
    setVisible(false);
  };

  return (
    <div
      className="bg-card rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      data-testid="push-opt-in-card"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="shrink-0 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
          <BellRing className="w-5 h-5 text-brand" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Get notified on this device
          </h3>
          <p className="text-sm text-muted mt-0.5">
            Turn on push notifications for shift changes, approvals and
            reminders — even when the app is closed.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" onClick={handleDismiss} disabled={enabling}>
          Not now
        </Button>
        <Button onClick={handleEnable} loading={enabling}>
          Enable notifications
        </Button>
      </div>
    </div>
  );
}
