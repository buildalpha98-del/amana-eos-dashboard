import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { resolveActivationFromUtm } from "@/lib/activation-attribution";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { clientIpFromRequest } from "@/lib/activation-qr";

const childSchema = z.object({
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(18).optional().nullable(),
});

const bodySchema = z.object({
  serviceId: z.string().min(1, "Centre is required"),
  parentName: z.string().min(1, "Your name is required").max(200),
  parentEmail: z.string().email().optional().nullable(),
  parentPhone: z.string().max(40).optional().nullable(),
  childName: z.string().max(200).optional().nullable(),
  childAge: z.number().int().min(0).max(18).optional().nullable(),
  childrenDetails: z.array(childSchema).optional().nullable(),
  parentDriver: z
    .enum(["homework", "quran", "enrichment", "working_parent", "traffic", "sports"])
    .optional()
    .nullable(),
  message: z.string().max(2000).optional().nullable(),
  /** Honeypot — bots fill anything; real users leave empty. */
  website: z.string().optional(),
  /** UTM attribution from QR scans. */
  utmSource: z.string().max(64).optional().nullable(),
  utmMedium: z.string().max(64).optional().nullable(),
  utmCampaign: z.string().max(64).optional().nullable(),
}).refine((d) => !!d.parentEmail || !!d.parentPhone, {
  message: "Provide an email or a phone number so we can get back to you",
  path: ["parentEmail"],
});

export const POST = withApiHandler(async (req) => {
  // IP-based rate limit to deter form spam — 5 submissions / 15 min per IP.
  const ip = clientIpFromRequest(req) ?? "anon";
  const rl = await checkRateLimit(`public-enquiry:${ip}`, 5, 15 * 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many submissions — please try again in a few minutes");
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  const data = parsed.data;

  // Honeypot trip → silently 200 so bots don't learn.
  if (data.website && data.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
    select: { id: true, status: true },
  });
  if (!service) throw ApiError.badRequest("Unknown centre");
  if (service.status !== "active" && service.status !== "onboarding") {
    throw ApiError.badRequest("Centre is not currently accepting enquiries");
  }

  // Build childName + first child age summary (mirrors the admin route).
  const children = data.childrenDetails?.filter((c) => c.name?.trim()) ?? [];
  let childName = data.childName?.trim() || null;
  let childAge = data.childAge ?? null;
  if (children.length > 0) {
    childName = children.map((c) => c.name).join(", ");
    childAge = children[0].age ?? null;
  }

  const sourceActivationId = await resolveActivationFromUtm(data.utmCampaign);

  const notesParts: string[] = [];
  if (data.message?.trim()) notesParts.push(data.message.trim());
  if (data.utmSource || data.utmMedium || data.utmCampaign) {
    const utmLine = `[utm_source=${data.utmSource ?? ""} utm_medium=${data.utmMedium ?? ""} utm_campaign=${data.utmCampaign ?? ""}]`;
    notesParts.push(utmLine);
  }

  try {
    const enquiry = await prisma.parentEnquiry.create({
      data: {
        serviceId: data.serviceId,
        parentName: data.parentName,
        parentEmail: data.parentEmail || null,
        parentPhone: data.parentPhone || null,
        childName,
        childAge,
        childrenDetails: children.length > 0 ? children : undefined,
        channel: "website",
        parentDriver: data.parentDriver ?? null,
        notes: notesParts.length > 0 ? notesParts.join("\n\n") : null,
        sourceActivationId,
        stageChangedAt: new Date(),
      },
      select: { id: true },
    });

    scheduleNurtureFromStageChange(enquiry.id, "new").catch((err) =>
      logger.error("Failed to schedule welcome nurture", { enquiryId: enquiry.id, err }),
    );

    return NextResponse.json({ ok: true, enquiryId: enquiry.id }, { status: 201 });
  } catch (err) {
    logger.error("public-enquiry create failed", { err });
    throw err;
  }
});
