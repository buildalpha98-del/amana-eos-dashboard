"use client";

/**
 * Service Information → Service Info (2026-10-08, modelled on OWNA's
 * Configure → Service Information): one white panel with tabs across the
 * top instead of a 13-card scroll. Centre details is a single labelled
 * form; the rest are the existing cards, each on its own tab.
 *
 * Removed from this page: the EOS summary counts and active projects —
 * they live under EOS. The admin danger zone stays at the bottom.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Trash2 } from "lucide-react";
import { useDeleteService } from "@/hooks/useServices";
import { hasMinRole, isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";

import { CentreDetailsForm } from "./overview/CentreDetailsForm";
import { SessionTimesCard } from "./overview/SessionTimesCard";
import { CapacityCard } from "./overview/CapacityCard";
import { RatesCard } from "./overview/RatesCard";
import { StaffingForecastCard } from "./overview/StaffingForecastCard";
import { MarketingCard } from "./overview/MarketingCard";
import { ParentFeedbackCard } from "./overview/ParentFeedbackCard";

const TABS = [
  { key: "details", label: "Centre details" },
  { key: "sessions", label: "Session times" },
  { key: "capacity", label: "Capacity & rates" },
  { key: "staffing", label: "Staffing" },
  { key: "school", label: "School partnership" },
  { key: "feedback", label: "Family feedback" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ServiceOverviewTab({
  service,
  users,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  const canEdit = isAdminRole(role) || (role === "member" && sessionServiceId === service.id);
  const deleteService = useDeleteService();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tab, setTab] = useState<TabKey>("details");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 pt-3 overflow-x-auto">
          <nav className="flex gap-1 -mb-px" aria-label="Service information">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-t-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-border border-b-card bg-card text-foreground"
                    : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-4 sm:p-6">
          {tab === "details" && <CentreDetailsForm service={service} users={users} canEdit={canEdit} />}
          {tab === "sessions" && <SessionTimesCard serviceId={service.id} canEdit={canEdit} />}
          {tab === "capacity" && (
            <div className="space-y-6">
              <CapacityCard service={service} />
              <RatesCard service={service} />
            </div>
          )}
          {tab === "staffing" && <StaffingForecastCard serviceId={service.id} />}
          {tab === "school" && <MarketingCard service={service} />}
          {tab === "feedback" && <ParentFeedbackCard serviceId={service.id} />}
        </div>
      </div>

      {/* Danger Zone — owner/admin only */}
      {hasMinRole(role, "admin") && (
        <div className="border border-red-200 dark:border-red-800 rounded-xl p-5 bg-red-50/50 dark:bg-red-950/20">
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Danger Zone</h4>
          <p className="text-xs text-red-600/80 dark:text-red-300/80 mb-3">
            Permanently delete this centre and all associated timesheets, financial data, metrics, and compliance records. Todos, issues, and rocks will be unlinked but preserved.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-card border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Centre
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Delete ${service.name}?`}
        description="This will permanently delete this centre and all associated timesheets, financial data, metrics, and compliance records. Todos, issues, and rocks will be unlinked but preserved. This action cannot be undone."
        confirmLabel="Delete Centre"
        variant="danger"
        loading={deleteService.isPending}
        onConfirm={async () => {
          await deleteService.mutateAsync(service.id);
          router.push("/services");
        }}
      />
    </div>
  );
}
