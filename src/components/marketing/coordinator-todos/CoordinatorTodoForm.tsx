"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateCoordinatorTodo } from "@/hooks/useCoordinatorTodos";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Check } from "lucide-react";

interface ServiceOption {
  id: string;
  name: string;
  state?: string | null;
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

interface CoordinatorTodoFormProps {
  /** Pre-fill a single service when launched from a centre/activation context. */
  initialServiceIds?: string[];
  /** Pre-fill activation context. */
  activationId?: string;
  campaignId?: string;
  /** Pre-fill title. */
  initialTitle?: string;
  /** Pre-fill description. */
  initialDescription?: string;
  /** Hide the multi-centre selector when used from a single-centre context. */
  lockServices?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
}

export function CoordinatorTodoForm({
  initialServiceIds = [],
  activationId,
  campaignId,
  initialTitle = "",
  initialDescription = "",
  lockServices = false,
  onCreated,
  onCancel,
}: CoordinatorTodoFormProps) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set(initialServiceIds));
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const create = useCreateCoordinatorTodo();

  useEffect(() => {
    if (lockServices) return;
    fetchApi<ServiceOption[] | { services: ServiceOption[] }>("/api/services?status=active")
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.services ?? [];
        setServices(list);
      })
      .catch(() => setServices([]));
  }, [lockServices]);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedServiceIds(new Set(services.map((s) => s.id)));
  }

  function clearAll() {
    setSelectedServiceIds(new Set());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ variant: "destructive", description: "Title is required" });
      return;
    }
    if (selectedServiceIds.size === 0) {
      toast({ variant: "destructive", description: "Pick at least one centre" });
      return;
    }
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        serviceIds: Array.from(selectedServiceIds),
        dueDate: new Date(dueDate).toISOString(),
        activationId,
        campaignId,
      });
      const createdCount = result.created.length;
      const skippedCount = result.skipped.length;
      if (createdCount > 0 && skippedCount === 0) {
        toast({ description: `Sent to ${createdCount} centre${createdCount === 1 ? "" : "s"}` });
      } else if (createdCount > 0) {
        toast({
          description: `Sent to ${createdCount}, skipped ${skippedCount} (no assignee). See list for details.`,
        });
      } else {
        toast({ variant: "destructive", description: "Couldn't send any todos — check assignees" });
      }
      setTitle("");
      setDescription("");
      onCreated?.();
    } catch {
      // hook toast
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Hand out flyers for Open Day"
          className="w-full rounded-md border border-border bg-card p-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What you need them to do, by when, and any context."
          className="w-full rounded-md border border-border bg-card p-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Due *</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
          className="w-full max-w-xs rounded-md border border-border bg-card p-2 text-sm"
        />
      </div>
      {!lockServices && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-muted">Centres *</label>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="text-brand hover:underline" onClick={selectAll}>Select all</button>
              <span className="text-muted">·</span>
              <button type="button" className="text-brand hover:underline" onClick={clearAll}>Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-md border border-border bg-surface p-2 max-h-64 overflow-y-auto">
            {services.map((s) => {
              const checked = selectedServiceIds.has(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card cursor-pointer text-sm">
                  <input type="checkbox" checked={checked} onChange={() => toggleService(s.id)} aria-label={`Toggle ${s.name}`} />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.state && <span className="text-[10px] text-muted">{s.state}</span>}
                </label>
              );
            })}
            {services.length === 0 && (
              <p className="text-xs text-muted px-2 py-1.5">Loading centres…</p>
            )}
          </div>
          <p className="text-[11px] text-muted mt-1">
            One todo per centre. Auto-assigned to that centre&apos;s coordinator (falls back to manager).
          </p>
        </div>
      )}
      {lockServices && initialServiceIds.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-2 text-xs text-muted">
          <Check className="w-3.5 h-3.5 inline mr-1" />
          Will be sent to this centre&apos;s coordinator.
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
          Send to coordinator{selectedServiceIds.size > 1 ? "s" : ""}
        </Button>
      </div>
    </form>
  );
}
