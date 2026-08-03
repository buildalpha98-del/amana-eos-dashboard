"use client";

/**
 * Everything a family holds about their own child, on one page.
 *
 * This is the first thing a parent should see when they open a child —
 * before the timetable — because it's the thing they came to check or
 * correct. Until now the details were spread across the enrolment form
 * (which they can't reopen once submitted) and nowhere else.
 *
 * What's editable is decided by the SERVER: the endpoint returns
 * `editableFields`, and anything absent renders read-only. A second copy
 * of that rule here would drift from it, and the drift would show up as
 * a form that silently discards what someone typed.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Pencil,
  X,
  Check,
  ShieldAlert,
  Camera,
  Tag,
} from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Skeleton } from "@/components/ui/Skeleton";

interface ChildInfo {
  id: string;
  firstName: string;
  surname: string;
  preferredName: string | null;
  dob: string | null;
  gender: string | null;
  schoolName: string | null;
  yearLevel: string | null;
  medicareNumber: string | null;
  medicareExpiry: string | null;
  mainLanguageAtHome: string | null;
  languagesOtherThanEnglish: string | null;
  livesWith: string | null;
  countryOfBirth: string | null;
  additionalNeeds: string | null;
  medicalConditions: string[];
  address: { street?: string; suburb?: string; state?: string; postcode?: string } | null;
  isStaffChild: boolean;
  allowSocialMediaPost: boolean;
  noAppPosting: boolean;
  room: string | null;
  tags: string[];
  service: { id: string; name: string } | null;
  editableFields: string[];
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

function formatDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAddress(a: ChildInfo["address"]): string {
  if (!a) return "—";
  return (
    [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", ") || "—"
  );
}

export function ChildInformationTab({ childId }: { childId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ChildInfo>>({});

  const { data, isLoading, error } = useQuery<ChildInfo>({
    queryKey: ["parent", "child", childId],
    queryFn: () => fetchApi(`/api/parent/children/${childId}`),
    retry: 2,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/parent/children/${childId}`, { method: "PUT", body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["parent", "child", childId] });
      setEditing(false);
      setForm({});
      toast({ description: "Details saved." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        Couldn&apos;t load this child&apos;s details.
      </p>
    );
  }

  const can = (k: string) => data.editableFields.includes(k);
  const value = <K extends keyof ChildInfo>(k: K): ChildInfo[K] =>
    (form[k] !== undefined ? form[k] : data[k]) as ChildInfo[K];
  const set = (k: keyof ChildInfo, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (can(k)) body[k] = v;
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    save.mutate(body);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {data.firstName} {data.surname}
        </h2>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setForm({});
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted min-h-11"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold min-h-11 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground min-h-11"
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
        )}
      </div>

      {/* ── About ──────────────────────────────────────────── */}
      <Card title="About">
        <Row label="First name" editable={editing && can("firstName")}>
          {editing && can("firstName") ? (
            <input
              className={field}
              value={value("firstName") ?? ""}
              onChange={(e) => set("firstName", e.target.value)}
              aria-label="First name"
            />
          ) : (
            data.firstName
          )}
        </Row>
        <Row label="Surname" editable={editing && can("surname")}>
          {editing && can("surname") ? (
            <input
              className={field}
              value={value("surname") ?? ""}
              onChange={(e) => set("surname", e.target.value)}
              aria-label="Surname"
            />
          ) : (
            data.surname
          )}
        </Row>
        <Row label="Preferred name" editable={editing && can("preferredName")}>
          {editing && can("preferredName") ? (
            <input
              className={field}
              value={value("preferredName") ?? ""}
              onChange={(e) => set("preferredName", e.target.value)}
              aria-label="Preferred name"
            />
          ) : (
            (data.preferredName ?? "—")
          )}
        </Row>
        <Row label="Date of birth" editable={editing && can("dob")}>
          {editing && can("dob") ? (
            <input
              type="date"
              className={field}
              value={value("dob") ?? ""}
              onChange={(e) => set("dob", e.target.value)}
              aria-label="Date of birth"
            />
          ) : (
            formatDate(data.dob)
          )}
        </Row>
        <Row label="Address">{formatAddress(data.address)}</Row>
        <Row label="School">{data.schoolName ?? "—"}</Row>
        <Row label="Classroom">{data.yearLevel ?? "—"}</Row>
        <Row label="Centre">{data.service?.name ?? "—"}</Row>
        {data.room && <Row label="Room">{data.room}</Row>}
      </Card>

      {/* ── Medicare ───────────────────────────────────────── */}
      <Card title="Medicare">
        <Row label="Number" editable={editing && can("medicareNumber")}>
          {editing && can("medicareNumber") ? (
            <input
              className={field}
              inputMode="numeric"
              value={value("medicareNumber") ?? ""}
              onChange={(e) => set("medicareNumber", e.target.value)}
              aria-label="Medicare number"
            />
          ) : (
            (data.medicareNumber ?? "—")
          )}
        </Row>
        <Row label="Expiry" editable={editing && can("medicareExpiry")}>
          {editing && can("medicareExpiry") ? (
            <input
              type="date"
              className={field}
              value={value("medicareExpiry") ?? ""}
              onChange={(e) => set("medicareExpiry", e.target.value)}
              aria-label="Medicare expiry"
            />
          ) : (
            formatDate(data.medicareExpiry)
          )}
        </Row>
      </Card>

      {/* ── Care needs ─────────────────────────────────────── */}
      <Card title="Care needs">
        <Row label="Medical conditions">
          {data.medicalConditions.length === 0 ? (
            "None recorded"
          ) : (
            <span className="flex flex-wrap gap-1.5 justify-end">
              {data.medicalConditions.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200"
                >
                  <ShieldAlert className="w-3 h-3" />
                  {c}
                </span>
              ))}
            </span>
          )}
        </Row>
        <Row label="Additional needs" editable={editing && can("additionalNeeds")}>
          {editing && can("additionalNeeds") ? (
            <textarea
              className={field}
              rows={3}
              value={value("additionalNeeds") ?? ""}
              onChange={(e) => set("additionalNeeds", e.target.value)}
              placeholder="Anything else we should know"
              aria-label="Additional needs"
            />
          ) : (
            (data.additionalNeeds ?? "None recorded")
          )}
        </Row>
        <p className="text-xs text-muted pt-1">
          Allergies, medication and action plans are on the Medical tab.
        </p>
      </Card>

      {/* ── Permissions ────────────────────────────────────
          The family's to give and to withdraw. Shown as plain
          statements of what happens, not policy language. */}
      <Card title="Permissions">
        <Toggle
          label="Photos may be used on social media"
          hint="Amana's public Facebook and Instagram."
          icon={Camera}
          checked={Boolean(value("allowSocialMediaPost"))}
          disabled={!editing || !can("allowSocialMediaPost")}
          onChange={(v) => set("allowSocialMediaPost", v)}
        />
        <Toggle
          label="Don't post about this child in the app"
          hint="Stops them appearing in the daily feed families see."
          checked={Boolean(value("noAppPosting"))}
          disabled={!editing || !can("noAppPosting")}
          onChange={(v) => set("noAppPosting", v)}
        />
        <Toggle
          label="A staff member's child"
          hint="Let us know if you work at Amana — it affects your fees."
          checked={Boolean(value("isStaffChild"))}
          disabled={!editing || !can("isStaffChild")}
          onChange={(v) => set("isStaffChild", v)}
        />
      </Card>

      {data.tags.length > 0 && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-surface text-foreground/70"
              >
                <Tag className="w-3 h-3" />
                {t}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted pt-1">
            Set by your centre to help them organise the day.
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  editable,
  children,
}: {
  label: string;
  editable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        editable
          ? "space-y-1"
          : "flex items-start justify-between gap-4 text-sm"
      }
    >
      <span className="text-muted shrink-0 text-sm">{label}</span>
      <span
        className={
          editable ? "block" : "text-foreground text-right min-w-0 break-words"
        }
      >
        {children}
      </span>
    </div>
  );
}

function Toggle({
  label,
  hint,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={
        "flex items-start gap-3 " + (disabled ? "" : "cursor-pointer")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand disabled:opacity-60"
      />
      <span className="text-sm text-foreground">
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 text-muted" />}
          {label}
        </span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
