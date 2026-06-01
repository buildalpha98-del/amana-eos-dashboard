"use client";

/**
 * MyPositionDescriptionCard — staff read-only view of their assigned PD.
 *
 * The card stays quiet (renders null) when no PD is assigned. When one
 * is assigned, it shows the title + summary inline and expands into
 * the full content on click.
 *
 * 2026-06-01: introduced as part of the position-descriptions library.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ChevronDown, ChevronUp } from "lucide-react";
import type { Role } from "@prisma/client";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

interface PositionDescription {
  id: string;
  title: string;
  summary: string;
  responsibilities: string;
  selectionCriteria: string;
  qualifications: string;
  targetRole: Role | null;
}

export function MyPositionDescriptionCard() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useQuery<
    { positionDescription: PositionDescription | null },
    ApiResponseError
  >({
    queryKey: ["my-position-description"],
    queryFn: () => fetchApi("/api/position-descriptions?mine=1"),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return null;
  if (error || !data?.positionDescription) return null;

  const pd = data.positionDescription;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Briefcase className="w-5 h-5 text-brand flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              My Position Description
            </h3>
            <p className="text-sm text-muted mt-0.5 truncate">{pd.title}</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
          <Section label="Summary" value={pd.summary} />
          <Section label="Key responsibilities" value={pd.responsibilities} />
          <Section label="Selection criteria" value={pd.selectionCriteria} />
          <Section label="Qualifications" value={pd.qualifications} />
        </div>
      )}
    </div>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
        {label}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}
