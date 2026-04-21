"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useUpdateService, useDeleteService } from "@/hooks/useServices";
import { hasMinRole, isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { useServiceStaffing } from "@/hooks/useStaffing";
import { useWaitlist, useOfferSpot } from "@/hooks/useWaitlist";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { SessionTimes } from "@/lib/service-settings";
import {
  MapPin,
  Phone,
  Mail,
  Users,
  Calendar,
  Edit3,
  DollarSign,
  FolderKanban,
  Target,
  AlertCircle,
  CheckSquare,
  Trash2,
  Loader2,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Smile,
  Copy,
  ExternalLink,
  Handshake,
  Save,
  X,
  Clock,
} from "lucide-react";

const statusOptions = [
  { key: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "onboarding", label: "Onboarding", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "pipeline", label: "Pipeline", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { key: "closing", label: "Closing", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "closed", label: "Closed", color: "bg-gray-100 text-gray-500 border-gray-300" },
] as const;

export function ServiceOverviewTab({
  service,
  users,
}: {
  service: any;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  const canEdit =
    isAdminRole(role) || (role === "coordinator" && sessionServiceId === service.id);
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    code: "",
    address: "",
    suburb: "",
    state: "",
    postcode: "",
    phone: "",
    email: "",
    capacity: "",
    operatingDays: "",
  });

  return (
    <div className="space-y-6">
      {/* Status */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Status
        </label>
        <div className="flex gap-1">
          {statusOptions.map((s) => (
            <button
              key={s.key}
              onClick={() =>
                updateService.mutate({ id: service.id, status: s.key })
              }
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors",
                service.status === s.key
                  ? s.color
                  : "bg-card border-border text-muted hover:border-border"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            Contact Details
          </label>
          {!editingDetails && (
            <button
              onClick={() => {
                setDetailsForm({
                  name: service.name || "",
                  code: service.code || "",
                  address: service.address || "",
                  suburb: service.suburb || "",
                  state: service.state || "",
                  postcode: service.postcode || "",
                  phone: service.phone || "",
                  email: service.email || "",
                  capacity: service.capacity?.toString() || "",
                  operatingDays: service.operatingDays || "",
                });
                setEditingDetails(true);
              }}
              className="text-muted hover:text-brand"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingDetails ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Service Name</label>
                <input
                  autoFocus
                  type="text"
                  value={detailsForm.name}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service name"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Code</label>
                <input
                  type="text"
                  value={detailsForm.code}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service code"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Address</label>
              <input
                type="text"
                value={detailsForm.address}
                onChange={(e) => setDetailsForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Suburb</label>
                <input
                  type="text"
                  value={detailsForm.suburb}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, suburb: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Suburb"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">State</label>
                <input
                  type="text"
                  value={detailsForm.state}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, state: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="State"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Postcode</label>
                <input
                  type="text"
                  value={detailsForm.postcode}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, postcode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Postcode"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Phone</label>
                <input
                  type="text"
                  value={detailsForm.phone}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Email</label>
                <input
                  type="text"
                  value={detailsForm.email}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Email address"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Capacity</label>
                <input
                  type="number"
                  min={0}
                  value={detailsForm.capacity}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Max children"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5">Operating Days</label>
                <input
                  type="text"
                  value={detailsForm.operatingDays}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, operatingDays: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. Mon-Fri"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const capacityVal = detailsForm.capacity
                    ? parseInt(detailsForm.capacity, 10)
                    : null;
                  updateService.mutate({
                    id: service.id,
                    name: detailsForm.name,
                    code: detailsForm.code,
                    address: detailsForm.address,
                    suburb: detailsForm.suburb,
                    state: detailsForm.state,
                    postcode: detailsForm.postcode,
                    phone: detailsForm.phone,
                    email: detailsForm.email,
                    capacity: isNaN(capacityVal as number) ? null : capacityVal,
                    operatingDays: detailsForm.operatingDays,
                  });
                  setEditingDetails(false);
                }}
                className="text-xs px-3 py-1 bg-brand text-white rounded-md"
              >
                Save
              </button>
              <button
                onClick={() => setEditingDetails(false)}
                className="text-xs px-3 py-1 text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {service.name && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="font-medium">{service.name}</span>
                {service.code && (
                  <span className="text-xs text-muted">({service.code})</span>
                )}
              </div>
            )}
            {service.address && (
              <div className="flex items-start gap-2 text-sm text-muted">
                <MapPin className="w-4 h-4 text-muted mt-0.5" />
                <span>
                  {service.address}
                  {service.suburb && `, ${service.suburb}`}
                  {service.state && ` ${service.state}`}
                  {service.postcode && ` ${service.postcode}`}
                </span>
              </div>
            )}
            {service.phone && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Phone className="w-4 h-4 text-muted" />
                <a
                  href={`tel:${service.phone}`}
                  className="text-brand hover:underline"
                >
                  {service.phone}
                </a>
              </div>
            )}
            {service.email && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Mail className="w-4 h-4 text-muted" />
                <a
                  href={`mailto:${service.email}`}
                  className="text-brand hover:underline"
                >
                  {service.email}
                </a>
              </div>
            )}
            {service.capacity && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Users className="w-4 h-4 text-muted" />
                <span>Capacity: {service.capacity} children</span>
              </div>
            )}
            {service.operatingDays && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Calendar className="w-4 h-4 text-muted" />
                <span>{service.operatingDays}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Capacity & Waitlist */}
      <CapacityWaitlistWidget service={service} />

      {/* Service Approvals & Session Times */}
      <ApprovalsSessionTimesCard service={service} canEdit={canEdit} />

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

      {/* Daily Rates */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Daily Rates (per child per day)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.bscDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  bscDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.ascDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  ascDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">VC</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.vcDailyRate ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  vcDailyRate: isNaN(val) ? null : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Casual Rates */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Casual Rates (per child per session)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted block mb-0.5">BSC Casual</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.bscCasualRate ?? 0}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  bscCasualRate: isNaN(val) ? 0 : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-0.5">ASC Casual</label>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={service.ascCasualRate ?? 0}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                updateService.mutate({
                  id: service.id,
                  ascCasualRate: isNaN(val) ? 0 : val,
                });
              }}
              className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Staffing Forecast */}
      <StaffingForecast serviceId={service.id} />

      {/* Summary Stats */}
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Summary
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <Target className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {service._count?.rocks ?? 0}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Active Rocks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <AlertCircle className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {service._count?.issues ?? 0}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Open Issues
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <CheckSquare className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {service._count?.todos ?? 0}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Pending Todos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <FolderKanban className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {service._count?.projects ?? 0}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                Active Projects
              </p>
            </div>
          </div>
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

      {/* School Partnership */}
      <SchoolPartnershipSection service={service} onUpdate={(data: Record<string, unknown>) => updateService.mutate({ id: service.id, ...data })} />

      {/* Parent Feedback */}
      <ParentFeedbackSection serviceId={service.id} />

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

