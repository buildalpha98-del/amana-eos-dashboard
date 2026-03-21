"use client";

import { useState, useCallback } from "react";
import { FolderLock } from "lucide-react";
import { useDataRoom } from "@/hooks/useDataRoom";
import { DATA_ROOM_SECTIONS } from "@/lib/data-room-config";
import { ExitReadinessScore } from "@/components/data-room/ExitReadinessScore";
import { DataRoomSection } from "@/components/data-room/DataRoomSection";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV, type LegacyCsvColumn } from "@/lib/csv-export";
import { toast } from "@/hooks/useToast";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DataRoomPage() {
  const { data, isLoading, error, refetch } = useDataRoom();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(DATA_ROOM_SECTIONS.map((s) => s.key)));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  const allExpanded = expandedSections.size === DATA_ROOM_SECTIONS.length;

  if (error) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#004E6415", color: "#004E64" }}
            >
              <FolderLock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Due Diligence Data Room</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Investor-ready document tracking and exit readiness scoring
              </p>
            </div>
          </div>
        </div>
        <ErrorState
          title="Failed to load data room"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  const handleExport = useCallback(() => {
    if (!data) return;
    const rows = data.sections.flatMap((section) =>
      section.items.map((item) => ({
        section: section.label,
        sectionCompleteness: `${section.completeness}%`,
        document: item.label,
        status: item.status.charAt(0).toUpperCase() + item.status.slice(1),
        count: item.count,
        lastUpdated: item.lastUpdated
          ? new Date(item.lastUpdated).toLocaleDateString("en-AU")
          : "N/A",
      })),
    );
    const columns: LegacyCsvColumn[] = [
      { key: "section", header: "DD Section" },
      { key: "sectionCompleteness", header: "Section Completeness" },
      { key: "document", header: "Required Document" },
      { key: "status", header: "Status" },
      { key: "count", header: "Records Found" },
      { key: "lastUpdated", header: "Last Updated" },
    ];
    exportToCSV(rows, `data-room-index-${new Date().toISOString().split("T")[0]}`, columns);
    toast({ description: "Data Room Index exported successfully" });
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#004E6415", color: "#004E64" }}
          >
            <FolderLock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Due Diligence Data Room</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Investor-ready document tracking and exit readiness scoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-sm text-brand hover:underline font-medium"
          >
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
          <ExportButton onClick={handleExport} label="Export Index" disabled={!data} />
        </div>
      </div>

      {/* Exit Readiness Score */}
      <ExitReadinessScore
        overallScore={data?.overallScore ?? 0}
        sections={data?.sections ?? []}
        loading={isLoading}
      />

      {/* DD Sections */}
      <div className="space-y-4">
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-100 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 bg-gray-100 rounded" />
                    <div className="h-1.5 w-full bg-gray-100 rounded-full" />
                  </div>
                </div>
              </div>
            ))
          : !data || data.sections.length === 0 ? (
              <EmptyState
                icon={FolderLock}
                title="No data room sections available"
                description="Due diligence document sections will appear here once data is available."
              />
            ) : (
              data.sections.map((section, idx) => {
                const config = DATA_ROOM_SECTIONS[idx];
                if (!config) return null;
                return (
                  <DataRoomSection
                    key={section.key}
                    section={section}
                    config={config}
                    expanded={expandedSections.has(section.key)}
                    onToggle={() => toggleSection(section.key)}
                  />
                );
              })
            )}
      </div>

      {/* Generated timestamp */}
      {data?.generatedAt && (
        <p className="text-xs text-gray-400 text-center">
          Data Room index generated{" "}
          {new Date(data.generatedAt).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
