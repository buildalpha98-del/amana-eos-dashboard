/**
 * POST /api/public/careers/[id]/apply — public job application intake.
 *
 * INTENTIONALLY UNAUTHENTICATED. A member of the public applies for a vacancy
 * that has been published to the website. Creates a RecruitmentCandidate that
 * drops straight into the recruiter's pipeline (and AI screening), attributed
 * to wherever they came from — `website` unless the link carried a `?src=`
 * (see `normalisePublicSource`), which is how an Indeed ad's applicants are
 * told apart from organic ones. Applications are only accepted for vacancies
 * that are still open AND flagged for the website — you can't apply to an
 * unpublished or filled role by guessing its id.
 *
 * Abuse controls: per-IP rate limit + honeypot field. Resume upload is inline
 * (base64) and reuses the same validated storage path as enrolment documents.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { storeResume } from "@/lib/recruitment/resume-upload";
import { sendEmail } from "@/lib/email";
import { applicationRecipients } from "@/lib/recruitment/application-recipients";
import { logger } from "@/lib/logger";
import { FIT_LABELS, fitForRecords } from "@/lib/recruitment/fit";
import { publicVacancyWhere } from "@/lib/recruitment/public-vacancy";
import {
  POOL_SESSIONS,
  POOL_DAYS,
  POOL_SOURCES,
  RIGHT_TO_WORK,
  normalisePublicSource,
  sourceLabel,
} from "@/lib/recruitment/pool";


const applySchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  email: z.string().email("a valid email is required").max(200),
  phone: z.string().max(40).optional().nullable(),
  message: z.string().max(5000).optional().nullable(),
  // 2026-09-15: the same funnel fields the pool registration form collects, so
  // an applicant to a specific ad lands in the pool as complete as anyone else.
  suburb: z.string().max(120).optional().nullable(),
  postcode: z.string().max(10).optional().nullable(),
  qualification: z
    .enum(["cert_iii", "diploma", "bachelor", "masters", "other"])
    .optional()
    .nullable(),
  studying: z.boolean().optional(),
  previousRole: z.string().max(200).optional().nullable(),
  previousEmployer: z.string().max(200).optional().nullable(),
  availableSessions: z.array(z.enum(POOL_SESSIONS)).optional(),
  availableDays: z.array(z.enum(POOL_DAYS)).optional(),
  hasTransport: z.boolean().optional(),
  // 2026-10-16: the answers the automatic fit score uses (recruitment/fit.ts).
  state: z.enum(["NSW", "VIC"]).optional().nullable(),
  qualificationName: z.string().max(200).optional().nullable(),
  vicDiplomaLevel: z.boolean().optional().nullable(),
  holidayWeeks: z.number().int().min(0).max(8).optional().nullable(),
  wwccNumber: z.string().max(40).optional().nullable(),
  hasFirstAid: z.boolean().optional(),
  rightToWork: z.enum(RIGHT_TO_WORK).optional().nullable(),
  yearsExperience: z.number().int().min(0).max(50).optional().nullable(),
  /**
   * Where this application came from, carried on the ad's link as `?src=`.
   * Whitelisted rather than free text — see `normalisePublicSource`. An
   * unknown value is not an error; it just reads as an ordinary website visit.
   */
  source: z.enum(POOL_SOURCES).optional().nullable(),
  resumeFile: z.string().optional().nullable(), // base64, no data: prefix
  resumeFilename: z.string().max(200).optional().nullable(),
  resumeContentType: z.string().max(120).optional().nullable(),
  // Honeypot — real users never fill this (it's hidden). Bots do.
  company: z.string().optional().nullable(),
});

const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  member: "Coordinator",
  director: "Director",
};

