import type { User, EmergencyContact } from "@prisma/client";
import { Phone, MapPin, Cake, CalendarDays } from "lucide-react";

interface PersonalTabProps {
  targetUser: User;
  emergencyContacts: EmergencyContact[];
  canEdit: boolean;
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

export function PersonalTab({ targetUser, emergencyContacts, canEdit }: PersonalTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Personal details</h3>
          {canEdit && (
            <button
              type="button"
              disabled
              title="Editing lands in a future chunk"
              className="text-sm text-muted hover:text-foreground px-3 py-1 rounded-md border border-border opacity-60 cursor-not-allowed"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
