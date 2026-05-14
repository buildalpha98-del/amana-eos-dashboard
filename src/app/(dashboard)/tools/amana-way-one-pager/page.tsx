"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Download, ExternalLink } from "lucide-react";

const IMAGE_PATH = "/Amana_PP.png";

export default function AmanaWayOnePagerPage() {
  return (
    <div className="max-w-7xl mx-auto h-full overflow-hidden">
      <PageHeader
        title="The Amana Way — Proven Process"
        description="Our 7-stage journey from enrolment to ongoing care"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open(IMAGE_PATH, "_blank"),
          },
          {
            label: "Download Image",
            icon: Download,
            onClick: () => {
              const a = document.createElement("a");
              a.href = IMAGE_PATH;
              a.download = "Amana_PP.png";
              a.click();
            },
          },
        ]}
      />

      <div
        className="mt-4 rounded-xl border border-border bg-card shadow-warm-sm"
        style={{
          width: "100%",
          height: "calc(100vh - 200px)",
          minHeight: "600px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          overflow: "auto",
        }}
      >
        <img
          src={IMAGE_PATH}
          alt="Amana OSHC Proven Process"
          style={{ maxWidth: "100%", height: "auto", borderRadius: "12px" }}
        />
      </div>
    </div>
  );
}
