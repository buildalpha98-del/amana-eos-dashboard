"use client";

import { useMemo, useState } from "react";
import { Star, Phone, Mail, Users, ShieldCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import {
  parseJsonField,
  primaryParentSchema,
  emergencyContactSchema,
} from "@/lib/schemas/json-fields";
import type { ChildProfileRecord } from "../types";
import { useChildRelationships } from "@/hooks/useChildRelationships";
import {
  RelationshipsEditDialog,
  type RelationshipsDialogKind,
  type RelationshipsDialogPayload,
} from "./RelationshipsEditDialog";

interface RelationshipsTabProps {
  child: ChildProfileRecord;
  canEdit: boolean;
}

const authorisedPickupSchema = z
  .object({
    name: z.string(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
  })
  .passthrough();

const emergencyContactsListSchema = z.array(emergencyContactSchema);
const authorisedPickupListSchema = z.array(authorisedPickupSchema);

type EmergencyContact = z.infer<typeof emergencyContactSchema>;
type AuthorisedPickup = z.infer<typeof authorisedPickupSchema>;

type SecondaryParent = z.infer<typeof primaryParentSchema>;

interface EditingState {
  kind: RelationshipsDialogKind;
  /** Index into the target list (emergency / pickup). Undefined = new item. */
  index?: number;
  initial?: {
    firstName?: string;
    surname?: string;
    name?: string;
    relationship?: string;
    phone?: string;
    mobile?: string;
    email?: string;
  };
}

function digitsOnly(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/[^\d+]/g, "");
}

function telHref(phone: string | undefined): string | null {
  const cleaned = digitsOnly(phone);
  return cleaned ? `tel:${cleaned}` : null;
}

function mailHref(email: string | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  return trimmed ? `mailto:${trimmed}` : null;
}

function parentName(p: {
  firstName?: string;
  surname?: string;
  name?: string;
}): string {
  if (p.name && p.name.trim()) return p.name.trim();
  const first = (p.firstName ?? "").trim();
  const last = (p.surname ?? "").trim();
  const combined = `${first} ${last}`.trim();
  return combined || "—";
}

export function RelationshipsTab({ child, canEdit }: RelationshipsTabProps) {
  const enrolment = child.enrolment;
  const mutation = useChildRelationships(child.id);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const primary = useMemo(
    () =>
      enrolment
        ? parseJsonField(enrolment.primaryParent, primaryParentSchema, {
            firstName: "",
            surname: "",
          })
        : null,
    [enrolment],
  );

  const secondary = useMemo<SecondaryParent | null>(() => {
    if (!enrolment?.secondaryParent) return null;
    const parsed = parseJsonField(
      enrolment.secondaryParent,
      primaryParentSchema,
      {
        firstName: "",
        surname: "",
      },
    );
    // Hide if the secondary record is entirely empty (common when enrolment
    // only captured the primary parent).
    const hasAny = Boolean(
      (parsed.firstName ?? "").trim() ||
        (parsed.surname ?? "").trim() ||
        (parsed.email ?? "").trim() ||
        (parsed.mobile ?? "").trim(),
    );
    return hasAny ? parsed : null;
  }, [enrolment]);

  const emergencyContacts = useMemo<EmergencyContact[]>(() => {
    if (!enrolment) return [];
    return parseJsonField(
      enrolment.emergencyContacts,
      emergencyContactsListSchema,
      [],
    );
  }, [enrolment]);

  const authorisedPickup = useMemo<AuthorisedPickup[]>(() => {
    if (!enrolment) return [];
    return parseJsonField(
      enrolment.authorisedPickup,
      authorisedPickupListSchema,
      [],
    );
  }, [enrolment]);

  if (!enrolment) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
        No enrolment data available for this child. Contacts, emergency
        contacts and authorised pickups are captured during the enrolment
        flow.
      </div>
    );
  }

  async function handleSave(payload: RelationshipsDialogPayload) {
    if (!editing) return;
    if (editing.kind === "secondary") {
      const next = {
        firstName: payload.firstName ?? "",
        surname: payload.surname ?? "",
        relationship: payload.relationship ?? undefined,
        mobile: payload.mobile ?? undefined,
        email: payload.email ?? undefined,
      };
      await mutation.mutateAsync({ secondaryParent: next });
      return;
    }
    if (editing.kind === "emergency") {
      const entry = {
        name: payload.name ?? "",
        relationship: payload.relationship ?? "",
        phone: payload.phone ?? "",
        email: payload.email ?? undefined,
      };
      const nextList = [...emergencyContacts];
      if (editing.index !== undefined) {
        nextList[editing.index] = entry;
      } else {
        nextList.push(entry);
      }
      await mutation.mutateAsync({ emergencyContacts: nextList });
      return;
    }
    // pickup
    const entry = {
      name: payload.name ?? "",
      relationship: payload.relationship ?? undefined,
      phone: payload.phone ?? undefined,
    };
    const nextList = [...authorisedPickup];
    if (editing.index !== undefined) {
      nextList[editing.index] = entry;
    } else {
      nextList.push(entry);
    }
    await mutation.mutateAsync({ authorisedPickup: nextList });
  }

  async function removeSecondary() {
    // `null` is the "clear" signal — server maps to Prisma.JsonNull (SQL NULL).
    // An empty object would fail Zod because primaryParentSchema requires
    // firstName + surname.
    await mutation.mutateAsync({ secondaryParent: null });
  }

  async function removeEmergency(i: number) {
    const nextList = emergencyContacts.filter((_, idx) => idx !== i);
    await mutation.mutateAsync({ emergencyContacts: nextList });
  }

  async function removePickup(i: number) {
    const nextList = authorisedPickup.filter((_, idx) => idx !== i);
    await mutation.mutateAsync({ authorisedPickup: nextList });
  }

  return (
    <div className="space-y-6">
      {/* Primary carer (starred, always read-only) */}
      <section className="rounded-xl border-2 border-brand/30 bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-brand fill-brand" aria-hidden />
          <h3 className="text-lg font-semibold text-foreground">
            Primary Carer
          </h3>
        </div>
        {primary ? (
          <ContactRow
            name={parentName(primary)}
            relationship={primary.relationship}
            phone={primary.mobile}
            email={primary.email}
          />
        ) : (
          <p className="text-sm text-muted">No primary carer recorded.</p>
        )}
        {canEdit && (
          <p className="text-xs text-muted mt-3">
            Primary carer details are managed through the enrolment flow.
          </p>
        )}
      </section>

      {/* Secondary carer (optional) */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">
              Secondary Carer
            </h3>
          </div>
          {canEdit && !secondary && (
            <IconButton
              label="Add secondary carer"
              icon={<Plus className="w-3.5 h-3.5" aria-hidden />}
              onClick={() =>
                setEditing({ kind: "secondary", initial: {} })
              }
            />
          )}
        </div>
        {secondary ? (
          <div className="flex flex-col gap-3">
            <ContactRow
              name={parentName(secondary)}
              relationship={secondary.relationship}
              phone={secondary.mobile}
              email={secondary.email}
            />
            {canEdit && (
              <div className="flex items-center gap-2">
                <IconButton
                  label="Edit secondary carer"
                  icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}
                  onClick={() =>
                    setEditing({
                      kind: "secondary",
                      initial: {
                        firstName: secondary.firstName,
                        surname: secondary.surname,
                        relationship: secondary.relationship,
                        mobile: secondary.mobile,
                        email: secondary.email,
                      },
                    })
                  }
                />
                <IconButton
                  label="Remove secondary carer"
                  icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />}
                  onClick={removeSecondary}
                  variant="danger"
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No secondary carer recorded.</p>
        )}
      </section>

      {/* Emergency contacts */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-muted" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">
              Emergency Contacts
            </h3>
          </div>
          {canEdit && (
            <IconButton
              label="Add emergency contact"
              icon={<Plus className="w-3.5 h-3.5" aria-hidden />}
              onClick={() =>
                setEditing({ kind: "emergency", initial: {} })
              }
            />
          )}
        </div>
        {emergencyContacts.length === 0 ? (
          <p className="text-sm text-muted">No emergency contacts recorded.</p>
        ) : (
          <ul className="space-y-4">
            {emergencyContacts.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="border-t border-border first:border-t-0 first:pt-0 pt-4"
              >
                <ContactRow
                  name={c.name || "—"}
                  relationship={c.relationship}
                  phone={c.phone}
                  email={c.email}
                />
                {canEdit && (
                  <div className="flex items-center gap-2 mt-2">
                    <IconButton
                      label={`Edit emergency contact ${c.name || i + 1}`}
                      icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}
                      onClick={() =>
                        setEditing({
                          kind: "emergency",
                          index: i,
                          initial: {
                            name: c.name,
                            relationship: c.relationship,
                            phone: c.phone,
                            email: c.email,
                          },
                        })
                      }
                    />
                    <IconButton
                      label={`Remove emergency contact ${c.name || i + 1}`}
                      icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />}
                      onClick={() => removeEmergency(i)}
                      variant="danger"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Authorised pickups */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">
              Authorised Pickup
            </h3>
          </div>
          {canEdit && (
            <IconButton
              label="Add authorised pickup"
              icon={<Plus className="w-3.5 h-3.5" aria-hidden />}
              onClick={() =>
                setEditing({ kind: "pickup", initial: {} })
              }
            />
          )}
        </div>
        {authorisedPickup.length === 0 ? (
          <p className="text-sm text-muted">
            No authorised pickups recorded.
          </p>
        ) : (
          <ul className="space-y-4">
            {authorisedPickup.map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                className="border-t border-border first:border-t-0 first:pt-0 pt-4"
              >
                <ContactRow
                  name={p.name || "—"}
                  relationship={p.relationship}
                  phone={p.phone}
                />
                {canEdit && (
                  <div className="flex items-center gap-2 mt-2">
                    <IconButton
                      label={`Edit authorised pickup ${p.name || i + 1}`}
                      icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}
                      onClick={() =>
                        setEditing({
                          kind: "pickup",
                          index: i,
                          initial: {
                            name: p.name,
                            relationship: p.relationship,
                            phone: p.phone,
                          },
                        })
                      }
                    />
                    <IconButton
                      label={`Remove authorised pickup ${p.name || i + 1}`}
                      icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />}
                      onClick={() => removePickup(i)}
                      variant="danger"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <RelationshipsEditDialog
          open
          onClose={() => setEditing(null)}
          kind={editing.kind}
          initial={editing.initial}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────

function ContactRow({
  name,
  relationship,
  phone,
  email,
}: {
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
}) {
  const tel = telHref(phone);
  const mail = mailHref(email);
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        {relationship && (
          <p className="text-xs text-muted mt-0.5">{relationship}</p>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm sm:text-right">
        {tel ? (
          <a
            href={tel}
            className="inline-flex items-center gap-1.5 text-foreground hover:text-brand transition-colors sm:justify-end"
          >
            <Phone className="w-3.5 h-3.5" aria-hidden />
            {phone}
          </a>
        ) : (
          phone && <span className="text-muted">{phone}</span>
        )}
        {mail ? (
          <a
            href={mail}
            className="inline-flex items-center gap-1.5 text-foreground hover:text-brand transition-colors sm:justify-end"
          >
            <Mail className="w-3.5 h-3.5" aria-hidden />
            {email}
          </a>
        ) : (
          email && <span className="text-muted">{email}</span>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  variant = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void | Promise<void>;
  variant?: "default" | "danger";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors";
  const palette =
    variant === "danger"
      ? "border-red-200 text-red-600 hover:bg-red-50"
      : "border-border text-muted hover:bg-surface hover:text-foreground";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`${base} ${palette}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
