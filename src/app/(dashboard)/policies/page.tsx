"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isAdminRole } from "@/lib/role-permissions";
import { PolicyAdminPanel } from "@/components/policies/PolicyAdminPanel";

// Admins see the library management UI here. Phase 3 adds the staff list +
// PDF viewer + acknowledgement flow under the same route, gated on role.
export default function PoliciesPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? null;
  const isAdmin = isAdminRole(role);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Policies & Procedures"
        description={
          isAdmin
            ? "Upload PDFs, manage versions, and monitor acknowledgements."
            : "Versioned policy & procedure library."
        }
      />
      {status === "loading" ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : isAdmin ? (
        <PolicyAdminPanel />
      ) : (
        <StaffPlaceholder />
      )}
    </div>
  );
}

// Phase-2 placeholder — Phase 3 replaces this with the list + PDF viewer.
function StaffPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
      <p className="text-sm text-muted-foreground">
        The staff Policies &amp; Procedures view is being upgraded.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Acknowledgement flow arrives in the next release.
      </p>
    </div>
  );
}
