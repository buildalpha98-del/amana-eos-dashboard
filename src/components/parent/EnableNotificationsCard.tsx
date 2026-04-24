"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Smartphone } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  getPushStatus,
  subscribeParentPush,
  unsubscribeParentPush,
  type PushStatus,
} from "@/lib/push/register";

type UiState = "loading" | "ready" | "error";

export function EnableNotificationsCard() {
  const [state, setState] = useState<UiState>("loading");
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <CardShell>Checking notification settings…</CardShell>;
  }

  if (state === "error" || !status) {
    return (
      <CardShell>
        Unable to check notification support on this device.
      </CardShell>
    );
  }

  if (!status.supported) {
    return (
      <CardShell>
        This browser doesn&apos;t support push notifications. Try Chrome on
        Android or Safari on iOS 16.4+ with the app added to your home screen.
      </CardShell>
    );
  }

  if (status.needsStandalonePwa) {
    return (
      <CardShell>
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-[#004E64] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[#1a1a2e]">
              Install the app first
            </p>
            <p className="text-xs text-[#7c7c8a] mt-1">
              On iPhone, open this page in Safari, tap the Share button, then
              &ldquo;Add to Home Screen&rdquo;. Notifications can be enabled
              once the app is installed.
            </p>
          </div>
        </div>
      </CardShell>
    );
  }

  const enabled = status.permission === "granted" && status.subscribed;
  const blocked = status.permission === "denied";

  const handleEnable = async () => {
    setBusy(true);
    try {
      await subscribeParentPush();
      const next = await getPushStatus();
      setStatus(next);
      toast({
        description: "Notifications enabled — you'll get push alerts on this device.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't enable notifications",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await unsubscribeParentPush();
      const next = await getPushStatus();
      setStatus(next);
      toast({ description: "Notifications turned off for this device." });
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't turn off notifications",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardShell>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            enabled ? "bg-[#d4f4d4] text-[#1f5e1f]" : "bg-[#004E64]/10 text-[#004E64]"
          }`}
        >
          {enabled ? <Check className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1a1a2e]">
            Push notifications
          </p>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            Sign-in/out, messages from the centre, new posts about your child
            and booking updates.
          </p>
          {blocked && (
            <p className="text-xs text-[#8B2525] mt-2">
              Notifications are blocked in your browser settings. Re-enable
              them for this site to turn push alerts back on.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        {enabled ? (
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7c7c8a] hover:text-[#1a1a2e] disabled:opacity-50"
          >
            <BellOff className="w-3.5 h-3.5" />
            Turn off
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy || blocked}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#004E64] hover:bg-[#006B87] disabled:opacity-60 rounded-md px-3 py-1.5"
          >
            <Bell className="w-3.5 h-3.5" />
            {busy ? "Enabling…" : "Enable"}
          </button>
        )}
      </div>
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      {children}
    </section>
  );
}
