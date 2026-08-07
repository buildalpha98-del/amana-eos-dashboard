import { prisma } from "@/lib/prisma";
import type { AmbassadorAttributionSource } from "@prisma/client";
import { resolveRefCode } from "./ref-codes";

/**
 * Resolves who gets credited for an ambassador enrolment from the two
 * capture signals: the ref code (QR/link) and the parent's free-text
 * "Which educator spoke with you?" answer.
 *
 * Policy: when both signals resolve to DIFFERENT people we NEVER silently
 * pick one — the record is flagged for the Director to resolve.
 */

export interface AttributionResult {
  creditedEducatorId: string | null;
  attributionSource: AmbassadorAttributionSource;
  attributionConflict: boolean;
  /** Both resolved educators when in conflict — the Director picks one. */
  candidateIds: string[];
}

/**
 * Match a parent's free-text educator name against active educators and
 * Directors working at the service. Exact full-name match (case-insensitive)
 * first; failing that, a UNIQUE first-name match; anything ambiguous or
 * unmatched resolves to null.
 */
export async function matchNamedEducator(
  namedText: string | null | undefined,
  serviceId: string,
): Promise<string | null> {
  const name = namedText?.trim().toLowerCase();
  if (!name) return null;

  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["staff", "member"] },
      OR: [
        { serviceId },
        { serviceMemberships: { some: { serviceId, status: "active" } } },
      ],
    },
    select: { id: true, name: true },
  });

  const exact = staff.filter((u) => u.name.trim().toLowerCase() === name);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const byFirst = staff.filter(
    (u) => u.name.trim().toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0],
  );
  if (byFirst.length === 1) return byFirst[0].id;
  return null;
}

export async function resolveAttribution(input: {
  refCode: string | null | undefined;
  namedEducatorText: string | null | undefined;
  serviceId: string;
}): Promise<AttributionResult> {
  const [ref, namedId] = await Promise.all([
    resolveRefCode(input.refCode),
    matchNamedEducator(input.namedEducatorText, input.serviceId),
  ]);

  if (ref && namedId) {
    if (ref.userId === namedId) {
      return {
        creditedEducatorId: ref.userId,
        attributionSource: "both",
        attributionConflict: false,
        candidateIds: [ref.userId],
      };
    }
    return {
      creditedEducatorId: null,
      attributionSource: "both",
      attributionConflict: true,
      candidateIds: [ref.userId, namedId],
    };
  }

  if (ref) {
    return {
      creditedEducatorId: ref.userId,
      attributionSource: "qr_ref",
      attributionConflict: false,
      candidateIds: [ref.userId],
    };
  }

  if (namedId) {
    return {
      creditedEducatorId: namedId,
      attributionSource: "form_field",
      attributionConflict: false,
      candidateIds: [namedId],
    };
  }

  return {
    creditedEducatorId: null,
    attributionSource: "unknown",
    attributionConflict: false,
    candidateIds: [],
  };
}
