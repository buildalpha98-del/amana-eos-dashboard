"use client";

/**
 * ShiftTemplatesPanel — admin manages saved shift patterns for a service.
 *
 * Renders as a centred modal with two sections:
 *   1. The existing templates (with two-tap delete)
 *   2. An inline form to add a new template
 *
 * 2026-05-04: introduced alongside the ShiftTemplate model. Templates
 * pre-fill ShiftEditModal's create form so admins don't re-type the
 * same "ASC educator 3-6pm" pattern every week.
 */

import { useEffect, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useShiftTemplates,
  useCreateShiftTemplate,
  useDeleteShiftTemplate,
  type ShiftTemplate,
} from "@/hooks/useShiftTemplates";

const SESSION_OPTIONS: Array<{ value: "bsc" | "asc" | "vc"; label: string }> = [
  { value: "bsc", label: "BSC" },
  { value: "asc", label: "ASC" },
  { value: "vc", label: "VC" },
];

interface ShiftTemplatesPanelProps {
  open: boolean;
  onClose: () => void;
  serviceId: string;
}

export function ShiftTemplatesPanel({
  open,
  onClose,
  serviceId,
}: ShiftTemplatesPanelProps) {
  const { data, isLoading } = useShiftTemplates(open ? serviceId : undefined);
  const create = useCreateShiftTemplate();
  const remove = useDeleteShiftTemplate();

  const templates = data?.templates ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            Shift Templates
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* List */}
          <section>
            <h4 className="text-sm font-medium text-foreground mb-2">
              Saved patterns
            </h4>
            {isLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted">
                No templates yet. Save your first pattern below — admins can
                reuse it when creating shifts.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onDelete={() =>
                      remove.mutate({ id: t.id, serviceId: t.serviceId })
                    }
                    pending={remove.isPending}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Create form */}
          <section className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-2">
              Save a new pattern
            </h4>
            <CreateForm
              serviceId={serviceId}
              onSubmit={(input) => create.mutate(input)}
              pending={create.isPending}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onDelete,
  pending,
}: {
  template: ShiftTemplate;
  onDelete: () => void;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 5_000);
    return () => clearTimeout(t);
  }, [confirming]);

  const session = SESSION_OPTIONS.find((s) => s.value === template.sessionType);

  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
      data-testid={`template-row-${template.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {template.label}
        </p>
        <p className="text-xs text-muted">
          {session?.label ?? template.sessionType.toUpperCase()} ·{" "}
          {template.shiftStart}–{template.shiftEnd}
          {template.role ? ` · ${template.role}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          onDelete();
        }}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
          confirming
            ? "bg-red-100 text-red-900 hover:bg-red-200"
            : "text-muted hover:text-foreground hover:bg-muted/30",
          pending && "opacity-60 cursor-not-allowed",
        )}
      >
        <Trash2 className="w-3 h-3" />
        {confirming ? "Tap to confirm" : "Delete"}
      </button>
    </li>
  );
}

// ── Create form ───────────────────────────────────────────────────────

interface CreateFormProps {
  serviceId: string;
  onSubmit: (input: {
    serviceId: string;
    label: string;
    sessionType: "bsc" | "asc" | "vc";
    shiftStart: string;
    shiftEnd: string;
    role?: string | null;
  }) => void;
  pending: boolean;
}

function CreateForm({ serviceId, onSubmit, pending }: CreateFormProps) {
  const [label, setLabel] = useState("");
  const [sessionType, setSessionType] =
    useState<"bsc" | "asc" | "vc">("asc");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [role, setRole] = useState("");

  function reset() {
    setLabel("");
    setSessionType("asc");
    setShiftStart("");
    setShiftEnd("");
    setRole("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      serviceId,
      label: label.trim(),
      sessionType,
      shiftStart,
      shiftEnd,
      role: role.trim() || null,
    });
    reset();
  }

  const valid =
    label.trim().length > 0 &&
    /^\d{2}:\d{2}$/.test(shiftStart) &&
    /^\d{2}:\d{2}$/.test(shiftEnd) &&
    shiftStart < shiftEnd;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="template-label"
          className="block text-xs font-medium text-muted mb-1"
        >
          Label
        </label>
        <input
          id="template-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. ASC educator 3-6pm"
          className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
          maxLength={60}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="template-session"
            className="block text-xs font-medium text-muted mb-1"
          >
            Session
          </label>
          <select
            id="template-session"
            value={sessionType}
            onChange={(e) =>
              setSessionType(e.target.value as "bsc" | "asc" | "vc")
            }
            className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
          >
            {SESSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="template-start"
            className="block text-xs font-medium text-muted mb-1"
          >
            Start
          </label>
          <input
            id="template-start"
            type="time"
            value={shiftStart}
            onChange={(e) => setShiftStart(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
            required
          />
        </div>
        <div>
          <label
            htmlFor="template-end"
            className="block text-xs font-medium text-muted mb-1"
          >
            End
          </label>
          <input
            id="template-end"
            type="time"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
            required
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="template-role"
          className="block text-xs font-medium text-muted mb-1"
        >
          Role (optional)
        </label>
        <input
          id="template-role"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Educator"
          className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
          maxLength={40}
        />
      </div>

      <button
        type="submit"
        disabled={!valid || pending}
        className={cn(
          "w-full rounded-md px-3 py-2 text-sm font-medium",
          "bg-brand text-white hover:opacity-90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
