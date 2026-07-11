import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CareerApplyForm } from "./CareerApplyForm";

/**
 * /careers/[id] — public application page for a single vacancy.
 *
 * Server component: looks up the vacancy and only renders if it's open AND
 * published to the website (`postedChannels` has "website"). Otherwise 404 —
 * you can't reach a draft/filled role by guessing its id. The website
 * careers page links here; the form posts to /api/public/careers/[id]/apply.
 */
const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  member: "Coordinator",
  director: "Director",
};
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
    where: {
      id,
      deleted: false,
      status: "open",
      postedChannels: { has: "website" },
    },
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
  const role = ROLE_LABELS[v.role] ?? v.role;
  return {
    title: `${role} — ${v.service?.name ?? "Amana OSHC"} | Careers`,
    description: `Apply for the ${role} role at ${v.service?.name ?? "Amana OSHC"}.`,
  };
}

export default async function CareerApplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const v = await getVacancy(id);
  if (!v) notFound();

  const roleLabel = ROLE_LABELS[v.role] ?? v.role.replace(/_/g, " ");
  const centre = v.service?.name ?? "Amana OSHC";
  const location = [v.service?.suburb, v.service?.state].filter(Boolean).join(", ");
  const chips = [
    EMPLOYMENT_LABELS[v.employmentType] ?? v.employmentType,
    v.qualificationRequired
      ? QUALIFICATION_LABELS[v.qualificationRequired] ?? v.qualificationRequired
      : null,
    location || null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-[#FFFAE6] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#004E64]/60">
          Amana OSHC Careers
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight text-[#004E64] md:text-5xl">
          {roleLabel}
        </h1>
        <p className="mt-2 text-xl text-[#004E64]/80">{centre}</p>

        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-[#FFF2BF] px-3 py-1 text-sm font-medium text-[#004E64]">
                {c}
              </span>
            ))}
          </div>
        )}

        {v.notes?.trim() && (
          <div className="mt-8 whitespace-pre-wrap rounded-2xl bg-white p-6 text-[#004E64]/90 shadow-sm ring-1 ring-black/5 md:p-8">
            {v.notes.trim()}
          </div>
        )}

        <div className="mt-8">
          <CareerApplyForm vacancyId={v.id} roleLabel={roleLabel} centre={centre} />
        </div>

        <p className="mt-8 text-center text-sm text-[#004E64]/60">
          <Link href="/careers" className="underline">See all open roles</Link>
        </p>
      </div>
    </main>
  );
}
