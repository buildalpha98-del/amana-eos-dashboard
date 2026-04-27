"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useCoordinatorTodos, type CoordinatorTodoRow } from "@/hooks/useCoordinatorTodos";
import { CoordinatorTodoForm } from "./CoordinatorTodoForm";
import { Plus, Filter } from "lucide-react";

const STATUS_PILL: Record<string, string> = {
  pending: "bg-surface text-muted border-border",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

function daysUntil(iso: string): string {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 3600_000));
  if (d === 0) return "today";
  if (d > 0) return `in ${d}d`;
  return `${-d}d overdue`;
}

export default function CoordinatorTodosContent() {
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("pending");
  const queryStatus = filter === "all" ? undefined : filter === "completed" ? "completed" : "pending";
  const { data, isLoading, isError, error, refetch } = useCoordinatorTodos({ status: queryStatus });
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Coordinator Todos"
        description="Push tasks to centre coordinators (or their managers as fallback). One todo per centre, auto-assigned, with email notification."
        primaryAction={{
          label: createOpen ? "Hide form" : "New todo",
          icon: Plus,
          onClick: () => setCreateOpen((v) => !v),
        }}
      />

      {createOpen && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Send a todo to one or more centres</h3>
          <CoordinatorTodoForm
            onCreated={() => {
              setCreateOpen(false);
              refetch();
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </section>
      )}

      <div className="flex items-center gap-2 text-xs">
        <Filter className="w-3.5 h-3.5 text-muted" aria-hidden />
        {(["pending", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full border ${
              filter === f ? "bg-brand text-white border-brand" : "bg-card text-muted border-border hover:text-foreground"
            }`}
            aria-pressed={filter === f}
          >
            {f === "all" ? "All" : f === "pending" ? "Active" : "Done"}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && <ErrorState title="Couldn't load todos" error={error ?? undefined} onRetry={() => refetch()} />}

      {data && data.todos.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
          No todos here. Click <strong>New todo</strong> to push a task to one or more centres.
        </p>
      )}

      {data && data.todos.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Centre</th>
                <th className="text-left p-3 font-medium">Assignee</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {data.todos.map((t: CoordinatorTodoRow) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium text-foreground">{t.title}</div>
                    {t.description && (
                      <div className="text-xs text-muted line-clamp-2 whitespace-pre-line">{t.description}</div>
                    )}
                  </td>
                  <td className="p-3 text-foreground">{t.service?.name ?? "—"}</td>
                  <td className="p-3 text-muted text-xs">{t.assignee?.name ?? "—"}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_PILL[t.status]}`}>
                      {t.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-3 text-foreground text-xs">
                    {fmtDate(t.dueDate)} <span className="text-muted">· {daysUntil(t.dueDate)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
