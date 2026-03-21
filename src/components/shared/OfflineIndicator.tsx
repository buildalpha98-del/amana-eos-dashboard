"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff, Wifi } from "lucide-react";
import { toast } from "@/hooks/useToast";

export function OfflineIndicator() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [visible, setVisible] = useState(false);

  const goOffline = useCallback(() => {
    setIsOnline(false);
    setShowReconnected(false);
    // slide in
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const goOnline = useCallback(() => {
    setIsOnline(true);
    setShowReconnected(true);
    requestAnimationFrame(() => setVisible(true));

    // Invalidate all queries to refresh stale data after reconnect
    queryClient.invalidateQueries();
    toast({ description: "Back online. Refreshing data..." });

    const timer = setTimeout(() => {
      setVisible(false);
      // remove from DOM after transition
      setTimeout(() => setShowReconnected(false), 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [queryClient]);

  useEffect(() => {
    // Initialize from current state
    if (!navigator.onLine) {
      goOffline();
    }

    let cleanupTimer: (() => void) | undefined;

    function handleOffline() {
      goOffline();
    }

    function handleOnline() {
      cleanupTimer = goOnline();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      cleanupTimer?.();
    };
  }, [goOffline, goOnline]);

  // Nothing to show
  if (isOnline && !showReconnected) return null;

  const isOfflineBanner = !isOnline;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[60] text-center py-2 text-sm font-medium text-white
        transition-transform duration-300 ease-out
        ${isOfflineBanner ? "bg-amber-500" : "bg-emerald-500"}
        ${visible ? "translate-y-0" : "-translate-y-full"}`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        {isOfflineBanner ? (
          <>
            <WifiOff className="h-4 w-4" />
            You&apos;re offline. Changes will sync when you reconnect.
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4" />
            You&apos;re back online!
          </>
        )}
      </span>
    </div>
  );
}
