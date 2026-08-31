"use client";

/**
 * /parent/forms — the designated place for anything that needs a
 * signature: excursion consents, incursion forms, CWAs, policy
 * acknowledgements. Reached from the action button; also mirrored in
 * My Centre → Documents beside the policies, via the same component.
 */

import { ParentFormsList } from "@/components/parent/ParentFormsList";

export default function ParentFormsPage() {
  return (
    <div className="pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[color:var(--color-foreground)]">
          Forms
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">
          Sign with your full name — it counts the same as pen and paper.
        </p>
      </div>
      <ParentFormsList />
    </div>
  );
}
