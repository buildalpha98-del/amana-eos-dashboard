import type {
  VendorBriefStatus,
  VendorBriefType,
  TermReadinessCategory,
} from "@prisma/client";
import { computeSlaState, type SlaState } from "./sla";

/**
 * Shared shape returned by list endpoints + read by the frontend table.
 */
export interface VendorBriefListItem {
  id: string;
  briefNumber: string;
  title: string;
  type: VendorBriefType;
  status: VendorBriefStatus;
  serviceId: string | null;
  serviceName: string | null;
  vendorContactId: string | null;
  vendorContactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  termYear: number | null;
  termNumber: number | null;
  termReadinessCategory: TermReadinessCategory | null;
  briefSentAt: string | null;
  acknowledgedAt: string | null;
  quoteReceivedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  installedAt: string | null;
  deliveryDeadline: string | null;
  targetTermStart: string | null;
  escalatedAt: string | null;
  escalatedToUserId: string | null;
  slaState: SlaState;
  createdAt: string;
  updatedAt: string;
}

type RawBrief = {
  id: string;
  briefNumber: string;
  title: string;
  type: VendorBriefType;
  status: VendorBriefStatus;
  serviceId: string | null;
  service: { name: string } | null;
  vendorContactId: string | null;
  vendorContact: { name: string } | null;
  ownerId: string | null;
  owner: { name: string | null } | null;
  termYear: number | null;
  termNumber: number | null;
  termReadinessCategory: TermReadinessCategory | null;
  briefSentAt: Date | null;
  acknowledgedAt: Date | null;
  quoteReceivedAt: Date | null;
  approvedAt: Date | null;
  orderedAt: Date | null;
  deliveredAt: Date | null;
  installedAt: Date | null;
  deliveryDeadline: Date | null;
  targetTermStart: Date | null;
  escalatedAt: Date | null;
  escalatedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toListItem(b: RawBrief, now: Date = new Date()): VendorBriefListItem {
  return {
    id: b.id,
    briefNumber: b.briefNumber,
    title: b.title,
    type: b.type,
    status: b.status,
    serviceId: b.serviceId,
    serviceName: b.service?.name ?? null,
    vendorContactId: b.vendorContactId,
    vendorContactName: b.vendorContact?.name ?? null,
    ownerId: b.ownerId,
    ownerName: b.owner?.name ?? null,
    termYear: b.termYear,
    termNumber: b.termNumber,
    termReadinessCategory: b.termReadinessCategory,
    briefSentAt: b.briefSentAt?.toISOString() ?? null,
    acknowledgedAt: b.acknowledgedAt?.toISOString() ?? null,
    quoteReceivedAt: b.quoteReceivedAt?.toISOString() ?? null,
    approvedAt: b.approvedAt?.toISOString() ?? null,
    orderedAt: b.orderedAt?.toISOString() ?? null,
    deliveredAt: b.deliveredAt?.toISOString() ?? null,
    installedAt: b.installedAt?.toISOString() ?? null,
    deliveryDeadline: b.deliveryDeadline?.toISOString() ?? null,
    targetTermStart: b.targetTermStart?.toISOString() ?? null,
    escalatedAt: b.escalatedAt?.toISOString() ?? null,
    escalatedToUserId: b.escalatedToUserId,
    slaState: computeSlaState(
      {
        status: b.status,
        briefSentAt: b.briefSentAt,
        acknowledgedAt: b.acknowledgedAt,
        quoteReceivedAt: b.quoteReceivedAt,
        deliveryDeadline: b.deliveryDeadline,
        deliveredAt: b.deliveredAt,
      },
      now,
    ),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Standard include shape for list/detail Prisma queries. */
export const briefIncludeFor = {
  service: { select: { id: true, name: true, state: true } },
  vendorContact: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  escalatedTo: { select: { id: true, name: true } },
} as const;
