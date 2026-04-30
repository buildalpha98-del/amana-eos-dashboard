"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUpdateService, useDeleteService } from "@/hooks/useServices";
import { hasMinRole, isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import {
  Edit3,
  FolderKanban,
  Target,
  AlertCircle,
  CheckSquare,
  Trash2,
} from "lucide-react";

import { OverviewHeader } from "./overview/OverviewHeader";
import { ServiceInfoCard } from "./overview/ServiceInfoCard";
import { CapacityCard } from "./overview/CapacityCard";
import { RatesCard } from "./overview/RatesCard";
import { StaffingForecastCard } from "./overview/StaffingForecastCard";
import { MarketingCard } from "./overview/MarketingCard";
import { ParentFeedbackCard } from "./overview/ParentFeedbackCard";

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
  const canEdit =
    isAdminRole(role) || (role === "member" && sessionServiceId === service.id);
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-6">
      <OverviewHeader service={service} />

      <ServiceInfoCard service={service} canEdit={canEdit} />

      <CapacityCard service={service} />

      {/* Centre Manager */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
          Centre Manager
        </label>
        <select
          value={service.managerId || ""}
          onChange={(e) =>
            updateService.mutate({
              id: service.id,
              managerId: e.target.value || null,
            })
          }
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            Notes
          </label>
          {!editing && (
            <button
              onClick={() => {
                setNotes(service.notes || "");
                setEditing(true);
              }}
              className="text-muted hover:text-brand"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  updateService.mutate({ id: service.id, notes });
                  setEditing(false);
                }}
                className="text-xs px-3 py-1 bg-brand text-white rounded-md"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-xs px-3 py-1 text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {service.notes || "No notes yet."}
          </p>
        )}
      </div>

      <RatesCard service={service} />

      <StaffingForecastCard serviceId={service.id} />

      {/* Summary Stats */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Summary
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { Icon: Target, label: "Active Rocks", value: service._count?.rocks ?? 0 },
              { Icon: AlertCircle, label: "Open Issues", value: service._count?.issues ?? 0 },
              { Icon: CheckSquare, label: "Pending Todos", value: service._count?.todos ?? 0 },
              { Icon: FolderKanban, label: "Active Projects", value: service._count?.projects ?? 0 },
            ] as const
          ).map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
              <Icon className="w-4 h-4 text-brand" />
              <div>
                <p className="text-lg font-semibold text-foreground">{value}</p>
                <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Projects */}
      {service.projects && service.projects.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            <FolderKanban className="w-3.5 h-3.5 inline mr-1" />
            Active Projects ({service.projects.length})
          </label>
          <div className="space-y-1.5">
            {service.projects.map(
              (project: {
                id: string;
                name: string;
                status: string;
                owner: { id: string; name: string } | null;
              }) => (
                <button
                  key={project.id}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-brand/5 rounded-lg text-sm text-left hover:bg-brand/10 transition-colors"
                >
                  <FolderKanban className="w-4 h-4 text-brand flex-shrink-0" />
                  <span className="flex-1 truncate text-brand font-medium">
                    {project.name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize",
                      project.status === "active"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                        : project.status === "onboarding"
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : project.status === "closing"
                        ? "bg-amber-100 text-amber-700 border-amber-300"
                        : project.status === "closed"
                        ? "bg-gray-100 text-gray-500 border-gray-300"
                        : "bg-gray-100 text-gray-500 border-gray-300"
                    )}
                  >
                    {project.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted">
                    {project.owner?.name || "Unassigned"}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      <MarketingCard service={service} />

      <ParentFeedbackCard serviceId={service.id} />

      {/* Danger Zone — owner/admin only */}
      {hasMinRole(role, "admin") && (
        <div className="border border-red-200 rounded-xl p-5 bg-red-50/50">
          <h4 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h4>
          <p className="text-xs text-red-600/80 mb-3">
            Permanently delete this centre and all associated timesheets, financial data, metrics, and compliance records. Todos, issues, and rocks will be unlinked but preserved.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-card border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
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
