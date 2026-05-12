"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Download, ExternalLink } from "lucide-react";

/**
 * The Amana Way — One Pager: a single-page view of our 7-stage
 * Proven Process from enrolment through ongoing care.
 *
 * 2026-05-12: switched from the old static HTML to the new PDF the
 * user supplied (public/amana-proven-process.pdf). The iframe loads
 * the PDF natively in-browser; "Download" hits the same asset.
 */

const PDF_PATH = "/amana-proven-process.pdf";

export default function AmanaWayOnePagerPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="The Amana Way — Proven Process"
        description="Our 7-stage journey from enrolment to ongoing care"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open(PDF_PATH, "_blank"),
          },
          {
            label: "Download PDF",
            icon: Download,
            onClick: () => {
              const a = document.createElement("a");
              a.href = PDF_PATH;
              a.download = "amana-proven-process.pdf";
              a.click();
            },
          },
        ]}
      />

      <div className="mt-4 rounded-xl border border-border overflow-hidden bg-card shadow-warm-sm">
        <iframe
          src={PDF_PATH}
          className="w-full border-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
          title="The Amana Way — Proven Process"
        />
      </div>
    </div>
  );
}
