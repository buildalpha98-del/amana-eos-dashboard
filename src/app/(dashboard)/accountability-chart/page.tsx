"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrgChartView } from "@/components/team/OrgChartView";
import { toast } from "@/hooks/useToast";

/**
 * /accountability-chart — dedicated home for the EOS accountability
 * chart, re-homed out of the legacy /team page as part of the Teams
 * tab redesign (spec PR #77, PR 6).
 *
 * Visible to all roles: it's the canonical "who reports to whom"
 * surface for the org. Edit access stays gated inside OrgChartView
 * itself (owner + admin only).
 */
export default function AccountabilityChartPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/accountability-chart/pdf");
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `amana-accountability-chart-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't generate PDF",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="Accountability chart"
        description="The org structure — who is accountable for what. Owners and admins can edit; everyone can view."
        primaryAction={{
          label: "Download PDF",
          icon: Download,
          onClick: handleDownloadPdf,
          loading: downloading,
          variant: "secondary",
        }}
      />
      <OrgChartView />
    </div>
  );
}
