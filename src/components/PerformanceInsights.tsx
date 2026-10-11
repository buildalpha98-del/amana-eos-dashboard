"use client";

import { usePathname } from "next/navigation";
import { SpeedInsights } from "@vercel/speed-insights/next";

export function PerformanceInsights() {
  const pathname = usePathname();
  // A login fragment is a credential, even before hydration removes it.
  if (!pathname || pathname === "/parent/login/confirm") return null;
  return <SpeedInsights />;
}
