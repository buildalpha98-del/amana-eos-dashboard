"use client";

/**
 * Diversity & Inclusion dashboard — admin aggregate D&I stats.
 * Rendered as the "Diversity & Inclusion" tab of /workforce-reports
 * (moved out of the retired /diversity-dashboard page, 2026-07-05).
 *
 * Shows opt-in disclosure rate + per-category counts with min-cell-size
 * suppression (categories with <3 respondents are shown as "<3"). The
 * server enforces this too — clients never see raw counts below the
 * threshold.
 *
 * Designed for WGEA-prep (Workplace Gender Equality Agency reporting
 * for orgs ≥ 100 employees) and ongoing workforce-planning use.
 */

import { useQuery } from "@tanstack/react-query";
import { Heart, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

type Cell = number | "<3";

interface DiversityStats {
  totalRespondents: number;
  totalActiveStaff: number;
  minCellSize: number;
  gender: Record<string, Cell>;
  indigenous: Record<string, Cell>;
  disability: Record<string, Cell>;
  carer: Record<string, Cell>;
  veteran: Record<string, Cell>;
  bornInAustralia: Record<string, Cell>;
}

const GENDER_LABEL: Record<string, string> = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  prefer_to_self_describe: "Self-described",
  prefer_not_to_say: "Prefer not to say",
  undisclosed: "Not specified",
};

const INDIGENOUS_LABEL: Record<string, string> = {
  none: "Neither",
  aboriginal: "Aboriginal",
  torres_strait_islander: "Torres Strait Islander",
  both: "Both",
  prefer_not_to_say: "Prefer not to say",
  undisclosed: "Not specified",
};

const DISABILITY_LABEL: Record<string, string> = {
  none: "No disability",
  with_disability: "With disability",
  prefer_not_to_say: "Prefer not to say",
  undisclosed: "Not specified",
};

const CARER_LABEL: Record<string, string> = {
  none: "No carer responsibilities",
  parent_carer: "Parent carer",
  family_carer: "Family carer",
  both: "Both",
  prefer_not_to_say: "Prefer not to say",
  undisclosed: "Not specified",
};

const YES_NO_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  undisclosed: "Not specified",
};

export function DiversityDashboardContent() {
  const { data, isLoading, error } = useQuery<DiversityStats, ApiResponseError>({
    queryKey: ["diversity-stats"],
    queryFn: () => fetchApi("/api/diversity-stats"),
    retry: 2,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-64 bg-border rounded" />
          <div className="h-32 bg-border/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-red-600">
          Unable to load diversity statistics.
        </p>
      </div>
    );
  }

  const disclosureRate =
    data.totalActiveStaff > 0
      ? Math.round((data.totalRespondents / data.totalActiveStaff) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <p className="text-sm text-muted">
        Aggregated workforce diversity, opt-in. Individual values are
        never displayed.
      </p>

      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900 flex items-start gap-2">
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Privacy</p>
          <p className="text-xs mt-1">
            Counts smaller than {data.minCellSize} are shown as
            &ldquo;&lt;{data.minCellSize}&rdquo; so individuals cannot
            be identified. Categories with zero respondents are hidden
            entirely. Staff choose what to share and can withdraw consent
            at any time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Active staff"
          value={data.totalActiveStaff.toString()}
          icon={UsersIcon}
        />
        <Stat
          label="Respondents"
          value={data.totalRespondents.toString()}
          icon={Heart}
        />
        <Stat
          label="Disclosure rate"
          value={`${disclosureRate}%`}
          icon={ShieldCheck}
        />
      </div>

      <CategoryBlock
        title="Gender identity"
        labels={GENDER_LABEL}
        data={data.gender}
        total={data.totalRespondents}
      />
      <CategoryBlock
        title="Aboriginal or Torres Strait Islander"
        labels={INDIGENOUS_LABEL}
        data={data.indigenous}
        total={data.totalRespondents}
      />
      <CategoryBlock
        title="Disability"
        labels={DISABILITY_LABEL}
        data={data.disability}
        total={data.totalRespondents}
      />
      <CategoryBlock
        title="Carer responsibilities"
        labels={CARER_LABEL}
        data={data.carer}
        total={data.totalRespondents}
      />
      <CategoryBlock
        title="Born in Australia"
        labels={YES_NO_LABEL}
        data={data.bornInAustralia}
        total={data.totalRespondents}
      />
      <CategoryBlock
        title="ADF veteran"
        labels={YES_NO_LABEL}
        data={data.veteran}
        total={data.totalRespondents}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted" />
        <p className="text-xs uppercase font-semibold text-muted tracking-wider">
          {label}
        </p>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function CategoryBlock({
  title,
  labels,
  data,
  total,
}: {
  title: string;
  labels: Record<string, string>;
  data: Record<string, Cell>;
  total: number;
}) {
  // Sort entries by raw count (suppressed values sort last).
  const entries = Object.entries(data)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => {
      const av = typeof a[1] === "number" ? a[1] : -1;
      const bv = typeof b[1] === "number" ? b[1] : -1;
      return bv - av;
    });

  if (entries.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted italic">
          No respondents in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <ul className="space-y-2">
        {entries.map(([key, value]) => {
          const label = labels[key] ?? key;
          const isSuppressed = value === "<3";
          const pct =
            !isSuppressed && total > 0
              ? Math.round((value / total) * 100)
              : null;
          return (
            <li
              key={key}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex-1 text-foreground">{label}</span>
              <span className="flex items-center gap-2 text-muted">
                {pct !== null && (
                  <span className="text-xs">({pct}%)</span>
                )}
                <span className="font-semibold text-foreground tabular-nums w-8 text-right">
                  {value}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
