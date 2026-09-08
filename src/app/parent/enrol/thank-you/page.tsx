"use client";

/**
 * /parent/enrol/thank-you — lands here right after a parent submits the
 * enrolment form (see the redirect in src/app/parent/enrol/page.tsx's
 * submit()). Says thank you, states what happens next, and — when the
 * submission resolved to a single centre — shows that centre's own
 * "what happens next" message (Service.content.enrolmentThankYou,
 * admin-editable from the service's Content tab). Falls back to a
 * generic message when there's no matching centre yet, or the centre
 * hasn't customised it.
 *
 * Rendered inside the normal ParentShell chrome — by the time this
 * redirect fires, the parent's enrolment state is no longer
 * "needs_enrolment" (submit() awaits the state-query invalidation
 * before navigating), so the shell's enrolment gate has already
 * cleared and doesn't intercept this path.
 */

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Home } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { WarmCTA } from "@/components/ui/v2";
import type { ServiceContent } from "@/lib/service-content-shared";

interface Centre {
  id: string;
  name: string;
  content: Pick<ServiceContent, "enrolmentThankYou">;
}

const GENERIC_THANK_YOU =
  "Someone from our team will review your enrolment and be in touch within one business day.";

export default function EnrolmentThankYouPage() {
  return (
    <Suspense fallback={null}>
      <ThankYouContent />
    </Suspense>
  );
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submissionId") ?? null;
  const serviceId = searchParams?.get("serviceId") ?? null;

  // Only fetched to pull the one centre's custom message — the same
  // endpoint /parent/my-centre uses, so no new API surface.
  const { data, isLoading } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    enabled: !!serviceId,
    retry: 1,
  });

  const centre = serviceId
    ? (data?.centres ?? []).find((c) => c.id === serviceId)
    : undefined;
  const centreMessage = centre?.content.enrolmentThankYou.trim() || null;

  return (
    <div className="pb-24 space-y-6">
      <section className="warm-card text-center py-10">
        <CheckCircle2 className="w-12 h-12 mx-auto text-[color:var(--color-brand)] mb-3" />
        <h1 className="text-xl font-heading font-bold text-[color:var(--color-foreground)]">
          Thank you!
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-2 max-w-sm mx-auto">
          Your enrolment has been submitted.
        </p>
        {submissionId && (
          <p className="text-2xs text-[color:var(--color-muted)] mt-1">
            Reference: {submissionId.slice(0, 8).toUpperCase()}
          </p>
        )}
      </section>

      <section className="warm-card space-y-2">
        <p className="text-xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> What happens next
        </p>
        {serviceId && isLoading ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : (
          <p className="text-sm text-[color:var(--color-foreground)]/85 leading-relaxed whitespace-pre-wrap">
            {centreMessage ?? GENERIC_THANK_YOU}
          </p>
        )}
      </section>

      <WarmCTA icon={Home} title="Go to my portal" href="/parent" />

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        Need to change something? Message us from{" "}
        <Link href="/parent/messages" className="text-[color:var(--color-brand)] underline">
          Messages
        </Link>
        .
      </p>
    </div>
  );
}
