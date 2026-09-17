/**
 * POST /api/public/careers/register — general expression of interest.
 *
 * INTENTIONALLY UNAUTHENTICATED. This is the front door of the casual staff
 * pool: someone registers interest WITHOUT applying to a specific advertised
 * role, and sits in the pool until a centre needs cover, Holiday Quest comes
 * round, or a new service opens. The per-vacancy form
 * (`/api/public/careers/[id]/apply`) still exists for advertised roles; both
 * land in the same pool.
 *
 * This is also where Indeed applicants are meant to arrive — Indeed has no API
 * we can pull from, so the ad links here and the applicant fills this in once,
 * structured, instead of someone re-keying a PDF later. The link carries
 * `?src=indeed` so those registrations are attributed to the ad rather than
 * blending into organic website traffic.
 *
 * Abuse controls match the apply route: per-IP rate limit plus a honeypot.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { storeResume } from "@/lib/recruitment/resume-upload";
import {
  POOL_SESSIONS,
  POOL_DAYS,
  POOL_SOURCES,
  RIGHT_TO_WORK,
  normalisePublicSource,
} from "@/lib/recruitment/pool";
import { logger } from "@/lib/logger";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(200),
  email: z.string().email("A valid email is required").max(200),
  phone: z.string().trim().min(1, "A mobile number is required").max(40),
  suburb: z.string().max(120).optional().nullable(),
  postcode: z.string().max(10).optional().nullable(),
  preferredRegion: z.string().max(120).optional().nullable(),

  qualification: z
    .enum(["cert_iii", "diploma", "bachelor", "masters", "other"])
    .optional()
    .nullable(),
  studying: z.boolean().optional(),
  rightToWork: z.enum(RIGHT_TO_WORK).optional().nullable(),
  wwccNumber: z.string().max(60).optional().nullable(),
  hasFirstAid: z.boolean().optional(),

  previousRole: z.string().max(200).optional().nullable(),
  previousEmployer: z.string().max(200).optional().nullable(),
  yearsExperience: z.number().int().min(0).max(60).optional().nullable(),

  availableSessions: z.array(z.enum(POOL_SESSIONS)).optional(),
  availableDays: z.array(z.enum(POOL_DAYS)).optional(),
  hasTransport: z.boolean().optional(),

  message: z.string().max(5000).optional().nullable(),
  /** Carried from the ad's link as `?src=` — whitelisted, never free text. */
  source: z.enum(POOL_SOURCES).optional().nullable(),
  resumeFile: z.string().optional().nullable(),
  resumeFilename: z.string().max(200).optional().nullable(),
  resumeContentType: z.string().max(120).optional().nullable(),

  /** Honeypot — hidden from real users, irresistible to bots. */
  company: z.string().optional().nullable(),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await checkRateLimit(`careers-register:${ip}`, 10, 60 * 60_000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many registrations. Please try again later." },
      { status: 429 },
    );
  }

  const parsed = registerSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  // Silently accept so the bot believes it worked, but write nothing.
  if (data.company && data.company.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const email = data.email.trim().toLowerCase();

  // Someone re-registering is a person nudging us, not a duplicate to file.
  // Refresh their details on the existing row rather than creating a second
  // record that splits their notes and history.
  const existing = await prisma.recruitmentCandidate.findFirst({
    where: { email, archivedAt: null },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  const resumeFileUrl = await storeResume(data);

  const fields = {
    name: data.name.trim(),
    email,
    phone: data.phone.trim(),
    suburb: data.suburb?.trim() || null,
    postcode: data.postcode?.trim() || null,
    preferredRegion: data.preferredRegion?.trim() || null,
    qualification: data.qualification ?? null,
    studying: data.studying ?? false,
    rightToWork: data.rightToWork ?? null,
    wwccNumber: data.wwccNumber?.trim() || null,
    hasFirstAid: data.hasFirstAid ?? false,
    previousRole: data.previousRole?.trim() || null,
    previousEmployer: data.previousEmployer?.trim() || null,
    yearsExperience: data.yearsExperience ?? null,
    availableSessions: data.availableSessions ?? [],
    availableDays: data.availableDays ?? [],
    hasTransport: data.hasTransport ?? false,
    notes: data.message?.trim() || null,
    // Keep an existing résumé if this submission didn't include one.
    ...(resumeFileUrl ? { resumeFileUrl } : {}),
  };

  const candidate = existing
    ? await prisma.recruitmentCandidate.update({
        where: { id: existing.id },
        data: fields,
        select: { id: true },
      })
    : await prisma.recruitmentCandidate.create({
        // Source is set on CREATE only. Someone who found us through Indeed
        // in March and re-registers through the website in November was still
        // won by the Indeed ad — overwriting it on every return visit would
        // quietly re-attribute the whole pool to whatever channel is busiest
        // right now.
        data: {
          ...fields,
          source: normalisePublicSource(data.source),
          stage: "applied",
        },
        select: { id: true },
      });

  logger.info("Casual pool registration received", {
    candidateId: candidate.id,
    updatedExisting: Boolean(existing),
    source: normalisePublicSource(data.source),
    hasResume: Boolean(resumeFileUrl),
  });

  return NextResponse.json({ ok: true, id: candidate.id }, { status: 201 });
});
