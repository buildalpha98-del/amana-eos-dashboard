"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { RockData } from "@/hooks/useRocks";
import { cn } from "@/lib/utils";

export function RockReviewSection({ rocks }: { rocks: RockData[] | undefined }) {
  if (!rocks || rocks.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No rocks for this quarter. Add them in the Rocks section.
      </div>
    );
  }

  const onTrack = rocks.filter((r) => r.status === "on_track" || r.status === "complete").length;
  const total = rocks.length;

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-800 mb-1">
          Quarterly Rocks
        </h4>
        <p className="text-xs text-emerald-600">
          Quick check: Is each Rock on track or off track? Do not discuss &mdash;
          drop off-track rocks into IDS.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-muted">
          <span className="font-semibold text-foreground">{onTrack}</span> /{" "}
          {total} on track
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (onTrack / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {rocks.map((rock) => (
          <div
            key={rock.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border",
              rock.status === "on_track" || rock.status === "complete"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-red-200 bg-red-50/50"
            )}
          >
            {rock.status === "on_track" || rock.status === "complete" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {rock.title}
              </p>
              <p className="text-xs text-muted">
                {rock.owner?.name ?? "Unassigned"} &middot; {rock.percentComplete}% complete
              </p>
            </div>
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                rock.status === "on_track"
                  ? "bg-emerald-100 text-emerald-700"
                  : rock.status === "complete"
                  ? "bg-green-100 text-green-700"
                  : rock.status === "off_track"
                  ? "bg-red-100 text-red-700"
                  : "bg-surface text-muted"
              )}
            >
              {rock.status.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
