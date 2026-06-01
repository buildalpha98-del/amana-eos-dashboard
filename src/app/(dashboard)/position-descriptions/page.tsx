"use client";

/**
 * Position Descriptions admin page.
 *
 * Admin-only. Lists every PD grouped by status, lets admins create new
 * ones, edit existing, publish/archive, and inspect who's assigned.
 *
 * Staff get a read-only surface on the staff profile + My Portal —
 * this page is the source of truth for the library itself.
 */

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  Archive,
  Send,
  FileText,
  Users as UsersIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

type PDStatus = "draft" | "published" | "archived";

interface PositionDescription {
  id: string;
  title: string;
  summary: string;
  responsibilities: string;
  selectionCriteria: string;
  qualifications: string;
  targetRole: Role | null;
  status: PDStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  _count: { assignedUsers: number };
}

interface PositionDescriptionDetail extends PositionDescription {
  assignedUsers: Array<{
    id: string;
    name: string;
    role: Role;
    active: boolean;
  }>;
}

const STATUS_LABEL: Record<PDStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function statusPill(s: PDStatus): string {
  switch (s) {
    case "published":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "draft":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "archived":
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

// Mirror src/lib/org-settings-shared.ts ROLE_LABEL_DEFAULTS — kept
// local to dodge a client-component → server-shared-module import in
// this page. 2026-06-02: staff → "OSHC Educator",
// member → "OSHC Coordinator".
const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "OSHC Coordinator",
  staff: "OSHC Educator",
};

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

// ── Page ─────────────────────────────────────────────────────────────

export default function PositionDescriptionsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const role = session?.user?.role ?? "";
  const isAdmin = ADMIN_ROLES.has(role);

  const { data, isLoading, error } = useQuery<
    { items: PositionDescription[] },
    ApiResponseError
  >({
    queryKey: ["position-descriptions"],
    queryFn: () => fetchApi("/api/position-descriptions"),
    staleTime: 60_000,
    enabled: sessionStatus === "authenticated",
  });

  // Group by status — admins see all three; non-admins only get published.
  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const out: Record<PDStatus, PositionDescription[]> = {
      published: [],
      draft: [],
      archived: [],
    };
    for (const pd of items) {
      out[pd.status].push(pd);
    }
    return out;
  }, [data]);

  if (sessionStatus === "loading" || isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-64 bg-border rounded" />
          <div className="h-24 bg-border/40 rounded-xl" />
          <div className="h-24 bg-border/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-red-600">
          Unable to load position descriptions.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="Position Descriptions">
        <p className="text-sm text-muted">
          The reference document for every job in the organisation.
          {!isAdmin && " You can browse published descriptions here."}
        </p>
      </PageHeader>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
          >
            <Plus className="w-4 h-4" />
            New position description
          </button>
        </div>
      )}

      {isAdmin && grouped.draft.length > 0 && (
        <Group
          title="Draft"
          icon={FileText}
          items={grouped.draft}
          onOpen={(id) => setEditId(id)}
        />
      )}
      <Group
        title="Published"
        icon={Briefcase}
        items={grouped.published}
        onOpen={(id) => setEditId(id)}
        emptyCopy={
          isAdmin
            ? "No published descriptions yet. Create one and set status to Published."
            : "No published position descriptions yet."
        }
      />
      {isAdmin && grouped.archived.length > 0 && (
        <Group
          title="Archived"
          icon={Archive}
          items={grouped.archived}
          onOpen={(id) => setEditId(id)}
          muted
        />
      )}

      {createOpen && (
        <PDModal mode="create" onClose={() => setCreateOpen(false)} />
      )}
      {editId && (
        <PDModal
          mode="edit"
          id={editId}
          isAdmin={isAdmin}
          isOwner={role === "owner"}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

// ── Group block ──────────────────────────────────────────────────────

function Group({
  title,
  icon: Icon,
  items,
  onOpen,
  emptyCopy,
  muted,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: PositionDescription[];
  onOpen: (id: string) => void;
  emptyCopy?: string;
  muted?: boolean;
}) {
  if (items.length === 0 && !emptyCopy) return null;
  return (
    <div className={cn("bg-card rounded-xl border border-border p-5", muted && "opacity-80")}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted italic">{emptyCopy}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((pd) => (
            <li
              key={pd.id}
              className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface/50 cursor-pointer"
              onClick={() => onOpen(pd.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {pd.title}
                  </span>
                  {pd.targetRole && (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-surface text-muted">
                      {ROLE_LABEL[pd.targetRole]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5 line-clamp-2">
                  {pd.summary}
                </p>
                <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon className="w-3 h-3" />
                    {pd._count.assignedUsers} assigned
                  </span>
                  <span>by {pd.createdBy.name}</span>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                  statusPill(pd.status),
                )}
              >
                {STATUS_LABEL[pd.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────

interface PDModalProps {
  mode: "create" | "edit";
  id?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  onClose: () => void;
}

function PDModal({ mode, id, isAdmin = true, isOwner = false, onClose }: PDModalProps) {
  const qc = useQueryClient();
  const isEdit = mode === "edit";

  const { data: existing, isLoading } = useQuery<
    PositionDescriptionDetail,
    ApiResponseError
  >({
    queryKey: ["position-description", id],
    queryFn: () => fetchApi(`/api/position-descriptions/${id}`),
    enabled: isEdit && !!id,
  });

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [selectionCriteria, setSelectionCriteria] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [targetRole, setTargetRole] = useState<Role | "">("");
  const [status, setStatus] = useState<PDStatus>("draft");
  const [hydrated, setHydrated] = useState(false);

  if (isEdit && existing && !hydrated) {
    setTitle(existing.title);
    setSummary(existing.summary);
    setResponsibilities(existing.responsibilities);
    setSelectionCriteria(existing.selectionCriteria);
    setQualifications(existing.qualifications);
    setTargetRole(existing.targetRole ?? "");
    setStatus(existing.status);
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        summary,
        responsibilities,
        selectionCriteria,
        qualifications,
        targetRole: targetRole || null,
        status,
      };
      if (isEdit) {
        return mutateApi(`/api/position-descriptions/${id}`, {
          method: "PATCH",
          body,
        });
      }
      return mutateApi("/api/position-descriptions", {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["position-descriptions"] });
      qc.invalidateQueries({ queryKey: ["position-description", id] });
      toast({
        description: isEdit
          ? "Position description updated."
          : "Position description created.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const del = useMutation({
    mutationFn: () =>
      mutateApi(`/api/position-descriptions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["position-descriptions"] });
      toast({ description: "Position description deleted." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleDelete = () => {
    if (
      !window.confirm(
        "Hard-delete this position description? Owner-only. If any users are still assigned, this will fail — use Archive instead.",
      )
    )
      return;
    del.mutate();
  };

  const canSave =
    !!title.trim() &&
    !!summary.trim() &&
    !!responsibilities.trim() &&
    !!selectionCriteria.trim() &&
    !!qualifications.trim() &&
    !save.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-3xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {isEdit ? "Edit position description" : "New position description"}
            </h2>
            {isEdit && existing?.assignedUsers?.length ? (
              <p className="text-xs text-muted mt-0.5">
                {existing.assignedUsers.length} staff currently assigned
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isEdit && isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Title" full>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    disabled={save.isPending}
                    placeholder="e.g. Lead Educator"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
                  />
                </Field>
                <Field label="Target role (optional)">
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as Role | "")}
                    disabled={save.isPending}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">— Any role —</option>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PDStatus)}
                    disabled={save.isPending}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
              </div>

              <Field label="Summary">
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={save.isPending}
                  placeholder="One-paragraph overview of what this role exists to do."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Key responsibilities">
                <textarea
                  rows={6}
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  disabled={save.isPending}
                  placeholder="Bulleted list (use • or -) of the main duties this role is accountable for."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
                />
              </Field>
              <Field label="Selection criteria">
                <textarea
                  rows={5}
                  value={selectionCriteria}
                  onChange={(e) => setSelectionCriteria(e.target.value)}
                  disabled={save.isPending}
                  placeholder="Skills, attributes, experience we look for when hiring or promoting into this role."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
                />
              </Field>
              <Field label="Qualifications">
                <textarea
                  rows={4}
                  value={qualifications}
                  onChange={(e) => setQualifications(e.target.value)}
                  disabled={save.isPending}
                  placeholder="Mandatory certifications, education, registrations (e.g. Diploma in Early Childhood, current WWCC)."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
                />
              </Field>

              {isEdit && existing?.assignedUsers && existing.assignedUsers.length > 0 && (
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-semibold text-foreground/80 mb-1.5 flex items-center gap-1">
                    <UsersIcon className="w-3.5 h-3.5" />
                    Currently assigned
                  </p>
                  <ul className="text-xs text-muted space-y-1">
                    {existing.assignedUsers.map((u) => (
                      <li key={u.id} className="flex items-center gap-2">
                        <span className="text-foreground">{u.name}</span>
                        <span className="text-[10px] uppercase tracking-wide bg-surface px-1.5 py-0.5 rounded">
                          {ROLE_LABEL[u.role]}
                        </span>
                        {!u.active && (
                          <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {isEdit && isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={save.isPending || del.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                {del.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
            >
              Cancel
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!canSave}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
              >
                {save.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isEdit ? (
                  <Pencil className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isEdit ? "Save" : "Create"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-3" : undefined}>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
