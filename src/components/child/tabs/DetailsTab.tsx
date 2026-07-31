"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, X, Save, AlertTriangle, Trash2 } from "lucide-react";
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
  // ── OSHC detail fields ──
  preferredName: string;
  livesWith: string;
  mainLanguageAtHome: string;
  languagesOtherThanEnglish: string;
  indigenousStatus: string;
  yearOfArrival: string;
  englishAssistance: boolean;
  isStaffChild: boolean;
  suppressBirthdayPost: boolean;
  ownSunscreen: boolean;
  noAppPosting: boolean;
  allowSocialMediaPost: boolean;
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
    preferredName: child.preferredName ?? "",
    livesWith: child.livesWith ?? "",
    mainLanguageAtHome: child.mainLanguageAtHome ?? "",
    languagesOtherThanEnglish: child.languagesOtherThanEnglish ?? "",
    indigenousStatus: child.indigenousStatus ?? "",
    yearOfArrival: child.yearOfArrival ? String(child.yearOfArrival) : "",
    englishAssistance: child.englishAssistance ?? false,
    isStaffChild: child.isStaffChild ?? false,
    suppressBirthdayPost: child.suppressBirthdayPost ?? false,
    ownSunscreen: child.ownSunscreen ?? false,
    noAppPosting: child.noAppPosting ?? false,
    allowSocialMediaPost: child.allowSocialMediaPost ?? false,
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
      "preferredName",
      "livesWith",
      "mainLanguageAtHome",
      "languagesOtherThanEnglish",
      "indigenousStatus",
    ];
    for (const key of stringKeys) {
      if (form[key] !== initial[key]) {
        const value = String(form[key]).trim();
        // Allow clearing nullable fields
        if (value === "") {
          // Every one of these is nullable, so blanking the box must
          // actually clear the value rather than silently doing nothing.
          const CLEARABLE = new Set([
            "photo",
            "gender",
            "crn",
            "exitCategory",
            "exitReason",
            "preferredName",
            "livesWith",
            "mainLanguageAtHome",
            "languagesOtherThanEnglish",
            "indigenousStatus",
          ]);
          if (CLEARABLE.has(key as string)) {
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

    const boolKeys: (keyof FormState)[] = [
      "englishAssistance",
      "isStaffChild",
      "suppressBirthdayPost",
      "ownSunscreen",
      "noAppPosting",
      "allowSocialMediaPost",
    ];
    for (const key of boolKeys) {
      if (form[key] !== initial[key]) diff[key] = form[key];
    }

    if (form.yearOfArrival !== initial.yearOfArrival) {
      const raw = form.yearOfArrival.trim();
      diff.yearOfArrival = raw === "" ? null : Number(raw);
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

            <div className="sm:col-span-2 pt-3 mt-1 border-t border-border">
              <h4 className="text-sm font-semibold text-foreground">
                Background &amp; language
              </h4>
            </div>
            <Input
              label="Preferred name"
              value={form.preferredName}
              onChange={(v) => update("preferredName", v)}
              placeholder="What educators call them"
            />
            <Input
              label="Lives with"
              value={form.livesWith}
              onChange={(v) => update("livesWith", v)}
              placeholder="e.g. Both parents, Mother, shared care"
            />
            <Input
              label="Main language at home"
              value={form.mainLanguageAtHome}
              onChange={(v) => update("mainLanguageAtHome", v)}
              placeholder="e.g. Arabic"
            />
            <Input
              label="Languages other than English"
              value={form.languagesOtherThanEnglish}
              onChange={(v) => update("languagesOtherThanEnglish", v)}
            />
            <Input
              label="Aboriginal / Torres Strait Islander status"
              value={form.indigenousStatus}
              onChange={(v) => update("indigenousStatus", v)}
              placeholder="e.g. Aboriginal, Torres Strait Islander, Both, Neither"
            />
            <Input
              label="Year of arrival in Australia"
              value={form.yearOfArrival}
              onChange={(v) => update("yearOfArrival", v)}
              placeholder="Leave blank if born here"
            />

            <div className="sm:col-span-2 pt-3 mt-1 border-t border-border">
              <h4 className="text-sm font-semibold text-foreground">
                Flags &amp; consents
              </h4>
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Check
                label="Needs English assistance"
                checked={form.englishAssistance}
                onChange={(v) => update("englishAssistance", v)}
              />
              <Check
                label="Child of a staff member"
                hint="Also enables staff discounting."
                checked={form.isStaffChild}
                onChange={(v) => update("isStaffChild", v)}
              />
              <Check
                label="Don't post their birthday"
                checked={form.suppressBirthdayPost}
                onChange={(v) => update("suppressBirthdayPost", v)}
              />
              <Check
                label="Brings their own sunscreen"
                checked={form.ownSunscreen}
                onChange={(v) => update("ownSunscreen", v)}
              />
              <Check
                label="No posting about this child"
                checked={form.noAppPosting}
                onChange={(v) => update("noAppPosting", v)}
              />
              <Check
                label="Social media posts allowed"
                checked={form.allowSocialMediaPost}
                onChange={(v) => update("allowSocialMediaPost", v)}
              />
            </div>
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
            <Field label="Preferred name" value={child.preferredName ?? "—"} />
            <Field label="Lives with" value={child.livesWith ?? "—"} />
            <Field
              label="Main language at home"
              value={child.mainLanguageAtHome ?? "—"}
            />
            <Field
              label="Languages other than English"
              value={child.languagesOtherThanEnglish ?? "—"}
            />
            <Field
              label="Aboriginal / Torres Strait Islander"
              value={child.indigenousStatus ?? "—"}
            />
            <Field
              label="Year of arrival"
              value={child.yearOfArrival ? String(child.yearOfArrival) : "—"}
            />
            <Field
              label="Flags"
              className="sm:col-span-2"
              value={
                [
                  child.englishAssistance && "English assistance",
                  child.isStaffChild && "Staff member's child",
                  child.suppressBirthdayPost && "No birthday post",
                  child.ownSunscreen && "Own sunscreen",
                  child.noAppPosting && "No posting",
                  child.allowSocialMediaPost && "Social media OK",
                ]
                  .filter(Boolean)
                  .join(" · ") || "None set"
              }
            />
          </dl>
        )}
      </div>

      {/* Deactivate / Delete actions */}
      {canEdit && (
        <ChildDangerZone childId={child.id} childName={`${child.firstName} ${child.surname}`} status={child.status} />
      )}
    </div>
  );
}

function ChildDangerZone({ childId, childName, status }: { childId: string; childName: string; status: string }) {
  const router = useRouter();
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await mutateApi(`/api/children/${childId}`, {
        method: "PATCH",
        body: { status: "withdrawn" },
      });
      toast({ description: `${childName} has been deactivated.` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to deactivate" });
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async () => {
    setDeactivating(true);
    try {
      await mutateApi(`/api/children/${childId}`, {
        method: "PATCH",
        body: { status: "active" },
      });
      toast({ description: `${childName} has been reactivated.` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to reactivate" });
    } finally {
      setDeactivating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await mutateApi(`/api/children/${childId}`, { method: "DELETE" });
      toast({ description: `${childName} has been permanently deleted.` });
      router.push("/children");
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Failed to delete" });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 p-6">
      <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4" />
        Danger Zone
      </h3>
      <div className="space-y-3">
        {status !== "withdrawn" ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground font-medium">Deactivate child</p>
              <p className="text-xs text-muted">Set status to withdrawn. This can be reversed.</p>
            </div>
            <button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
            >
              {deactivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Deactivate
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground font-medium">Reactivate child</p>
              <p className="text-xs text-muted">Set status back to active.</p>
            </div>
            <button
              onClick={handleReactivate}
              disabled={deactivating}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors disabled:opacity-50"
            >
              {deactivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reactivate
            </button>
          </div>
        )}

        <div className="border-t border-red-200 pt-3">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-foreground font-medium">Delete child record</p>
                <p className="text-xs text-muted">Permanently remove this child and all related data. This cannot be undone.</p>
              </div>
              <button
                onClick={() => setConfirmDelete(true)}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          ) : (
            <div className="bg-red-100 dark:bg-red-950/50 rounded-lg p-4">
              <p className="text-sm text-red-800 font-medium mb-3">
                Are you sure you want to permanently delete {childName}? This will remove all bookings, documents, and pickup records.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? "Deleting..." : "Yes, delete permanently"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:bg-surface transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
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

/** Checkbox with an optional hint, matching the Input/Textarea helpers. */
function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
      />
      <span className="text-sm text-foreground">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
