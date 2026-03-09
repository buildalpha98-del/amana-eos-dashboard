"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Target,
  Check,
} from "lucide-react";
import {
  useKPIs,
  useCreateKPI,
  useUpdateKPI,
  useDeleteKPI,
} from "@/hooks/useMarketing";

// ── Constants ──────────────────────────────────────────────

const CATEGORIES = ["All", "Engagement", "Growth", "Content", "Conversion"] as const;

const PERIOD_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const CATEGORY_OPTIONS = [
  { value: "Engagement", label: "Engagement" },
  { value: "Growth", label: "Growth" },
  { value: "Content", label: "Content" },
  { value: "Conversion", label: "Conversion" },
];

const categoryBadgeColors: Record<string, string> = {
  engagement: "bg-blue-100 text-blue-700",
  growth: "bg-green-100 text-green-700",
  content: "bg-purple-100 text-purple-700",
  conversion: "bg-amber-100 text-amber-700",
};

const periodBadgeColors: Record<string, string> = {
  weekly: "bg-gray-100 text-gray-600",
  monthly: "bg-sky-100 text-sky-700",
  quarterly: "bg-indigo-100 text-indigo-700",
  yearly: "bg-teal-100 text-teal-700",
};

// ── Types ──────────────────────────────────────────────────

interface KPIData {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string | null;
  period: string;
  category: string;
}

interface CreateKPIForm {
  name: string;
  target: string;
  current: string;
  unit: string;
  period: string;
  category: string;
}

const emptyForm: CreateKPIForm = {
  name: "",
  target: "",
  current: "0",
  unit: "",
  period: "monthly",
  category: "Engagement",
};

// ── Component ──────────────────────────────────────────────

