/**
 * /communication tab keys + URL-param resolution (2026-08-31).
 *
 * Extracted from the page so the ?tab= contract — which cascade
 * notification deep-links depend on — is unit-testable.
 */

export const COMMUNICATION_TABS = ["announcements", "cascade", "pulse"] as const;
export type CommunicationTab = (typeof COMMUNICATION_TABS)[number];

export function resolveCommunicationTab(
  raw: string | null | undefined,
): CommunicationTab {
  return COMMUNICATION_TABS.includes(raw as CommunicationTab)
    ? (raw as CommunicationTab)
    : "announcements";
}
