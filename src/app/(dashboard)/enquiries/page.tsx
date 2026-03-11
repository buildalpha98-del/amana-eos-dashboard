"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
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
