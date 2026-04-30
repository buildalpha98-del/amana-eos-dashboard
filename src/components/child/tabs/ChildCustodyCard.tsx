"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Save, X, ExternalLink, Shield } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import type { ChildProfileRecord } from "../types";

const CUSTODY_TYPES: { value: CustodyType | ""; label: string }[] = [
  { value: "", label: "— Not recorded —" },
  { value: "shared", label: "Shared (50/50 or similar)" },
  { value: "sole", label: "Sole custody" },
  { value: "court_order", label: "Court order in place" },
  { value: "informal", label: "Informal arrangement" },
];

type CustodyType = "shared" | "sole" | "court_order" | "informal";

interface CustodyArrangements {
  type: CustodyType;
  primaryGuardian?: string;
  details?: string;
  courtOrderUrl?: string;
}

function parseCustody(value: unknown): CustodyArrangements | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== "string") return null;
  if (!["shared", "sole", "court_order", "informal"].includes(obj.type)) return null;
  return {
    type: obj.type as CustodyType,
    primaryGuardian:
      typeof obj.primaryGuardian === "string" ? obj.primaryGuardian : undefined,
    details: typeof obj.details === "string" ? obj.details : undefined,
    courtOrderUrl:
      typeof obj.courtOrderUrl === "string" ? obj.courtOrderUrl : undefined,
  };
}

function typeLabel(value: string): string {
  return CUSTODY_TYPES.find((t) => t.value === value)?.label ?? value;
}

interface FormState {
  type: "" | CustodyType;
  primaryGuardian: string;
  details: string;
  courtOrderUrl: string;
}

function buildInitial(custody: CustodyArrangements | null): FormState {
  return {
    type: custody?.type ?? "",
    primaryGuardian: custody?.primaryGuardian ?? "",
    details: custody?.details ?? "",
    courtOrderUrl: custody?.courtOrderUrl ?? "",
  };
}

export function ChildCustodyCard({
  child,
  canEdit,
}: {
  child: ChildProfileRecord;
  canEdit: boolean;
}) {
  const router = useRouter();
  const initialCustody = useMemo(
    () => parseCustody(child.custodyArrangements),
    [child.custodyArrangements],
  );
  const initial = useMemo(() => buildInitial(initialCustody), [initialCustody]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setForm(initial);
    setEditing(false);
  }, [initial]);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    // Empty type = clear the field. Anything else = upsert the object.
    const payload: { custodyArrangements: CustodyArrangements | null } = {
      custodyArrangements:
        form.type === ""
          ? null
          : {
              type: form.type,
              ...(form.primaryGuardian.trim()
                ? { primaryGuardian: form.primaryGuardian.trim() }
                : {}),
              ...(form.details.trim() ? { details: form.details.trim() } : {}),
              ...(form.courtOrderUrl.trim()
                ? { courtOrderUrl: form.courtOrderUrl.trim() }
                : {}),
            },
    };

    try {
      setSaving(true);
      await mutateApi(`/api/children/${child.id}`, {
        method: "PATCH",
        body: payload,
      });
      toast({ description: "Custody arrangements saved" });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }, [child.id, form, router]);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground inline-flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-600" />
          Custody arrangements
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit custody arrangements"
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
        {canEdit && editing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-muted">
              Arrangement type
            </span>
            <select
              value={form.type}
              onChange={(e) =>
                update("type", e.target.value as FormState["type"])
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {CUSTODY_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {form.type !== "" && (
            <>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Primary guardian
                </span>
                <input
                  type="text"
                  value={form.primaryGuardian}
                  onChange={(e) => update("primaryGuardian", e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Sarah Doe"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Court order URL (if applicable)
                </span>
                <input
                  type="url"
                  value={form.courtOrderUrl}
                  onChange={(e) => update("courtOrderUrl", e.target.value)}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Details
                </span>
                <textarea
                  value={form.details}
                  onChange={(e) => update("details", e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Pickup restrictions, alternating weeks, contact preferences, etc."
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
              </label>
            </>
          )}
        </div>
      ) : initialCustody ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Type</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {typeLabel(initialCustody.type)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">
              Primary guardian
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {initialCustody.primaryGuardian ?? "—"}
            </dd>
          </div>
          {initialCustody.details && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">
                Details
              </dt>
              <dd className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">
                {initialCustody.details}
              </dd>
            </div>
          )}
          {initialCustody.courtOrderUrl && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">
                Court order
              </dt>
              <dd className="mt-0.5 text-sm">
                <a
                  href={initialCustody.courtOrderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  View document
                </a>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-sm text-muted">
          No custody arrangements recorded.
          {canEdit ? " Click Edit to add." : ""}
        </p>
      )}

      {!canEdit && (
        <p className="text-xs text-muted mt-3">
          Custody arrangements can only be edited by coordinators and admins.
        </p>
      )}
    </div>
  );
}
