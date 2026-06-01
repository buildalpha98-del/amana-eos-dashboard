"use client";

/**
 * PositionDescriptionTab — staff profile sub-tab.
 *
 * Shows the position description currently assigned to this staff
 * member. Admin can re-assign or clear; non-admin viewers see it
 * read-only. The card is the same shape for everyone — only the
 * "Change" / "Clear" controls are admin-gated.
 *
 * 2026-06-01: introduced as part of the position-descriptions library.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Pencil,
  Loader2,
  FileText,
  X,
  CheckCircle2,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
}

interface ListItem {
  id: string;
  title: string;
  status: PDStatus;
  targetRole: Role | null;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "OSHC Coordinator",
  staff: "OSHC Educator",
};

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

export interface PositionDescriptionTabProps {
  targetUserId: string;
  targetUserName: string;
  targetUserRole: Role;
  viewerRole: string;
}

export function PositionDescriptionTab({
  targetUserId,
  targetUserName,
  targetUserRole,
  viewerRole,
}: PositionDescriptionTabProps) {
  const isAdmin = ADMIN_ROLES.has(viewerRole);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fetch the user's assignment via /api/users/[id] (which already
  // returns positionDescriptionId + the related PD object).
  const { data, isLoading, error } = useQuery<
    {
      positionDescriptionId: string | null;
      positionDescriptionAssignedAt: string | null;
      positionDescription: PositionDescription | null;
    },
    ApiResponseError
  >({
    queryKey: ["user-position-description", targetUserId],
    queryFn: () => fetchApi(`/api/users/${targetUserId}/position-description`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-600">
        Unable to load position description.
      </p>
    );
  }

  const pd = data?.positionDescription;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-muted" />
            Position description
          </h3>
          <p className="text-xs text-muted">
            The formal job description assigned to {targetUserName}.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-surface"
          >
            <Pencil className="w-3.5 h-3.5" />
            {pd ? "Change" : "Assign"}
          </button>
        )}
      </div>

      {!pd ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-border" />
          <p className="text-sm text-muted">
            No position description assigned.
          </p>
          {isAdmin ? (
            <p className="text-xs text-muted mt-1">
              Browse the{" "}
              <Link href="/position-descriptions" className="text-brand hover:underline">
                library
              </Link>{" "}
              to assign one.
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">
              Ask your manager to assign one.
            </p>
          )}
        </div>
      ) : (
        <PDDisplay pd={pd} />
      )}

      {pickerOpen && (
        <AssignPicker
          targetUserId={targetUserId}
          targetUserRole={targetUserRole}
          currentPdId={data?.positionDescriptionId ?? null}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── PD display block (shared with My Portal-ish surfaces) ────────────

function PDDisplay({ pd }: { pd: PositionDescription }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-semibold text-foreground">{pd.title}</h4>
        {pd.targetRole && (
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-surface text-muted">
            {ROLE_LABEL[pd.targetRole]}
          </span>
        )}
      </div>

      <Section label="Summary" value={pd.summary} />
      <Section label="Key responsibilities" value={pd.responsibilities} />
      <Section label="Selection criteria" value={pd.selectionCriteria} />
      <Section label="Qualifications" value={pd.qualifications} />
    </div>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
        {label}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// ── Admin assignment picker ─────────────────────────────────────────

function AssignPicker({
  targetUserId,
  targetUserRole,
  currentPdId,
  onClose,
}: {
  targetUserId: string;
  targetUserRole: Role;
  currentPdId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(currentPdId);

  const { data, isLoading } = useQuery<
    { items: ListItem[] },
    ApiResponseError
  >({
    queryKey: ["position-descriptions", "published"],
    queryFn: () => fetchApi("/api/position-descriptions?status=published"),
  });

  // Group "fit your role" PDs first.
  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const fit: ListItem[] = [];
    const other: ListItem[] = [];
    for (const pd of items) {
      if (pd.targetRole === targetUserRole || pd.targetRole === null) {
        fit.push(pd);
      } else {
        other.push(pd);
      }
    }
    return { fit, other };
  }, [data, targetUserRole]);

  const save = useMutation({
    mutationFn: () =>
      mutateApi(`/api/users/${targetUserId}/position-description`, {
        method: "PUT",
        body: { positionDescriptionId: selected },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["user-position-description", targetUserId],
      });
      qc.invalidateQueries({ queryKey: ["my-portal"] });
      toast({
        description: selected
          ? "Position description assigned."
          : "Position description cleared.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-lg flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            Assign position description
          </h2>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted">Loading library…</p>
          ) : grouped.fit.length === 0 && grouped.other.length === 0 ? (
            <p className="text-sm text-muted">
              No published descriptions yet. Visit{" "}
              <Link href="/position-descriptions" className="text-brand">
                Position Descriptions
              </Link>{" "}
              to create one.
            </p>
          ) : (
            <>
              <PickerOption
                pdId={null}
                title="— No description —"
                hint="Clear the current assignment."
                selected={selected === null}
                onSelect={() => setSelected(null)}
              />
              {grouped.fit.length > 0 && (
                <PickerSection
                  title={`Suggested for ${ROLE_LABEL[targetUserRole]}`}
                  items={grouped.fit}
                  selected={selected}
                  onSelect={(id) => setSelected(id)}
                />
              )}
              {grouped.other.length > 0 && (
                <PickerSection
                  title="Other"
                  items={grouped.other}
                  selected={selected}
                  onSelect={(id) => setSelected(id)}
                />
              )}
            </>
          )}
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex items-center justify-end gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || selected === currentPdId}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function PickerSection({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: ListItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((pd) => (
          <PickerOption
            key={pd.id}
            pdId={pd.id}
            title={pd.title}
            hint={pd.targetRole ? ROLE_LABEL[pd.targetRole] : "Any role"}
            selected={selected === pd.id}
            onSelect={() => onSelect(pd.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function PickerOption({
  pdId,
  title,
  hint,
  selected,
  onSelect,
}: {
  pdId: string | null;
  title: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  void pdId;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-2 p-2.5 rounded-md border text-left transition-colors",
        selected
          ? "border-brand bg-brand/5 ring-1 ring-brand"
          : "border-border hover:bg-surface",
      )}
    >
      <div
        className={cn(
          "mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0",
          selected ? "border-brand bg-brand" : "border-border",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </button>
  );
}
