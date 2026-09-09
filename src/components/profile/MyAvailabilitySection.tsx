"use client";

/**
 * MyAvailabilitySection — recurring weekly availability editor on /profile
 * (staff-portal-v2 Task 10.2). Seven rows (Monday-first display order),
 * each with an available toggle, an optional time window and a note.
 * Single Save via PUT /api/my-portal/availability (full replace).
 *
 * Advisory only: rostering admins see an "Unavailable" hint on the roster
 * grid; nothing blocks them from rostering anyway.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface AvailabilityEntry {
  weekday: number; // 0=Sunday … 6=Saturday (JS Date#getDay)
  available: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

interface AvailabilityResponse {
  availability: AvailabilityEntry[];
}

// Monday-first display order over getDay-convention weekday numbers.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function defaultWeek(): AvailabilityEntry[] {
  // Weekdays available, weekend off — a sensible starting point that the
  // staff member adjusts before their first save.
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    available: weekday !== 0 && weekday !== 6,
    startTime: null,
    endTime: null,
    note: null,
  }));
}

export function MyAvailabilitySection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AvailabilityResponse>({
    queryKey: ["my-availability"],
    queryFn: () =>
      fetchApi<AvailabilityResponse>("/api/my-portal/availability"),
    retry: 2,
    staleTime: 30_000,
  });

  // Local editable copy, seeded from the server set (or the default week
  // when the user has never saved). Adjust-state-during-render pattern —
  // same as the rest of /profile.
  const [entries, setEntries] = useState<AvailabilityEntry[]>(defaultWeek);
  const [dirty, setDirty] = useState(false);
  const [prevData, setPrevData] = useState<AvailabilityResponse | undefined>(
    undefined,
  );
  if (data && data !== prevData) {
    setPrevData(data);
    if (data.availability.length === 7) {
      setEntries(
        [...data.availability].sort((a, b) => a.weekday - b.weekday),
      );
    }
    setDirty(false);
  }

  const save = useMutation({
    mutationFn: () =>
      mutateApi<AvailabilityResponse>("/api/my-portal/availability", {
        method: "PUT",
        body: { availability: entries },
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["my-availability"], res);
      setDirty(false);
      toast({ description: "Availability saved" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });

  function updateEntry(weekday: number, patch: Partial<AvailabilityEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.weekday === weekday ? { ...e, ...patch } : e)),
    );
    setDirty(true);
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted" />
          My Availability
        </h3>
        <Button
          size="sm"
          variant="primary"
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty || save.isPending}
          iconLeft={<Save className="w-4 h-4 mr-1.5" />}
        >
          Save
        </Button>
      </div>
      <p className="text-xs text-muted mb-4">
        Your usual weekly availability. Rostering staff see unavailable days
        as a hint on the roster — talk to your coordinator about one-off
        changes.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {DISPLAY_ORDER.map((weekday) => {
            const entry = entries.find((e) => e.weekday === weekday);
            if (!entry) return null;
            return (
              <div
                key={weekday}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <label className="flex items-center gap-2 sm:w-36 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={entry.available}
                    onChange={(e) =>
                      updateEntry(weekday, {
                        available: e.target.checked,
                        ...(e.target.checked
                          ? {}
                          : { startTime: null, endTime: null }),
                      })
                    }
                    className="rounded border-border text-brand focus:ring-brand/40"
                  />
                  <span
                    className={
                      entry.available
                        ? "text-sm font-medium text-foreground"
                        : "text-sm font-medium text-muted line-through"
                    }
                  >
                    {WEEKDAY_LABELS[weekday]}
                  </span>
                </label>

                {entry.available ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="time"
                      value={entry.startTime ?? ""}
                      onChange={(e) =>
                        updateEntry(weekday, {
                          startTime: e.target.value || null,
                        })
                      }
                      aria-label={`${WEEKDAY_LABELS[weekday]} available from`}
                      className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                    <span className="text-xs text-muted">to</span>
                    <input
                      type="time"
                      value={entry.endTime ?? ""}
                      onChange={(e) =>
                        updateEntry(weekday, {
                          endTime: e.target.value || null,
                        })
                      }
                      aria-label={`${WEEKDAY_LABELS[weekday]} available until`}
                      className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                    <input
                      type="text"
                      value={entry.note ?? ""}
                      onChange={(e) =>
                        updateEntry(weekday, { note: e.target.value || null })
                      }
                      placeholder="Note (optional)"
                      maxLength={500}
                      aria-label={`${WEEKDAY_LABELS[weekday]} availability note`}
                      className="flex-1 min-w-[140px] rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted">Not available</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
