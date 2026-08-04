"use client";

/**
 * /parent/my-centre — everything a family needs to know about their
 * centre, read entirely from HQ → Services → Service Information.
 *
 * NOTHING here is hardcoded. When a centre hasn't filled a field in, the
 * whole section is omitted rather than rendered as an empty heading — a
 * "Daily routine" header with nothing under it reads as broken, not as
 * "not supplied".
 *
 * Phone-first: this is the page opened at the school gate, so the
 * address, the location within the school, the map and the phone number
 * come before any narrative.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  Building2,
  Clock,
  FileText,
  Mail,
  MapPin,
  Phone,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { SectionLabel } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";

interface Contact {
  role: string;
  name: string;
  phone: string;
  email: string;
}

interface Policy {
  id: string;
  name: string;
  fileUrl: string;
  fileName: string;
}

interface Centre {
  id: string;
  name: string;
  code: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  policies: Policy[];
  content: {
    about: string;
    tagline: string;
    vision: string;
    heroImage: string;
    contacts: Contact[];
    dailyRoutine: string;
    foodProvider: string;
    parentOnboarding: string;
    locationWithinSchool: string;
    meetingPoints: string;
    serviceMapUrl: string;
    serviceMapName: string;
  };
}

/** Multi-line plain text — preserve the author's line breaks. */
function Prose({ text }: { text: string }) {
  return (
    <p className="text-sm text-[color:var(--color-foreground)]/85 leading-relaxed whitespace-pre-wrap">
      {text}
    </p>
  );
}

const isPdf = (url: string) => url.toLowerCase().split("?")[0].endsWith(".pdf");

