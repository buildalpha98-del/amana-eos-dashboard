"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { TodaysOpsItem } from "@/hooks/useDashboardData";

type SortKey =
  | "name"
  | "bscAttended"
  | "ascAttended"
  | "educatorsRostered"
  | "ratioOk"
  | "incidentsToday";

const statusIcon = {
  green: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  amber: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  red: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
};

const statusBg = {
  green: "bg-emerald-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
};

export function TodaysOps({ centres }: { centres: TodaysOpsItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  if (centres.length === 0) return null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "name"); // default asc for name, desc for numbers
    }
  };

  const sorted = [...centres].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "bscAttended":
        cmp = a.bscAttended - b.bscAttended;
        break;
      case "ascAttended":
        cmp = a.ascAttended - b.ascAttended;
        break;
      case "educatorsRostered":
        cmp = a.educatorsRostered - b.educatorsRostered;
        break;
      case "ratioOk":
        cmp = (a.ratioOk ? 1 : 0) - (b.ratioOk ? 1 : 0);
        break;
      case "incidentsToday":
        cmp = a.incidentsToday - b.incidentsToday;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({
    label,
    field,
    className = "",
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors ${className}`}
    >
      {label}
      {sortKey === field &&
        (sortAsc ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        ))}
    </button>
  );

  // Summary counts
  const redCount = centres.filter((c) => c.opsStatus === "red").length;
  const amberCount = centres.filter((c) => c.opsStatus === "amber").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#004E64]" />
          <h3 className="text-sm font-semibold text-gray-900">
            Today&apos;s Operations
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {redCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold">
              <AlertCircle className="w-3 h-3" />
              {redCount} action needed
            </span>
          )}
          {amberCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">
              <AlertTriangle className="w-3 h-3" />
              {amberCount} watch
            </span>
          )}
          {redCount === 0 && amberCount === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              All on track
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="text-left px-4 py-2">
                <SortHeader label="Centre" field="name" />
              </th>
              <th className="text-center px-2 py-2">
                <SortHeader
                  label="BSC"
                  field="bscAttended"
                  className="justify-center"
                />
              </th>
              <th className="text-center px-2 py-2">
                <SortHeader
                  label="ASC"
                  field="ascAttended"
                  className="justify-center"
                />
              </th>
              <th className="text-center px-2 py-2">
                <SortHeader
                  label="Educators"
                  field="educatorsRostered"
                  className="justify-center"
                />
              </th>
              <th className="text-center px-2 py-2">
                <SortHeader
                  label="Ratio"
                  field="ratioOk"
                  className="justify-center"
                />
              </th>
              <th className="text-center px-2 py-2">
                <SortHeader
                  label="Incidents"
                  field="incidentsToday"
                  className="justify-center"
                />
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((c) => (
              <tr
                key={c.id}
                className={`hover:bg-gray-50 transition-colors ${statusBg[c.opsStatus]}`}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {statusIcon[c.opsStatus]}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.name}
                      </p>
                      <p className="text-[10px] text-gray-400">{c.code}</p>
                    </div>
                  </div>
                </td>
                <td className="text-center px-2 py-2.5">
                  <span className="text-sm font-medium text-gray-900">
                    {c.bscAttended}
                  </span>
                  <span className="text-xs text-gray-400">
                    /{c.bscEnrolled}
                  </span>
                </td>
                <td className="text-center px-2 py-2.5">
                  <span className="text-sm font-medium text-gray-900">
                    {c.ascAttended}
                  </span>
                  <span className="text-xs text-gray-400">
                    /{c.ascEnrolled}
                  </span>
                </td>
                <td className="text-center px-2 py-2.5">
                  <span className="text-sm font-semibold text-gray-900">
                    {c.educatorsRostered}
                  </span>
                </td>
                <td className="text-center px-2 py-2.5">
                  {c.ratioOk ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
                      <AlertCircle className="w-3 h-3" />
                      Over
                    </span>
                  )}
                </td>
                <td className="text-center px-2 py-2.5">
                  {c.incidentsToday > 0 ? (
                    <span className="text-xs font-semibold text-red-600">
                      {c.incidentsToday}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <Link
                    href={`/services/${c.id}`}
                    className="text-gray-400 hover:text-[#004E64] transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
        <p className="text-[10px] text-gray-400">
          {centres.length} centre{centres.length !== 1 ? "s" : ""} &middot;
          Totals: BSC {centres.reduce((s, c) => s + c.bscAttended, 0)}/
          {centres.reduce((s, c) => s + c.bscEnrolled, 0)} &middot; ASC{" "}
          {centres.reduce((s, c) => s + c.ascAttended, 0)}/
          {centres.reduce((s, c) => s + c.ascEnrolled, 0)} &middot;{" "}
          {centres.reduce((s, c) => s + c.educatorsRostered, 0)} educators
          rostered
        </p>
      </div>
    </div>
  );
}
