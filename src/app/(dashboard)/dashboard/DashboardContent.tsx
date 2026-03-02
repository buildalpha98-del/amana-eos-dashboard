"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mountain,
  CheckSquare,
  AlertCircle,
  Plus,
  TrendingUp,
  Building2,
  FolderKanban,
  ArrowRight,
  X,
} from "lucide-react";
import { getCurrentQuarter, getWeekStart } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "15", color }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}

interface DashboardData {
  rocks: { total: number; onTrack: number; complete: number };
  todos: { total: number; complete: number; overdue: number };
  issues: { open: number; inDiscussion: number; solved: number };
  services: { total: number; active: number };
  projects: { total: number; inProgress: number };
}

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
  const [dueDate, setDueDate] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

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
      if (!res.ok) throw new Error("Failed to create to-do");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setShowSuccess(true);
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setDueDate("");
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dueDate || !session?.user?.id) return;

    const dueDateObj = new Date(dueDate);
    const weekOf = getWeekStart(dueDateObj).toISOString().split("T")[0];

    createTodoMutation.mutate({
      title,
      assigneeId: session.user.id,
      dueDate: dueDateObj.toISOString().split("T")[0],
      weekOf,
      description: description || undefined,
    });
  };

  const getDefaultDueDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date *
            </label>
            <input
              type="date"
              value={dueDate || getDefaultDueDate()}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
              required
            />
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              disabled={createTodoMutation.isPending || !title || !dueDate}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50 transition-colors font-medium"
            >
              {createTodoMutation.isPending ? "Creating..." : "Create To-Do"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickAddIssueModal({
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
  const [priority, setPriority] = useState<"medium" | "high" | "critical" | "low">("medium");
  const [showSuccess, setShowSuccess] = useState(false);

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
      if (!res.ok) throw new Error("Failed to create issue");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setShowSuccess(true);
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="flex-1 px-4 py-2 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50 transition-colors font-medium"
            >
              {createIssueMutation.isPending ? "Creating..." : "Report Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [showSuccess, setShowSuccess] = useState(false);

  const createRockMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      ownerId: string;
      quarter: string;
      priority: string;
      description?: string;
    }) => {
      const res = await fetch("/api/rocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create rock");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      setShowSuccess(true);
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setShowSuccess(false);
        onClose();
      }, 1500);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !session?.user?.id) return;

    const quarter = getCurrentQuarter();

    createRockMutation.mutate({
      title,
      ownerId: session.user.id,
      quarter,
      priority,
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]/50"
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
              className="flex-1 px-4 py-2 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] disabled:opacity-50 transition-colors font-medium"
            >
              {createRockMutation.isPending ? "Creating..." : "Create Rock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DashboardContent() {
  const { data: session } = useSession();
  const quarter = getCurrentQuarter();
  const [openTodoModal, setOpenTodoModal] = useState(false);
  const [openIssueModal, setOpenIssueModal] = useState(false);
  const [openRockModal, setOpenRockModal] = useState(false);

  const { data: stats } = useQuery<DashboardData>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [rocksRes, todosRes, issuesRes, servicesRes, projectsRes] =
        await Promise.all([
          fetch("/api/rocks"),
          fetch("/api/todos"),
          fetch("/api/issues"),
          fetch("/api/services"),
          fetch("/api/projects"),
        ]);

      const rocks = rocksRes.ok ? await rocksRes.json() : [];
      const todos = todosRes.ok ? await todosRes.json() : [];
      const issues = issuesRes.ok ? await issuesRes.json() : [];
      const services = servicesRes.ok ? await servicesRes.json() : [];
      const projects = projectsRes.ok ? await projectsRes.json() : [];

      const now = new Date();

      return {
        rocks: {
          total: rocks.length,
          onTrack: rocks.filter((r: { status: string }) => r.status === "on_track").length,
          complete: rocks.filter((r: { status: string }) => r.status === "complete").length,
        },
        todos: {
          total: todos.length,
          complete: todos.filter((t: { status: string }) => t.status === "complete").length,
          overdue: todos.filter(
            (t: { status: string; dueDate: string }) =>
              t.status !== "complete" && new Date(t.dueDate) < now
          ).length,
        },
        issues: {
          open: issues.filter((i: { status: string }) => i.status === "open").length,
          inDiscussion: issues.filter((i: { status: string }) => i.status === "in_discussion").length,
          solved: issues.filter((i: { status: string }) => i.status === "solved").length,
        },
        services: {
          total: services.length,
          active: services.filter((s: { status: string }) => s.status === "active").length,
        },
        projects: {
          total: projects.length,
          inProgress: projects.filter((p: { status: string }) => p.status === "in_progress").length,
        },
      };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome back, {session?.user?.name?.split(" ")[0] || "there"}
        </h2>
        <p className="text-gray-500 mt-1">
          Here&apos;s your {quarter} overview at a glance.
        </p>
      </div>

      {/* Primary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Rocks"
          value={stats?.rocks.total || 0}
          subtitle={`${stats?.rocks.onTrack || 0} on track`}
          icon={Mountain}
          color="#004E64"
          href="/rocks"
        />
        <StatCard
          title="To-Dos"
          value={`${stats?.todos.complete || 0} / ${stats?.todos.total || 0}`}
          subtitle={
            stats?.todos.overdue
              ? `${stats.todos.overdue} overdue`
              : "completed"
          }
          icon={CheckSquare}
          color="#3B82F6"
          href="/todos"
        />
        <StatCard
          title="Open Issues"
          value={
            (stats?.issues.open || 0) + (stats?.issues.inDiscussion || 0)
          }
          subtitle="pending resolution"
          icon={AlertCircle}
          color="#EF4444"
          href="/issues"
        />
        <StatCard
          title="Service Centres"
          value={stats?.services.active || 0}
          subtitle={`of ${stats?.services.total || 0} total`}
          icon={Building2}
          color="#FECE00"
          href="/services"
        />
      </div>

      {/* Secondary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => setOpenTodoModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                <Plus className="w-4 h-4 text-[#004E64]" />
              </div>
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                Quick To-Do
              </span>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#004E64] transition-colors" />
            </button>
            <button
              onClick={() => setOpenIssueModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                <Plus className="w-4 h-4 text-[#004E64]" />
              </div>
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                Quick Issue
              </span>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#004E64] transition-colors" />
            </button>
            <button
              onClick={() => setOpenRockModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                <Plus className="w-4 h-4 text-[#004E64]" />
              </div>
              <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                Quick Rock
              </span>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#004E64] transition-colors" />
            </button>

            <div className="pt-2 border-t border-gray-200 mt-2">
              {[
                { label: "New Project", href: "/projects", icon: FolderKanban },
                { label: "Add Service Centre", href: "/services", icon: Building2 },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-[#004E64]" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 flex-1">
                    {item.label}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#004E64] transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Rock Progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Rock Progress</h3>
            <Link href="/rocks" className="text-sm text-[#004E64] hover:underline">
              View all
            </Link>
          </div>
          {stats && stats.rocks.total > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">On Track</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {stats.rocks.onTrack}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Complete</span>
                <span className="text-sm font-semibold text-gray-600">
                  {stats.rocks.complete}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-[#004E64] rounded-full transition-all"
                  style={{
                    width: `${
                      stats.rocks.total > 0
                        ? Math.round(
                            ((stats.rocks.onTrack + stats.rocks.complete) /
                              stats.rocks.total) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {stats.rocks.total > 0
                  ? Math.round(
                      ((stats.rocks.onTrack + stats.rocks.complete) /
                        stats.rocks.total) *
                        100
                    )
                  : 0}
                % healthy
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Mountain className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No Rocks for this quarter yet.</p>
              <Link
                href="/rocks"
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Rock
              </Link>
            </div>
          )}
        </div>

        {/* Projects Overview */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Projects</h3>
            <Link href="/projects" className="text-sm text-[#004E64] hover:underline">
              View all
            </Link>
          </div>
          {stats && stats.projects.total > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-sm font-semibold text-gray-700">
                  {stats.projects.total}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">In Progress</span>
                <span className="text-sm font-semibold text-blue-600">
                  {stats.projects.inProgress}
                </span>
              </div>
              <div
                className={cn(
                  "p-3 rounded-lg",
                  stats.projects.inProgress > 0 ? "bg-blue-50" : "bg-gray-50"
                )}
              >
                <p className="text-xs text-gray-600">
                  {stats.projects.inProgress > 0
                    ? `${stats.projects.inProgress} project${
                        stats.projects.inProgress > 1 ? "s" : ""
                      } actively underway`
                    : "No projects currently in progress"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No projects yet.</p>
              <Link
                href="/projects"
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Project
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Add Modals */}
      <QuickAddToDoModal
        isOpen={openTodoModal}
        onClose={() => setOpenTodoModal(false)}
      />
      <QuickAddIssueModal
        isOpen={openIssueModal}
        onClose={() => setOpenIssueModal(false)}
      />
      <QuickAddRockModal
        isOpen={openRockModal}
        onClose={() => setOpenRockModal(false)}
      />
    </div>
  );
}