// ─── Capacity & Waitlist Sub-component ───────────────────────────────────────

function CapacityWaitlistWidget({ service }: { service: any }) {
  const { data: waitlistData } = useWaitlist(service.id);
  const offerSpot = useOfferSpot();

  // Fetch enrolled count for this service
  const { data: enrolledData } = useQuery<{ count: number }>({
    queryKey: ["enrolled-count", service.id],
    queryFn: () =>
      fetchApi<{ count: number }>(
        `/api/enquiries/stats?serviceId=${service.id}`
      ).then((stats: any) => ({
        count:
          (stats.countByStage?.enrolled || 0) +
          (stats.countByStage?.first_session || 0) +
          (stats.countByStage?.retained || 0),
      })),
    staleTime: 30_000,
    retry: 2,
  });

  const capacity = service.capacity ?? 0;
  const enrolled = enrolledData?.count ?? 0;
  const waitlistCount = waitlistData?.total ?? 0;
  const utilisation = capacity > 0 ? (enrolled / capacity) * 100 : 0;

  const barColor =
    utilisation > 95
      ? "bg-red-500"
      : utilisation > 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
        <Users className="w-3.5 h-3.5 inline mr-1" />
        Capacity & Waitlist
      </label>

      {capacity > 0 ? (
        <div className="space-y-3">
          {/* Capacity bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">
                {enrolled} enrolled / {capacity} capacity
              </span>
              <span className="text-xs font-medium text-foreground">
                {Math.round(utilisation)}%
              </span>
            </div>
            <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(utilisation, 100)}%` }}
              />
            </div>
          </div>

          {/* Waitlist info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  waitlistCount > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-surface text-muted"
                )}
              >
                {waitlistCount} {waitlistCount === 1 ? "family" : "families"} waiting
              </span>
            </div>
            {waitlistCount > 0 && (
              <button
                onClick={() => offerSpot.mutate(service.id)}
                disabled={offerSpot.isPending}
                className="text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                {offerSpot.isPending ? "Offering..." : "Offer Next Spot"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Set capacity in contact details above to track utilisation.
        </p>
      )}
    </div>
  );
}

// ─── Staffing Forecast Sub-component ─────────────────────────────────────────

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function StaffingForecast({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useServiceStaffing(serviceId);

  if (isLoading) {
    return (
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Staffing Forecast
        </label>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-muted/50 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data?.week) return null;

  const { week, monthlyOverstaffingCost } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Staffing — This Week
        </label>
        {monthlyOverstaffingCost > 0 && (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            ${monthlyOverstaffingCost.toFixed(0)} overstaffing this month
          </span>
        )}
      </div>

      {/* Weekly grid */}
      <div className="space-y-1.5">
        {week.days.map((day: any, i: number) => {
          const date = new Date(day.date);
          const dayIndex = date.getDay();
          const label = dayLabels[dayIndex - 1] || date.toLocaleDateString("en-AU", { weekday: "short" });

          return (
            <div key={day.date} className="flex items-center gap-2">
              <span className="text-[10px] text-muted w-7 text-right font-medium">
                {label}
              </span>
              <div className="flex-1 flex gap-1">
                {day.sessions.map((s: any) => {
                  const isOver = s.variance > 0;
                  const isUnder = s.variance < 0;
                  return (
                    <div
                      key={s.sessionType}
                      className={cn(
                        "flex-1 flex items-center justify-between px-2 py-1 rounded text-[10px] border",
                        isUnder
                          ? "bg-red-50 border-red-200 text-red-700"
                          : isOver
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      )}
                    >
                      <span className="font-medium uppercase">
                        {s.sessionType}
                      </span>
                      <span className="flex items-center gap-0.5">
                        {isUnder ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : isOver ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {s.rostered}r / {s.required}req
                        {s.variance !== 0 && (
                          <span className="font-semibold ml-0.5">
                            ({s.variance > 0 ? "+" : ""}
                            {s.variance})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waste / Risk totals for the week */}
      {(week.totalWaste > 0 || week.totalRisk > 0) && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {week.totalWaste > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-sm font-bold text-amber-700">
                ${week.totalWaste.toFixed(0)}
              </p>
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">
                Weekly Waste
              </p>
            </div>
          )}
          {week.totalRisk > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-100">
              <p className="text-sm font-bold text-red-700">
                ${week.totalRisk.toFixed(0)}
              </p>
              <p className="text-[10px] text-red-600 uppercase tracking-wider">
                Revenue at Risk
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── School Partnership Sub-component ────────────────────────────────────────

function SchoolPartnershipSection({
  service,
  onUpdate,
}: {
  service: any;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contractStartDate: "",
    contractEndDate: "",
    licenceFeeAnnual: "",
    schoolPrincipalName: "",
    schoolPrincipalEmail: "",
    schoolBusinessManagerName: "",
    schoolBusinessManagerEmail: "",
    lastPrincipalVisit: "",
    buildAlphaKidsActive: false,
  });

  const startEdit = () => {
    setForm({
      contractStartDate: service.contractStartDate?.split("T")[0] || "",
      contractEndDate: service.contractEndDate?.split("T")[0] || "",
      licenceFeeAnnual: service.licenceFeeAnnual?.toString() || "",
      schoolPrincipalName: service.schoolPrincipalName || "",
      schoolPrincipalEmail: service.schoolPrincipalEmail || "",
      schoolBusinessManagerName: service.schoolBusinessManagerName || "",
      schoolBusinessManagerEmail: service.schoolBusinessManagerEmail || "",
      lastPrincipalVisit: service.lastPrincipalVisit?.split("T")[0] || "",
      buildAlphaKidsActive: service.buildAlphaKidsActive ?? false,
    });
    setEditing(true);
  };

  const handleSave = () => {
    onUpdate({
      contractStartDate: form.contractStartDate || null,
      contractEndDate: form.contractEndDate || null,
      licenceFeeAnnual: form.licenceFeeAnnual ? parseFloat(form.licenceFeeAnnual) : null,
      schoolPrincipalName: form.schoolPrincipalName || null,
      schoolPrincipalEmail: form.schoolPrincipalEmail || null,
      schoolBusinessManagerName: form.schoolBusinessManagerName || null,
      schoolBusinessManagerEmail: form.schoolBusinessManagerEmail || null,
      lastPrincipalVisit: form.lastPrincipalVisit || null,
      buildAlphaKidsActive: form.buildAlphaKidsActive,
    });
    setEditing(false);
  };

  const daysUntilRenewal = service.contractEndDate
    ? Math.ceil((new Date(service.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const daysSinceVisit = service.lastPrincipalVisit
    ? Math.floor((Date.now() - new Date(service.lastPrincipalVisit).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-brand" />
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            School Partnership
          </label>
        </div>
        {!editing ? (
          <button onClick={startEdit} className="text-muted hover:text-brand">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700">
              <Save className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 p-4 border border-border rounded-xl bg-surface/30">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Contract Start</label>
              <input type="date" value={form.contractStartDate} onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Contract End</label>
              <input type="date" value={form.contractEndDate} onChange={(e) => setForm((f) => ({ ...f, contractEndDate: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Licence Fee (Annual)</label>
              <input type="number" step="0.01" value={form.licenceFeeAnnual} onChange={(e) => setForm((f) => ({ ...f, licenceFeeAnnual: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" placeholder="$0.00" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Last Principal Visit</label>
              <input type="date" value={form.lastPrincipalVisit} onChange={(e) => setForm((f) => ({ ...f, lastPrincipalVisit: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Principal Name</label>
              <input type="text" value={form.schoolPrincipalName} onChange={(e) => setForm((f) => ({ ...f, schoolPrincipalName: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Principal Email</label>
              <input type="email" value={form.schoolPrincipalEmail} onChange={(e) => setForm((f) => ({ ...f, schoolPrincipalEmail: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Business Manager</label>
              <input type="text" value={form.schoolBusinessManagerName} onChange={(e) => setForm((f) => ({ ...f, schoolBusinessManagerName: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Business Manager Email</label>
              <input type="email" value={form.schoolBusinessManagerEmail} onChange={(e) => setForm((f) => ({ ...f, schoolBusinessManagerEmail: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.buildAlphaKidsActive} onChange={(e) => setForm((f) => ({ ...f, buildAlphaKidsActive: e.target.checked }))} className="w-4 h-4 rounded border-border text-brand focus:ring-brand" />
            <span className="text-foreground/80">Build Alpha Kids Active</span>
          </label>
        </div>
      ) : (
        <div className="p-4 border border-border rounded-xl bg-card space-y-3">
          {/* Contract row */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Contract Start</span>
              <span className="text-foreground">{service.contractStartDate ? new Date(service.contractStartDate).toLocaleDateString("en-AU") : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Contract End</span>
              <div className="flex items-center gap-1.5">
                <span className="text-foreground">{service.contractEndDate ? new Date(service.contractEndDate).toLocaleDateString("en-AU") : "—"}</span>
                {daysUntilRenewal !== null && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", daysUntilRenewal <= 0 ? "bg-red-100 text-red-700" : daysUntilRenewal <= 180 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                    {daysUntilRenewal <= 0 ? "Expired" : `${daysUntilRenewal}d`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Licence Fee</span>
              <span className="text-foreground">{service.licenceFeeAnnual ? `$${Number(service.licenceFeeAnnual).toLocaleString()}/yr` : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Last Principal Visit</span>
              <div className="flex items-center gap-1.5">
                <span className="text-foreground">{service.lastPrincipalVisit ? new Date(service.lastPrincipalVisit).toLocaleDateString("en-AU") : "—"}</span>
                {daysSinceVisit !== null && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", daysSinceVisit > 90 ? "bg-red-100 text-red-700" : daysSinceVisit > 60 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                    {daysSinceVisit}d ago
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Principal</span>
              <span className="text-foreground">{service.schoolPrincipalName || "—"}</span>
              {service.schoolPrincipalEmail && <span className="text-[10px] text-muted block">{service.schoolPrincipalEmail}</span>}
            </div>
            <div>
              <span className="text-[10px] text-muted block">Business Manager</span>
              <span className="text-foreground">{service.schoolBusinessManagerName || "—"}</span>
              {service.schoolBusinessManagerEmail && <span className="text-[10px] text-muted block">{service.schoolBusinessManagerEmail}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full", service.buildAlphaKidsActive ? "bg-emerald-500" : "bg-border")} />
            <span className="text-muted">Build Alpha Kids: {service.buildAlphaKidsActive ? "Active" : "Inactive"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Parent Feedback Sub-component ───────────────────────────────────────────

const SCORE_EMOJI: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "😊", 5: "😍" };

function ParentFeedbackSection({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["quick-feedback", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/feedback/quick?serviceId=${serviceId}&weeks=8`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.services?.[0] || null;
    },
  });

  const [copied, setCopied] = useState(false);
  const surveyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/survey/feedback/${serviceId}`
    : `/survey/feedback/${serviceId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1">
          <Smile className="w-3.5 h-3.5" />
          Parent Feedback
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={copyLink}
            className="text-[10px] text-muted hover:text-foreground/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:border-border"
            title="Copy survey link"
          >
            {copied ? "Copied!" : <><Copy className="w-3 h-3" /> Survey Link</>}
          </button>
          <a
            href={surveyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted hover:text-foreground/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:border-border"
          >
            <ExternalLink className="w-3 h-3" /> Preview
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-muted/50 animate-spin" />
        </div>
      ) : !data || data.totalResponses === 0 ? (
        <div className="bg-surface/50 rounded-xl p-4 text-center">
          <p className="text-sm text-muted">No feedback received yet.</p>
          <p className="text-xs text-muted mt-1">
            Share the survey link with parents via WhatsApp or email.
          </p>
        </div>
      ) : (
        <div className="bg-surface/50 rounded-xl p-4 space-y-3">
          {/* Summary row */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <span className="text-3xl">
                {SCORE_EMOJI[Math.round(data.overallAverage)] || "😐"}
              </span>
              <p className="text-lg font-bold text-foreground">
                {data.overallAverage}
                <span className="text-xs font-normal text-muted">/5</span>
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground/80">
                {data.totalResponses} responses
              </p>
              <p className="text-xs text-muted">Last 8 weeks</p>
            </div>
          </div>

          {/* Weekly trend (sparkline using bars) */}
          {data.weeklyData?.length > 1 && (
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                Weekly Trend
              </p>
              <div className="flex items-end gap-1 h-8">
                {data.weeklyData
                  .slice()
                  .reverse()
                  .slice(-8)
                  .map((w: any, i: number) => {
                    const pct = ((w.averageScore - 1) / 4) * 100;
                    const colors =
                      w.averageScore >= 4
                        ? "bg-emerald-400"
                        : w.averageScore >= 3
                          ? "bg-yellow-400"
                          : "bg-red-400";
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${colors}`}
                        style={{ height: `${Math.max(pct, 10)}%` }}
                        title={`Week of ${w.weekStart}: ${w.averageScore} avg (${w.count} responses)`}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Service Approvals & Session Times Sub-component ─────────────────────────

const SESSION_TYPES = [
  { key: "bsc", label: "BSC" },
  { key: "asc", label: "ASC" },
  { key: "vc", label: "VC" },
] as const;
type SessionKey = (typeof SESSION_TYPES)[number]["key"];

type SessionRow = { start: string; end: string };
type EditableSessionTimes = Record<SessionKey, SessionRow>;

function toEditableSessionTimes(value: SessionTimes | null | undefined): EditableSessionTimes {
  return {
    bsc: { start: value?.bsc?.start ?? "", end: value?.bsc?.end ?? "" },
    asc: { start: value?.asc?.start ?? "", end: value?.asc?.end ?? "" },
    vc: { start: value?.vc?.start ?? "", end: value?.vc?.end ?? "" },
  };
}

function ApprovalsSessionTimesCard({
  service,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
}) {
  const updateService = useUpdateService();
  const [open, setOpen] = useState(false);
  const [formServiceApproval, setFormServiceApproval] = useState("");
  const [formProviderApproval, setFormProviderApproval] = useState("");
  const [formSessionTimes, setFormSessionTimes] = useState<EditableSessionTimes>(
    toEditableSessionTimes(service.sessionTimes as SessionTimes | null | undefined),
  );
  const saving = updateService.isPending;

  const sessionTimes = (service.sessionTimes ?? null) as SessionTimes | null;
  const populatedSessions = SESSION_TYPES.filter((s) => {
    const entry = sessionTimes?.[s.key];
    return !!entry && !!entry.start && !!entry.end;
  });

  function openEditor() {
    setFormServiceApproval(service.serviceApprovalNumber ?? "");
    setFormProviderApproval(service.providerApprovalNumber ?? "");
    setFormSessionTimes(toEditableSessionTimes(service.sessionTimes as SessionTimes | null | undefined));
    setOpen(true);
  }

  function buildSessionTimesPayload(): SessionTimes | null {
    const out: SessionTimes = {};
    for (const s of SESSION_TYPES) {
      const row = formSessionTimes[s.key];
      const start = row.start.trim();
      const end = row.end.trim();
      if (start && end) out[s.key] = { start, end };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  async function handleSave() {
    try {
      await updateService.mutateAsync({
        id: service.id,
        serviceApprovalNumber: formServiceApproval.trim() || null,
        providerApprovalNumber: formProviderApproval.trim() || null,
        sessionTimes: buildSessionTimesPayload(),
      });
      toast({ description: "Service info updated" });
      setOpen(false);
    } catch {
      // useUpdateService.onError already shows a destructive toast; keep modal open.
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Service Approvals & Session Times
        </label>
        {canEdit && (
          <button
            type="button"
            onClick={openEditor}
            aria-label="Edit approvals"
            title="Edit approvals and session times"
            className="text-muted hover:text-brand"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 border border-border rounded-xl bg-card space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-[10px] text-muted block">Service Approval #</span>
            <span className="text-foreground">
              {service.serviceApprovalNumber ? service.serviceApprovalNumber : "—"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted block">Provider Approval #</span>
            <span className="text-foreground">
              {service.providerApprovalNumber ? service.providerApprovalNumber : "—"}
            </span>
          </div>
        </div>

        {populatedSessions.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <span className="text-[10px] text-muted block mb-1 uppercase tracking-wider">
              Session Times
            </span>
            <ul className="space-y-1">
              {populatedSessions.map((s) => {
                const row = sessionTimes![s.key]!;
                return (
                  <li key={s.key} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="font-semibold uppercase text-xs w-10">{s.label}</span>
                    <span>
                      {row.start} – {row.end}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <DialogContent size="lg" className="md:p-6" aria-label="Edit service approvals and session times">
          <DialogTitle className="text-base font-semibold text-foreground mb-4">
            Edit Approvals & Session Times
          </DialogTitle>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted block mb-0.5 uppercase tracking-wider">
                  Service Approval #
                </label>
                <input
                  autoFocus
                  type="text"
                  value={formServiceApproval}
                  onChange={(e) => setFormServiceApproval(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. SE-00012345"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-0.5 uppercase tracking-wider">
                  Provider Approval #
                </label>
                <input
                  type="text"
                  value={formProviderApproval}
                  onChange={(e) => setFormProviderApproval(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="e.g. PR-00067890"
                />
              </div>
            </div>

            <div>
              <span className="text-[10px] text-muted block mb-2 uppercase tracking-wider">
                Session Times (HH:MM)
              </span>
              <div className="space-y-2">
                {SESSION_TYPES.map((s) => (
                  <div key={s.key} className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center">
                    <span className="text-xs font-semibold text-foreground uppercase">
                      {s.label}
                    </span>
                    <input
                      type="time"
                      value={formSessionTimes[s.key].start}
                      onChange={(e) =>
                        setFormSessionTimes((f) => ({
                          ...f,
                          [s.key]: { ...f[s.key], start: e.target.value },
                        }))
                      }
                      aria-label={`${s.label} start time`}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <input
                      type="time"
                      value={formSessionTimes[s.key].end}
                      onChange={(e) =>
                        setFormSessionTimes((f) => ({
                          ...f,
                          [s.key]: { ...f[s.key], end: e.target.value },
                        }))
                      }
                      aria-label={`${s.label} end time`}
                      className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-xs px-3 py-1.5 text-muted hover:text-foreground rounded-md"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
