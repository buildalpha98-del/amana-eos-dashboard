"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isAdminRole } from "@/lib/role-permissions";
import { PolicyAdminPanel } from "@/components/policies/PolicyAdminPanel";
import { PolicyStaffPanel } from "@/components/policies/PolicyStaffPanel";

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
            : "Review and acknowledge the latest policies and procedures."
        }
      />
      {status === "loading" ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-sm text-muted">
          Loading…
        </div>
      ) : isAdmin ? (
        <PolicyAdminPanel />
      ) : (
        <PolicyStaffPanel />
      )}
    </div>
  );
}
