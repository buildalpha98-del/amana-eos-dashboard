"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import {
  bookingPrefsSchema,
  type FortnightPattern,
} from "@/lib/service-settings";
import type { ChildProfileRecord } from "../types";

interface RoomDaysTabProps {
  child: ChildProfileRecord;
  canEdit: boolean;
}

const SESSION_TYPES = [
  { key: "bsc", label: "Before School" },
  { key: "asc", label: "After School" },
  { key: "vc", label: "Vacation Care" },
] as const;
type SessionKey = (typeof SESSION_TYPES)[number]["key"];

const DAYS: { key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

type DayKey = (typeof DAYS)[number]["key"];

const WEEKS: { key: "week1" | "week2"; label: string }[] = [
  { key: "week1", label: "Week 1" },
  { key: "week2", label: "Week 2" },
];

type WeekKey = (typeof WEEKS)[number]["key"];

function emptyPattern(): FortnightPattern {
  return {
    week1: { bsc: [], asc: [], vc: [] },
    week2: { bsc: [], asc: [], vc: [] },
  };
}

function parsePattern(raw: unknown): FortnightPattern {
  const parsed = bookingPrefsSchema.safeParse(raw ?? {});
  if (!parsed.success) return emptyPattern();
  const fp = parsed.data.fortnightPattern;
  if (!fp) return emptyPattern();
  return {
    week1: {
      bsc: fp.week1.bsc ?? [],
      asc: fp.week1.asc ?? [],
      vc: fp.week1.vc ?? [],
    },
    week2: {
      bsc: fp.week2.bsc ?? [],
      asc: fp.week2.asc ?? [],
      vc: fp.week2.vc ?? [],
    },
  };
}

export function RoomDaysTab({ child, canEdit }: RoomDaysTabProps) {
  const router = useRouter();
  const initial = useMemo(() => parsePattern(child.bookingPrefs), [child.bookingPrefs]);
  const [pattern, setPattern] = useState<FortnightPattern>(initial);
  const [saving, setSaving] = useState(false);

  const toggleCell = useCallback(
    (week: WeekKey, session: SessionKey, day: DayKey) => {
      if (!canEdit) return;
      setPattern((prev) => {
        const current = (prev[week][session] ?? []) as DayKey[];
        const exists = current.includes(day);
        const nextDays = exists
          ? current.filter((d) => d !== day)
          : [...current, day];
        return {
          ...prev,
          [week]: {
            ...prev[week],
            [session]: nextDays,
          },
        };
      });
    },
    [canEdit],
  );

  const isDirty = useMemo(
    () => JSON.stringify(pattern) !== JSON.stringify(initial),
    [pattern, initial],
  );

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await mutateApi(`/api/children/${child.id}`, {
        method: "PATCH",
        body: { bookingPrefs: { fortnightPattern: pattern } },
      });
      toast({ description: "Fortnight pattern saved" });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }, [child.id, pattern, router]);

  const handleReset = useCallback(() => {
    setPattern(initial);
  }, [initial]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Fortnight booking pattern
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Select the days this child is booked for each session, across a 2-week cycle.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving || !isDirty}
                className="text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface transition-colors disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {WEEKS.map((week) => (
            <div key={week.key}>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                {week.label}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 pr-3 font-medium">Session</th>
                      {DAYS.map((d) => (
                        <th key={d.key} className="p-1 text-center font-medium">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SESSION_TYPES.map((session) => (
                      <tr key={session.key} className="border-t border-border">
                        <td className="py-2 pr-3 text-sm text-foreground whitespace-nowrap">
                          {session.label}
                        </td>
                        {DAYS.map((d) => {
                          const days = (pattern[week.key][session.key] ?? []) as DayKey[];
                          const checked = days.includes(d.key);
                          const cellId = `${week.key}-${session.key}-${d.key}`;
                          return (
                            <td key={d.key} className="p-1 text-center">
                              <input
                                id={cellId}
                                type="checkbox"
                                aria-label={`${week.label} ${session.label} ${d.label}`}
                                checked={checked}
                                disabled={!canEdit}
                                onChange={() =>
                                  toggleCell(week.key, session.key, d.key)
                                }
                                className="h-4 w-4 rounded border-border text-brand focus:ring-brand disabled:opacity-50"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {!canEdit && (
          <p className="mt-4 text-xs text-muted">
            Only coordinators and admins can change the fortnight pattern.
          </p>
        )}
      </div>
    </div>
  );
}
