"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getCurrentQuarter, getWeekStart } from "@/lib/utils";

function getDefaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

// ─── Context ─────────────────────────────────────────────────

interface QuickAddContextValue {
  openTodoModal: () => void;
  openIssueModal: () => void;
  openRockModal: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [todoOpen, setTodoOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [rockOpen, setRockOpen] = useState(false);

  return (
    <QuickAddContext.Provider
      value={{
        openTodoModal: () => setTodoOpen(true),
        openIssueModal: () => setIssueOpen(true),
        openRockModal: () => setRockOpen(true),
      }}
    >
      {children}
      <QuickAddToDoModal isOpen={todoOpen} onClose={() => setTodoOpen(false)} />
      <QuickAddIssueModal isOpen={issueOpen} onClose={() => setIssueOpen(false)} />
      <QuickAddRockModal isOpen={rockOpen} onClose={() => setRockOpen(false)} />
    </QuickAddContext.Provider>
  );
}

// ─── Quick Add To-Do Modal ───────────────────────────────────

function QuickAddToDoModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(getDefaultDueDate);
  const [assigneeId, setAssigneeId] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: users = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
  });

  // Reset form every time modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setDueDate(getDefaultDueDate());
      setAssigneeId(session?.user?.id || "");
      setShowSuccess(false);
      setErrorMsg("");
    }
  }, [isOpen, session?.user?.id]);

  const createTodoMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      assigneeId: string;
      dueDate: string;
      weekOf: string;
      description?: string;
    }) => {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create to-do");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setShowSuccess(true);
      setErrorMsg("");
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Something went wrong");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dueDate || !assigneeId) return;

    setErrorMsg("");
    const dueDateObj = new Date(dueDate);
    const weekOf = getWeekStart(dueDateObj).toISOString().split("T")[0];

    createTodoMutation.mutate({
      title,
      assigneeId,
      dueDate: dueDateObj.toISOString().split("T")[0],
      weekOf,
      description: description || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Quick Add To-Do</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
            To-Do created successfully!
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignee *
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
                required
              >
                <option value="">Select assignee...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTodoMutation.isPending || !title || !dueDate || !assigneeId}
              className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors font-medium"
            >
              {createTodoMutation.isPending ? "Creating..." : "Create To-Do"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Add Issue Modal ───────────────────────────────────

function QuickAddIssueModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"medium" | "high" | "critical" | "low">("medium");
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset form every time modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setShowSuccess(false);
      setErrorMsg("");
    }
  }, [isOpen]);

  const createIssueMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      priority: string;
      description?: string;
    }) => {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create issue");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setShowSuccess(true);
      setErrorMsg("");
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Something went wrong");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    setErrorMsg("");
    createIssueMutation.mutate({
      title,
      priority,
      description: description || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Quick Report Issue</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
            Issue created successfully!
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the issue?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createIssueMutation.isPending || !title}
              className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors font-medium"
            >
              {createIssueMutation.isPending ? "Creating..." : "Report Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Add Rock Modal ────────────────────────────────────

function QuickAddRockModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"medium" | "high" | "critical">("medium");
  const [rockType, setRockType] = useState<"company" | "personal">("personal");
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset form every time modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setRockType("personal");
      setShowSuccess(false);
      setErrorMsg("");
    }
  }, [isOpen]);

  const createRockMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      ownerId: string;
      quarter: string;
      priority: string;
      rockType: string;
      description?: string;
    }) => {
      const res = await fetch("/api/rocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create rock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      setShowSuccess(true);
      setErrorMsg("");
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Something went wrong");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !session?.user?.id) return;

    setErrorMsg("");
    const quarter = getCurrentQuarter();

    createRockMutation.mutate({
      title,
      ownerId: session.user.id,
      quarter,
      priority,
      rockType,
      description: description || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Quick Add Rock</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm">
            Rock created successfully!
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your rock goal?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rock Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRockType("company")}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  rockType === "company"
                    ? "bg-brand text-white border-brand"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Company
              </button>
              <button
                type="button"
                onClick={() => setRockType("personal")}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  rockType === "personal"
                    ? "bg-brand text-white border-brand"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Personal
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details and context..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRockMutation.isPending || !title}
              className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors font-medium"
            >
              {createRockMutation.isPending ? "Creating..." : "Create Rock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
