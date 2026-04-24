"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isIOS,
  isInAppBrowser,
  isRecentlyDismissed,
  isStandalone,
  getVisitCount,
  setDismissedAt,
} from "@/app/parent/utils/platform";

// The `beforeinstallprompt` event is Chrome/Edge-only. We type it ourselves
// rather than pulling the `@types/wicg-beforeinstallprompt` package.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android-native" | "android-fallback" | "desktop" | null;

interface Props {
  /** How many visits before the banner is shown. Defaults to 2 (not the 1st visit). */
  minVisits?: number;
  /** Called when the install either completes (Android) or the user taps "I've added it" (iOS). */
  onInstalled?: () => void;
  className?: string;
}

const DEFAULT_MIN_VISITS = 2;

export function InstallBanner({
  minVisits = DEFAULT_MIN_VISITS,
  onInstalled,
  className,
}: Props) {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const installingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hard suppressors — installed already, in-app browser, or recently dismissed.
    if (isStandalone()) return;
    if (isInAppBrowser()) return;
    if (isRecentlyDismissed()) return;

    // Gate on visit count so we don't nag first-time visitors before they've
    // seen what the portal does.
    if (getVisitCount() < minVisits) return;

    // Respect the OS-level motion preference for the slide-up animation.
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setPrefersReducedMotion(mq.matches);
    } catch {
      // Some environments throw on certain media queries — default to false.
    }

    // Determine platform. Android fires beforeinstallprompt; iOS needs manual
    // steps; everything else falls through to a manual-steps hint.
    if (isIOS()) {
      setPlatform("ios");
      setEligible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android-native");
      setEligible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // If the browser never fires the prompt (Firefox, some Samsung Internet
    // builds), fall back to a manual-steps hint after a short delay.
    const fallbackTimer = window.setTimeout(() => {
      if (!installingRef.current) {
        setPlatform((prev) => prev ?? "android-fallback");
        setEligible(true);
      }
    }, 1_500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.clearTimeout(fallbackTimer);
    };
  }, [minVisits]);

  if (!eligible || dismissed || platform === null) return null;

  const handleDismiss = () => {
    setDismissed(true);
    setDismissedAt(Date.now());
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    installingRef.current = true;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDismissed(true);
        onInstalled?.();
      }
    } catch {
      // User dismissed the native sheet — treat as dismiss but don't burn the
      // 30-day window, since they might still install later.
    } finally {
      installingRef.current = false;
      setDeferredPrompt(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Install the Amana Parents app"
      data-testid="parent-install-banner"
      className={cn(
        "relative rounded-2xl border border-[#e8e4df] bg-gradient-to-br from-[#FFFAE6] to-white p-4 shadow-sm",
        !prefersReducedMotion && "transition-transform duration-300 ease-out",
        className,
      )}
      style={{
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px) / 2)",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full text-[#7c7c8a] hover:text-[#1a1a2e] hover:bg-[#F2EDE8] transition-colors min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-[#004E64] flex items-center justify-center shadow-sm">
          <Download className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-heading font-bold text-[#1a1a2e]">
            Add Amana Parents to your home screen
          </h3>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            Tap, open, and stay up to date — no app store needed.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {platform === "android-native" && deferredPrompt && (
          <button
            type="button"
            onClick={handleInstall}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-colors active:scale-[0.99]"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Install app
          </button>
        )}
        {platform === "ios" && <IosHint />}
        {(platform === "android-fallback" || platform === "desktop") && (
          <AndroidFallbackHint />
        )}
      </div>
    </div>
  );
}

function IosHint() {
  return (
    <ol
      className="space-y-2 text-sm text-[#1a1a2e]"
      data-testid="install-ios-hint"
    >
      <Step n={1}>
        Tap the <IosShareIcon /> <strong>Share</strong> button in Safari.
      </Step>
      <Step n={2}>
        Scroll and tap <strong>Add to Home Screen</strong>.
      </Step>
      <Step n={3}>
        Tap <strong>Add</strong> in the top right.
      </Step>
    </ol>
  );
}

function AndroidFallbackHint() {
  return (
    <ol
      className="space-y-2 text-sm text-[#1a1a2e]"
      data-testid="install-android-hint"
    >
      <Step n={1}>Open this page in Chrome on your phone.</Step>
      <Step n={2}>
        Tap the <strong>⋮</strong> menu, then{" "}
        <strong>Add to Home screen</strong>.
      </Step>
      <Step n={3}>Confirm to add the app to your home screen.</Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-5 h-5 shrink-0 mt-0.5 rounded-full bg-[#004E64] text-white text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-xs text-[#1a1a2e] leading-relaxed">{children}</span>
    </li>
  );
}

function IosShareIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="inline-block w-4 h-4 align-text-bottom mx-0.5 text-[#004E64]"
      fill="currentColor"
    >
      <path d="M8 1.5a.75.75 0 0 1 .53.22l2.5 2.5a.75.75 0 1 1-1.06 1.06L8.75 3.56V10a.75.75 0 0 1-1.5 0V3.56L5.53 5.28A.75.75 0 0 1 4.47 4.22l2.5-2.5A.75.75 0 0 1 8 1.5Z" />
      <path d="M3.5 7.5A1.5 1.5 0 0 0 2 9v4.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5H11a.75.75 0 0 0 0 1.5h1.5V13.5h-9V9H5a.75.75 0 0 0 0-1.5H3.5Z" />
    </svg>
  );
}