export function KPIsTab() {
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CreateKPIForm>(emptyForm);
  const [createForm, setCreateForm] = useState<CreateKPIForm>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const { data: kpis, isLoading, isError } = useKPIs();
  const createKPI = useCreateKPI();
  const updateKPI = useUpdateKPI();
  const deleteKPI = useDeleteKPI();

  // ── Filtered list ─────────────────────────────────────────
  const filteredKPIs =
    categoryFilter === "All"
      ? (kpis ?? [])
      : (kpis ?? []).filter(
          (k: KPIData) =>
            k.category.toLowerCase() === categoryFilter.toLowerCase()
        );

  // ── Handlers ──────────────────────────────────────────────

  function startEdit(kpi: KPIData) {
    setEditingId(kpi.id);
    setEditForm({
      name: kpi.name,
      target: String(kpi.target),
      current: String(kpi.current),
      unit: kpi.unit ?? "",
      period: kpi.period,
      category: kpi.category,
    });
    setFormError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
    setFormError("");
  }

  function handleSaveEdit(id: string) {
    if (!editForm.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!editForm.target || Number(editForm.target) <= 0) {
      setFormError("Target must be greater than 0.");
      return;
    }

    updateKPI.mutate(
      {
        id,
        name: editForm.name.trim(),
        target: Number(editForm.target),
        current: Number(editForm.current) || 0,
        unit: editForm.unit.trim() || null,
        period: editForm.period,
        category: editForm.category,
      },
      {
        onSuccess: () => cancelEdit(),
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Failed to update KPI."
          ),
      }
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!createForm.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!createForm.target || Number(createForm.target) <= 0) {
      setFormError("Target must be greater than 0.");
      return;
    }

    createKPI.mutate(
      {
        name: createForm.name.trim(),
        target: Number(createForm.target),
        current: Number(createForm.current) || 0,
        unit: createForm.unit.trim() || null,
        period: createForm.period,
        category: createForm.category,
      },
      {
        onSuccess: () => {
          setShowCreateModal(false);
          setCreateForm(emptyForm);
          setFormError("");
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Failed to create KPI."
          ),
      }
    );
  }

  function handleDelete(id: string) {
    deleteKPI.mutate(id, {
      onSuccess: () => setDeleteConfirmId(null),
    });
  }

  // ── Progress helper ───────────────────────────────────────

  function progressPct(current: number, target: number): number {
    if (target <= 0) return 0;
    return Math.min(100, (current / target) * 100);
  }

  // ── Render ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading KPIs...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16">
        <Target className="mb-3 h-10 w-10 text-red-300" />
        <p className="text-lg font-medium text-gray-700">Failed to load KPIs</p>
        <p className="mt-1 text-sm text-gray-500">
          Something went wrong. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              categoryFilter === cat
                ? "bg-[#004E64] text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {cat}
          </button>
        ))}

        <div className="ml-auto">
          <button
            onClick={() => {
              setCreateForm(emptyForm);
              setFormError("");
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003d4f]"
          >
            <Plus className="h-4 w-4" />
            New KPI
          </button>
        </div>
      </div>

      {/* Card Grid */}
      {!filteredKPIs || filteredKPIs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16">
          <Target className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">No KPIs found</p>
          <p className="mt-1 text-sm text-gray-500">
            {categoryFilter !== "All"
              ? "Try selecting a different category or create a new KPI."
              : "Create your first KPI to start tracking performance."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKPIs.map((kpi: KPIData) => {
            const isEditing = editingId === kpi.id;
            const isDeleting = deleteConfirmId === kpi.id;
            const pct = progressPct(kpi.current, kpi.target);
            const isComplete = pct >= 100;

            // ── Inline Edit Form ────────────────────────────
            if (isEditing) {
              return (
                <div
                  key={kpi.id}
                  className="rounded-xl border border-[#004E64] bg-white p-5"
                >
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Target
                        </label>
                        <input
                          type="number"
                          value={editForm.target}
                          onChange={(e) =>
                            setEditForm({ ...editForm, target: e.target.value })
                          }
                          min="0"
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Current
                        </label>
                        <input
                          type="number"
                          value={editForm.current}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              current: e.target.value,
                            })
                          }
                          min="0"
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={editForm.unit}
                        onChange={(e) =>
                          setEditForm({ ...editForm, unit: e.target.value })
                        }
                        placeholder="e.g. %, followers, posts"
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Period
                        </label>
                        <select
                          value={editForm.period}
                          onChange={(e) =>
                            setEditForm({ ...editForm, period: e.target.value })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                        >
                          {PERIOD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Category
                        </label>
                        <select
                          value={editForm.category}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              category: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {formError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                        {formError}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(kpi.id)}
                        disabled={updateKPI.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#004E64] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {updateKPI.isPending ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // ── Normal KPI Card ─────────────────────────────
            return (
              <div
                key={kpi.id}
                className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">
                      {kpi.name}
                    </h4>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          categoryBadgeColors[kpi.category.toLowerCase()] ??
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {kpi.category}
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          periodBadgeColors[kpi.period.toLowerCase()] ??
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {kpi.period.charAt(0).toUpperCase() +
                          kpi.period.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => startEdit(kpi)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(kpi.id)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="h-3 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        isComplete ? "bg-green-500" : "bg-[#004E64]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Values */}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">
                      {kpi.current.toLocaleString()}
                    </span>
                    {" / "}
                    <span>{kpi.target.toLocaleString()}</span>
                    {kpi.unit && (
                      <span className="ml-1 text-xs text-gray-400">
                        {kpi.unit}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isComplete ? "text-green-600" : "text-[#004E64]"
                    }`}
                  >
                    {Math.round(pct)}%
                  </span>
                </div>

                {/* Delete Confirmation */}
                {isDeleting && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-700 mb-2">
                      Delete this KPI? This action cannot be undone.
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(kpi.id)}
                        disabled={deleteKPI.isPending}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteKPI.isPending ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create KPI Modal ─────────────────────────────────── */}
      {showCreateModal && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/30"
            onClick={() => {
              setShowCreateModal(false);
              setFormError("");
            }}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-md rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  New KPI
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormError("");
                  }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleCreate}
                className="max-h-[70vh] overflow-y-auto px-6 py-5"
              >
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, name: e.target.value })
                      }
                      placeholder="e.g. Monthly Engagement Rate"
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                    />
                  </div>

                  {/* Target & Current */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Target <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={createForm.target}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            target: e.target.value,
                          })
                        }
                        min="0"
                        placeholder="0"
                        required
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Current
                      </label>
                      <input
                        type="number"
                        value={createForm.current}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            current: e.target.value,
                          })
                        }
                        min="0"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      />
                    </div>
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={createForm.unit}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, unit: e.target.value })
                      }
                      placeholder="e.g. %, followers, posts"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                    />
                  </div>

                  {/* Period & Category */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Period
                      </label>
                      <select
                        value={createForm.period}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            period: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      >
                        {PERIOD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Category
                      </label>
                      <select
                        value={createForm.category}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            category: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Error */}
                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      {formError}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setFormError("");
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createKPI.isPending}
                    className="rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50"
                  >
                    {createKPI.isPending ? "Creating..." : "Create KPI"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
