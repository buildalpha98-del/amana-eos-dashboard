import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

/**
 * /careers — public index of open, website-published vacancies.
 * The marketing site lists these too; this page is the canonical
 * dashboard-hosted fallback and the parent of the apply pages.
 */
export const metadata: Metadata = {
  title: "Careers at Amana OSHC",
  description: "Open educator and coordinator roles across Amana OSHC centres in NSW and VIC.",
};

// A job board must reflect live vacancy status — render per request rather
// than freezing the list at build time.
export const dynamic = "force-dynamic";

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

export default async function CareersIndexPage() {
  const vacancies = await prisma.recruitmentVacancy.findMany({
    where: { deleted: false, status: "open", postedChannels: { has: "website" } },
    include: { service: { select: { name: true, suburb: true, state: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-[#FFFAE6] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#004E64]/60">
          Amana OSHC
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight text-[#004E64] md:text-5xl">
          Work Beyond The Bell
        </h1>
        <p className="mt-3 text-xl text-[#004E64]/80">
          Open roles at our Islamic-school centres across NSW &amp; VIC.
        </p>

        {vacancies.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-8 text-center text-[#004E64]/80 shadow-sm ring-1 ring-black/5">
            <p className="text-lg font-medium text-[#004E64]">No open roles right now.</p>
            <p className="mt-2">
              We&rsquo;re always keen to meet great educators — email your CV to{" "}
              <a href="mailto:contact@amanaoshc.com.au" className="underline">contact@amanaoshc.com.au</a>.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {vacancies.map((v) => {
              const roleLabel = ROLE_LABELS[v.role] ?? v.role.replace(/_/g, " ");
              const centre = v.service?.name ?? "Amana OSHC";
              const location = [v.service?.suburb, v.service?.state].filter(Boolean).join(", ");
              return (
                <Link
                  key={v.id}
                  href={`/careers/${v.id}`}
                  className="block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
                >
                  <h2 className="text-2xl font-semibold text-[#004E64]">{roleLabel}</h2>
                  <p className="mt-1 text-[#004E64]/80">{centre}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#FFF2BF] px-3 py-1 text-sm font-medium text-[#004E64]">
                      {EMPLOYMENT_LABELS[v.employmentType] ?? v.employmentType}
                    </span>
                    {location && (
                      <span className="rounded-full bg-[#FFF2BF] px-3 py-1 text-sm font-medium text-[#004E64]">
                        {location}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-semibold text-[#004E64] underline decoration-[#FECE00] decoration-2 underline-offset-4">
                    View &amp; apply →
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
