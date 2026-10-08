"use client";

import { RoomsAndFeesCard } from "./RoomsAndFeesCard";
import { FeePolicyCard } from "./FeePolicyCard";
import { ParentFormsCard } from "./ParentFormsCard";
import { ExcursionsCard } from "./ExcursionsCard";
import { BlockOutDatesCard } from "@/components/services/BlockOutDatesCard";
import { FeeChangesCard } from "./FeeChangesCard";
import { AppSettingsCard } from "./AppSettingsCard";
import { RoomConfigurationSuggestions } from "./RoomConfigurationSuggestions";

/**
 * Which slice of Service Information to render.
 *
 * 2026-08-06: this was one long scroll of eight cards — contact details
 * through to excursion forms — and finding anything meant knowing how
 * far down it lived. The Service Information tab now has its own
 * sub-navigation (mirroring OWNA's Configure list), and each sub-tab
 * asks this component for one section.
 */
export type ServiceInfoSection = "info" | "settings" | "rooms" | "forms";

export function ServiceInfoCard({
  service,
  canEdit,
  section = "info",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
  section?: ServiceInfoSection;
}) {
  return (
    <>
      {/* section "info" is rendered by ServiceOverviewTab (Centre details
          form + tabs, 2026-10-08) — nothing to draw here. */}

      {section === "settings" && (
        <AppSettingsCard serviceId={service.id} canEdit={canEdit} />
      )}

      {/* Rooms and everything priced or scheduled against them: the fee
          changes and the days you're closed are the same subject one
          step into the future. */}
      {section === "rooms" && (
        <>
          {/* OWNA-style advisor, always visible (2026-10-08). */}
          <RoomConfigurationSuggestions service={service} />
          <RoomsAndFeesCard service={service} canEdit={canEdit} />
          {/* Directly under the room prices, because it answers the
              questions those prices don't: late pickup, absence,
              cancellation. */}
          <div id="fee-policy" className="scroll-mt-24">
            <FeePolicyCard serviceId={service.id} canEdit={canEdit} />
          </div>
          <div id="fee-changes" className="scroll-mt-24">
          <FeeChangesCard
            serviceId={service.id}
            sessionTimes={service.sessionTimes}
            canEdit={canEdit}
          />
          </div>
          <div id="blockout-dates" className="scroll-mt-24">
          <BlockOutDatesCard
            serviceId={service.id}
            sessionTimes={service.sessionTimes}
            canEdit={canEdit}
          />
          </div>
        </>
      )}

      {/* Excursions above the general forms card: an outing creates a
          form of its own, so the order matches how they're made. */}
      {section === "forms" && (
        <>
          <ExcursionsCard
            serviceId={service.id}
            sessionTimes={service.sessionTimes}
            canEdit={canEdit}
          />
          <ParentFormsCard serviceId={service.id} canEdit={canEdit} />
        </>
      )}
    </>
  );
}
