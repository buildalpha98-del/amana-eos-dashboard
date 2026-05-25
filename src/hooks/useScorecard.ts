"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface EntryUser {
  id: string;
  name: string;
}

export interface MeasurableEntry {
  id: string;
  measurableId: string;
  weekOf: string;
  value: number;
  onTrack: boolean;
  notes: string | null;
  enteredBy: EntryUser;
  createdAt: string;
}

export interface MeasurableOwner {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface MeasurableData {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: MeasurableOwner;
  goalValue: number;
  goalDirection: "above" | "below" | "exact";
  unit: string | null;
  frequency: "weekly" | "monthly";
  rockId: string | null;
  rock: { id: string; title: string } | null;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  entries: MeasurableEntry[];
}

export interface ScorecardData {
  id: string;
  title: string;
  measurables: MeasurableData[];
}

export function useScorecard() {
  return useQuery<ScorecardData>({
    queryKey: ["scorecard"],
    queryFn: () => fetchApi<ScorecardData>("/api/scorecard"),
    staleTime: 2 * 60_000, // Scorecard data: 2 min stale time
    retry: 2,
  });
}

/**
 * Query keys that may hold scorecard data and need invalidation when an
 * entry is created/updated. Kept central so future scorecard surfaces
 * (e.g. service detail's ServiceScorecardTab) automatically pick up
 * fresh data without each page having to remember the prefix list.
 */
const SCORECARD_QUERY_PREFIXES = [
  "scorecard",
  "scorecard-detail",
  "service-scorecard",
  "scorecard-rollup",
] as const;

function isScorecardQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && (SCORECARD_QUERY_PREFIXES as readonly string[]).includes(key[0]);
}

/** Stable lookup key for an entry — UTC date portion of weekOf. */
function weekKeyFromIso(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      measurableId,
      weekOf,
      value,
      notes,
    }: {
      measurableId: string;
      weekOf: string;
      value: number;
      notes?: string;
    }) => {
      return mutateApi<MeasurableEntry>(`/api/measurables/${measurableId}/entries`, {
        method: "POST",
        body: { weekOf, value, notes },
      });
    },
    // Optimistic update: patch every cached scorecard that holds this
    // measurable so the cell shows the new value immediately. Without
    // this, the cell flashes back to `—` between the POST returning and
    // the refetch landing.
    onMutate: async ({ measurableId, weekOf, value, notes }) => {
      await queryClient.cancelQueries({
        predicate: (q) => isScorecardQueryKey(q.queryKey),
      });

      const snapshots = queryClient.getQueriesData<ScorecardData>({
        predicate: (q) => isScorecardQueryKey(q.queryKey),
      });

      const targetWeekKey = weekKeyFromIso(weekOf);

      queryClient.setQueriesData<ScorecardData>(
        { predicate: (q) => isScorecardQueryKey(q.queryKey) },
        (old) => {
          if (!old?.measurables) return old;
          return {
            ...old,
            measurables: old.measurables.map((m) => {
              if (m.id !== measurableId) return m;

              const onTrack =
                m.goalDirection === "above"
                  ? value >= m.goalValue
                  : m.goalDirection === "below"
                    ? value <= m.goalValue
                    : value === m.goalValue;

              const existingIdx = m.entries.findIndex(
                (e) => weekKeyFromIso(e.weekOf) === targetWeekKey,
              );

              if (existingIdx >= 0) {
                const updated = [...m.entries];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  value,
                  onTrack,
                  notes: notes ?? updated[existingIdx].notes,
                };
                return { ...m, entries: updated };
              }

              const optimistic: MeasurableEntry = {
                id: `optimistic-${measurableId}-${targetWeekKey}`,
                measurableId,
                weekOf,
                value,
                onTrack,
                notes: notes ?? null,
                enteredBy: { id: "", name: "" },
                createdAt: new Date().toISOString(),
              };
              return { ...m, entries: [optimistic, ...m.entries] };
            }),
          };
        },
      );

      return { snapshots };
    },
    onError: (err: Error, _vars, context) => {
      // Roll back to the snapshot we captured in onMutate so the cell
      // doesn't keep the optimistic value when the API rejected.
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
    onSettled: () => {
      // Refetch all scorecard surfaces to reconcile with server truth.
      // Runs on both success (replace optimistic) and error (re-fetch
      // after we restored the snapshot, in case anything else changed).
      queryClient.invalidateQueries({
        predicate: (q) => isScorecardQueryKey(q.queryKey),
      });
    },
  });
}
