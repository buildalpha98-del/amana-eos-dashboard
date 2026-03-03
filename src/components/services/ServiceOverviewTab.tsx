"use client";

import { useState } from "react";
import { useUpdateService } from "@/hooks/useServices";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

const statusOptions = [
  { key: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "onboarding", label: "Onboarding", color: "bg-blue-100 text-blue-700 border-blue-300" },
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
  const updateService = useUpdateService();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");

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
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
          Contact Details
        </label>
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
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
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
              className="text-gray-400 hover:text-[#004E64]"
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  updateService.mutate({ id: service.id, notes });
                  setEditing(false);
                }}
                className="text-xs px-3 py-1 bg-[#004E64] text-white rounded-md"
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#004E64]"
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Summary
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#004E64]/5 rounded-lg">
            <Target className="w-4 h-4 text-[#004E64]" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.rocks ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Active Rocks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#004E64]/5 rounded-lg">
            <AlertCircle className="w-4 h-4 text-[#004E64]" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.issues ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Open Issues
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#004E64]/5 rounded-lg">
            <CheckSquare className="w-4 h-4 text-[#004E64]" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {service._count?.todos ?? 0}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Pending Todos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#004E64]/5 rounded-lg">
            <FolderKanban className="w-4 h-4 text-[#004E64]" />
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
                  className="w-full flex items-center gap-2 px-3 py-2 bg-[#004E64]/5 rounded-lg text-sm text-left hover:bg-[#004E64]/10 transition-colors"
                >
                  <FolderKanban className="w-4 h-4 text-[#004E64] flex-shrink-0" />
                  <span className="flex-1 truncate text-[#004E64] font-medium">
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
    </div>
  );
}
