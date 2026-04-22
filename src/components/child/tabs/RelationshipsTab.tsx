"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Star, Phone, Mail, Users, ShieldCheck } from "lucide-react";
import { z } from "zod";
import {
  parseJsonField,
  primaryParentSchema,
  emergencyContactSchema,
} from "@/lib/schemas/json-fields";
import type { ChildProfileRecord } from "../types";

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

  const secondary = useMemo(() => {
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

  return (
    <div className="space-y-6">
      {/* Primary carer (starred) */}
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
      </section>

      {/* Secondary carer (optional) */}
      {secondary && (
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-muted" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">
              Secondary Carer
            </h3>
          </div>
          <ContactRow
            name={parentName(secondary)}
            relationship={secondary.relationship}
            phone={secondary.mobile}
            email={secondary.email}
          />
        </section>
      )}

      {/* Emergency contacts */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-muted" aria-hidden />
          <h3 className="text-lg font-semibold text-foreground">
            Emergency Contacts
          </h3>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Authorised pickups */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-muted" aria-hidden />
          <h3 className="text-lg font-semibold text-foreground">
            Authorised Pickup
          </h3>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <div className="rounded-xl border border-dashed border-border bg-surface/40 p-4 text-sm text-muted">
          To edit carer, emergency, or authorised-pickup details, use the
          enrolment flow at{" "}
          <Link
            href={`/admin/enrolments/${enrolment.id}`}
            className="text-brand underline underline-offset-2 hover:text-brand/80"
          >
            the enrolment record
          </Link>
          . Inline editing will ship in a later sub-project.
        </div>
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
