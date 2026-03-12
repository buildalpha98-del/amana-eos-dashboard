"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useUpdateService, useDeleteService } from "@/hooks/useServices";
import { hasMinRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { useServiceStaffing } from "@/hooks/useStaffing";
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
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
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
                  : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
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
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
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
              className="text-gray-400 hover:text-brand"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingDetails ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Service Name</label>
                <input
                  autoFocus
                  type="text"
                  value={detailsForm.name}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service name"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Code</label>
                <input
                  type="text"
                  value={detailsForm.code}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Service code"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Address</label>
              <input
                type="text"
                value={detailsForm.address}
                onChange={(e) => setDetailsForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Suburb</label>
                <input
                  type="text"
                  value={detailsForm.suburb}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, suburb: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Suburb"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">State</label>
                <input
                  type="text"
                  value={detailsForm.state}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, state: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="State"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Postcode</label>
                <input
                  type="text"
                  value={detailsForm.postcode}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, postcode: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Postcode"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Phone</label>
                <input
                  type="text"
                  value={detailsForm.phone}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Email</label>
                <input
                  type="text"
                  value={detailsForm.email}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Email address"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Capacity</label>
                <input
                  type="number"
                  min={0}
                  value={detailsForm.capacity}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Max children"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Operating Days</label>
                <input
                  type="text"
                  value={detailsForm.operatingDays}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, operatingDays: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
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
                className="text-xs px-3 py-1 text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {service.name && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">{service.name}</span>
                {service.code && (
                  <span className="text-xs text-gray-400">({service.code})</span>
                )}
              </div>
            )}
            {service.address && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span>
                  {service.address}
                  {service.suburb && `, ${service.suburb}`}
                  {service.state && ` ${service.state}`}
                  {service.postcode && ` ${service.postcode}`}
                </span>
              </div>
            )}
            {service.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <span>{service.phone}</span>
              </div>
            )}
            {service.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                <span>{service.email}</span>
              </div>
            )}
            {service.capacity && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-4 h-4 text-gray-400" />
                <span>Capacity: {service.capacity} children</span>
              </div>
            )}
            {service.operatingDays && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{service.operatingDays}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Centre Manager */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
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
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
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
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Notes
          </label>
          {!editing && (
            <button
              onClick={() => {
                setNotes(service.notes || "");
                setEditing(true);
              }}
              className="text-gray-400 hover:text-brand"
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
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
                className="text-xs px-3 py-1 text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {service.notes || "No notes yet."}
          </p>
        )}
      </div>

      {/* Daily Rates */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Daily Rates (per child per day)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">BSC</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">ASC</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">VC</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Casual Rates */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Casual Rates (per child per session)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">BSC Casual</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">ASC Casual</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Staffing Forecast */}
      <StaffingForecast serviceId={service.id} />

      {/* Summary Stats */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Summary
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <Target className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.rocks ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Active Rocks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <AlertCircle className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.issues ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Open Issues
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <CheckSquare className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.todos ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Pending Todos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand/5 rounded-lg">
            <FolderKanban className="w-4 h-4 text-brand" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.projects ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Active Projects
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Projects */}
      {service.projects && service.projects.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
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
                  <span className="text-xs text-gray-400">
                    {project.owner?.name || "Unassigned"}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
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

// ─── Staffing Forecast Sub-component ─────────────────────────────────────────

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function StaffingForecast({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useServiceStaffing(serviceId);

  if (isLoading) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Staffing Forecast
        </label>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data?.week) return null;

  const { week, monthlyOverstaffingCost } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
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
              <span className="text-[10px] text-gray-400 w-7 text-right font-medium">
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
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Smile className="w-3.5 h-3.5" />
          Parent Feedback
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={copyLink}
            className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-200 hover:border-gray-300"
            title="Copy survey link"
          >
            {copied ? "Copied!" : <><Copy className="w-3 h-3" /> Survey Link</>}
          </button>
          <a
            href={surveyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-200 hover:border-gray-300"
          >
            <ExternalLink className="w-3 h-3" /> Preview
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
      ) : !data || data.totalResponses === 0 ? (
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500">No feedback received yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Share the survey link with parents via WhatsApp or email.
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          {/* Summary row */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <span className="text-3xl">
                {SCORE_EMOJI[Math.round(data.overallAverage)] || "😐"}
              </span>
              <p className="text-lg font-bold text-gray-900">
                {data.overallAverage}
                <span className="text-xs font-normal text-gray-400">/5</span>
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {data.totalResponses} responses
              </p>
              <p className="text-xs text-gray-500">Last 8 weeks</p>
            </div>
          </div>

          {/* Weekly trend (sparkline using bars) */}
          {data.weeklyData?.length > 1 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
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
