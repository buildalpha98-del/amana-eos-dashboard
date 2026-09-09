"use client";

/**
 * QipEvidenceBrowser — "regulator walks in, show me QA5" surface.
 *
 * Tags ARE the evidence ledger: this browses staff reflections and child
 * observations by NQS quality area / MTOP outcome over a date range, with
 * click-through to the source tab. Pure query — no evidence tables.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQipEvidence } from "@/hooks/useQipSuggestions";
import { MTOP_OUTCOMES } from "@/lib/schemas/staff-reflection";

const QA_OPTIONS = [
  { value: 1, label: "QA1 · Educational program" },
  { value: 2, label: "QA2 · Health & safety" },
  { value: 3, label: "QA3 · Physical environment" },
  { value: 4, label: "QA4 · Staffing" },
  { value: 5, label: "QA5 · Relationships" },
  { value: 6, label: "QA6 · Partnerships" },
  { value: 7, label: "QA7 · Governance" },
];

const RANGE_PRESETS = [
  { key: "term", label: "This term (~10 wks)", weeks: 10 },
  { key: "month", label: "Last 4 weeks", weeks: 4 },
  { key: "week", label: "This week", weeks: 1 },
] as const;

export function QipEvidenceBrowser({ serviceId }: { serviceId: string }) {
  const [qa, setQa] = useState<number | undefined>(undefined);
  const [mtop, setMtop] = useState<string | undefined>(undefined);
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_PRESETS)[number]["key"]>("term");
  // Anchor "now" once per mount so render stays pure (react-hooks/purity).
  const [mountedAt] = useState(() => Date.now());

  const from = useMemo(() => {
    const weeks = RANGE_PRESETS.find((r) => r.key === rangeKey)?.weeks ?? 10;
    return new Date(mountedAt - weeks * 7 * 86400000).toISOString();
  }, [rangeKey, mountedAt]);

  const { data, isLoading } = useQipEvidence(serviceId, { qa, mtop, from });
  const items = data?.items ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-[color:var(--color-primary,#004E64)]" />
        <h3 className="text-sm font-semibold text-gray-800">Evidence browser</h3>
        <span className="text-[11px] text-gray-400">
          reflections & observations by quality area / outcome
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={qa ?? ""}
          onChange={(e) => setQa(e.target.value ? Number(e.target.value) : undefined)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">All quality areas</option>
          {QA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={mtop ?? ""}
          onChange={(e) => setMtop(e.target.value || undefined)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">All MTOP outcomes</option>
          {MTOP_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium border",
                rangeKey === r.key
                  ? "bg-[color:var(--color-primary,#004E64)] text-white border-transparent"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {qa && !mtop && (
        <p className="text-[11px] text-gray-400">
          Observations carry MTOP tags only, so a quality-area filter shows reflections.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 py-4">Loading evidence…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          No evidence for this filter yet — daily reflections feed this automatically.
        </p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={
                  item.kind === "reflection"
                    ? `/services/${serviceId}?tab=compliance&sub=reflections`
                    : `/services/${serviceId}?tab=program&sub=observations`
                }
                className="block rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-gray-300 transition"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                      item.kind === "reflection"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700",
                    )}
                  >
                    {item.kind}
                  </span>
                  {item.qualityAreas.map((q) => (
                    <span
                      key={q}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-600"
                    >
                      QA{q}
                    </span>
                  ))}
                  {item.mtopOutcomes.map((m) => (
                    <span
                      key={m}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                    >
                      {m}
                    </span>
                  ))}
                  {item.aiTagged && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                      <Sparkles className="w-2.5 h-2.5" /> AI-tagged
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-400">
                    {new Date(item.createdAt).toLocaleDateString("en-AU")} ·{" "}
                    {item.author?.name}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1.5">{item.excerpt}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
