"use client";

import { ServiceTodayPanel } from "./ServiceTodayPanel";
import { RatioWidget } from "./RatioWidget";

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
      <div>
        <h3 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em] mb-2">
          Live ratio
        </h3>
        <RatioWidget serviceId={serviceId} compact />
      </div>
      <ServiceTodayPanel serviceId={serviceId} />
    </div>
  );
}
