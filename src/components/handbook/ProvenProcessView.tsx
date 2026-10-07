"use client";

import { Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * The Amana Proven Process one-pager — shared by the /handbook hub's
 * "Proven Process" tab and the standalone /tools/amana-way-one-pager page
 * (an Educator's own menu item, 2026-10-07).
 */
const ONE_PAGER_IMAGE_PATH = "/Amana_PP.png";

export function ProvenProcessView() {
  return (
    <div className="max-w-7xl mx-auto h-full overflow-hidden">
      <PageHeader
        title="Amana Proven Process"
        description="Our 7-stage journey from enrolment to ongoing care"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open(ONE_PAGER_IMAGE_PATH, "_blank"),
          },
          {
            label: "Download Image",
            icon: Download,
            onClick: () => {
              const a = document.createElement("a");
              a.href = ONE_PAGER_IMAGE_PATH;
              a.download = "Amana_PP.png";
              a.click();
            },
          },
        ]}
      />

      <div className="mt-4 rounded-xl border border-border bg-card shadow-warm-sm w-full h-[60vh] min-h-[320px] md:h-[calc(100vh-200px)] md:min-h-[600px] flex items-center justify-center p-6 overflow-auto">
        <img
          src={ONE_PAGER_IMAGE_PATH}
          alt="Amana OSHC Proven Process"
          style={{ maxWidth: "100%", height: "auto", borderRadius: "12px" }}
        />
      </div>
    </div>
  );
}

