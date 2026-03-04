"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useTodoTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  type TodoTemplateData,
} from "@/hooks/useTodoTemplates";
import {
  X,
  Plus,
  Repeat,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  ChevronLeft,
} from "lucide-react";
import type { RecurrenceRule } from "@prisma/client";

interface UserOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const recurrenceLabels: Record<RecurrenceRule, string> = {
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const recurrenceBadgeColors: Record<RecurrenceRule, string> = {
  daily: "bg-purple-100 text-purple-700",
  weekly: "bg-blue-100 text-blue-700",
  fortnightly: "bg-cyan-100 text-cyan-700",
  monthly: "bg-emerald-100 text-emerald-700",
  quarterly: "bg-amber-100 text-amber-700",
};

interface TemplateFormData {
  title: string;
  description: string;
  assigneeId: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  nextRunAt: string;
}

const emptyForm: TemplateFormData = {
  title: "",
  description: "",
  assigneeId: "",
  serviceId: "",
  recurrence: "weekly",
  nextRunAt: new Date().toISOString().split("T")[0],
};

export function TemplateManagerModal({ onClose }: { onClose: () => void }) {
  const { data: templates, isLoading } = useTodoTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [error, setError] = useState("");

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setView("form");
  }, []);

  const openEditForm = useCallback((template: TodoTemplateData) => {
    setEditingId(template.id);
    setForm({
      title: template.title,
      description: template.description || "",
      assigneeId: template.assigneeId,
      serviceId: template.serviceId || "",
      recurrence: template.recurrence,
      nextRunAt: new Date(template.nextRunAt).toISOString().split("T")[0],
    });
    setError("");
    setView("form");
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!form.assigneeId) {
        setError("Please select an assignee");
        return;
      }

      const payload = {
        title: form.title,
        description: form.description || undefined,
        assigneeId: form.assigneeId,
        serviceId: form.serviceId || null,
        recurrence: form.recurrence,
        nextRunAt: form.nextRunAt,
      };

      if (editingId) {
        updateTemplate.mutate(
          { id: editingId, ...payload },
          {
            onSuccess: () => {
              setView("list");
              setEditingId(null);
            },
            onError: (err: Error) => setError(err.message),
          }
        );
      } else {
        createTemplate.mutate(payload, {
          onSuccess: () => {
            setView("list");
            setForm(emptyForm);
          },
          onError: (err: Error) => setError(err.message),
        });
      }
    },
    [form, editingId, createTemplate, updateTemplate]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("Remove this template? It will stop generating new to-dos.")) return;
      deleteTemplate.mutate(id);
    },
    [deleteTemplate]
  );

  const handleToggleActive = useCallback(
    (template: TodoTemplateData) => {
      updateTemplate.mutate({
        id: template.id,
        isActive: !template.isActive,
      });
    },
    [updateTemplate]
  );

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {view === "form" && (
              <button
                onClick={() => setView("list")}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 mr-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Repeat className="w-5 h-5 text-[#004E64]" />
            <h2 className="text-lg font-semibold text-gray-900">
              {view === "form"
                ? editingId
                  ? "Edit Template"
                  : "New Template"
                : "Recurring Templates"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" ? (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[#004E64]" />
                </div>
              ) : templates && templates.length > 0 ? (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {template.title}
                          </h4>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                              recurrenceBadgeColors[template.recurrence]
                            }`}
                          >
                            {recurrenceLabels[template.recurrence]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{template.assignee.name}</span>
                          {template.service && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>{template.service.code}</span>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Next:{" "}
                            {new Date(template.nextRunAt).toLocaleDateString(
                              "en-AU",
                              {
                                day: "numeric",
                                month: "short",
                              }
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Active toggle */}
                      <button
                        onClick={() => handleToggleActive(template)}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                          template.isActive ? "bg-[#004E64]" : "bg-gray-300"
                        }`}
                        title={template.isActive ? "Active" : "Paused"}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            template.isActive ? "translate-x-5" : ""
                          }`}
                        />
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openEditForm(template)}
                        className="p-1.5 text-gray-400 hover:text-[#004E64] rounded-md hover:bg-gray-100"
                        title="Edit template"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100"
                        title="Remove template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-[#004E64]/5 flex items-center justify-center mx-auto mb-4">
                    <Repeat className="w-7 h-7 text-[#004E64]/30" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    No templates yet
                  </h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Create a recurring template to automatically generate to-dos
                    on a schedule.
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Create / Edit Form */
            <form onSubmit={handleSubmit} className="space-y-4" id="template-form">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  placeholder="e.g., Weekly service report"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent resize-none"
                  placeholder="Add details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignee
                  </label>
                  <select
                    required
                    value={form.assigneeId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, assigneeId: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  >
                    <option value="">Select person...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={form.serviceId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, serviceId: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  >
                    <option value="">No service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recurrence
                  </label>
                  <select
                    required
                    value={form.recurrence}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        recurrence: e.target.value as RecurrenceRule,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Next Run Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.nextRunAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nextRunAt: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {view === "list" ? (
            <>
              <p className="text-xs text-gray-400">
                {templates?.length || 0} template{templates?.length !== 1 ? "s" : ""}
              </p>
              <button
                onClick={openCreateForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#004E64] text-white hover:bg-[#003D52] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Template
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView("list")}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="template-form"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[#004E64] text-white hover:bg-[#003D52] disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
                {editingId ? "Save Changes" : "Create Template"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
