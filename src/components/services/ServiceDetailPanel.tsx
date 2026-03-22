"use client";

import { useState } from "react";
import { useService, useUpdateService } from "@/hooks/useServices";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { WeeklyDataEntry } from "./WeeklyDataEntry";
import {
  X,
  MapPin,
  Phone,
  Mail,
  Users,
  Calendar,
  CheckSquare,
  AlertCircle,
  FolderKanban,
  Edit3,
  DollarSign,
  BarChart3,
} from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

const statusOptions = [
  { key: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "onboarding", label: "Onboarding", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "closing", label: "Closing", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "closed", label: "Closed", color: "bg-gray-100 text-gray-500 border-gray-300" },
] as const;

export function ServiceDetailPanel({
  serviceId,
  onClose,
  onNavigateToProject,
}: {
  serviceId: string;
  onClose: () => void;
  onNavigateToProject?: (projectId: string) => void;
}) {
  const { data: service, isLoading } = useService(serviceId);
  const updateService = useUpdateService();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "weekly" | "financials">("overview");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading || !service) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card shadow-2xl border-l border-border z-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card shadow-2xl border-l border-border z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {service.name}
            </h3>
            <p className="text-xs text-muted font-mono">{service.code}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {([
            { key: "overview", label: "Overview" },
            { key: "weekly", label: "Weekly Data", icon: BarChart3 },
            { key: "financials", label: "Financials", icon: DollarSign },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Weekly Data Tab */}
          {activeTab === "weekly" && (
            <WeeklyDataEntry
              serviceId={serviceId}
              bscRate={service.bscDailyRate || 0}
              ascRate={service.ascDailyRate || 0}
              vcRate={service.vcDailyRate || 0}
            />
          )}

          {/* Financials Tab */}
          {activeTab === "financials" && (
            <div className="text-center py-12 text-muted text-sm">
              Financial summary is available on the Financial Dashboard page filtered to this centre.
            </div>
          )}

          {activeTab !== "overview" ? null : (
          <>
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
                    updateService.mutate({ id: serviceId, status: s.key })
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

          {/* Contact Info */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider">
              Contact Details
            </label>
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
                <span>{service.phone}</span>
              </div>
            )}
            {service.email && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Mail className="w-4 h-4 text-muted" />
                <span>{service.email}</span>
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
          </div>

          {/* Manager */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
              Centre Manager
            </label>
            <select
              value={service.managerId || ""}
              onChange={(e) =>
                updateService.mutate({
                  id: serviceId,
                  managerId: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Unassigned</option>
              {users?.map((u) => (
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
                      updateService.mutate({ id: serviceId, notes });
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

          {/* Active Todos */}
          {service.todos && service.todos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
                Active To-Dos ({service.todos.length})
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {service.todos.slice(0, 10).map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-2 px-3 py-2 bg-surface/50 rounded-lg text-sm"
                  >
                    <CheckSquare
                      className={cn(
                        "w-4 h-4 flex-shrink-0",
                        todo.status === "complete"
                          ? "text-emerald-500"
                          : "text-muted/50"
                      )}
                    />
                    <span className="flex-1 truncate text-foreground/80">
                      {todo.title}
                    </span>
                    <span className="text-xs text-muted">
                      {todo.assignee?.name ?? "Unassigned"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Issues */}
          {service.issues && service.issues.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                Open Issues ({service.issues.length})
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {service.issues.slice(0, 10).map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center gap-2 px-3 py-2 bg-surface/50 rounded-lg text-sm"
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        issue.priority === "critical"
                          ? "bg-red-500"
                          : issue.priority === "high"
                          ? "bg-orange-500"
                          : issue.priority === "medium"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                      )}
                    />
                    <span className="flex-1 truncate text-foreground/80">
                      {issue.title}
                    </span>
                    <span className="text-xs text-muted">
                      {issue.owner?.name || "Unassigned"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {service.projects && service.projects.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                <FolderKanban className="w-3.5 h-3.5 inline mr-1" />
                Projects ({service.projects.length})
              </label>
              <div className="space-y-1.5">
                {service.projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onNavigateToProject?.(project.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-brand/5 rounded-lg text-sm text-left hover:bg-brand/10 transition-colors"
                  >
                    <FolderKanban className="w-4 h-4 text-brand flex-shrink-0" />
                    <span className="flex-1 truncate text-brand font-medium">
                      {project.name}
                    </span>
                    <span className="text-xs text-muted capitalize">
                      {project.status.replace("_", " ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rate Configuration */}
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
                    updateService.mutate({ id: serviceId, bscDailyRate: isNaN(val) ? null : val });
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
                    updateService.mutate({ id: serviceId, ascDailyRate: isNaN(val) ? null : val });
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
                    updateService.mutate({ id: serviceId, vcDailyRate: isNaN(val) ? null : val });
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="$0"
                />
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </>
  );
}
