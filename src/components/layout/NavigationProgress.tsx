"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "complete">("idle");
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Clear any pending timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Start loading animation
    setState("loading");

    // After the bar reaches ~80%, snap to complete
    timeoutRef.current = setTimeout(() => {
      setState("complete");
      // Then hide after fade-out
      timeoutRef.current = setTimeout(() => {
        setState("idle");
      }, 300);
    }, 500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  if (state === "idle") return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none"
      role="progressbar"
      aria-label="Page loading"
    >
      <div
        className={
          state === "loading"
            ? "h-full bg-accent rounded-r-full transition-all duration-500 ease-out w-[80%]"
            : "h-full bg-accent rounded-r-full transition-all duration-300 ease-out w-full opacity-0"
        }
      />
    </div>
  );
}
