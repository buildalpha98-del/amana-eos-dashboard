"use client";

import { useState, useMemo } from "react";
import { Building2, CheckCircle2, AlertTriangle, XCircle, Globe, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { useCentreCoverage } from "@/hooks/useMarketing";
import { cn } from "@/lib/utils";

interface CoverageService {
  id: string;
  name: string;
  code: string;
  state: string | null;
  postsThisMonth: number;
  postsLastMonth: number;
  activeCampaigns: number;
  lastPostDate: string | null;
  status: "active" | "moderate" | "neglected";
}

interface CoverageData {
  totalCentres: number;
  activeCentres: number;
  moderateCentres: number;
  neglectedCentres: number;
  globalPosts: number;
  services: CoverageService[];
}

type SortKey = "name" | "code" | "state" | "postsThisMonth" | "postsLastMonth" | "activeCampaigns" | "lastPostDate" | "status";
type SortDir = "asc" | "desc";

interface CoverageTabProps {
  onSelectService: (serviceId: string) => void;
}

const statusOrder: Record<string, number> = { active: 0, moderate: 1, neglected: 2 };

export function CoverageTab({ onSelectService }: CoverageTabProps) {
  const { data, isLoading } = useCentreCoverage();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const coverage = data as CoverageData | undefined;

  const sorted = useMemo(() => {
    if (!coverage?.services) return [];
    const items = [...coverage.services];
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "state":
          cmp = (a.state ?? "").localeCompare(b.state ?? "");
          break;
        case "postsThisMonth":
          cmp = a.postsThisMonth - b.postsThisMonth;
          break;
        case "postsLastMonth":
          cmp = a.postsLastMonth - b.postsLastMonth;
          break;
        case "activeCampaigns":
          cmp = a.activeCampaigns - b.activeCampaigns;
          break;
        case "lastPostDate":
          cmp = (a.lastPostDate ?? "").localeCompare(b.lastPostDate ?? "");
          break;
        case "status":
          cmp = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [coverage?.services, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-0.5" />
    );
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading coverage data...
      </div>
    );
  }

  if (!coverage || coverage.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16">
        <Building2 className="mb-3 h-10 w-10 text-gray-300" />
        <p className="text-lg font-medium text-gray-700">No services found</p>
        <p className="mt-1 text-sm text-gray-500">
          Add services to track marketing coverage across centres.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Centres */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
              <Building2 className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {coverage.totalCentres}
              </p>
              <p className="text-sm text-gray-500">Total Centres</p>
            </div>
          </div>
        </div>

        {/* Active */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {coverage.activeCentres}
              </p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>

        {/* Moderate */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {coverage.moderateCentres}
              </p>
              <p className="text-sm text-gray-500">Moderate</p>
            </div>
          </div>
        </div>

        {/* Neglected */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {coverage.neglectedCentres}
              </p>
              <p className="text-sm text-gray-500">Neglected</p>
            </div>
          </div>
        </div>

        {/* Global Posts */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {coverage.globalPosts}
              </p>
              <p className="text-sm text-gray-500">Global Posts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("name")}
                >
                  Centre Name <SortIcon col="name" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("code")}
                >
                  Code <SortIcon col="code" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("state")}
                >
                  State <SortIcon col="state" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("postsThisMonth")}
                >
                  Posts This Month <SortIcon col="postsThisMonth" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("postsLastMonth")}
                >
                  Last Month <SortIcon col="postsLastMonth" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("activeCampaigns")}
                >
                  Active Campaigns <SortIcon col="activeCampaigns" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("lastPostDate")}
                >
                  Last Post <SortIcon col="lastPostDate" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("status")}
                >
                  Status <SortIcon col="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((svc) => (
                <tr
                  key={svc.id}
                  onClick={() => onSelectService(svc.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {svc.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{svc.code}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {svc.state ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {svc.postsThisMonth}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {svc.postsLastMonth}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {svc.activeCampaigns}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(svc.lastPostDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        svc.status === "active" &&
                          "bg-green-100 text-green-700",
                        svc.status === "moderate" &&
                          "bg-amber-100 text-amber-700",
                        svc.status === "neglected" &&
                          "bg-red-100 text-red-700"
                      )}
                    >
                      {svc.status.charAt(0).toUpperCase() +
                        svc.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
