import type { Child, Service } from "@prisma/client";

/**
 * The shape the `/children/[id]` page.tsx hands to <ChildProfileTabs />.
 *
 * Matches the prisma.child.findUnique({...}) include used in the page route:
 * - service: small subset (id, name, code)
 * - enrolment: select of safe fields (no sensitive payment details)
 */
export type ChildProfileRecord = Child & {
  service: Pick<Service, "id" | "name" | "code"> | null;
  enrolment: {
    id: string;
    token: string;
    primaryParent: unknown;
    secondaryParent: unknown;
    emergencyContacts: unknown;
    authorisedPickup: unknown;
    consents: unknown;
    paymentMethod: string | null;
    paymentDetails: unknown;
    status: string;
    createdAt: Date;
  } | null;
};
