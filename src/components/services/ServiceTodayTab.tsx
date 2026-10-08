"use client";

import { ServiceTodayHome } from "./ServiceTodayHome";

interface ServiceTodayTabProps {
  serviceId: string;
  /** Kept for the tab API; the Today screen reads its own data. */
  serviceName?: string | null;
}

/**
 * The centre's Today tab. 2026-10-09 (staff-UX Round 2): one screen that
 * runs the shift — see {@link ServiceTodayHome}. The old stack (quick
 * actions + activity feed + a panel whose attendance and "staff on duty"
 * counted differently from the Coordinator dashboard) is retired.
 */
export function ServiceTodayTab({ serviceId }: ServiceTodayTabProps) {
  return <ServiceTodayHome serviceId={serviceId} />;
}
