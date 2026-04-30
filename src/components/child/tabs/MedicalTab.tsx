"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import type { ChildProfileRecord } from "../types";

interface MedicalTabProps {
  child: ChildProfileRecord;
  canEdit: boolean;
}

type VaccinationStatus = "up_to_date" | "overdue" | "exempt" | "unknown";

const VACCINATION_OPTIONS: { value: VaccinationStatus | ""; label: string }[] = [
  { value: "", label: "— Not set —" },
  { value: "up_to_date", label: "Up to date" },
  { value: "overdue", label: "Overdue" },
  { value: "exempt", label: "Exempt" },
  { value: "unknown", label: "Unknown" },
];

const CONDITION_CODES: { code: string; label: string }[] = [
  { code: "anaphylaxis", label: "Anaphylaxis" },
  { code: "allergies", label: "Allergies" },
  { code: "asthma", label: "Asthma" },
  { code: "dietary", label: "Dietary" },
];

interface FormState {
  conditions: Record<string, boolean>;
  medicareNumber: string;
  medicareExpiry: string; // YYYY-MM-DD
  medicareRef: string;
  vaccinationStatus: "" | VaccinationStatus;
}

function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

function formatDateDisplay(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function codesFromChild(child: ChildProfileRecord): Record<string, boolean> {
  const present = new Set(
    (child.medicalConditions ?? []).map((c) => String(c).toLowerCase()),
  );
  const out: Record<string, boolean> = {};
  for (const { code } of CONDITION_CODES) {
    out[code] = present.has(code);
  }
  return out;
}

function buildInitial(child: ChildProfileRecord): FormState {
  return {
    conditions: codesFromChild(child),
    medicareNumber: child.medicareNumber ?? "",
    medicareExpiry: toDateInput(child.medicareExpiry),
    medicareRef: child.medicareRef ?? "",
    vaccinationStatus:
      (child.vaccinationStatus as "" | VaccinationStatus) ?? "",
  };
}

function vaccinationLabel(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const match = VACCINATION_OPTIONS.find((o) => o.value === value);
  return match ? match.label : value;
}

export function MedicalTab({ child, canEdit }: MedicalTabProps) {
  const router = useRouter();
  const initial = useMemo(() => buildInitial(child), [child]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setForm(initial);
    setEditing(false);
  }, [initial]);

  const toggleCondition = useCallback((code: string) => {
    setForm((prev) => ({
      ...prev,
      conditions: { ...prev.conditions, [code]: !prev.conditions[code] },
    }));
  }, []);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const diff: Record<string, unknown> = {};

    // medicalConditions: only send if the set of true-codes changed.
    const initialCodes = Object.entries(initial.conditions)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    const nextCodes = Object.entries(form.conditions)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    if (initialCodes.join(",") !== nextCodes.join(",")) {
      diff.medicalConditions = nextCodes;
    }

    // medicareNumber
    if (form.medicareNumber !== initial.medicareNumber) {
      const trimmed = form.medicareNumber.trim();
      diff.medicareNumber = trimmed === "" ? null : trimmed;
    }
    // medicareRef
    if (form.medicareRef !== initial.medicareRef) {
      const trimmed = form.medicareRef.trim();
      diff.medicareRef = trimmed === "" ? null : trimmed;
    }
    // medicareExpiry
    if (form.medicareExpiry !== initial.medicareExpiry) {
      diff.medicareExpiry = toIsoOrNull(form.medicareExpiry);
    }
    // vaccinationStatus
    if (form.vaccinationStatus !== initial.vaccinationStatus) {
      diff.vaccinationStatus =
        form.vaccinationStatus === "" ? null : form.vaccinationStatus;
    }

    if (Object.keys(diff).length === 0) {
      setEditing(false);
      return;
    }

    try {
      setSaving(true);
      await mutateApi(`/api/children/${child.id}`, {
        method: "PATCH",
        body: diff,
      });
      toast({ description: "Medical details saved" });
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
  }, [child.id, form, initial, router]);

  const viewConditions = useMemo(() => {
    const active = Object.entries(initial.conditions)
      .filter(([, v]) => v)
      .map(([code]) => {
        const meta = CONDITION_CODES.find((c) => c.code === code);
        return meta?.label ?? code;
      });
    return active;
  }, [initial.conditions]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Medical details
          </h3>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
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
                onClick={resetForm}
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
          <div className="space-y-6">
            {/* Medical condition checkboxes */}
            <fieldset>
              <legend className="text-xs uppercase tracking-wide text-muted mb-2">
                Medical conditions
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CONDITION_CODES.map(({ code, label }) => (
                  <label
                    key={code}
                    className="inline-flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      aria-label={label}
                      checked={form.conditions[code] ?? false}
                      onChange={() => toggleCondition(code)}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Medicare + vaccination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Medicare number"
                value={form.medicareNumber}
                maxLength={20}
                onChange={(v) => update("medicareNumber", v)}
                placeholder="10-digit Medicare number"
              />
              <Input
                label="Medicare ref"
                value={form.medicareRef}
                maxLength={10}
                onChange={(v) => update("medicareRef", v)}
                placeholder="Individual ref #"
              />
              <Input
                type="date"
                label="Medicare expiry"
                value={form.medicareExpiry}
                onChange={(v) => update("medicareExpiry", v)}
              />
              <Select
                label="Vaccination status"
                value={form.vaccinationStatus}
                onChange={(v) =>
                  update("vaccinationStatus", v as FormState["vaccinationStatus"])
                }
                options={VACCINATION_OPTIONS}
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Medical conditions"
              value={viewConditions.length ? viewConditions.join(", ") : "—"}
              className="sm:col-span-2"
            />
            <Field
              label="Medicare number"
              value={child.medicareNumber ?? "—"}
            />
            <Field
              label="Medicare ref"
              value={child.medicareRef ?? "—"}
            />
            <Field
              label="Medicare expiry"
              value={formatDateDisplay(child.medicareExpiry)}
            />
            <Field
              label="Vaccination status"
              value={vaccinationLabel(child.vaccinationStatus)}
            />
          </dl>
        )}
      </div>

      {!canEdit && (
        <p className="text-xs text-muted">
          Medical details can only be edited by coordinators and admins.
        </p>
      )}
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
