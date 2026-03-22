"use client";

import { useState, useMemo } from "react";
import { Building2, CheckCircle2, AlertTriangle, XCircle, Globe, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { useCentreCoverage } from "@/hooks/useMarketing";
import { cn } from "@/lib/utils";
import { PhotoComplianceWidget } from "./PhotoComplianceWidget";

interface CoverageServiceRaw {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  totalPosts: number;
  postsThisMonth: number;
  postsLastMonth: number;
  activeCampaigns: number;
  lastPostDate: string | null;
  status: "active" | "moderate" | "neglected";
}

interface CoverageDataRaw {
  centres: CoverageServiceRaw[];
  summary: {
    totalCentres: number;
    activeCentres: number;
    moderateCentres: number;
    neglectedCentres: number;
    globalPosts: number;
  };
}

// Normalised shape used internally by the component
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

  // Normalise API shape → internal CoverageData
  const coverage: CoverageData | undefined = useMemo(() => {
    if (!data) return undefined;
    const raw = data as CoverageDataRaw;
    // Handle both old (flat) and new (nested summary) response shapes
    if (raw.centres && raw.summary) {
      return {
        ...raw.summary,
        services: raw.centres.map((c) => ({
          id: c.serviceId,
          name: c.serviceName,
          code: c.serviceCode,
          state: null, // API doesn't return state yet
          postsThisMonth: c.postsThisMonth,
          postsLastMonth: c.postsLastMonth,
          activeCampaigns: c.activeCampaigns,
          lastPostDate: c.lastPostDate,
          status: c.status,
        })),
      };
    }
    // Fallback: data might already be in the flat shape
    return data as unknown as CoverageData;
  }, [data]);

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
      <div className="flex items-center justify-center py-20 text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading coverage data...
      </div>
    );
  }

  if (!coverage || coverage.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
        <Building2 className="mb-3 h-10 w-10 text-muted/50" />
        <p className="text-lg font-medium text-foreground/80">No services found</p>
        <p className="mt-1 text-sm text-muted">
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
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-surface">
              <Building2 className="w-5 h-5 text-muted" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {coverage.totalCentres}
              </p>
              <p className="text-sm text-muted">Total Centres</p>
            </div>
          </div>
        </div>

        {/* Active */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {coverage.activeCentres}
              </p>
              <p className="text-sm text-muted">Active</p>
            </div>
          </div>
        </div>

        {/* Moderate */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {coverage.moderateCentres}
              </p>
              <p className="text-sm text-muted">Moderate</p>
            </div>
          </div>
        </div>

        {/* Neglected */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {coverage.neglectedCentres}
              </p>
              <p className="text-sm text-muted">Neglected</p>
            </div>
          </div>
        </div>

        {/* Global Posts */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {coverage.globalPosts}
              </p>
              <p className="text-sm text-muted">Global Posts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Photo Compliance (Last 7 Days) */}
      <div>
        <h3 className="text-sm font-semibold text-foreground/80 mb-3">
          Daily Photo Compliance (Last 7 Days)
        </h3>
        <PhotoComplianceWidget />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left text-xs font-medium uppercase tracking-wider text-muted">
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  Centre Name <SortIcon col="name" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("code")}
                >
                  Code <SortIcon col="code" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("state")}
                >
                  State <SortIcon col="state" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("postsThisMonth")}
                >
                  Posts This Month <SortIcon col="postsThisMonth" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("postsLastMonth")}
                >
                  Last Month <SortIcon col="postsLastMonth" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("activeCampaigns")}
                >
                  Active Campaigns <SortIcon col="activeCampaigns" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("lastPostDate")}
                >
                  Last Post <SortIcon col="lastPostDate" />
                </th>
                <th
                  className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("status")}
                >
                  Status <SortIcon col="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((svc) => (
                <tr
                  key={svc.id}
                  onClick={() => onSelectService(svc.id)}
                  className="cursor-pointer hover:bg-surface transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {svc.name}
                  </td>
                  <td className="px-4 py-3 text-muted">{svc.code}</td>
                  <td className="px-4 py-3 text-muted">
                    {svc.state ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {svc.postsThisMonth}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {svc.postsLastMonth}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {svc.activeCampaigns}
                  </td>
                  <td className="px-4 py-3 text-muted">
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
