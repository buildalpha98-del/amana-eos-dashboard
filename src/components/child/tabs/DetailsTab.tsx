"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, X, Save } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import type { ChildProfileRecord } from "../types";

interface DetailsTabProps {
  child: ChildProfileRecord;
  canEdit: boolean;
}

type GenderValue = "male" | "female" | "other" | "prefer_not_to_say";
type StatusValue = "pending" | "active" | "withdrawn";

interface FormState {
  firstName: string;
  surname: string;
  dob: string; // YYYY-MM-DD (input[type=date])
  gender: "" | GenderValue;
  photo: string;
  schoolName: string;
  yearLevel: string;
  crn: string;
  status: "" | StatusValue;
  enrolmentDate: string;
  exitDate: string;
  exitCategory: string;
  exitReason: string;
}

function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  // Use UTC to avoid TZ drift on display / round-trip.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  return iso;
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

function buildInitial(child: ChildProfileRecord): FormState {
  return {
    firstName: child.firstName ?? "",
    surname: child.surname ?? "",
    dob: toDateInput(child.dob),
    gender: (child.gender as "" | GenderValue) ?? "",
    photo: child.photo ?? "",
    schoolName: child.schoolName ?? "",
    yearLevel: child.yearLevel ?? "",
    crn: child.crn ?? "",
    status: (child.status as "" | StatusValue) ?? "",
    enrolmentDate: "",
    exitDate: "",
    exitCategory: "",
    exitReason: "",
  };
}

export function DetailsTab({ child, canEdit }: DetailsTabProps) {
  const router = useRouter();
  const initial = useMemo(() => buildInitial(child), [child]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
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
    // Build the diff: only send keys that changed.
    const diff: Record<string, unknown> = {};
    const stringKeys: (keyof FormState)[] = [
      "firstName",
      "surname",
      "schoolName",
      "yearLevel",
      "crn",
      "photo",
      "status",
      "gender",
      "exitCategory",
      "exitReason",
    ];
    for (const key of stringKeys) {
      if (form[key] !== initial[key]) {
        const value = String(form[key]).trim();
        // Allow clearing nullable fields
        if (value === "") {
          if (key === "photo" || key === "gender" || key === "crn" || key === "exitCategory" || key === "exitReason") {
            diff[key] = null;
          }
          continue;
        }
        diff[key] = value;
      }
    }

    const dateKeys: (keyof FormState)[] = ["dob", "enrolmentDate", "exitDate"];
    for (const key of dateKeys) {
      if (form[key] !== initial[key]) {
        diff[key] = toIsoOrNull(form[key] as string);
      }
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
      toast({ description: "Child details saved" });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error && err.message ? err.message : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }, [child.id, form, initial, router]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Child details</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              value={form.firstName}
              onChange={(v) => update("firstName", v)}
            />
            <Input
              label="Surname"
              value={form.surname}
              onChange={(v) => update("surname", v)}
            />
            <Input
              type="date"
              label="Date of birth"
              value={form.dob}
              onChange={(v) => update("dob", v)}
            />
            <Select
              label="Gender"
              value={form.gender}
              onChange={(v) => update("gender", v as FormState["gender"])}
              options={[
                { value: "", label: "— Not set —" },
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
                { value: "prefer_not_to_say", label: "Prefer not to say" },
              ]}
            />
            <Input
              label="Photo URL"
              value={form.photo}
              onChange={(v) => update("photo", v)}
              placeholder="https://..."
              className="sm:col-span-2"
            />
            <Input
              label="School"
              value={form.schoolName}
              onChange={(v) => update("schoolName", v)}
            />
            <Input
              label="Year level"
              value={form.yearLevel}
              onChange={(v) => update("yearLevel", v)}
            />
            <Input
              label="CRN"
              value={form.crn}
              onChange={(v) => update("crn", v)}
              placeholder="Customer Reference Number"
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => update("status", v as FormState["status"])}
              options={[
                { value: "pending", label: "Pending" },
                { value: "active", label: "Active" },
                { value: "withdrawn", label: "Withdrawn" },
              ]}
            />
            <Input
              type="date"
              label="Enrolment date"
              value={form.enrolmentDate}
              onChange={(v) => update("enrolmentDate", v)}
            />
            <Input
              type="date"
              label="Exit date"
              value={form.exitDate}
              onChange={(v) => update("exitDate", v)}
            />
            <Input
              label="Exit category"
              value={form.exitCategory}
              onChange={(v) => update("exitCategory", v)}
              placeholder="e.g. moved, school change"
            />
            <Textarea
              label="Exit reason"
              value={form.exitReason}
              onChange={(v) => update("exitReason", v)}
              placeholder="Optional notes"
              className="sm:col-span-2"
            />
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" value={child.firstName} />
            <Field label="Surname" value={child.surname} />
            <Field label="Date of birth" value={formatDateDisplay(child.dob)} />
            <Field label="Gender" value={child.gender ?? "—"} />
            <Field
              label="Photo"
              value={child.photo ? "On file" : "—"}
              className="sm:col-span-2"
            />
            <Field label="School" value={child.schoolName ?? "—"} />
            <Field label="Year level" value={child.yearLevel ?? "—"} />
            <Field label="CRN" value={child.crn ?? "—"} />
            <Field label="Status" value={child.status} />
          </dl>
        )}
      </div>
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────

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
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className ? className + " block" : "block"}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className ? className + " block" : "block"}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
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
