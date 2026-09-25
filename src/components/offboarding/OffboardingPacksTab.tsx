"use client";

/**
 * OffboardingPacksTab — the /onboarding "Offboarding" tab. Self-contained
 * (fetches its own data, owns its own dialog state) so it does not lean on
 * the onboarding page's shared loading gate: packs CRUD, in-flight
 * assignments with per-task progress, and the "Start offboarding" flow.
 *
 * Structure mirrors OnboardingPacksTab visually but deliberately avoids
 * its prop-drilling — everything lives here + the two siblings
 * (OffboardingAssignmentsList, StartOffboardingDialog).
 *
 * 2026-09-04: introduced (Staff Portal v2 Phase 4, Task 4.1).
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi } from "@/lib/fetch-api";
import { hasFeature } from "@/lib/role-permissions";
import { isRole } from "@/lib/role-enum";
import {
  useCreateOffboardingPack,
  useDeleteOffboardingPack,
  useOffboardingPack,
  useOffboardingPacks,
  useUpdateOffboardingPack,
  type OffboardingPackData,
} from "@/hooks/useOffboarding";
import { OffboardingAssignmentsList } from "./OffboardingAssignmentsList";
import { StartOffboardingDialog } from "./StartOffboardingDialog";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const TASK_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "documentation", label: "Documentation" },
  { value: "equipment", label: "Equipment" },
  { value: "access", label: "Access & IT" },
  { value: "handover", label: "Handover" },
  { value: "hr", label: "HR & payroll" },
] as const;

interface TaskDraft {
  title: string;
  category: string;
  isRequired: boolean;
}

const emptyTask = (): TaskDraft => ({
  title: "",
  category: "general",
  isRequired: true,
});

export function OffboardingPacksTab() {
  const { data: session } = useSession();
  const rawRole = session?.user?.role;
  const role = isRole(rawRole) ? rawRole : undefined;
  const canStart = hasFeature(role, "offboarding.create");
  const canManage = hasFeature(role, "offboarding.manage");

  const {
    data: packs = [],
    isLoading: packsLoading,
    error: packsError,
    refetch: refetchPacks,
  } = useOffboardingPacks();

  const [startOpen, setStartOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<OffboardingPackData | null>(
    null,
  );
  const [deletingPack, setDeletingPack] = useState<OffboardingPackData | null>(
    null,
  );
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);

  const deletePack = useDeleteOffboardingPack();

  async function handleDelete() {
    if (!deletingPack) return;
    try {
      await deletePack.mutateAsync(deletingPack.id);
      toast({ description: `"${deletingPack.name}" deleted.` });
      if (expandedPackId === deletingPack.id) setExpandedPackId(null);
      setDeletingPack(null);
    } catch {
      // Error toast handled by the mutation's onError.
      setDeletingPack(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── In-flight offboardings ─────────────────────────────── */}
      <section aria-labelledby="offboarding-assignments-heading">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2
            id="offboarding-assignments-heading"
            className="text-lg font-semibold text-foreground"
          >
            Offboarding in progress
          </h2>
          {canStart ? (
            <Button
              size="sm"
              iconLeft={<UserX className="w-4 h-4" aria-hidden="true" />}
              onClick={() => setStartOpen(true)}
            >
              Start offboarding
            </Button>
          ) : null}
        </div>
        <OffboardingAssignmentsList canManage={canManage} />
      </section>

      {/* ── Packs ──────────────────────────────────────────────── */}
      <section aria-labelledby="offboarding-packs-heading">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2
            id="offboarding-packs-heading"
            className="text-lg font-semibold text-foreground"
          >
            Offboarding packs
          </h2>
          {canManage ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
              onClick={() => setCreateOpen(true)}
            >
              New pack
            </Button>
          ) : null}
        </div>

        {packsLoading ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            aria-busy="true"
            aria-label="Loading offboarding packs"
          >
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : packsError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-6 text-center">
            <p className="text-sm text-rose-800 dark:text-rose-300">
              Couldn&apos;t load offboarding packs.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void refetchPacks()}
            >
              Retry
            </Button>
          </div>
        ) : packs.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No offboarding packs yet"
            description="Packs are reusable exit checklists — equipment returns, access removal, handover, final pay."
            variant="inline"
            action={
              canManage
                ? { label: "Create a pack", onClick: () => setCreateOpen(true) }
                : undefined
            }
          />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                canManage={canManage}
                expanded={expandedPackId === pack.id}
                onToggleExpand={() =>
                  setExpandedPackId(
                    expandedPackId === pack.id ? null : pack.id,
                  )
                }
                onEdit={() => setEditingPack(pack)}
                onDelete={() => setDeletingPack(pack)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Dialogs ───────────────────────────────────────────── */}
      <StartOffboardingDialog open={startOpen} onOpenChange={setStartOpen} />
      {createOpen ? (
        <CreatePackDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
      {editingPack ? (
        <EditPackDialog
          pack={editingPack}
          onClose={() => setEditingPack(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deletingPack !== null}
        onOpenChange={(o) => !o && setDeletingPack(null)}
        title={`Delete "${deletingPack?.name ?? "pack"}"?`}
        description="The pack will no longer be assignable. Offboardings already using it keep their tasks and history."
        confirmLabel="Delete pack"
        variant="danger"
        onConfirm={() => void handleDelete()}
        loading={deletePack.isPending}
      />
    </div>
  );
}

// ── PackCard ─────────────────────────────────────────────────────────

function PackCard({
  pack,
  canManage,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  pack: OffboardingPackData;
  canManage: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: detail, isLoading: detailLoading } = useOffboardingPack(
    expanded ? pack.id : null,
  );

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand/10 p-2 text-brand shrink-0">
          <Package className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{pack.name}</span>
            {pack.isDefault ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 px-1.5 py-0 text-2xs font-bold uppercase tracking-wide"
                title="Default pack"
              >
                <Star className="w-2.5 h-2.5" aria-hidden="true" />
                Default
              </span>
            ) : null}
          </p>
          {pack.description ? (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">
              {pack.description}
            </p>
          ) : null}
          <p className="flex items-center gap-1 text-xs text-muted mt-1">
            <Building2 className="w-3 h-3" aria-hidden="true" />
            {pack.service?.name ?? "Company-wide"} · {pack._count.tasks} tasks ·{" "}
            {pack._count.assignments} assigned
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit pack ${pack.name}`}
              className="p-1.5 rounded text-muted hover:bg-surface hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete pack ${pack.name}`}
              className="p-1.5 rounded text-muted hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        {expanded ? "Hide tasks" : "Show tasks"}
      </button>

      {expanded ? (
        <div className="mt-2 border-t border-border pt-2">
          {detailLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted py-1">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Loading tasks…
            </p>
          ) : !detail || detail.tasks.length === 0 ? (
            <p className="text-sm text-muted italic py-1">
              This pack has no tasks yet.
            </p>
          ) : (
            <ol className="space-y-1">
              {detail.tasks.map((t, i) => (
                <li key={t.id} className="flex items-baseline gap-2 text-sm">
                  <span className="text-2xs text-muted tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="text-foreground">{t.title}</span>
                  {t.isRequired ? (
                    <span className="text-2xs text-muted uppercase tracking-wide">
                      Required
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </li>
  );
}

// ── CreatePackDialog ─────────────────────────────────────────────────

function CreatePackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask()]);

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: () => fetchApi<ServiceOption[]>("/api/services"),
    enabled: open,
    retry: 2,
    staleTime: 60_000,
  });

  const createPack = useCreateOffboardingPack();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validTasks = tasks.filter((t) => t.title.trim());
    if (!name.trim()) return;
    try {
      await createPack.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        serviceId: serviceId || null,
        isDefault,
        tasks: validTasks.map((t, i) => ({
          title: t.title.trim(),
          category: t.category,
          isRequired: t.isRequired,
          sortOrder: i,
        })),
      });
      toast({ description: `"${name.trim()}" created.` });
      onOpenChange(false);
    } catch {
      // Error toast handled by the mutation's onError.
    }
  }

  function updateTask(i: number, patch: Partial<TaskDraft>) {
    setTasks((prev) =>
      prev.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Create offboarding pack
        </DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="pack-name"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              Name *
            </label>
            <input
              id="pack-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g. Permanent staff exit"
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="pack-desc"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              Description
            </label>
            <textarea
              id="pack-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="pack-service"
                className="block text-sm font-medium text-foreground/80 mb-1"
              >
                Centre (optional)
              </label>
              <select
                id="pack-service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">Company-wide</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-border text-brand focus:ring-brand"
                />
                Default pack
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground/80">Tasks</p>
              <button
                type="button"
                onClick={() => setTasks((prev) => [...prev, emptyTask()])}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" aria-hidden="true" /> Add task
              </button>
            </div>
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={task.title}
                    onChange={(e) => updateTask(i, { title: e.target.value })}
                    aria-label={`Task ${i + 1} title`}
                    placeholder={`Task ${i + 1}…`}
                    className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <select
                    value={task.category}
                    onChange={(e) =>
                      updateTask(i, { category: e.target.value })
                    }
                    aria-label={`Task ${i + 1} category`}
                    className="px-2 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <label
                    className="flex items-center gap-1 text-2xs text-muted uppercase tracking-wide"
                    title="Required tasks must be done before the offboarding counts as complete"
                  >
                    <input
                      type="checkbox"
                      checked={task.isRequired}
                      onChange={(e) =>
                        updateTask(i, { isRequired: e.target.checked })
                      }
                      className="rounded border-border text-brand focus:ring-brand"
                    />
                    Req
                  </label>
                  {tasks.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTasks((prev) => prev.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove task ${i + 1}`}
                      className="p-1 rounded text-muted hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createPack.isPending}>
              Create pack
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── EditPackDialog ───────────────────────────────────────────────────

function EditPackDialog({
  pack,
  onClose,
}: {
  pack: OffboardingPackData;
  onClose: () => void;
}) {
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description ?? "");
  const [isDefault, setIsDefault] = useState(pack.isDefault);

  const updatePack = useUpdateOffboardingPack();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await updatePack.mutateAsync({
        id: pack.id,
        name: name.trim(),
        description: description.trim() || null,
        isDefault,
      });
      toast({ description: `"${name.trim()}" updated.` });
      onClose();
    } catch {
      // Error toast handled by the mutation's onError.
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Edit pack
        </DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-pack-name"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              Name *
            </label>
            <input
              id="edit-pack-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="edit-pack-desc"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              Description
            </label>
            <textarea
              id="edit-pack-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            Default pack
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updatePack.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
