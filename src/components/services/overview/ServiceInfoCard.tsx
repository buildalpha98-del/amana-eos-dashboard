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
export type ServiceInfoSection = "info" | "settings" | "rooms" | "fees" | "closures" | "forms";

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

      {/* Rooms, Fees and Closures were one scroll (2026-10-09 split, as
          OWNA does it). Room prices stay with the rooms — that's where a
          coordinator looks for "what does Afternoons cost". */}
      {section === "rooms" && (
        <>
          {/* OWNA-style advisor, always visible (2026-10-08). */}
          <RoomConfigurationSuggestions service={service} />
          <RoomsAndFeesCard service={service} canEdit={canEdit} />
        </>
      )}

      {/* What families are charged beyond the session fee, and rate
          changes booked for a future date. */}
      {section === "fees" && (
        <>
          <FeePolicyCard serviceId={service.id} canEdit={canEdit} />
          <FeeChangesCard
            serviceId={service.id}
            sessionTimes={service.sessionTimes}
            canEdit={canEdit}
          />
        </>
      )}

      {section === "closures" && (
        <BlockOutDatesCard
          serviceId={service.id}
          sessionTimes={service.sessionTimes}
          canEdit={canEdit}
        />
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
