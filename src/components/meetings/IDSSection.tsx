"use client";

import { useState } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import type { IssueData } from "@/hooks/useIssues";
import { cn } from "@/lib/utils";

export function IDSSection({
  issues,
  onUpdateStatus,
  onCreateIssue,
  onCreateTodo,
  onUpdatePriority,
  onUpdateDescription,
  users,
}: {
  issues: IssueData[] | undefined;
  onUpdateStatus: (id: string, status: string) => void;
  onCreateIssue: (title: string, priority?: string) => void;
  onCreateTodo: (data: { title: string; description?: string; assigneeIds: string[]; issueId: string }) => void;
  onUpdatePriority: (id: string, priority: string) => void;
  onUpdateDescription: (id: string, description: string) => void;
  users: { id: string; name: string }[] | undefined;
}) {
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [showCreateTodo, setShowCreateTodo] = useState<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoAssignees, setNewTodoAssignees] = useState<string[]>([]);
  const [newTodoDescription, setNewTodoDescription] = useState("");
  const [newIssuePriority, setNewIssuePriority] = useState("medium");

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = issues
    ? [...issues].sort(
        (a, b) =>
          priorityOrder[a.priority as keyof typeof priorityOrder] -
          priorityOrder[b.priority as keyof typeof priorityOrder]
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-red-800 mb-1">
          IDS: Identify, Discuss, Solve
        </h4>
        <p className="text-xs text-red-600">
          Work through issues by priority. For each issue: Identify the real
          issue, Discuss it openly, then Solve it with a to-do or decision.
        </p>
      </div>

      {/* Create Issue Button / Form */}
      {showCreateIssue ? (
        <div className="p-3 border border-brand/20 bg-brand/5 rounded-lg space-y-2">
          <input
            autoFocus
            value={newIssueTitle}
            onChange={(e) => setNewIssueTitle(e.target.value)}
            placeholder="Describe the issue..."
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newIssueTitle.trim()) {
                onCreateIssue(newIssueTitle.trim(), newIssuePriority);
                setNewIssueTitle("");
                setNewIssuePriority("medium");
                setShowCreateIssue(false);
              }
              if (e.key === "Escape") setShowCreateIssue(false);
            }}
          />
          <select
            value={newIssuePriority}
            onChange={(e) => setNewIssuePriority(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (newIssueTitle.trim()) {
                  onCreateIssue(newIssueTitle.trim(), newIssuePriority);
                  setNewIssueTitle("");
                  setNewIssuePriority("medium");
                  setShowCreateIssue(false);
                }
              }}
              disabled={!newIssueTitle.trim()}
              className="text-xs px-3 py-1 bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
            >
              Create Issue
            </button>
            <button
              onClick={() => { setShowCreateIssue(false); setNewIssueTitle(""); setNewIssuePriority("medium"); }}
              className="text-xs px-3 py-1 text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateIssue(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-border rounded-lg text-sm text-muted hover:border-brand hover:text-brand transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Issue
        </button>
      )}

      {sortedIssues.length === 0 && !showCreateIssue && (
        <div className="text-center py-8 text-muted text-sm">
          No open issues. Great work!
        </div>
      )}

      <div className="space-y-2">
        {sortedIssues.map((issue) => (
          <div
            key={issue.id}
            className={cn(
              "border rounded-lg transition-all",
              selectedIssue === issue.id
                ? "border-brand bg-brand/5 shadow-sm"
                : "border-border bg-card"
            )}
          >
            <button
              onClick={() =>
                setSelectedIssue(
                  selectedIssue === issue.id ? null : issue.id
                )
              }
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  issue.priority === "critical"
                    ? "bg-red-500"
                    : issue.priority === "high"
                    ? "bg-amber-500"
                    : issue.priority === "medium"
                    ? "bg-blue-400"
                    : "bg-border"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {issue.title}
                </p>
                <p className="text-xs text-muted">
                  Raised by {issue.raisedBy?.name ?? "Unknown"}
                  {issue.owner ? ` \u00B7 Owner: ${issue.owner?.name ?? "Unassigned"}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                  issue.status === "open"
                    ? "bg-amber-100 text-amber-700"
                    : issue.status === "in_discussion"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                )}
              >
                {issue.status === "in_discussion"
                  ? "Discussing"
                  : issue.status === "open"
                  ? "Identify"
                  : "Solved"}
              </span>
            </button>

            {selectedIssue === issue.id && (
              <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                <textarea
                  defaultValue={issue.description || ""}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (issue.description || "")) {
                      onUpdateDescription(issue.id, val);
                    }
                  }}
                  placeholder="Add notes or description..."
                  className="w-full text-sm text-muted border border-border rounded-md p-2 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand bg-surface/50"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Priority:</span>
                  <select
                    value={issue.priority}
                    onChange={(e) => onUpdatePriority(issue.id, e.target.value)}
                    className="text-xs px-2 py-1 border border-border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Move to:</span>
                  {issue.status !== "in_discussion" && (
                    <button
                      onClick={() =>
                        onUpdateStatus(issue.id, "in_discussion")
                      }
                      className="text-xs px-3 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors font-medium"
                    >
                      Discuss
                    </button>
                  )}
                  {issue.status !== "solved" && (
                    <button
                      onClick={() => onUpdateStatus(issue.id, "solved")}
                      className="text-xs px-3 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-medium"
                    >
                      Solved
                    </button>
                  )}
                </div>

                {/* Inline Create To-Do */}
                {showCreateTodo === issue.id ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                    <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">Create To-Do from Issue</p>
                    <input
                      autoFocus
                      value={newTodoTitle}
                      onChange={(e) => setNewTodoTitle(e.target.value)}
                      placeholder="To-do title..."
                      className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTodoTitle.trim() && newTodoAssignees.length > 0) {
                          onCreateTodo({ title: newTodoTitle.trim(), description: newTodoDescription.trim() || undefined, assigneeIds: newTodoAssignees, issueId: issue.id });
                          setNewTodoTitle("");
                          setNewTodoDescription("");
                          setNewTodoAssignees([]);
                          setShowCreateTodo(null);
                        }
                        if (e.key === "Escape") setShowCreateTodo(null);
                      }}
                    />
                    <textarea
                      value={newTodoDescription}
                      onChange={(e) => setNewTodoDescription(e.target.value)}
                      placeholder="Description (optional)..."
                      className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                    />
                    {/* Multi-select assignees */}
                    <div>
                      <p className="text-[10px] font-medium text-muted mb-1">Assign to ({newTodoAssignees.length} selected)</p>
                      <div className="max-h-32 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
                        {users?.map((u) => {
                          const isSelected = newTodoAssignees.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setNewTodoAssignees((prev) =>
                                  isSelected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                                );
                              }}
                              className={cn(
                                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors",
                                isSelected ? "bg-emerald-50 text-emerald-700" : "hover:bg-surface text-foreground/80"
                              )}
                            >
                              <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                isSelected ? "bg-emerald-600 border-emerald-600" : "border-border"
                              )}>
                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              {u.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (newTodoTitle.trim() && newTodoAssignees.length > 0) {
                            onCreateTodo({ title: newTodoTitle.trim(), description: newTodoDescription.trim() || undefined, assigneeIds: newTodoAssignees, issueId: issue.id });
                            setNewTodoTitle("");
                            setNewTodoDescription("");
                            setNewTodoAssignees([]);
                            setShowCreateTodo(null);
                          }
                        }}
                        disabled={!newTodoTitle.trim() || newTodoAssignees.length === 0}
                        className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setShowCreateTodo(null); setNewTodoTitle(""); setNewTodoDescription(""); setNewTodoAssignees([]); }}
                        className="text-xs px-3 py-1 text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateTodo(issue.id)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Create To-Do from this Issue
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
