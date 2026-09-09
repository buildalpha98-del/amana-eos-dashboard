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
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Home,
  MapPin,
  Phone,
  Mail,
  Hash,
  FileText,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { WarmCTA } from "@/components/ui/v2";
import { formatTime } from "@/lib/service-settings";
import type { ServiceContent } from "@/lib/service-content-shared";

interface CentreRoom {
  id: string | null;
  name: string;
  startTime: string | null;
  endTime: string | null;
}

interface Centre {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  serviceApprovalNumber: string | null;
  operatingDays: string | null;
  rooms: CentreRoom[];
  content: Pick<
    ServiceContent,
    "enrolmentThankYou" | "locationWithinSchool" | "serviceMapUrl" | "serviceMapName"
  >;
}

const GENERIC_THANK_YOU =
  "Someone from our team will review your enrolment and be in touch within one business day.";

const isPdf = (url: string) => url.toLowerCase().split("?")[0].endsWith(".pdf");

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

      {centre && <CentreDetailsCard centre={centre} />}

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

/**
 * The "extensive info" block Daniel asked for (2026-09-08): everything a
 * family needs right after enrolling at THIS centre — approval number,
 * operating hours per session, contact details, and where to find it
 * (address + map). Pulled from the same /api/parent/centres payload
 * /parent/my-centre already renders, so nothing here can drift from
 * what admin edits on the service's Content tab.
 */
function CentreDetailsCard({ centre }: { centre: Centre }) {
  const rooms = (centre.rooms ?? []).filter((r) => r.startTime && r.endTime);
  const mapUrl = centre.content.serviceMapUrl;

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide px-1">
        {centre.name}
      </p>

      <div className="warm-card space-y-3">
        {centre.address && (
          <p className="text-sm text-[color:var(--color-foreground)] flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--color-muted)]" />
            <span>
              {centre.address}
              {centre.content.locationWithinSchool && (
                <span className="block text-xs text-[color:var(--color-muted)] mt-0.5">
                  {centre.content.locationWithinSchool}
                </span>
              )}
            </span>
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
        {centre.serviceApprovalNumber && (
          <p className="text-xs text-[color:var(--color-muted)] flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 shrink-0" />
            Service approval number: {centre.serviceApprovalNumber}
          </p>
        )}
      </div>

      {rooms.length > 0 && (
        <div className="warm-card space-y-2">
          <p className="text-2xs font-semibold text-[color:var(--color-muted)] uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Operating hours
            {centre.operatingDays ? ` · ${centre.operatingDays}` : ""}
          </p>
          <div className="divide-y divide-[color:var(--color-border)]">
            {rooms.map((r) => (
              <div key={r.name} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[color:var(--color-foreground)]">{r.name}</span>
                <span className="text-sm text-[color:var(--color-muted)] font-medium">
                  {formatTime(r.startTime)} – {formatTime(r.endTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mapUrl &&
        (isPdf(mapUrl) ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-sm text-[color:var(--color-brand)] min-h-11"
          >
            <FileText className="w-4 h-4 shrink-0" />
            {centre.content.serviceMapName || "Open the centre map (PDF)"}
          </a>
        ) : (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full h-40 rounded-xl overflow-hidden border border-[color:var(--color-border)]"
          >
            <Image
              src={mapUrl}
              alt={`Map showing where ${centre.name} is located`}
              fill
              sizes="100vw"
              className="object-contain bg-[color:var(--color-surface)]"
            />
          </a>
        ))}
    </section>
  );
}
