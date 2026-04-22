"use client";

import { ServiceTodayPanel } from "./ServiceTodayPanel";

interface ServiceTodayTabProps {
  serviceId: string;
  /**
   * Reserved for future panel header enhancements. The current
   * {@link ServiceTodayPanel} only needs `serviceId` — accepting the name
   * here keeps the tab API forward-compatible without touching the panel.
   */
  serviceName?: string | null;
}

/**
 * Thin wrapper that composes {@link ServiceTodayPanel} into a tab-friendly
 * container.
 */
export function ServiceTodayTab({ serviceId }: ServiceTodayTabProps) {
  return (
    <div className="space-y-6">
      <ServiceTodayPanel serviceId={serviceId} />
    </div>
  );
}
