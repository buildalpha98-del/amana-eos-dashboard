"use client";

import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mountain,
  CheckSquare,
  Plus,
  FolderKanban,
  Building2,
  ArrowRight,
  X,
  Loader2,
} from "lucide-react";
import { getCurrentQuarter, getWeekStart } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

// Command Centre components
import { useDashboardData } from "@/hooks/useDashboardData";
import { KeyMetricsBar } from "@/components/dashboard/KeyMetricsBar";
import { DashboardRocks } from "@/components/dashboard/DashboardRocks";
import { DashboardAnnouncements } from "@/components/dashboard/DashboardAnnouncements";
import { CentreHealthHeatmap } from "@/components/dashboard/CentreHealthHeatmap";
import { TrendSparklines } from "@/components/dashboard/TrendSparklines";
import { ActionItemsFeed } from "@/components/dashboard/ActionItemsFeed";
import { DashboardProjectTodos } from "@/components/dashboard/DashboardProjectTodos";

// ─── Quick Add Modals (kept from original) ─────────────────────

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
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
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
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
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
  const [rockType, setRockType] = useState<"company" | "personal">("personal");
  const [showSuccess, setShowSuccess] = useState(false);

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
      if (!res.ok) throw new Error("Failed to create rock");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-command-centre"] });
      queryClient.invalidateQueries({ queryKey: ["rocks"] });
      setShowSuccess(true);
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setRockType("personal");
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
              Rock Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRockType("company")}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  rockType === "company"
                    ? "bg-[#004E64] text-white border-[#004E64]"
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
                    ? "bg-[#004E64] text-white border-[#004E64]"
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

// ─── Main Dashboard Content ─────────────────────────────────

function getPeriodOptions(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const options = [];
  for (let q = 1; q <= 4; q++) {
    options.push({ value: `Q${q}-${year}`, label: `Q${q} ${year}` });
  }
  options.push({ value: `yearly-${year}`, label: `Full Year ${year}` });
  return options;
}

export function DashboardContent() {
  const { data: session } = useSession();
  const quarter = getCurrentQuarter();
  const [period, setPeriod] = useState(quarter);
  const [openTodoModal, setOpenTodoModal] = useState(false);
  const [openIssueModal, setOpenIssueModal] = useState(false);
  const [openRockModal, setOpenRockModal] = useState(false);

  const periodOptions = getPeriodOptions();
  const { data, isLoading } = useDashboardData(period);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Command Centre
          </h2>
          <p className="text-gray-500 mt-1">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"} &mdash;{" "}
            overview across all centres.
          </p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                period === opt.value
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#004E64] animate-spin" />
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      ) : data ? (
        <>
          {/* ── Key Metrics Bar ─────────────────────────────── */}
          <KeyMetricsBar metrics={data.keyMetrics} />

          {/* ── Quick Actions ─────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Quick Actions
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <button
                onClick={() => setOpenTodoModal(true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-[#004E64]" />
                </div>
                <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                  Quick Rock
                </span>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#004E64] transition-colors" />
              </button>
              {[
                { label: "New Project", href: "/projects", icon: FolderKanban },
                { label: "Add Centre", href: "/services", icon: Building2 },
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

          {/* ── Company & Personal Rocks at a Glance ─────── */}
          <DashboardRocks />

          {/* ── Latest Announcements ───────────────────────── */}
          <DashboardAnnouncements />

          {/* ── Centre Health Heatmap ──────────────────────── */}
          <CentreHealthHeatmap centres={data.centreHealth} networkAvgScore={data.networkAvgScore} />

          {/* ── Project To-Dos ─────────────────────────────── */}
          <DashboardProjectTodos todos={data.projectTodos} />

          {/* ── Sparklines + Action Items ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <TrendSparklines
                revenue={data.trends.revenue}
                enrolments={data.trends.enrolments}
                tickets={data.trends.tickets}
              />
            </div>
            <div className="lg:col-span-2">
              <ActionItemsFeed
                overdueTodos={data.actionItems.overdueTodos}
                unassignedTickets={data.actionItems.unassignedTickets}
                idsIssues={data.actionItems.idsIssues}
                overdueRocks={data.actionItems.overdueRocks}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p>Unable to load dashboard data. Please try again.</p>
        </div>
      )}

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