export const POST = withApiHandler(async (req: NextRequest, context) => {
  const { id } = (await context!.params!) as { id: string };

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // 10 applications per hour per IP — generous for a genuine job seeker
  // applying to a few roles, harsh for a spambot.
  const limit = await checkRateLimit(`careers-apply:${ip}`, 10, 60 * 60_000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many applications. Please try again later." },
      { status: 429 },
    );
  }

  const raw = await parseJsonBody(req);
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;
  const source = normalisePublicSource(data.source);

  // Honeypot: silently accept (so the bot thinks it worked) but do nothing.
  if (data.company && data.company.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Only open, website-published vacancies accept applications.
  const vacancy = await prisma.recruitmentVacancy.findFirst({
    where: { id, ...publicVacancyWhere() },
    include: {
      service: { select: { name: true, state: true } },
      assignedTo: { select: { email: true, name: true } },
    },
  });
  if (!vacancy) {
    return NextResponse.json(
      { error: "This role is no longer accepting applications." },
      { status: 404 },
    );
  }

  // Résumé handling is shared with the pool registration form so the two
  // public intake paths can't drift on what they accept.
  const resumeFileUrl = await storeResume(data);

  const roleLabel = vacancy.title?.trim() || (ROLE_LABELS[vacancy.role] ?? vacancy.role.replace(/_/g, " "));

  const answers = {
    state: data.state ?? null,
    qualification: data.qualification ?? null,
    studying: data.studying ?? false,
    vicDiplomaLevel: data.vicDiplomaLevel ?? null,
    wwccNumber: data.wwccNumber?.trim() || null,
    hasFirstAid: data.hasFirstAid ?? false,
    rightToWork: data.rightToWork ?? null,
    yearsExperience: data.yearsExperience ?? null,
    previousRole: data.previousRole?.trim() || null,
    holidayWeeks: data.holidayWeeks ?? null,
    availableSessions: data.availableSessions ?? [],
    availableDays: data.availableDays ?? [],
    hasTransport: data.hasTransport ?? false,
  };
  const fit = fitForRecords(vacancy, answers);
  const centre = vacancy.service?.name ?? "Amana OSHC";

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      vacancyId: vacancy.id,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim() || null,
      source,
      notes: data.message?.trim() || null,
      resumeFileUrl,
      suburb: data.suburb?.trim() || null,
      postcode: data.postcode?.trim() || null,
      ...answers,
      qualificationName: data.qualificationName?.trim() || null,
      previousEmployer: data.previousEmployer?.trim() || null,
      fitScore: fit.score,
      fitLabel: fit.label,
      fitReasons: fit.reasons,
    },
    select: { id: true },
  });

  logger.info("Website job application received", {
    candidateId: candidate.id,
    vacancyId: vacancy.id,
    source,
    role: vacancy.role,
    hasResume: Boolean(resumeFileUrl),
  });

  // Best-effort notification to HR and the state's hiring lead. The candidate record is the durable artifact —
  // if email fails, the application is still safe in the pipeline.
  try {
    // HR + the state's hiring lead (Tracie VIC / Mirna NSW) on one email.
    const recipients = applicationRecipients(
      vacancy.state ?? vacancy.service?.state ?? data.state,
      vacancy.assignedTo?.email,
    );
    if (recipients.length > 0) {
      const dashUrl = `${process.env.NEXTAUTH_URL ?? "https://amanaoshc.company"}/hiring`;
      await sendEmail({
        to: recipients,
        subject: `New application (${FIT_LABELS[fit.label]}): ${roleLabel} — ${centre}`,
        html: `<p>A new application came in from the ${escapeHtml(sourceLabel(source))} careers link.</p>
               <p><strong>Automatic fit:</strong> ${FIT_LABELS[fit.label]} (${fit.score}/100) — ${escapeHtml(fit.reasons.slice(0, 4).join("; "))}</p>
               <p><strong>Applicant:</strong> ${escapeHtml(data.name)}</p>
               <p><strong>Role:</strong> ${escapeHtml(roleLabel)} — ${escapeHtml(centre)}</p>
               <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
               ${data.phone ? `<p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>` : ""}
               ${resumeFileUrl ? `<p><strong>Resume:</strong> <a href="${resumeFileUrl}">Download</a></p>` : "<p><em>No resume attached.</em></p>"}
               ${data.message ? `<p><strong>Message:</strong></p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;white-space:pre-wrap;">${escapeHtml(data.message)}</blockquote>` : ""}
               <p><a href="${dashUrl}">Open the recruitment pipeline</a></p>`,
      });
    }
  } catch (err) {
    logger.warn("Website application notification failed", {
      candidateId: candidate.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true, candidateId: candidate.id }, { status: 201 });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
