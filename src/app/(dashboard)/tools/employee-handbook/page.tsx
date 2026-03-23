"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ExternalLink } from "lucide-react";

export default function EmployeeHandbookPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Employee Handbook"
        description="Educators induction module — policies, procedures, and daily operations"
        secondaryActions={[
          {
            label: "Open Full Screen",
            icon: ExternalLink,
            onClick: () => window.open("/employee-handbook.html", "_blank"),
          },
        ]}
      />

      <div className="mt-4 rounded-xl border border-border overflow-hidden bg-card shadow-warm-sm">
        <iframe
          src="/employee-handbook.html"
          className="w-full border-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "700px" }}
          title="Amana OSHC Employee Handbook"
        />
      </div>
    </div>
  );
}
