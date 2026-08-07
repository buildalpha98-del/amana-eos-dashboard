"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useAudiences,
  useAudience,
  useCreateAudience,
  useUpdateAudience,
  useArchiveAudience,
  usePreviewAudienceCount,
  type EmailAudienceData,
} from "@/hooks/useEmailTemplates";
// Type-only import — audience-rules.ts is client-safe (zod + Prisma types only).
import type { AudienceRules } from "@/lib/audience-rules";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = ["active", "withdrawn", "paused"] as const;
type AudienceStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<AudienceStatus, string> = {
  active: "Active",
  withdrawn: "Withdrawn",
  paused: "Paused",
};

type EngagementKind = "none" | "opened" | "clicked" | "not_opened";

const ENGAGEMENT_OPTIONS: { value: EngagementKind; label: string }[] = [
  { value: "none", label: "No engagement condition" },
  { value: "opened", label: "Opened an email" },
  { value: "clicked", label: "Clicked a link" },
  { value: "not_opened", label: "Not opened any email" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// ── Expanded row: live count via detail fetch ───────────────

function AudienceLiveCount({ audienceId }: { audienceId: string }) {
  const { data, isLoading, isError } = useAudience(audienceId);

  if (isLoading) {
    return <p className="text-xs text-muted">Counting recipients...</p>;
  }
  if (isError || !data) {
    return <p className="text-xs text-muted">Could not load recipient count.</p>;
  }
  return (
    <div>
      <p className="text-sm text-foreground">
        {data.count} recipient{data.count === 1 ? "" : "s"}
      </p>
      <p className="mt-0.5 text-2xs text-muted">
        Live count — membership is evaluated at send time, suppressed and
        unsubscribed contacts excluded
      </p>
    </div>
  );
}

// ── Create / edit form ──────────────────────────────────────

function AudienceForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: EmailAudienceData | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(
    initial?.rules.serviceIds ?? [],
  );
  const [statuses, setStatuses] = useState<AudienceStatus[]>(
    initial?.rules.statuses ?? [],
  );
  const [joinedAfter, setJoinedAfter] = useState(
    initial?.rules.joinedAfter?.slice(0, 10) ?? "",
  );
  const [joinedBefore, setJoinedBefore] = useState(
    initial?.rules.joinedBefore?.slice(0, 10) ?? "",
  );
  const [engagementKind, setEngagementKind] = useState<EngagementKind>(
    initial?.rules.engagement?.kind ?? "none",
  );
  const [engagementDays, setEngagementDays] = useState(
    initial?.rules.engagement?.days ?? 30,
  );

  const { data: services } = useQuery<
    { id: string; name: string; code: string }[]
  >({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services?status=active");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }));
    },
    retry: 2,
    staleTime: 60_000,
  });

  const createMutation = useCreateAudience();
  const updateMutation = useUpdateAudience();
  const previewMutation = usePreviewAudienceCount();

  const daysValid =
    Number.isInteger(engagementDays) &&
    engagementDays >= 1 &&
    engagementDays <= 365;

  const rules = useMemo<AudienceRules>(
    () => ({
      ...(serviceIds.length > 0 && { serviceIds }),
      ...(statuses.length > 0 && { statuses }),
      ...(joinedAfter && { joinedAfter }),
      ...(joinedBefore && { joinedBefore }),
      ...(engagementKind !== "none" &&
        daysValid && {
          engagement: { kind: engagementKind, days: engagementDays },
        }),
    }),
    [
      serviceIds,
      statuses,
      joinedAfter,
      joinedBefore,
      engagementKind,
      engagementDays,
      daysValid,
    ],
  );

  // Debounced live count preview — re-count ~500ms after the last rule edit.
  // Keyed on the serialised rules so object identity churn doesn't refire it;
  // `mutate` is referentially stable in React Query v5.
  const rulesKey = JSON.stringify(rules);
  const previewMutate = previewMutation.mutate;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      previewMutate(JSON.parse(rulesKey) as AudienceRules);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rulesKey, previewMutate]);

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = name.trim().length > 0 && (engagementKind === "none" || daysValid) && !saving;

  function toggleService(id: string) {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function toggleStatus(status: AudienceStatus) {
    setStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  }

  function handleSave() {
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      rules,
    };
    if (initial) {
      updateMutation.mutate(
        { id: initial.id, ...payload },
        { onSuccess: onSaved },
      );
    } else {
      createMutation.mutate(payload, { onSuccess: onSaved });
    }
  }

  return (
    <div className="space-y-4">
      {/* Name + description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Active families — western centres"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this audience is for"
          className={inputClass}
        />
      </div>

      {/* Centres */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">Centres</p>
        <p className="mb-2 text-2xs text-muted">
          Leave all unticked to include every centre.
        </p>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {(services ?? []).map((svc) => (
            <label
              key={svc.id}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={serviceIds.includes(svc.id)}
                onChange={() => toggleService(svc.id)}
                className="rounded border-border text-brand focus:ring-brand"
              />
              {svc.name}{" "}
              <span className="text-2xs text-muted">({svc.code})</span>
            </label>
          ))}
          {services && services.length === 0 && (
            <p className="text-xs text-muted">No active centres found.</p>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">
          Contact status
        </p>
        <p className="mb-2 text-2xs text-muted">
          Leave all unticked to include every status.
        </p>
        <div className="flex flex-wrap gap-4">
          {STATUS_OPTIONS.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={statuses.includes(status)}
                onChange={() => toggleStatus(status)}
                className="rounded border-border text-brand focus:ring-brand"
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </div>

      {/* Joined date range */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">Joined</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">After</label>
            <input
              type="date"
              value={joinedAfter}
              onChange={(e) => setJoinedAfter(e.target.value)}
              aria-label="Joined after"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Before</label>
            <input
              type="date"
              value={joinedBefore}
              onChange={(e) => setJoinedBefore(e.target.value)}
              aria-label="Joined before"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Engagement */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">Engagement</p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={engagementKind}
            onChange={(e) =>
              setEngagementKind(e.target.value as EngagementKind)
            }
            aria-label="Engagement condition"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {ENGAGEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {engagementKind !== "none" && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              within the last
              <input
                type="number"
                min={1}
                max={365}
                value={engagementDays}
                onChange={(e) => setEngagementDays(Number(e.target.value))}
                aria-label="Engagement lookback days"
                className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              days
            </label>
          )}
        </div>
        {engagementKind !== "none" && !daysValid && (
          <p className="mt-2 text-2xs text-red-600 dark:text-red-400">
            Days must be a whole number between 1 and 365.
          </p>
        )}
        {engagementKind === "not_opened" && (
          <p className="mt-2 text-2xs text-muted">
            Includes contacts who haven&apos;t received any tracked email yet —
            tracking began with the Phase 3 deploy
          </p>
        )}
      </div>

      {/* Live count preview */}
      <div className="rounded-lg bg-hover/50 p-3">
        <p className="text-sm font-medium text-foreground">
          {previewMutation.isPending
            ? "Counting recipients..."
            : `${previewMutation.data?.count ?? "..."} matching recipient${previewMutation.data?.count === 1 ? "" : "s"}`}
        </p>
        <p className="mt-0.5 text-2xs text-muted">
          Live count — membership is evaluated at send time, suppressed and
          unsubscribed contacts excluded
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!canSave}
          loading={saving}
        >
          {initial ? "Save changes" : "Create audience"}
        </Button>
      </div>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────

export default function AudienceManagerModal({ open, onClose }: Props) {
  const { data: audiences, isLoading } = useAudiences();
  const archiveMutation = useArchiveAudience();

  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<EmailAudienceData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] =
    useState<EmailAudienceData | null>(null);

  // Disabled while the archive confirm is up — Radix's AlertDialog handles
  // Escape itself, and without this gate the same keydown would ALSO hit the
  // window listener and close the whole manager. Routes through handleClose
  // so Escape gets the same view/expanded reset as the X button.
  useEscapeClose(handleClose, open && !pendingArchive);

  if (!open) return null;

  function backToList() {
    setView("list");
    setEditing(null);
  }

  function handleClose() {
    backToList();
    setExpandedId(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage audiences"
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {view === "form"
              ? editing
                ? "Edit audience"
                : "New audience"
              : "Manage audiences"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded p-1 text-muted hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {view === "form" ? (
            <AudienceForm
              key={editing?.id ?? "new"}
              initial={editing}
              onCancel={backToList}
              onSaved={backToList}
            />
          ) : (
            <div className="space-y-3">
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setView("form");
                }}
              >
                <Plus className="h-4 w-4" />
                New audience
              </Button>

              {isLoading && (
                <p className="text-sm text-muted">Loading audiences...</p>
              )}

              {!isLoading && (audiences ?? []).length === 0 && (
                <p className="text-sm text-muted">
                  No saved audiences yet. Create one to reuse a set of
                  recipient conditions across sends.
                </p>
              )}

              {(audiences ?? []).map((audience) => {
                const expanded = expandedId === audience.id;
                return (
                  <div
                    key={audience.id}
                    className="rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : audience.id)
                        }
                        aria-label={
                          expanded
                            ? `Collapse ${audience.name}`
                            : `Expand ${audience.name} to show live count`
                        }
                        className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {audience.name}
                        </p>
                        {audience.description && (
                          <p className="truncate text-xs text-muted">
                            {audience.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(audience);
                          setView("form");
                        }}
                        aria-label={`Edit ${audience.name}`}
                        className="rounded p-1.5 text-muted hover:bg-hover hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingArchive(audience)}
                      >
                        Archive
                      </Button>
                    </div>
                    {expanded && (
                      <div className="border-t border-border px-3 py-2.5">
                        <AudienceLiveCount audienceId={audience.id} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Archive confirmation */}
      <ConfirmDialog
        open={!!pendingArchive}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) setPendingArchive(null);
        }}
        title="Archive audience?"
        description={`"${pendingArchive?.name ?? ""}" will no longer be selectable for new sends. Past sends keep their history.`}
        confirmLabel="Archive"
        variant="danger"
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (!pendingArchive) return;
          archiveMutation.mutate(pendingArchive.id, {
            onSuccess: () => setPendingArchive(null),
          });
        }}
      />
    </div>
  );
}
