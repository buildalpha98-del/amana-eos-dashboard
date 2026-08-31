/**
 * A centre's rooms, as records.
 *
 * Stage 2 of docs/rooms-migration-plan.md. The point of this hook is
 * what it DOESN'T do: it never enumerates `SESSION_KEYS`. A component
 * that renders what this returns shows however many rooms the centre
 * has, which is the difference between seven fixed slots and a room
 * a centre can add.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { FeeTier, SessionKey } from "@/lib/service-settings";

export interface ServiceRoom {
  id: string;
  name: string;
  /**
   * The enum slot this room came from, or null for one the enum never
   * knew about. Still needed on write paths until Stage 4 drops the
   * `sessionType` columns.
   */
  legacyKey: SessionKey | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  ratio: string | null;
  description: string | null;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  photoUrl: string | null;
  staffOnly: boolean;
  archivedAt: string | null;
  /** What this room can be charged at. Cheapest first, archived excluded. */
  fees: FeeTier[];
  /**
   * Retired tiers — history, not options. Needed only to NAME a tier
   * something is already linked to; never to offer a new one.
   */
  archivedFees: FeeTier[];
}

export type RoomScope = "active" | "retired" | "all";

export function useServiceRooms(
  serviceId: string | null | undefined,
  scope: RoomScope = "active",
) {
  return useQuery<{ rooms: ServiceRoom[] }>({
    queryKey: ["service-rooms", serviceId, scope],
    queryFn: () =>
      fetchApi(`/api/services/${serviceId}/rooms?scope=${scope}`),
    enabled: Boolean(serviceId),
    retry: 2,
  });
}
