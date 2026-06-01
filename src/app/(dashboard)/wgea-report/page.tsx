"use client";

/**
 * /wgea-report — WGEA workforce-composition report preview + CSV export.
 *
 * Admin-only. Shows a summary preview (counts by gender / employment
 * type / manager category, average tenure) and a "Download CSV" button.
 * Defaults to anonymised IDs; admin can opt-in to names.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Download,
  Loader2,
  Building2,
  Shield,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

type Gender = "woman" | "man" | "non_binary" | "undisclosed";
type Employment =
  | "full_time_permanent"
  | "full_time_fixed_term"
  | "part_time_permanent"
  | "part_time_fixed_term"
  | "casual"
  | "unknown";
type ManagerCat = "key_management" | "other_manager" | "non_manager";

interface WgeaSummary {
  total: number;
  byGender: Record<Gender, number>;
  byEmployment: Record<Employment, number>;
  byManager: Record<ManagerCat, number>;
  averageTenureYears: number | null;
}

interface WgeaResponse {
  rows: unknown[];
  summary: WgeaSummary;
  generatedAt: string;
  filters: { serviceId?: string; anonymise: boolean; includeInactive: boolean };
}

const GENDER_LABEL: Record<Gender, string> = {
  woman: "Women",
  man: "Men",
  non_binary: "Non-binary / self-described",
  undisclosed: "Undisclosed",
};

const EMPLOYMENT_LABEL: Record<Employment, string> = {
  full_time_permanent: "Full-time permanent",
  full_time_fixed_term: "Full-time fixed-term",
  part_time_permanent: "Part-time permanent",
  part_time_fixed_term: "Part-time fixed-term",
  casual: "Casual",
  unknown: "Unknown / no contract",
};

const MANAGER_LABEL: Record<ManagerCat, string> = {
  key_management: "Key management",
  other_manager: "Other manager",
  non_manager: "Non-manager",
};

export default function WgeaReportPage() {
  const [anonymise, setAnonymise] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data, isLoading, error } = useQuery<WgeaResponse, ApiResponseError>({
    queryKey: ["wgea-report", { anonymise, includeInactive }],
    queryFn: () =>
      fetchApi(
        `/api/wgea-report?anonymise=${anonymise}&includeInactive=${includeInactive}`,
      ),
    staleTime: 60_000,
  });

  function downloadCsv() {
    const params = new URLSearchParams({
      format: "csv",
      anonymise: anonymise.toString(),
      includeInactive: includeInactive.toString(),
    });
    window.location.href = `/api/wgea-report?${params}`;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="WGEA Workforce Report">
        <p className="text-sm text-muted">
          Workplace Gender Equality Agency-format workforce composition
          report. Anonymised IDs by default — flip on names only for
          internal HR analysis.
        </p>
      </PageHeader>

      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900 flex items-start gap-2">
        <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">About this report</p>
          <p className="text-xs">
            WGEA reporting is legally mandatory for non-public-sector
            employers with 100+ employees. Generating the report
            voluntarily now gives us a workforce-composition snapshot
            and ensures the data shape is locked in for when we cross
            the threshold.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={anonymise}
            onChange={(e) => setAnonymise(e.target.checked)}
          />
          Anonymise staff IDs (recommended)
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive staff
        </label>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={isLoading || !!error}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6 flex items-center gap-2 text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Building report…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-red-600">Unable to build the report.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat
              label="Headcount"
              value={data.summary.total.toString()}
              icon={Building2}
            />
            <Stat
              label="Avg tenure"
              value={
                data.summary.averageTenureYears != null
                  ? `${data.summary.averageTenureYears}y`
                  : "—"
              }
              icon={BarChart3}
            />
            <Stat
              label="Generated"
              value={new Date(data.generatedAt).toLocaleString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              icon={Download}
            />
          </div>

          <CategoryBlock
            title="Gender"
            data={data.summary.byGender}
            labels={GENDER_LABEL as Record<string, string>}
            total={data.summary.total}
          />
          <CategoryBlock
            title="Employment type"
            data={data.summary.byEmployment}
            labels={EMPLOYMENT_LABEL as Record<string, string>}
            total={data.summary.total}
          />
          <CategoryBlock
            title="Manager category"
            data={data.summary.byManager}
            labels={MANAGER_LABEL as Record<string, string>}
            total={data.summary.total}
          />
        </>
      )}
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
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function CategoryBlock({
  title,
  data,
  labels,
  total,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
  total: number;
}) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <ul className="space-y-2">
        {entries.map(([key, value]) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <li key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{labels[key] ?? key}</span>
                <span className="text-muted">
                  {value} <span className="text-xs">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
