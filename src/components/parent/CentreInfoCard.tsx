"use client";

/**
 * CentreInfoCard — surfaces the Director-of-Service-edited per-service
 * content (Service.content) to parents. Shows the hero image, About copy,
 * key contacts, food provider note, parent onboarding text. Renders
 * nothing for the section if the corresponding field is blank, so a
 * brand-new (unfilled) service stays out of the parent's view.
 *
 * The editable layer was shipped in PR #113 (admin tab on the service
 * detail page). This component completes the loop — what Directors edit
 * is what families see.
 *
 * 2026-05-16.
 */

import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, MapPin, Utensils } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { SectionLabel } from "@/components/parent/ui";
import type { ServiceContent } from "@/lib/service-content-shared";

interface Centre {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string | null;
  email: string | null;
  content: ServiceContent;
}

export function CentreInfoCard() {
  const { data, isLoading } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent-centres"],
    queryFn: async () => {
      const res = await fetch("/api/parent/centres");
      if (!res.ok) throw new Error("Failed to load centre info");
      return res.json();
    },
    staleTime: 60_000,
    retry: 2,
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  const centres = data?.centres ?? [];
  if (centres.length === 0) return null;

  return (
    <section aria-label="About your centre" className="space-y-4">
      {centres.map((centre) => (
        <CentreBlock key={centre.id} centre={centre} />
      ))}
    </section>
  );
}

function CentreBlock({ centre }: { centre: Centre }) {
  const { content } = centre;
  const hasContacts = content.contacts.some(
    (c) => c.name.trim().length > 0 || c.role.trim().length > 0,
  );
  const hasAbout = content.about.trim().length > 0;
  const hasOnboarding = content.parentOnboarding.trim().length > 0;
  const hasFood = content.foodProvider.trim().length > 0;

  return (
    <article className="rounded-lg border border-[color:var(--color-border)] bg-card overflow-hidden">
      <SectionLabel label={`About ${centre.name}`} />

      {content.heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.heroImage}
          alt={`${centre.name} hero`}
          className="w-full h-32 object-cover"
        />
      )}

      <div className="p-4 space-y-3">
        {content.tagline && (
          <p className="text-sm italic text-[color:var(--color-muted)]">
            {content.tagline}
          </p>
        )}

        {hasAbout && (
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
            {content.about}
          </p>
        )}

        <div className="space-y-1.5 text-xs text-[color:var(--color-muted)]">
          {centre.address && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{centre.address}</span>
            </div>
          )}
          {centre.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <a href={`tel:${centre.phone}`} className="underline">
                {centre.phone}
              </a>
            </div>
          )}
          {centre.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
              <a href={`mailto:${centre.email}`} className="underline">
                {centre.email}
              </a>
            </div>
          )}
        </div>

        {hasContacts && (
          <div className="space-y-2 border-t border-[color:var(--color-border)] pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
              Key contacts
            </div>
            {content.contacts
              .filter(
                (c) => c.name.trim().length > 0 || c.role.trim().length > 0,
              )
              .map((c, i) => (
                <div key={i} className="text-sm">
                  <div className="font-medium text-foreground">
                    {c.name}
                    {c.role && c.name && " · "}
                    <span className="font-normal text-[color:var(--color-muted)]">
                      {c.role}
                    </span>
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)] flex gap-3">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="underline">
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="underline">
                        {c.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {hasFood && (
          <div className="border-t border-[color:var(--color-border)] pt-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)] flex items-center gap-1.5">
              <Utensils className="h-3 w-3" /> Food & dietary
            </div>
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
              {content.foodProvider}
            </p>
          </div>
        )}

        {hasOnboarding && (
          <div className="border-t border-[color:var(--color-border)] pt-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
              What to expect
            </div>
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
              {content.parentOnboarding}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
