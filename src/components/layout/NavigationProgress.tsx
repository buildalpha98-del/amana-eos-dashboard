"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "complete">("idle");
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Route change → start the loading animation (render-time sync guarded by
  // the last-seen pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setState("loading");
  }

  // Timer chain: loading → (500ms, bar reaches ~80%) → complete →
  // (300ms fade-out) → idle. `prevPathname` in the deps restarts the
  // loading timer when another navigation lands mid-animation.
  useEffect(() => {
    if (state === "idle") return;
    const timeout = setTimeout(
      () => setState(state === "loading" ? "complete" : "idle"),
      state === "loading" ? 500 : 300,
    );
    return () => clearTimeout(timeout);
  }, [state, prevPathname]);

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
