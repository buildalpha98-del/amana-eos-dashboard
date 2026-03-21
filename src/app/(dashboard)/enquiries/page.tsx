"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { ServiceFilter } from "@/components/marketing/ServiceFilter";
import { EnquiryKanban } from "@/components/enquiries/EnquiryKanban";
import { EnquiryStatsBar } from "@/components/enquiries/EnquiryStatsBar";
import { NewEnquiryModal } from "@/components/enquiries/NewEnquiryModal";
import { EnquiryDetailPanel } from "@/components/enquiries/EnquiryDetailPanel";

export default function EnquiriesPage() {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enquiriesData } = useQuery<{ enquiries: any[] }>({
    queryKey: ["enquiries-export", selectedServiceId, refreshKey],
    queryFn: async () => {
      const url = selectedServiceId
        ? `/api/enquiries?serviceId=${selectedServiceId}&limit=500`
        : "/api/enquiries?limit=500";
      const res = await fetch(url);
      if (!res.ok) return { enquiries: [] };
      return res.json();
    },
  });
  const allEnquiries = enquiriesData?.enquiries || [];

  const { data: sentimentSummary } = useQuery({
    queryKey: ["sentiment-summary"],
    queryFn: async () => {
      const res = await fetch("/api/sentiment/summary");
      if (!res.ok) return null;
      return res.json();
    },
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Parent Enquiry Pipeline
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Track parent enquiries from first contact through to retention
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ServiceFilter
            value={selectedServiceId}
            onChange={setSelectedServiceId}
          />
          <ExportButton
            onClick={() =>
              exportToCsv(
                `amana-enquiries-${new Date().toISOString().slice(0, 10)}`,
                allEnquiries,
                [
                  { header: "ID", accessor: (e) => e.id },
                  { header: "Parent Name", accessor: (e) => e.parentName ?? "" },
                  { header: "Email", accessor: (e) => e.parentEmail ?? "" },
                  { header: "Phone", accessor: (e) => e.parentPhone ?? "" },
                  { header: "Child Name", accessor: (e) => e.childName ?? "" },
                  { header: "Centre", accessor: (e) => e.service?.name ?? "" },
                  { header: "Stage", accessor: (e) => e.stage ?? "" },
                  { header: "Source", accessor: (e) => e.source ?? "" },
                  { header: "Created", accessor: (e) => e.createdAt ? new Date(e.createdAt).toLocaleDateString("en-AU") : "" },
                ],
              )
            }
            disabled={allEnquiries.length === 0}
          />
          <button
            onClick={() => setShowNewEnquiry(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            New Enquiry
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <EnquiryStatsBar serviceId={selectedServiceId} refreshKey={refreshKey} />

      {/* Sentiment Summary */}
      {sentimentSummary && sentimentSummary.total > 0 && (
        <div className="flex items-center gap-4 mb-4 px-4 py-2 bg-gray-50 rounded-lg text-sm">
          <span className="text-gray-500 font-medium">This Week&apos;s Sentiment:</span>
          <span className="text-emerald-600">{sentimentSummary.positive} positive</span>
          <span className="text-gray-500">{sentimentSummary.neutral} neutral</span>
          <span className="text-red-500">{sentimentSummary.negative} negative</span>
          {sentimentSummary.avgScore !== null && (
            <span className="text-gray-400 text-xs">
              (avg: {sentimentSummary.avgScore.toFixed(2)})
            </span>
          )}
        </div>
      )}

      {/* Kanban board */}
      <EnquiryKanban
        serviceId={selectedServiceId}
        refreshKey={refreshKey}
        onSelectEnquiry={setSelectedEnquiryId}
      />

      {/* New enquiry modal */}
      {showNewEnquiry && (
        <NewEnquiryModal
          onClose={() => setShowNewEnquiry(false)}
          onCreated={handleRefresh}
        />
      )}

      {/* Detail panel */}
      {selectedEnquiryId && (
        <EnquiryDetailPanel
          enquiryId={selectedEnquiryId}
          onClose={() => setSelectedEnquiryId(null)}
          onUpdated={handleRefresh}
        />
      )}
    </div>
  );
}
