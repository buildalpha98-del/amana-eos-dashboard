"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Plus,
  Trash2,
  Loader2,
  ListPlus,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAiGenerate } from "@/hooks/useAiGenerate";

interface UserOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface BulkTodoRow {
  title: string;
  assigneeId: string;
  serviceId: string;
  dueDate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  weekOf: Date;
}

const emptyRow = (weekOf: Date): BulkTodoRow => ({
  title: "",
  assigneeId: "",
  serviceId: "",
  dueDate: new Date(weekOf.getTime() + 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
});

export function BulkCreateTodosModal({ open, onClose, weekOf }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<BulkTodoRow[]>(() => [
    emptyRow(weekOf),
    emptyRow(weekOf),
    emptyRow(weekOf),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [showAiNotes, setShowAiNotes] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState("");
  const { generate: aiGenerate, isLoading: aiLoading } = useAiGenerate();

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

  const updateRow = useCallback(
    (index: number, field: keyof BulkTodoRow, value: string) => {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  const addRow = useCallback(() => {
    if (rows.length >= 50) return;
    setRows((prev) => [...prev, emptyRow(weekOf)]);
  }, [rows.length, weekOf]);

  const removeRow = useCallback(
    (index: number) => {
      if (rows.length <= 1) return;
      setRows((prev) => prev.filter((_, i) => i !== index));
    },
    [rows.length]
  );

  const validRows = rows.filter(
    (r) => r.title.trim() && r.assigneeId && r.dueDate
  );

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/todos/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          todos: validRows.map((r) => ({
            title: r.title.trim(),
            assigneeId: r.assigneeId,
            serviceId: r.serviceId || undefined,
            dueDate: r.dueDate,
            weekOf: weekOf.toISOString(),
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk create failed");
      }

      const data = await res.json();
      setResult({ created: data.created });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleAiExtract = async () => {
    if (!meetingNotes.trim()) return;
    const result = await aiGenerate({
      templateSlug: "todos/from-meeting-notes",
      variables: {
        meetingNotes: meetingNotes.trim(),
        attendees: users.map((u) => u.name).join(", "),
      },
      section: "todos",
    });
    if (!result) return;
    try {
      // Extract JSON array from the response (it may have markdown wrapping)
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      const parsed = JSON.parse(jsonMatch[0]) as { title: string; assignee: string; priority: string }[];
      const newRows: BulkTodoRow[] = parsed.map((item) => {
        const matchedUser = users.find((u) =>
          u.name.toLowerCase().includes(item.assignee.toLowerCase())
        );
        return {
          title: item.title,
          assigneeId: matchedUser?.id || "",
          serviceId: "",
          dueDate: new Date(weekOf.getTime() + 6 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        };
      });
      if (newRows.length > 0) {
        setRows(newRows);
        setShowAiNotes(false);
      }
    } catch {
      setError("Could not parse AI response. Try rephrasing your notes.");
    }
  };

  const handleClose = () => {
    setRows([emptyRow(weekOf), emptyRow(weekOf), emptyRow(weekOf)]);
    setError(null);
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-semibold text-gray-900">
              Bulk Create To-Dos
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {result ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <ListPlus className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {result.created} To-Dos Created
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                All to-dos have been added to this week.
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* AI Meeting Notes Extractor */}
              <div className="border border-purple-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowAiNotes(!showAiNotes)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50 hover:bg-purple-100 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-purple-700">
                    <Sparkles className="w-4 h-4" />
                    Extract from Meeting Notes
                  </span>
                  {showAiNotes ? (
                    <ChevronUp className="w-4 h-4 text-purple-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-purple-500" />
                  )}
                </button>
                {showAiNotes && (
                  <div className="p-4 space-y-3">
                    <textarea
                      rows={5}
                      value={meetingNotes}
                      onChange={(e) => setMeetingNotes(e.target.value)}
                      placeholder="Paste your L10 meeting notes here... AI will extract action items with assignees."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 focus:outline-none resize-none"
                    />
                    <button
                      onClick={handleAiExtract}
                      disabled={!meetingNotes.trim() || aiLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Extract To-Dos
                    </button>
                  </div>
                )}
              </div>

              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <span className="text-xs font-mono text-gray-400 mt-2.5 w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="To-Do title *"
                      value={row.title}
                      onChange={(e) => updateRow(i, "title", e.target.value)}
                      className="sm:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                    <select
                      value={row.assigneeId}
                      onChange={(e) =>
                        updateRow(i, "assigneeId", e.target.value)
                      }
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      <option value="">Assignee *</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.serviceId}
                      onChange={(e) =>
                        updateRow(i, "serviceId", e.target.value)
                      }
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      <option value="">Centre (optional)</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 mt-1.5"
                    title="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                onClick={addRow}
                disabled={rows.length >= 50}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add Row ({rows.length}/50)
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-400">
              {validRows.length} of {rows.length} rows valid
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={validRows.length === 0 || loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ListPlus className="w-4 h-4" />
                )}
                Create {validRows.length} To-Dos
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
