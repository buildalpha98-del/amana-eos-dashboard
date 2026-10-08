"use client";

/**
 * "Room configuration suggestions" — the always-visible box at the top of
 * Rooms & fees (2026-10-08, after OWNA's): rooms over the approved places,
 * capacities that leave an educator part-used, rooms with no capacity.
 * Uses the saved setup (analyseSavedRooms); the edit dialog keeps its own
 * live version while typing. Says so when everything checks out — silence
 * would read as "didn't check".
 */
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { analyseSavedRooms } from "@/lib/room-configuration";

const QUICK_LINKS = [
  { href: "#fee-policy", label: "Fee policy" },
  { href: "#fee-changes", label: "Upcoming fee changes" },
  { href: "#blockout-dates", label: "Block-out dates" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RoomConfigurationSuggestions({ service }: { service: any }) {
  const advice = analyseSavedRooms(service);
  const errors = advice.filter((a) => a.level === "error");

  return (
    <section
      className={
        advice.length === 0
          ? "rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4"
          : "rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4"
      }
      data-testid="room-suggestions"
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {advice.length === 0 ? (
          <CheckCircle2 className="w-4 h-4 text-success" aria-hidden />
        ) : (
          <Info className="w-4 h-4 text-amber-700 dark:text-amber-300" aria-hidden />
        )}
        <h4 className="text-sm font-semibold text-foreground">Room configuration suggestions</h4>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {QUICK_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md bg-brand px-2 py-0.5 text-2xs font-semibold text-white hover:bg-brand-hover"
            >
              {l.label}
            </a>
          ))}
        </span>
      </div>
      {advice.length === 0 ? (
        <p className="text-sm text-foreground/80">
          Every room fits within your approved places and uses its educators fully.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {[...errors, ...advice.filter((a) => a.level !== "error")].map((a, i) => (
            <li key={`${a.key ?? "service"}-${i}`} className="flex items-start gap-2 text-sm text-foreground/90">
              {a.level === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden />
              ) : (
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              )}
              <span>
                {a.roomName && <strong>{a.roomName} — </strong>}
                {a.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
