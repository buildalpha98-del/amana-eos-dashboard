"use client";

import { useState } from "react";
import type { User, Service, EmploymentContract } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { Briefcase, Building2, CalendarDays, BadgeCheck, Loader2 } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface EmploymentTabProps {
  targetUser: User & { service?: Service | null };
  latestContract: EmploymentContract | null;
  canEdit: boolean;
}

const EMPLOYMENT_TYPES = [
  { value: "casual", label: "Casual" },
  { value: "part_time", label: "Part-time" },
  { value: "permanent", label: "Permanent" },
  { value: "fixed_term", label: "Fixed-term" },
] as const;

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function EmploymentTab({ targetUser, latestContract, canEdit }: EmploymentTabProps) {
  const [editing, setEditing] = useState(false);

  if (editing && canEdit) {
    return (
      <EmploymentEditForm
        targetUser={targetUser}
        latestContract={latestContract}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Employment details</h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-foreground hover:bg-muted/50 px-3 py-1 rounded-md border border-border"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Role
            </dt>
            <dd className="mt-1">
              <RoleBadge role={targetUser.role} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Service
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {targetUser.service?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Start date
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {formatDate(targetUser.startDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Employment type
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {humanize(targetUser.employmentType)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Probation ends
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {formatDate(targetUser.probationEndDate)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-brand" />
            Latest contract
          </h3>
          {latestContract && (
            <Link
              href={`/contracts/${latestContract.id}`}
              className="text-sm text-brand hover:underline"
            >
              View in Contracts
            </Link>
          )}
        </div>
        {!latestContract ? (
          <p className="text-sm text-muted">No contract on file.</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Type</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.contractType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Pay rate</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatCurrency(latestContract.payRate)}
                {latestContract.hoursPerWeek
                  ? ` · ${latestContract.hoursPerWeek} hrs/wk`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Award level</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {humanize(latestContract.awardLevel) || latestContract.awardLevelCustom || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Start</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatDate(latestContract.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">End</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatDate(latestContract.endDate)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

function EmploymentEditForm({
  targetUser,
  latestContract,
  onCancel,
  onSaved,
}: {
  targetUser: User & { service?: Service | null };
  latestContract: EmploymentContract | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    startDate: toDateInput(targetUser.startDate),
    employmentType: targetUser.employmentType ?? "",
    probationEndDate: toDateInput(targetUser.probationEndDate),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send fields that actually changed. Empty-string dates
      // clear the value on the server; we forward those changes
      // through but never touch fields the user didn't open.
      const body: Record<string, string> = {};
      const initial = {
        startDate: toDateInput(targetUser.startDate),
        employmentType: targetUser.employmentType ?? "",
        probationEndDate: toDateInput(targetUser.probationEndDate),
      };
      for (const [key, value] of Object.entries(form)) {
        if (value !== initial[key as keyof typeof initial]) {
          body[key] = value;
        }
      }
      if (Object.keys(body).length === 0) {
        onSaved();
        return;
      }
      await mutateApi(`/api/users/${targetUser.id}/profile`, {
        method: "PATCH",
        body,
      });
      toast({ description: "Employment details updated." });
      router.refresh();
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Employment details</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="text-sm text-muted hover:text-foreground px-3 py-1 rounded-md border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm font-medium text-white bg-brand hover:bg-brand/90 px-3 py-1 rounded-md inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Role
            </div>
            <div className="mt-1">
              <RoleBadge role={targetUser.role} />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Role changes are managed by admins from the Team list.
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Service
            </div>
            <div className="mt-0.5 text-sm text-foreground">
              {targetUser.service?.name ?? "—"}
            </div>
          </div>
          <label>
            <span className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Start date
            </span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </label>
          <label>
            <span className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Employment type
            </span>
            <select
              value={form.employmentType}
              onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              <option value="">— Select —</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Probation end date
            </span>
            <input
              type="date"
              value={form.probationEndDate}
              onChange={(e) => setForm((f) => ({ ...f, probationEndDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </label>
        </div>
      </div>

      {latestContract && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-brand" />
              Latest contract
            </h3>
            <Link
              href={`/contracts/${latestContract.id}`}
              className="text-sm text-brand hover:underline"
            >
              Open contract editor
            </Link>
          </div>
          <p className="text-xs text-muted">
            Pay rate, hours, award level and contract dates are managed from the
            Contracts section.
          </p>
        </div>
      )}
    </form>
  );
}
