"use client";

import { useState, useMemo } from "react";
import {
  useConversions,
  useUpdateConversion,
  type ConversionOpportunity,
} from "@/hooks/useConversions";
import { useServices } from "@/hooks/useServices";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Repeat,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  DollarSign,
  Filter,
  Calculator,
} from "lucide-react";

// ── Pricing constants ────────────────────────────────────

const RATES = {
  bsc: { regular: 26, casual: 31 },
  asc: { regular: 36, casual: 41 },
};

const WEEKS_PER_YEAR = 40; // school weeks

// ── Status config ────────────────────────────────────────

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  identified: {
    label: "Identified",
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  contacted: {
    label: "Contacted",
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
  converted: {
    label: "Converted",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
  },
  declined: { label: "Declined", color: "text-gray-500", bg: "bg-gray-100" },
};

const statusTabs = [
  { key: "", label: "All" },
  { key: "identified", label: "Identified" },
  { key: "contacted", label: "Contacted" },
  { key: "converted", label: "Converted" },
  { key: "declined", label: "Declined" },
];

// ── Revenue Calculator ───────────────────────────────────

function RevenueCalculator({
  opportunities,
}: {
  opportunities: ConversionOpportunity[];
}) {
  const actionable = opportunities.filter(
    (o) => o.status === "identified" || o.status === "contacted"
  );

  // Calculate potential annual revenue increase if all actionable convert
  // Converting casual → regular means MORE sessions (predictable) but LOWER per-session rate
  // The real value is in retention, but we show the rate difference impact
  const totalPotential = actionable.reduce((sum, opp) => {
    const rates = RATES[opp.sessionType];
    // Assume each casual booking = 1 session/week when converted to regular
    const sessionsPerWeek = Math.min(opp.casualCount / 2, 5); // estimate weekly frequency from 14-day count
    // Revenue increase from retention (casual families who might churn vs regular who stay)
    // Conservative: assume 2 extra sessions/week retained at regular rate
    const retainedRevenue = sessionsPerWeek * rates.regular * WEEKS_PER_YEAR;
    return sum + retainedRevenue;
  }, 0);

  if (actionable.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Calculator className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            Revenue Opportunity
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            If {actionable.length} famil{actionable.length === 1 ? "y" : "ies"}{" "}
            convert to regular bookings, estimated annual revenue from retained
            sessions:
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            ${totalPotential.toLocaleString()}
            <span className="text-sm font-normal text-emerald-500">
              {" "}
              /year
            </span>
          </p>
          <p className="text-[10px] text-emerald-500 mt-1">
            Based on {WEEKS_PER_YEAR} school weeks. BSC $
            {RATES.bsc.regular}/session, ASC ${RATES.asc.regular}/session
            (regular rates).
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Opportunity Row ──────────────────────────────────────

function OpportunityRow({
  opp,
  onUpdateStatus,
  isPending,
}: {
  opp: ConversionOpportunity;
  onUpdateStatus: (id: string, status: string) => void;
  isPending: boolean;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(opp.notes || "");
  const updateConversion = useUpdateConversion();

  const config = statusConfig[opp.status] || statusConfig.identified;
  const rates = RATES[opp.sessionType];
  const sessionsPerWeek = Math.min(opp.casualCount / 2, 5);
  const annualValue = sessionsPerWeek * rates.regular * WEEKS_PER_YEAR;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">
              {opp.service.name}
            </p>
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {opp.service.code}
            </span>
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full",
                config.bg,
                config.color
              )}
            >
              {config.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>
              Family:{" "}
              <span className="font-medium text-gray-700">{opp.familyRef}</span>
            </span>
            <span>|</span>
            <span>
              Session:{" "}
              <span className="font-medium text-gray-700 uppercase">
                {opp.sessionType}
              </span>
            </span>
            <span>|</span>
            <span>
              Casual bookings:{" "}
              <span className="font-semibold text-gray-700">
                {opp.casualCount}
              </span>{" "}
              in 14 days
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>
              Period: {new Date(opp.periodStart).toLocaleDateString()} &ndash;{" "}
              {new Date(opp.periodEnd).toLocaleDateString()}
            </span>
            {opp.contactedAt && (
              <span>
                | Contacted: {new Date(opp.contactedAt).toLocaleDateString()}
              </span>
            )}
            {opp.convertedAt && (
              <span>
                | Converted: {new Date(opp.convertedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <DollarSign className="w-3 h-3 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">
              Est. ${annualValue.toLocaleString()}/yr if converted
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {opp.status === "identified" && (
            <button
              onClick={() => onUpdateStatus(opp.id, "contacted")}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Phone className="w-3 h-3" />
              Contacted
            </button>
          )}
          {(opp.status === "identified" || opp.status === "contacted") && (
            <>
              <button
                onClick={() => onUpdateStatus(opp.id, "converted")}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3 h-3" />
                Converted
              </button>
              <button
                onClick={() => onUpdateStatus(opp.id, "declined")}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" />
                Decline
              </button>
            </>
          )}
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Notes
          </button>
        </div>
      </div>

      {/* Notes panel */}
      {showNotes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex gap-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes about this conversion opportunity..."
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
            <button
              onClick={() => {
                updateConversion.mutate({
                  id: opp.id,
                  status: opp.status,
                  notes,
                });
                setShowNotes(false);
              }}
              disabled={updateConversion.isPending}
              className="px-3 py-1 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 self-end"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────

export default function ConversionsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");

  const { data: services } = useServices();
  const { data, isLoading, error, refetch } = useConversions({
    serviceId: serviceFilter || undefined,
    status: statusFilter || undefined,
    sessionType: sessionFilter || undefined,
  });
  const updateConversion = useUpdateConversion();

  const opportunities = data?.opportunities || [];
  const stats = data?.stats;

  // Group by service for the breakdown
  const byService = useMemo(() => {
    const map = new Map<string, ConversionOpportunity[]>();
    for (const opp of opportunities) {
      const key = opp.service.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opp);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [opportunities]);

  const handleUpdateStatus = (id: string, status: string) => {
    updateConversion.mutate({ id, status });
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Casual &rarr; Regular Conversions
          </h2>
          <p className="text-gray-500 mt-1 line-clamp-2">
            Identify and convert repeat casual families to regular bookings
          </p>
        </div>
        <ErrorState
          title="Failed to load conversions"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Casual → Regular Conversions
        </h2>
        <p className="text-gray-500 mt-1 line-clamp-2">
          Identify and convert repeat casual families to regular bookings
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard title="Total Opportunities" value={stats.total} />
          <StatCard
            title="Identified"
            value={stats.identified}
            valueColor="text-blue-600"
          />
          <StatCard
            title="Contacted"
            value={stats.contacted}
            valueColor="text-amber-600"
          />
          <StatCard
            title="Converted"
            value={stats.converted}
            valueColor="text-emerald-600"
          />
          <StatCard
            title="Casual Bookings"
            value={stats.totalCasualBookings}
            valueColor="text-gray-600"
          />
        </div>
      )}

      {/* Revenue Calculator */}
      {opportunities.length > 0 && (
        <RevenueCalculator opportunities={opportunities} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                statusFilter === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Centres</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Sessions</option>
            <option value="bsc">BSC</option>
            <option value="asc">ASC</option>
          </select>
        </div>
      </div>

      {/* Opportunity List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <span className="ml-3 text-gray-500">Loading conversions...</span>
        </div>
      ) : opportunities.length > 0 ? (
        <div className="space-y-6">
          {byService.map(([serviceName, opps]) => (
            <div key={serviceName}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {serviceName}
                </h3>
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  {opps.length} opportunit{opps.length === 1 ? "y" : "ies"}
                </span>
              </div>
              <div className="space-y-2">
                {opps.map((opp) => (
                  <OpportunityRow
                    key={opp.id}
                    opp={opp}
                    onUpdateStatus={handleUpdateStatus}
                    isPending={updateConversion.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Repeat}
          title="No conversion opportunities"
          description={
            statusFilter
              ? "Try adjusting your filters"
              : "The weekly analysis cron will detect repeat casual families automatically"
          }
          variant="inline"
        />
      )}
    </div>
  );
}
