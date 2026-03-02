"use client";

import { useState } from "react";
import { useCreateTodo } from "@/hooks/useTodos";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface RockOption {
  id: string;
  title: string;
}

export function CreateTodoModal({
  open,
  onClose,
  weekOf,
}: {
  open: boolean;
  onClose: () => void;
  weekOf: Date;
}) {
  const createTodo = useCreateTodo();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [rockId, setRockId] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    // Default due date = end of week (Sunday)
    const end = new Date(weekOf);
    end.setDate(end.getDate() + 6);
    return end.toISOString().split("T")[0];
  });
  const [error, setError] = useState("");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rocks } = useQuery<RockOption[]>({
    queryKey: ["rocks-list-active"],
    queryFn: async () => {
      const res = await fetch("/api/rocks");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: RockOption) => ({ id: r.id, title: r.title }));
    },
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!assigneeId) {
      setError("Please select an assignee");
      return;
    }

    createTodo.mutate(
      {
        title,
        description: description || undefined,
        assigneeId,
        rockId: rockId || null,
        dueDate,
        weekOf: weekOf.toISOString(),
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setAssigneeId("");
          setRockId("");
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Create New To-Do
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Week of{" "}
              {weekOf.toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="e.g., Follow up with NSW property managers"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">Select person...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Linked Rock{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={rockId}
              onChange={(e) => setRockId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            >
              <option value="">No linked Rock</option>
              {rocks?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTodo.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createTodo.isPending ? "Creating..." : "Create To-Do"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
