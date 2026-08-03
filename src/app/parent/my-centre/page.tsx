"use client";

/**
 * /parent/my-centre — everything a family needs to know about their
 * service: who to contact, the daily rhythm, what food is provided, and
 * the onboarding walkthrough for new families.
 *
 * 2026-08-01, per Daniel.
 *
 * The DATA and the API for this already existed. Directors of Service
 * have been able to edit About / tagline / key contacts / daily routine /
 * food provider / parent onboarding since May via the service Content
 * tab, and GET /api/parent/centres has returned all of it, correctly
 * scoped to the centres a family's children attend, since then too.
 *
 * Nothing in the parent app ever consumed it. So every director who
 * carefully filled in their centre's welcome text was writing into a void
 * — this is the third feature this week that was fully built on the staff
 * side and invisible to families.
 */

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  Building2,
  Clock,
  Mail,
  Phone,
  UtensilsCrossed,
  MapPin,
  Sparkles,
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

interface Centre {
  id: string;
  name: string;
  code: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  content: {
    about: string;
    tagline: string;
    heroImage: string;
    contacts: Contact[];
    dailyRoutine: string;
    foodProvider: string;
    parentOnboarding: string;
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

export default function MyCentrePage() {
  const { data, isLoading } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-32 rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  const centres = data?.centres ?? [];

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

  return (
    <div className="pb-24 space-y-8">
      {centres.map((centre) => (
        <div key={centre.id} className="space-y-6">
          {/* ── Hero ─────────────────────────────────── */}
          <section className="warm-card overflow-hidden">
            {centre.content.heroImage && (
              <div className="relative -mx-4 -mt-4 mb-4 h-40">
                <Image
                  src={centre.content.heroImage}
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
            {centre.content.tagline && (
              <p className="text-sm text-[color:var(--color-brand)] font-medium mt-0.5">
                {centre.content.tagline}
              </p>
            )}

            <div className="mt-3 space-y-1.5">
              {centre.address && (
                <p className="text-sm text-[color:var(--color-muted)] flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  {centre.address}
                </p>
              )}
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
          </section>

          {/* Each block renders ONLY when the director has written it —
              an empty "Daily routine" heading is worse than no heading. */}
          {centre.content.about && (
            <section>
              <SectionLabel label="About us" />
              <div className="warm-card">
                <Prose text={centre.content.about} />
              </div>
            </section>
          )}

          {centre.content.parentOnboarding && (
            <section>
              <SectionLabel label="What to expect" />
              <div className="warm-card">
                <div className="flex items-start gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[color:var(--color-brand)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[color:var(--color-muted)]">
                    A walkthrough for new families.
                  </p>
                </div>
                <Prose text={centre.content.parentOnboarding} />
              </div>
            </section>
          )}

          {centre.content.dailyRoutine && (
            <section>
              <SectionLabel label="A day with us" />
              <div className="warm-card">
                <div className="flex items-start gap-2 mb-2">
                  <Clock className="w-4 h-4 text-[color:var(--color-brand)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[color:var(--color-muted)]">
                    The rhythm at this centre.
                  </p>
                </div>
                <Prose text={centre.content.dailyRoutine} />
              </div>
            </section>
          )}

          {centre.content.foodProvider && (
            <section>
              <SectionLabel label="Food" />
              <div className="warm-card">
                <div className="flex items-start gap-2 mb-2">
                  <UtensilsCrossed className="w-4 h-4 text-[color:var(--color-brand)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[color:var(--color-muted)]">
                    What we provide, and how we handle dietary needs.
                  </p>
                </div>
                <Prose text={centre.content.foodProvider} />
              </div>
            </section>
          )}

          {centre.content.contacts.length > 0 && (
            <section>
              <SectionLabel label="Who to contact" />
              <div className="space-y-2">
                {centre.content.contacts
                  // A contact with no name is an unfilled slot, not a
                  // person — showing "Director of Service" with a blank
                  // name reads as an error.
                  .filter((c) => c.name?.trim())
                  .map((c, i) => (
                    <div key={`${c.role}-${i}`} className="warm-card">
                      <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                        {c.name}
                      </p>
                      <p className="text-xs text-[color:var(--color-muted)]">
                        {c.role}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="text-sm text-[color:var(--color-brand)] inline-flex items-center gap-1.5 min-h-11"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="text-sm text-[color:var(--color-brand)] inline-flex items-center gap-1.5 min-h-11 break-all"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {c.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      ))}
    </div>
  );
}
