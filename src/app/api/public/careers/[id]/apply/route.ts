/**
 * POST /api/public/careers/[id]/apply — public job application intake.
 *
 * INTENTIONALLY UNAUTHENTICATED. A member of the public applies for a vacancy
 * that has been published to the website. Creates a RecruitmentCandidate with
 * `source: "website"`, which drops straight into the recruiter's pipeline (and
 * AI screening). Applications are only accepted for vacancies that are still
 * open AND flagged for the website — you can't apply to an unpublished or
 * filled role by guessing its id.
 *
 * Abuse controls: per-IP rate limit + honeypot field. Resume upload is inline
 * (base64) and reuses the same validated storage path as enrolment documents.
 */
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const applySchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  email: z.string().email("a valid email is required").max(200),
  phone: z.string().max(40).optional().nullable(),
  message: z.string().max(5000).optional().nullable(),
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

  // Honeypot: silently accept (so the bot thinks it worked) but do nothing.
  if (data.company && data.company.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Only open, website-published vacancies accept applications.
  const vacancy = await prisma.recruitmentVacancy.findFirst({
    where: {
      id,
      deleted: false,
      status: "open",
      postedChannels: { has: "website" },
    },
    include: {
      service: { select: { name: true } },
      assignedTo: { select: { email: true, name: true } },
    },
  });
  if (!vacancy) {
    return NextResponse.json(
      { error: "This role is no longer accepting applications." },
      { status: 404 },
    );
  }

  // ── Optional resume upload (inline base64) ───────────────────────────
  let resumeFileUrl: string | null = null;
  if (data.resumeFile) {
    const filename = data.resumeFilename ?? "resume";
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw ApiError.badRequest(
        `Resume must be a PDF or Word (.docx) file (got "${ext || "unknown"}").`,
      );
    }

    const buffer = Buffer.from(data.resumeFile, "base64");
    if (buffer.length === 0) {
      throw ApiError.badRequest("Resume file is empty or malformed.");
    }
    if (buffer.length > MAX_RESUME_SIZE) {
      throw ApiError.badRequest("Resume exceeds the 10MB limit.");
    }

    const declaredMime =
      data.resumeContentType ||
      EXTENSION_TO_MIME[ext] ||
      "application/octet-stream";
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    if (!validateFileContent(arrayBuffer, declaredMime)) {
      throw ApiError.badRequest(
        "Resume content does not match its file type.",
      );
    }

    const baseName = path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .substring(0, 80);
    const uniqueName = `${baseName || "resume"}-${Date.now()}${ext}`;
    const { url } = await uploadFile(buffer, uniqueName, {
      contentType: declaredMime,
      folder: "resumes",
    });
    resumeFileUrl = url;
  }

  const roleLabel = ROLE_LABELS[vacancy.role] ?? vacancy.role.replace(/_/g, " ");
  const centre = vacancy.service?.name ?? "Amana OSHC";

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      vacancyId: vacancy.id,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim() || null,
      source: "website",
      notes: data.message?.trim() || null,
      resumeFileUrl,
    },
    select: { id: true },
  });

  logger.info("Website job application received", {
    candidateId: candidate.id,
    vacancyId: vacancy.id,
    role: vacancy.role,
    hasResume: Boolean(resumeFileUrl),
  });

  // Best-effort notification to the assigned recruiter (fall back to
  // head-office / owners). The candidate record is the durable artifact —
  // if email fails, the application is still safe in the pipeline.
  try {
    let recipients: string[] = [];
    if (vacancy.assignedTo?.email) {
      recipients = [vacancy.assignedTo.email];
    } else {
      const owners = await prisma.user.findMany({
        where: { active: true, role: { in: ["owner", "head_office"] } },
        select: { email: true },
      });
      recipients = owners.map((o) => o.email);
    }
    if (recipients.length > 0) {
      const dashUrl = `${process.env.NEXTAUTH_URL ?? "https://amanaoshc.company"}/recruitment`;
      await sendEmail({
        to: recipients,
        subject: `New application: ${roleLabel} — ${centre}`,
        html: `<p>A new application came in from the website careers page.</p>
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
