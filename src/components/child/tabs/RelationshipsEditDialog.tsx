"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export type RelationshipsDialogKind = "secondary" | "emergency" | "pickup";

/**
 * Initial values for the dialog. Kept loose so one shape works for all three
 * kinds — the dialog picks the relevant fields based on `kind`.
 */
export interface RelationshipsDialogInitial {
  firstName?: string;
  surname?: string;
  name?: string;
  relationship?: string;
  phone?: string;
  mobile?: string;
  email?: string;
}

/**
 * Payload shape returned via `onSave`. Mirrors the JSON field schemas:
 * - secondary  → { firstName, surname, mobile, email, relationship }
 * - emergency  → { name, phone, email, relationship }
 * - pickup     → { name, phone, relationship }
 */
export type RelationshipsDialogPayload = Record<string, string | undefined>;

interface Props {
  open: boolean;
  onClose: () => void;
  kind: RelationshipsDialogKind;
  initial?: RelationshipsDialogInitial;
  onSave: (data: RelationshipsDialogPayload) => Promise<void> | void;
}

const TITLES: Record<RelationshipsDialogKind, string> = {
  secondary: "Secondary carer",
  emergency: "Emergency contact",
  pickup: "Authorised pickup",
};

/**
 * Shared edit dialog for the three kinds of relationship entries on
 * `RelationshipsTab`.
 *
 * For `kind === "secondary"` the dialog collects a person record (firstName +
 * surname + mobile + email). For the other kinds it collects a single `name`
 * field + phone. All three collect `relationship`.
 */
export function RelationshipsEditDialog({
  open,
  onClose,
  kind,
  initial,
  onSave,
}: Props) {
  const isPerson = kind === "secondary";

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [surname, setSurname] = useState(initial?.surname ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? initial?.mobile ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [saving, setSaving] = useState(false);

  // Reset local form state when the dialog is re-opened with different data
  // (shared dialog across add-new vs. edit-existing flows).
  useEffect(() => {
    if (!open) return;
    setFirstName(initial?.firstName ?? "");
    setSurname(initial?.surname ?? "");
    setName(initial?.name ?? "");
    setRelationship(initial?.relationship ?? "");
    setPhone(initial?.phone ?? initial?.mobile ?? "");
    setEmail(initial?.email ?? "");
  }, [open, initial]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: RelationshipsDialogPayload = {
        relationship: relationship.trim() || undefined,
      };
      if (isPerson) {
        payload.firstName = firstName.trim();
        payload.surname = surname.trim();
        payload.mobile = phone.trim() || undefined;
        payload.email = email.trim() || undefined;
      } else {
        payload.name = name.trim();
        payload.phone = phone.trim() || undefined;
      }
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          {TITLES[kind]}
        </DialogTitle>
        <div className="space-y-3 mt-4">
          {isPerson ? (
            <>
              <Field
                label="First name"
                value={firstName}
                onChange={setFirstName}
              />
              <Field label="Surname" value={surname} onChange={setSurname} />
            </>
          ) : (
            <Field label="Name" value={name} onChange={setName} />
          )}
          <Field
            label="Relationship"
            value={relationship}
            onChange={setRelationship}
          />
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
          {isPerson && (
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={saving}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Local field primitive ───────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </label>
  );
}
