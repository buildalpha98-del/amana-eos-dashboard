"use client";

import { PageHeader } from "@/components/layout/PageHeader";

// Phase-1 stub. The full Policies & Procedures library UI (admin upload,
// version management, acknowledgement panel) lands in Phase 2; the staff
// PDF viewer + ack flow lands in Phase 3.
export default function PoliciesPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Policies & Procedures"
        description="Versioned policy & procedure library."
      />
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          The Policies &amp; Procedures library is being upgraded.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          New upload, version history, and acknowledgement flows arrive in the next release.
        </p>
      </div>
    </div>
  );
}
