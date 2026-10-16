import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { normalisePublicSource } from "@/lib/recruitment/pool";
import { CareerApplyForm } from "./CareerApplyForm";
import { closingLabel, publicVacancyWhere, vacancyHeadline, vacancyState } from "@/lib/recruitment/public-vacancy";
import { vacancyIsHoliday } from "@/lib/recruitment/fit";

/**
 * /careers/[id] — public application page for a single vacancy.
 *
 * Server component: looks up the vacancy and only renders if it's open AND
 * published to the website (`postedChannels` has "website"). Otherwise 404 —
 * you can't reach a draft/filled role by guessing its id. The website
 * careers page links here; the form posts to /api/public/careers/[id]/apply.
 *
 * `?src=` attributes the applicant to the ad that sent them (an Indeed post,
 * a Seek listing, a flyer QR). It is whitelisted server-side, so a stranger
 * editing the URL can't invent a channel — see `normalisePublicSource`.
 */
const EMPLOYMENT_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Permanent",
  fixed_term: "Fixed-term",
};
const QUALIFICATION_LABELS: Record<string, string> = {
  cert_iii: "Certificate III",
  diploma: "Diploma",
};

// Must reflect live status — a filled/unpublished role should 404 immediately,
// not after the next redeploy.
export const dynamic = "force-dynamic";

async function getVacancy(id: string) {
  return prisma.recruitmentVacancy.findFirst({
    where: { id, ...publicVacancyWhere() },
    include: { service: { select: { name: true, suburb: true, state: true } } },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const v = await getVacancy(id);
  if (!v) return { title: "Role not available — Amana OSHC Careers" };
  const role = vacancyHeadline(v);
  const where = v.service?.name ?? v.region ?? "Amana OSHC";
  return {
    title: `${role} — ${where} | Careers`,
    description: [`Apply for the ${role} role at ${where}.`, v.payRate, v.workPeriod].filter(Boolean).join(" "),
  };
}

export default async function CareerApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { id } = await params;
  const { src } = await searchParams;
  const v = await getVacancy(id);
  if (!v) notFound();

  const roleLabel = vacancyHeadline(v);
  const state = vacancyState(v);
  // A regional casual-pool ad has no single centre — its catchment IS the
  // location, and it is the common shape for pool advertising. Falling back to
  // a bare "Amana OSHC" told an applicant nothing about where the work is.
  const centre = v.service?.name ?? v.region ?? "Amana OSHC";
  // Only a site-specific ad gets a location chip: on a regional ad the
  // catchment is already the heading, and repeating it reads like a bug.
  const location = v.service
    ? [v.service.suburb, v.service.state].filter(Boolean).join(", ")
    : "";
  const chips = [
    EMPLOYMENT_LABELS[v.employmentType] ?? v.employmentType,
    v.qualificationRequired
      ? QUALIFICATION_LABELS[v.qualificationRequired] ?? v.qualificationRequired
      : null,
    location || (state && !v.service ? state : null),
  ].filter(Boolean) as string[];
  const closing = closingLabel(v.closesAt);

  return (
    <main className="min-h-screen bg-[#FFFAE6] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand/60">
          Amana OSHC Careers
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight text-brand md:text-5xl">
          {roleLabel}
        </h1>
        <p className="mt-2 text-xl text-brand/80">{centre}</p>

        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-[#FFF2BF] px-3 py-1 text-sm font-medium text-brand">
                {c}
              </span>
            ))}
          </div>
        )}

        {(v.payRate || v.workPeriod || closing) && (
          <dl className="mt-6 grid gap-3 rounded-2xl bg-card p-5 text-brand shadow-sm ring-1 ring-black/5 sm:grid-cols-3">
            {v.payRate && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand/60">Pay</dt>
                <dd className="mt-1 font-semibold">{v.payRate}</dd>
              </div>
            )}
            {v.workPeriod && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand/60">When</dt>
                <dd className="mt-1 font-semibold">{v.workPeriod}</dd>
              </div>
            )}
            {closing && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand/60">Closing date</dt>
                <dd className="mt-1 font-semibold">{closing.replace("Applications close ", "")}</dd>
              </div>
            )}
          </dl>
        )}

        {v.notes?.trim() && (
          <div className="mt-8 whitespace-pre-wrap rounded-2xl bg-card p-6 text-brand/90 shadow-sm ring-1 ring-black/5 md:p-8">
            {v.notes.trim()}
          </div>
        )}

        <div className="mt-8">
          <CareerApplyForm
            vacancyId={v.id}
            roleLabel={roleLabel}
            centre={centre}
            source={normalisePublicSource(src)}
            vacancyState={state}
            qualificationRequired={v.qualificationRequired}
            holiday={vacancyIsHoliday(v)}
          />
        </div>

        <p className="mt-8 text-center text-sm text-brand/60">
          <Link href="/careers" className="underline">See all open roles</Link>
        </p>
      </div>
    </main>
  );
}
