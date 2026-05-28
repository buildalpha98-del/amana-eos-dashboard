"use client";

import { useEffect, useState } from "react";
import type { User, EmergencyContact } from "@prisma/client";
import { Phone, MapPin, Cake, CalendarDays, Loader2, User as UserIcon, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface PersonalTabProps {
  targetUser: User;
  emergencyContacts: EmergencyContact[];
  canEdit: boolean;
  /** True when the viewer is an admin and is NOT viewing their own profile — controls visibility of the admin "Account" panel (role editing). */
  canEditAccount?: boolean;
  /** True when the viewer is an owner — needed because only owners can promote to owner/head_office. */
  viewerIsOwner?: boolean;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAddress(u: User): string {
  const parts = [u.addressStreet, u.addressSuburb, u.addressState, u.addressPostcode].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function PersonalTab({
  targetUser,
  emergencyContacts,
  canEdit,
  canEditAccount = false,
  viewerIsOwner = false,
}: PersonalTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);

  // Auto-open the edit form when arriving via the header's "Edit profile"
  // Quick Action (which sets `?edit=personal`). One-shot on mount: we strip
  // the param so a manual refresh doesn't re-open the form unexpectedly.
  useEffect(() => {
    if (!canEdit) return;
    if (searchParams.get("edit") !== "personal") return;
    setEditing(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("edit");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (editing && canEdit) {
    return (
      <PersonalEditForm
        targetUser={targetUser}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Personal details</h3>
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
          <Field icon={UserIcon} label="Full name" value={targetUser.name || "—"} />
          <Field icon={Mail} label="Email" value={targetUser.email || "—"} />
          <Field icon={Phone} label="Phone" value={targetUser.phone || "—"} />
          <Field icon={Cake} label="Date of birth" value={formatDate(targetUser.dateOfBirth)} />
          <Field
            icon={MapPin}
            label="Address"
            value={formatAddress(targetUser)}
            className="sm:col-span-2"
          />
          <Field icon={CalendarDays} label="Start date" value={formatDate(targetUser.startDate)} />
          <Field
            icon={CalendarDays}
            label="Probation ends"
            value={formatDate(targetUser.probationEndDate)}
          />
        </dl>
      </div>

      {canEditAccount && (
        <AccountPanel targetUser={targetUser} viewerIsOwner={viewerIsOwner} />
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Emergency contacts</h3>
        {emergencyContacts.length === 0 ? (
          <p className="text-sm text-muted">No emergency contacts recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {emergencyContacts.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {c.name}
                    {c.isPrimary && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand/10 text-brand">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">{c.relationship}</div>
                </div>
                <a
                  href={`tel:${c.phone}`}
                  className="text-sm text-brand hover:underline"
                >
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PersonalEditForm({
  targetUser,
  onCancel,
  onSaved,
}: {
  targetUser: User;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: targetUser.name ?? "",
    email: targetUser.email ?? "",
    phone: targetUser.phone ?? "",
    dateOfBirth: toDateInput(targetUser.dateOfBirth),
    addressStreet: targetUser.addressStreet ?? "",
    addressSuburb: targetUser.addressSuburb ?? "",
    addressState: targetUser.addressState ?? "",
    addressPostcode: targetUser.addressPostcode ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send fields the admin actually touched or that already
      // hold a value. Empty strings unset dates server-side; we don't
      // want to clobber unrelated fields the admin never opened.
      const body: Record<string, string> = {};
      const initial = {
        name: targetUser.name ?? "",
        email: targetUser.email ?? "",
        phone: targetUser.phone ?? "",
        dateOfBirth: toDateInput(targetUser.dateOfBirth),
        addressStreet: targetUser.addressStreet ?? "",
        addressSuburb: targetUser.addressSuburb ?? "",
        addressState: targetUser.addressState ?? "",
        addressPostcode: targetUser.addressPostcode ?? "",
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
      toast({ description: "Personal details updated." });
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
          <h3 className="text-lg font-semibold text-foreground">Personal details</h3>
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
          <Input
            label="Full name"
            icon={UserIcon}
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            autoComplete="name"
            className="sm:col-span-2"
          />
          <Input
            label="Email"
            icon={Mail}
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            autoComplete="email"
          />
          <Input
            label="Phone"
            icon={Phone}
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="0400 000 000"
            autoComplete="tel"
          />
          <Input
            label="Date of birth"
            icon={Cake}
            type="date"
            value={form.dateOfBirth}
            onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
          />
          <Input
            label="Street"
            icon={MapPin}
            value={form.addressStreet}
            onChange={(v) => setForm((f) => ({ ...f, addressStreet: v }))}
            className="sm:col-span-2"
            autoComplete="address-line1"
          />
          <Input
            label="Suburb"
            value={form.addressSuburb}
            onChange={(v) => setForm((f) => ({ ...f, addressSuburb: v }))}
            autoComplete="address-level2"
          />
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Input
              label="State"
              value={form.addressState}
              onChange={(v) => setForm((f) => ({ ...f, addressState: v }))}
              autoComplete="address-level1"
            />
            <Input
              label="Postcode"
              value={form.addressPostcode}
              onChange={(v) => setForm((f) => ({ ...f, addressPostcode: v }))}
              autoComplete="postal-code"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Input({
  label,
  icon: Icon,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  className,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "url" | "search" | "decimal" | "none";
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs uppercase tracking-wide text-muted flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
    </label>
  );
}

// ── AccountPanel ───────────────────────────────────────────────────
// Admin-only role editor. Shown on the staff profile when the viewer is an
// admin and is NOT viewing their own profile (we don't want one-click
// self-elevation/demotion from this UI; the user-list page handles that).
// Saves via PATCH /api/users/[id] which enforces the canonical role guards
// (only-owners-can-promote-to-owner, last-owner protection, etc.).

const ROLE_OPTIONS: { value: string; label: string; ownerOnly?: boolean }[] = [
  { value: "owner", label: "Owner", ownerOnly: true },
  { value: "head_office", label: "Head office", ownerOnly: true },
  { value: "admin", label: "Admin" },
  { value: "marketing", label: "Marketing" },
  { value: "member", label: "Member" },
  { value: "staff", label: "Staff" },
];

function AccountPanel({
  targetUser,
  viewerIsOwner,
}: {
  targetUser: User;
  viewerIsOwner: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string>(targetUser.role);

  const selectableRoles = ROLE_OPTIONS.filter(
    (r) => viewerIsOwner || !r.ownerOnly,
  );

  async function handleSave() {
    if (role === targetUser.role) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await mutateApi(`/api/users/${targetUser.id}`, {
        method: "PATCH",
        body: { role },
      });
      toast({ description: "Role updated." });
      router.refresh();
      setEditing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update role";
      toast({ variant: "destructive", description: message });
      // Reset the local role to the canonical value if the server rejected.
      setRole(targetUser.role);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-foreground">Account</h3>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
          Admin only
        </span>
      </div>
      <p className="text-xs text-muted mb-4">
        Privileged settings. Visible to owners and admins only.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">
            Role
          </span>
          {editing ? (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              {selectableRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-1 text-sm font-medium text-foreground capitalize">
              {targetUser.role.replace(/_/g, " ")}
            </div>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRole(targetUser.role);
                setEditing(false);
              }}
              disabled={saving}
              className="text-sm text-muted hover:text-foreground px-3 py-1.5 rounded-md border border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-sm font-medium text-white bg-brand hover:bg-brand/90 px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save role
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-foreground hover:bg-muted/50 px-3 py-1.5 rounded-md border border-border"
          >
            Change role
          </button>
        )}
      </div>
    </div>
  );
}
