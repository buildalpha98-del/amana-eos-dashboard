"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Download, ExternalLink } from "lucide-react";

export default function AmanaWayOnePagerPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="The Amana Way — One Pager"
        description="Our proven process at a glance"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open("/amana-way-one-pager.html", "_blank"),
          },
          {
            label: "Print / Save PDF",
            icon: Download,
            onClick: () => {
              const w = window.open("/amana-way-one-pager.html", "_blank");
              w?.addEventListener("load", () => w.print());
            },
          },
        ]}
      />

      <div className="mt-4 rounded-xl border border-border overflow-hidden bg-card shadow-warm-sm">
        <iframe
          src="/amana-way-one-pager.html"
          className="w-full border-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
          title="The Amana Way — One Pager"
        />
      </div>
    </div>
  );
}