export default function MyCentrePage() {
  const { data, isLoading } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    retry: 1,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const centres = data?.centres ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-32 rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (centres.length === 0) {
    return (
      <div className="warm-card text-center py-10">
        <Building2 className="w-7 h-7 mx-auto text-[color:var(--color-muted)] mb-2" />
        <p className="text-sm text-[color:var(--color-muted)]">
          Your centre details will appear here once your enrolment is
          confirmed.
        </p>
      </div>
    );
  }

  const centre = centres.find((x) => x.id === activeId) ?? centres[0];
  const c = centre.content;
  const namedContacts = c.contacts.filter((x) => x.name?.trim());

  return (
    <div className="pb-24 space-y-6">
      {/* Only rendered when a family genuinely has children at more than
          one centre — a switcher with one option is a control that does
          nothing. */}
      {centres.length > 1 && (
        <div className="flex gap-1 bg-[color:var(--color-surface)] rounded-xl p-1 overflow-x-auto">
          {centres.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setActiveId(opt.id)}
              className={
                "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-11 transition-colors " +
                (opt.id === centre.id
                  ? "bg-[color:var(--color-card)] text-[color:var(--color-brand)] shadow-sm"
                  : "text-[color:var(--color-muted)]")
              }
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}

      {/*
        No feed here (2026-08-04, per Daniel). Posts and announcements
        all live on Home — this tab is the centre's reference card:
        where we are, who to call, how the day runs, the policies.
      */}

      {/* ── 1. Welcome + vision ──────────────────────────── */}
      <section className="warm-card overflow-hidden">
        {c.heroImage && (
          <div className="relative -mx-4 -mt-4 mb-4 h-40">
            <Image
              src={c.heroImage}
              alt={centre.name}
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        )}
        <h1 className="text-xl font-heading font-bold text-[color:var(--color-foreground)]">
          {centre.name}
        </h1>
        {c.tagline && (
          <p className="text-sm text-[color:var(--color-brand)] font-medium mt-0.5">
            {c.tagline}
          </p>
        )}
        {c.about && (
          <div className="mt-3">
            <Prose text={c.about} />
          </div>
        )}
        {c.vision && (
          <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
            <Prose text={c.vision} />
          </div>
        )}
      </section>

      {/* ── 2. Where to find us ──────────────────────────── */}
      {(centre.address || c.locationWithinSchool || c.serviceMapUrl) && (
        <section className="space-y-3">
          <SectionLabel label="Where to find us" />
          <div className="warm-card space-y-3">
            {centre.address && (
              <p className="text-sm text-[color:var(--color-foreground)] flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--color-muted)]" />
                {centre.address}
              </p>
            )}
            {c.locationWithinSchool && (
              <div className="pl-6">
                <Prose text={c.locationWithinSchool} />
              </div>
            )}

            {c.serviceMapUrl &&
              (isPdf(c.serviceMapUrl) ? (
                <a
                  href={c.serviceMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-3 rounded-xl border border-[color:var(--color-border)] text-sm text-[color:var(--color-brand)] min-h-11"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  {c.serviceMapName || "Open the centre map (PDF)"}
                </a>
              ) : (
                /* Opens the file itself — a parent at the gate wants to
                   pinch and zoom, which a scaled-down preview can't do. */
                <a
                  href={c.serviceMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative w-full h-48 rounded-xl overflow-hidden border border-[color:var(--color-border)]"
                >
                  <Image
                    src={c.serviceMapUrl}
                    alt={`Map showing where ${centre.name} is located`}
                    fill
                    sizes="100vw"
                    className="object-contain bg-[color:var(--color-surface)]"
                  />
                </a>
              ))}
          </div>
        </section>
      )}

      {/* ── 3. Contact ───────────────────────────────────── */}
      {(centre.phone || centre.email || namedContacts.length > 0) && (
        <section className="space-y-3">
          <SectionLabel label="Contact" />
          {(centre.phone || centre.email) && (
            <div className="warm-card space-y-1">
              {centre.phone && (
                <a
                  href={`tel:${centre.phone}`}
                  className="text-sm text-[color:var(--color-brand)] flex items-center gap-2 min-h-11"
                >
                  <Phone className="w-4 h-4 shrink-0" />
                  {centre.phone}
                </a>
              )}
              {centre.email && (
                <a
                  href={`mailto:${centre.email}`}
                  className="text-sm text-[color:var(--color-brand)] flex items-center gap-2 min-h-11 break-all"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  {centre.email}
                </a>
              )}
            </div>
          )}

          {namedContacts.length > 0 && (
            <div className="warm-card space-y-3">
              <p className="text-xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Key contacts
              </p>
              {namedContacts.map((person, i) => (
                <div
                  key={`${person.name}-${i}`}
                  className="border-t border-[color:var(--color-border)] pt-3 first:border-0 first:pt-0"
                >
                  <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                    {person.name}
                  </p>
                  {person.role && (
                    <p className="text-xs text-[color:var(--color-muted)]">
                      {person.role}
                    </p>
                  )}
                  {person.phone && (
                    <a
                      href={`tel:${person.phone}`}
                      className="text-sm text-[color:var(--color-brand)] flex items-center gap-2 min-h-11"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      {person.phone}
                    </a>
                  )}
                  {person.email && (
                    <a
                      href={`mailto:${person.email}`}
                      className="text-sm text-[color:var(--color-brand)] flex items-center gap-2 min-h-11 break-all"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      {person.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 4. Meeting / pick-up points ──────────────────── */}
      {c.meetingPoints && (
        <section className="space-y-3">
          <SectionLabel label="Drop-off and pick-up" />
          <div className="warm-card">
            <Prose text={c.meetingPoints} />
          </div>
        </section>
      )}

      {/* ── 5. Daily routine ─────────────────────────────── */}
      {c.dailyRoutine && (
        <section className="space-y-3">
          <SectionLabel label="Daily routine" />
          <div className="warm-card">
            <p className="text-xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5" /> How the day runs
            </p>
            <Prose text={c.dailyRoutine} />
          </div>
        </section>
      )}

      {/* ── 6. Food and what to expect ───────────────────── */}
      {(c.foodProvider || c.parentOnboarding) && (
        <section className="space-y-3">
          <SectionLabel label="Food and what to expect" />
          {c.foodProvider && (
            <div className="warm-card">
              <p className="text-xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <UtensilsCrossed className="w-3.5 h-3.5" /> Food
              </p>
              <Prose text={c.foodProvider} />
            </div>
          )}
          {c.parentOnboarding && (
            <div className="warm-card">
              <Prose text={c.parentOnboarding} />
            </div>
          )}
        </section>
      )}

      {/* ── 7. Policies ──────────────────────────────────── */}
      {centre.policies.length > 0 && (
        <section className="space-y-3">
          <SectionLabel label="Policies" />
          <div className="warm-card divide-y divide-[color:var(--color-border)]">
            {centre.policies.map((p) => (
              <a
                key={p.id}
                href={p.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 min-h-11"
              >
                <FileText className="w-4 h-4 shrink-0 text-[color:var(--color-muted)]" />
                <span className="text-sm text-[color:var(--color-brand)] flex-1">
                  {p.name}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
