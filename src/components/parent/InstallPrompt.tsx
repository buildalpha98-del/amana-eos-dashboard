"use client";

import { useState, useEffect } from "react";
import {
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  Download,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Props {
  onInstalled?: () => void;
}

export function InstallPrompt({ onInstalled }: Props) {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) {
      setPlatform("ios");
    } else if (/Android/.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    // Check if already installed (standalone mode)
    const isInstalled = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isInstalled);

    // Capture beforeinstallprompt for Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        onInstalled?.();
      }
    } catch {
      // User dismissed
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  if (isStandalone) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">App installed</p>
          <p className="text-xs text-green-600">You&apos;re using the Amana Parents app.</p>
        </div>
      </div>
    );
  }

  // Android with native prompt available
  if (platform === "android" && deferredPrompt) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-[#004E64]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1a1a2e]">Install the app</p>
            <p className="text-xs text-[#7c7c8a] mt-0.5">
              Add Amana Parents to your home screen for quick access.
            </p>
          </div>
        </div>
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 min-h-[48px]"
        >
          <Download className="w-4 h-4" />
          {installing ? "Installing..." : "Install App"}
        </button>
      </div>
    );
  }

  // iOS instructions
  if (platform === "ios") {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-[#004E64]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1a1a2e]">Add to Home Screen</p>
            <p className="text-xs text-[#7c7c8a] mt-0.5">
              Follow these steps in Safari to add the app to your iPhone.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Step number={1} icon={Share}>
            Tap the <strong>Share</strong> button at the bottom of Safari
          </Step>
          <Step number={2} icon={PlusSquare}>
            Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>
          </Step>
          <Step number={3} icon={CheckCircle2}>
            Tap <strong>&ldquo;Add&rdquo;</strong> in the top right corner
          </Step>
        </div>

        <button
          onClick={() => onInstalled?.()}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 bg-[#F2EDE8] hover:bg-[#e8e4df] text-[#1a1a2e] text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] min-h-[48px]"
        >
          <CheckCircle2 className="w-4 h-4" />
          I&apos;ve added it
        </button>
      </div>
    );
  }

  // Android without prompt / Desktop
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-[#004E64]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1a1a2e]">Add to Home Screen</p>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            {platform === "android"
              ? "Open this page in Chrome, then follow these steps."
              : "Open this page on your phone to install the app."}
          </p>
        </div>
      </div>

      {platform === "android" && (
        <div className="space-y-3">
          <Step number={1} icon={MoreVertical}>
            Tap the <strong>menu</strong> (three dots) in Chrome
          </Step>
          <Step number={2} icon={PlusSquare}>
            Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>
          </Step>
          <Step number={3} icon={CheckCircle2}>
            Tap <strong>&ldquo;Add&rdquo;</strong> to confirm
          </Step>
        </div>
      )}

      <button
        onClick={() => onInstalled?.()}
        className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 bg-[#F2EDE8] hover:bg-[#e8e4df] text-[#1a1a2e] text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] min-h-[48px]"
      >
        <CheckCircle2 className="w-4 h-4" />
        I&apos;ve added it
      </button>
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  children,
}: {
  number: number;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-[#004E64] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {number}
      </div>
      <div className="flex items-start gap-2 text-sm text-[#1a1a2e]">
        <Icon className="w-4 h-4 text-[#7c7c8a] shrink-0 mt-0.5" />
        <p>{children}</p>
      </div>
    </div>
  );
}
